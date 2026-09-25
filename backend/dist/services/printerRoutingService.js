"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getShopPrintersWithWorkload = getShopPrintersWithWorkload;
exports.assignPrintersToJob = assignPrintersToJob;
const db_1 = require("../db");
/**
 * Retrieves all online printers for a shop with live workload statistics
 */
async function getShopPrintersWithWorkload(shopId) {
    try {
        // 1. Fetch online printers for this shop
        const printersRes = await (0, db_1.query)(`SELECT id, shop_id, name, type, status, system_name 
       FROM printers 
       WHERE shop_id = $1 AND status = 'online'
       ORDER BY created_at ASC`, [shopId]);
        if (printersRes.rowCount === 0) {
            return [];
        }
        // 2. Fetch active workloads (printing + waiting) per printer
        const workloadRes = await (0, db_1.query)(`SELECT printer_id, COUNT(*) as active_jobs, COALESCE(SUM(page_count), 0) as queued_pages
       FROM print_jobs
       WHERE shop_id = $1 AND status IN ('printing', 'waiting') AND printer_id IS NOT NULL
       GROUP BY printer_id`, [shopId]);
        const workloadMap = new Map();
        for (const row of workloadRes.rows) {
            workloadMap.set(row.printer_id, {
                active_jobs: parseInt(row.active_jobs, 10) || 0,
                queued_pages: parseInt(row.queued_pages, 10) || 0,
            });
        }
        // 3. Assemble printers with calculated load scores
        return printersRes.rows.map((p) => {
            const stats = workloadMap.get(p.id) || { active_jobs: 0, queued_pages: 0 };
            const load_score = (stats.active_jobs * 10) + stats.queued_pages;
            return {
                id: p.id,
                shop_id: p.shop_id,
                name: p.name,
                type: (p.type === 'color' ? 'color' : 'mono'),
                status: p.status,
                system_name: p.system_name,
                active_jobs: stats.active_jobs,
                queued_pages: stats.queued_pages,
                load_score,
            };
        });
    }
    catch (err) {
        console.error('[PrinterRoutingService] Error fetching printer workloads:', err);
        return [];
    }
}
/**
 * Selects the optimal printer among candidates using least-workload load balancing
 */
function selectBestPrinter(candidates) {
    if (!candidates || candidates.length === 0)
        return null;
    return [...candidates].sort((a, b) => {
        // 1. Lowest load score first
        if (a.load_score !== b.load_score) {
            return a.load_score - b.load_score;
        }
        // 2. Fewest active jobs
        if (a.active_jobs !== b.active_jobs) {
            return a.active_jobs - b.active_jobs;
        }
        // 3. Fewest queued pages
        return a.queued_pages - b.queued_pages;
    })[0];
}
/**
 * Sturdily assigns hardware printers to a print job and all its individual files.
 *
 * Scenarios Handled:
 * 1. Dedicated Hardware (Mono printer + Color printer):
 *    - Mono files routed to least-loaded Mono printer.
 *    - Color files routed to least-loaded Color printer.
 *    - Multi-file job is cleanly divided between the two devices.
 * 2. Shared Single Printer (Both B&W and Color on same printer):
 *    - All files routed to that printer.
 *    - driverColorMode is preserved per file (true = Color toner, false = Grayscale toner).
 * 3. Load Balancing (Multiple printers of the same capability):
 *    - Work distributed to the device with the lowest load score.
 * 4. Fallback:
 *    - Graceful fallback if preferred type is offline or unavailable.
 */
