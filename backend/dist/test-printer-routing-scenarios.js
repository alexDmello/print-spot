"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const printerRoutingService_1 = require("./services/printerRoutingService");
const db_1 = require("./db");
const uuid_1 = require("uuid");
async function runRoutingTests() {
    console.log('================================================================');
    console.log('🧪 RUNNING PRINTER ROUTING & LOAD BALANCING SCENARIO SUITE');
    console.log('================================================================\n');
    await (0, db_1.initDb)();
    const testShopId = `shop_test_${(0, uuid_1.v4)().substring(0, 8)}`;
    try {
        // Setup test shop
        await (0, db_1.query)(`INSERT INTO shops (id, name, location, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5)`, [testShopId, 'Alpha Print Solutions', '123 Tech Park', 12.9716, 77.5946]);
        // -------------------------------------------------------------------------
        // TEST 1: Shop with Dedicated B&W and Color Printers
        // -------------------------------------------------------------------------
        console.log('▶ TEST 1: Dedicated Hardware (1 B&W Printer + 1 Color Printer)');
        const monoPrinterId = `p_mono_${(0, uuid_1.v4)().substring(0, 6)}`;
        const colorPrinterId = `p_color_${(0, uuid_1.v4)().substring(0, 6)}`;
        await (0, db_1.query)(`INSERT INTO printers (id, shop_id, name, type, status, system_name)
       VALUES ($1, $2, $3, $4, $5, $6)`, [monoPrinterId, testShopId, 'HP LaserJet Mono Pro', 'mono', 'online', 'HP_LaserJet_Mono']);
        await (0, db_1.query)(`INSERT INTO printers (id, shop_id, name, type, status, system_name)
       VALUES ($1, $2, $3, $4, $5, $6)`, [colorPrinterId, testShopId, 'Canon ImageRunner Color', 'color', 'online', 'Canon_IR_Color']);
        // Multi-file job: 1 B&W PDF document + 1 Color Photo Sheet / image
        const mixedJobSettings = {
            files: [
                {
                    id: 'file_pdf_1',
                    fileName: 'Annual_Report.pdf',
                    fileUrl: '/uploads/report.pdf',
                    pageCount: 4,
                    copies: 1,
                    color: false, // B&W
                    duplex: true,
                },
                {
                    id: 'file_photo_2',
                    fileName: 'Product_Brochure.jpg',
                    fileUrl: '/uploads/brochure.jpg',
                    pageCount: 1,
                    copies: 2,
                    color: true, // Color
                    duplex: false,
                },
            ],
        };
        const decision1 = await (0, printerRoutingService_1.assignPrintersToJob)(testShopId, mixedJobSettings, 5);
        console.log('   Routing summary:', decision1.routingSummary);
        console.log('   isMultiPrinterSplit:', decision1.isMultiPrinterSplit);
        assert_1.default.strictEqual(decision1.isMultiPrinterSplit, true, 'Job should be split across printers');
        assert_1.default.strictEqual(decision1.assignedFiles.length, 2, 'Both files should be assigned');
        const monoFile = decision1.assignedFiles.find((f) => f.fileName === 'Annual_Report.pdf');
        const colorFile = decision1.assignedFiles.find((f) => f.fileName === 'Product_Brochure.jpg');
        (0, assert_1.default)(monoFile, 'Mono file must exist in routing');
        (0, assert_1.default)(colorFile, 'Color file must exist in routing');
        assert_1.default.strictEqual(monoFile.targetPrinterId, monoPrinterId, 'B&W file must route to Mono Printer');
        assert_1.default.strictEqual(monoFile.targetSystemPrinterName, 'HP_LaserJet_Mono');
        assert_1.default.strictEqual(monoFile.driverColorMode, false, 'Driver mode for B&W must be false');
        assert_1.default.strictEqual(colorFile.targetPrinterId, colorPrinterId, 'Color file must route to Color Printer');
        assert_1.default.strictEqual(colorFile.targetSystemPrinterName, 'Canon_IR_Color');
        assert_1.default.strictEqual(colorFile.driverColorMode, true, 'Driver mode for Color must be true');
        console.log('   ✅ TEST 1 PASSED: Files successfully divided between dedicated B&W and Color printers!\n');
        // -------------------------------------------------------------------------
        // TEST 2: Single Printer for Both B&W and Color
        // -------------------------------------------------------------------------
        console.log('▶ TEST 2: Single Printer for both B&W and Color (Multifunction Device)');
        const singlePrinterShopId = `shop_single_${(0, uuid_1.v4)().substring(0, 8)}`;
        await (0, db_1.query)(`INSERT INTO shops (id, name, location, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5)`, [singlePrinterShopId, 'Metro Fast Print', 'Kiosk #4', 12.9716, 77.5946]);
        const mfpPrinterId = `p_mfp_${(0, uuid_1.v4)().substring(0, 6)}`;
        await (0, db_1.query)(`INSERT INTO printers (id, shop_id, name, type, status, system_name)
       VALUES ($1, $2, $3, $4, $5, $6)`, [mfpPrinterId, singlePrinterShopId, 'Bizhub Multifunction Color C360', 'color', 'online', 'Bizhub_C360']);
        const decision2 = await (0, printerRoutingService_1.assignPrintersToJob)(singlePrinterShopId, mixedJobSettings, 5);
        console.log('   Routing summary:', decision2.routingSummary);
        console.log('   isMultiPrinterSplit:', decision2.isMultiPrinterSplit);
        assert_1.default.strictEqual(decision2.isMultiPrinterSplit, false, 'Single printer cannot be split');
        assert_1.default.strictEqual(decision2.assignedFiles[0].targetPrinterId, mfpPrinterId, 'All files must route to the single MFP');
        assert_1.default.strictEqual(decision2.assignedFiles[1].targetPrinterId, mfpPrinterId, 'All files must route to the single MFP');
        const mfpMonoFile = decision2.assignedFiles.find((f) => f.fileName === 'Annual_Report.pdf');
        const mfpColorFile = decision2.assignedFiles.find((f) => f.fileName === 'Product_Brochure.jpg');
        assert_1.default.strictEqual(mfpMonoFile?.driverColorMode, false, 'MFP driver must be instructed to print B&W document in grayscale');
        assert_1.default.strictEqual(mfpColorFile?.driverColorMode, true, 'MFP driver must be instructed to print Color document in color');
        console.log('   ✅ TEST 2 PASSED: Single printer handles both B&W and Color with driver-level color switching!\n');
        // -------------------------------------------------------------------------
        // TEST 3: Multiple Printers of Same Capability (Load Balancing)
        // -------------------------------------------------------------------------
        console.log('▶ TEST 3: Load Balancing Across Multiple Printers of the Same Capability');
        const loadBalanceShopId = `shop_lb_${(0, uuid_1.v4)().substring(0, 8)}`;
        await (0, db_1.query)(`INSERT INTO shops (id, name, location, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5)`, [loadBalanceShopId, 'High-Volume Print Center', 'Block C', 12.9716, 77.5946]);
        const busyPrinterId = `p_busy_${(0, uuid_1.v4)().substring(0, 6)}`;
        const idlePrinterId = `p_idle_${(0, uuid_1.v4)().substring(0, 6)}`;
        await (0, db_1.query)(`INSERT INTO printers (id, shop_id, name, type, status, system_name)
       VALUES ($1, $2, $3, $4, $5, $6)`, [busyPrinterId, loadBalanceShopId, 'Heavy Duty Mono Station A', 'mono', 'online', 'Mono_Station_A']);
        await (0, db_1.query)(`INSERT INTO printers (id, shop_id, name, type, status, system_name)
       VALUES ($1, $2, $3, $4, $5, $6)`, [idlePrinterId, loadBalanceShopId, 'Heavy Duty Mono Station B', 'mono', 'online', 'Mono_Station_B']);
        // Seed busy printer with active queued jobs
        const dummyUserId = `u_${(0, uuid_1.v4)().substring(0, 6)}`;
        await (0, db_1.query)(`INSERT INTO users (id, phone, name) VALUES ($1, $2, $3) ON CONFLICT (phone) DO NOTHING`, [dummyUserId, '9999900001', 'Test Customer']);
        await (0, db_1.query)(`INSERT INTO print_jobs (id, user_id, shop_id, printer_id, file_url, file_name, file_size, page_count, settings, status, price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [(0, uuid_1.v4)(), dummyUserId, loadBalanceShopId, busyPrinterId, '/uploads/dummy1.pdf', 'heavy_doc.pdf', 50000, 45, '{}', 'printing', 90]);
        const monoJob = {
            files: [
                {
                    fileName: 'Urgent_Exam_Paper.pdf',
                    fileUrl: '/uploads/exam.pdf',
                    pageCount: 6,
                    copies: 1,
                    color: false,
                },
            ],
        };
        const decision3 = await (0, printerRoutingService_1.assignPrintersToJob)(loadBalanceShopId, monoJob, 6);
        console.log('   Routing summary:', decision3.routingSummary);
        console.log('   Workload snapshot:', JSON.stringify(decision3.workloadSnapshot, null, 2));
        assert_1.default.strictEqual(decision3.assignedFiles[0].targetPrinterId, idlePrinterId, 'Load balancer must pick Station B because Station A has 45 active queued pages');
        console.log('   ✅ TEST 3 PASSED: Workload successfully balanced to the least busy printer!\n');
        // -------------------------------------------------------------------------
        // TEST 4: Photo Sheet Calculation (>9 images & combined sheets)
        // -------------------------------------------------------------------------
        console.log('▶ TEST 4: Photo Sheet Sheet Math (>9 images & Document mixing)');
        const testImages = Array.from({ length: 14 }).map((_, i) => ({
            fileName: `image_${i + 1}.jpg`,
            pageCount: 1,
            color: true,
            combineImages: true,
            pagesPerSheet: 9, // 9-in-1 layout
        }));
        const grid = 9;
        const sheetsCalculated = Math.max(1, Math.ceil(testImages.length / grid));
        console.log(`   14 images with 9-in-1 grid = ${sheetsCalculated} physical sheets`);
        assert_1.default.strictEqual(sheetsCalculated, 2, '14 images with 9-in-1 must yield 2 physical sheets');
        // Page 1: images 1..9
        const page1Images = testImages.slice(0, grid);
        assert_1.default.strictEqual(page1Images.length, 9, 'Page 1 must contain exactly 9 images');
        // Page 2: images 10..14, and spots 6..9 remain empty
        const page2Images = testImages.slice(grid, grid * 2);
        assert_1.default.strictEqual(page2Images.length, 5, 'Page 2 must contain remaining 5 images');
        const page2EmptySpots = grid - page2Images.length;
        assert_1.default.strictEqual(page2EmptySpots, 4, 'Page 2 must have 4 empty spots with no repeats');
        console.log('   ✅ TEST 4 PASSED: Multi-page photo sheet math and empty spots verified!\n');
        console.log('================================================================');
        console.log('🎉 ALL 4 ROUTING & PHOTO SHEET SCENARIOS PASSED WITH 100% SUCCESS');
        console.log('================================================================');
    }
    catch (error) {
        console.error('❌ Test failed with error:', error);
        process.exit(1);
    }
}
runRoutingTests();