async function assignPrintersToJob(shopId, jobSettings, jobPageCount, defaultFileUrl = '', defaultFileName = 'document') {
    const printers = await getShopPrintersWithWorkload(shopId);
    const workloadSnapshot = {};
    printers.forEach((p) => {
        workloadSnapshot[p.id] = {
            name: p.name,
            type: p.type,
            activeJobs: p.active_jobs,
            queuedPages: p.queued_pages,
            loadScore: p.load_score,
        };
    });
    // If no online printers at all
    if (printers.length === 0) {
        console.warn(`[PrinterRoutingService] No online printers available for shop ${shopId}.`);
        return {
            shopId,
            primaryPrinterId: null,
            primaryPrinterName: null,
            primarySystemPrinterName: null,
            primaryPrinterType: null,
            isMultiPrinterSplit: false,
            assignedFiles: [],
            routingSummary: 'No online hardware printers found for this shop.',
            workloadSnapshot,
        };
    }
    const monoPrinters = printers.filter((p) => p.type === 'mono');
    const colorPrinters = printers.filter((p) => p.type === 'color');
    // Working copy of workloads to balance multiple files within the same job batch
    const simulatedWorkloads = printers.map((p) => ({ ...p }));
    const pickSimulatedPrinter = (candidateIds) => {
        const subset = simulatedWorkloads.filter((p) => candidateIds.includes(p.id));
        const chosen = selectBestPrinter(subset) || simulatedWorkloads[0];
        return chosen;
    };
    // Determine files to route
    const rawFiles = Array.isArray(jobSettings?.files) && jobSettings.files.length > 0
        ? jobSettings.files
        : [
            {
                fileName: defaultFileName,
                fileUrl: defaultFileUrl,
                pageCount: jobPageCount || 1,
                copies: jobSettings?.copies || 1,
                color: !!jobSettings?.color,
                duplex: !!jobSettings?.duplex,
                paperSize: jobSettings?.paperSize || 'A4',
            },
        ];
    const assignedFiles = [];
    const assignedPrinterIds = new Set();
    for (const f of rawFiles) {
        const isFileColor = !!f.color;
        let chosenPrinter;
        let driverColorMode;
        // SCENARIO 1: Shop has both dedicated Mono and Color printers
        if (monoPrinters.length > 0 && colorPrinters.length > 0) {
            if (isFileColor) {
                chosenPrinter = pickSimulatedPrinter(colorPrinters.map((p) => p.id));
                driverColorMode = true;
            }
            else {
                chosenPrinter = pickSimulatedPrinter(monoPrinters.map((p) => p.id));
                driverColorMode = false;
            }
        }
        // SCENARIO 2: Shop has ONLY Color printers
        else if (colorPrinters.length > 0 && monoPrinters.length === 0) {
            chosenPrinter = pickSimulatedPrinter(colorPrinters.map((p) => p.id));
            // Color printer handles both! Driver switches color mode per document
            driverColorMode = isFileColor;
        }
        // SCENARIO 3: Shop has ONLY Mono printers
        else if (monoPrinters.length > 0 && colorPrinters.length === 0) {
            chosenPrinter = pickSimulatedPrinter(monoPrinters.map((p) => p.id));
            // Hardware cannot do color; force driver to mono
            driverColorMode = false;
        }
        // SCENARIO 4: General Fallback
        else {
            chosenPrinter = pickSimulatedPrinter(printers.map((p) => p.id));
            driverColorMode = isFileColor;
        }
        // Increment simulated workload for in-batch load balancing
        const pages = (f.pageCount || 1) * (f.copies || 1);
        chosenPrinter.queued_pages += pages;
        chosenPrinter.load_score += pages;
        assignedPrinterIds.add(chosenPrinter.id);
        assignedFiles.push({
            ...f,
            targetPrinterId: chosenPrinter.id,
            targetPrinterName: chosenPrinter.name,
            targetSystemPrinterName: chosenPrinter.system_name || chosenPrinter.name,
            targetPrinterType: chosenPrinter.type,
            driverColorMode,
        });
    }
    const isMultiPrinterSplit = assignedPrinterIds.size > 1;
    const primaryAssignedPrinter = printers.find((p) => p.id === assignedFiles[0]?.targetPrinterId) || printers[0];
    let routingSummary = '';
    if (isMultiPrinterSplit) {
        const monoCount = assignedFiles.filter((f) => f.targetPrinterType === 'mono').length;
        const colorCount = assignedFiles.filter((f) => f.targetPrinterType === 'color').length;
        routingSummary = `Job dynamically divided across ${assignedPrinterIds.size} printers: ${monoCount} file(s) -> Dedicated Mono Printer, ${colorCount} file(s) -> Dedicated Color Printer.`;
    }
    else if (monoPrinters.length > 0 && colorPrinters.length > 0) {
        const pType = primaryAssignedPrinter.type === 'color' ? 'Color' : 'Black & White';
        routingSummary = `All files routed to dedicated ${pType} printer (${primaryAssignedPrinter.name}).`;
    }
    else if (colorPrinters.length > 0 && monoPrinters.length === 0) {
        routingSummary = `All files routed to multifunction color printer (${primaryAssignedPrinter.name}) with per-document driver color/mono switching.`;
    }
    else {
        routingSummary = `Files routed to online printer (${primaryAssignedPrinter.name}) via load balancing.`;
    }
    return {
        shopId,
        primaryPrinterId: primaryAssignedPrinter ? primaryAssignedPrinter.id : null,
        primaryPrinterName: primaryAssignedPrinter ? primaryAssignedPrinter.name : null,
        primarySystemPrinterName: primaryAssignedPrinter ? (primaryAssignedPrinter.system_name || primaryAssignedPrinter.name) : null,
        primaryPrinterType: primaryAssignedPrinter ? primaryAssignedPrinter.type : null,
        isMultiPrinterSplit,
        assignedFiles,
        routingSummary,
        workloadSnapshot,
    };
}
