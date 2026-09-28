import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = util.promisify(exec);

export interface DetectedPrinter {
  id: string;
  name: string;
  type: 'mono' | 'color';
  status: 'online' | 'offline' | 'out-of-paper' | 'low-ink';
  systemName: string;
}

export interface PrintJobOptions {
  printerName?: string;
  copies: number;
  color: boolean;
  duplex: boolean;
  paperSize: string;
  simulate?: boolean;
}

export const VIRTUAL_DRIVER_BLACKLIST = [
  'microsoft print to pdf',
  'microsoft xps document writer',
  'onenote',
  'send to microsoft onenote',
  'fax',
  'microsoft shared fax driver',
  'microsoft software printer driver',
  'cutepdf',
  'acrobat distiller',
  'adobe pdf',
  'foxit reader pdf printer',
  'bullzip pdf',
  'pdfcreator',
  'cute pdf',
];

export const VIRTUAL_PORT_BLACKLIST = [
  'portprompt:',
  'nul:',
  'shrfax:',
];

export function isVirtualPrinter(name?: string, driver?: string, port?: string): boolean {
  const n = (name || '').toLowerCase();
  const d = (driver || '').toLowerCase();
  const p = (port || '').toLowerCase();

  if (VIRTUAL_DRIVER_BLACKLIST.some(b => n.includes(b) || d.includes(b))) {
    return true;
  }

  if (VIRTUAL_PORT_BLACKLIST.some(bp => p.includes(bp)) || p.includes('onenote')) {
    return true;
  }

  return false;
}

/**
 * Detects local physical Windows printers using PowerShell (filtering out virtual drivers)
 */
export async function getWindowsPrinters(): Promise<DetectedPrinter[]> {
  let list: any[] = [];

  // Strategy 1: Get-Printer
  try {
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Printer | Select-Object Name, Type, DriverName, PortName, PrinterStatus | ConvertTo-Json -Compress"`;
    const { stdout } = await execAsync(cmd, { timeout: 6000 });
    const trimmed = (stdout || '').trim();
    if (trimmed) {
      const jsonStart = trimmed.indexOf('[') !== -1 && (trimmed.indexOf('{') === -1 || trimmed.indexOf('[') < trimmed.indexOf('{'))
        ? trimmed.indexOf('[')
        : trimmed.indexOf('{');
      if (jsonStart !== -1) {
        const parsed = JSON.parse(trimmed.slice(jsonStart));
        list = Array.isArray(parsed) ? parsed : [parsed];
      }
    }
  } catch (err1) {
    console.warn('[Agent Detection] Strategy 1 (Get-Printer) failed, trying Get-CimInstance...');
  }

  // Strategy 2: Get-CimInstance Win32_Printer
  if (list.length === 0) {
    try {
      const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Printer | Select-Object Name, DriverName, PortName, PrinterStatus | ConvertTo-Json -Compress"`;
      const { stdout } = await execAsync(cmd, { timeout: 6000 });
      const trimmed = (stdout || '').trim();
      if (trimmed) {
        const jsonStart = trimmed.indexOf('[') !== -1 && (trimmed.indexOf('{') === -1 || trimmed.indexOf('[') < trimmed.indexOf('{'))
          ? trimmed.indexOf('[')
          : trimmed.indexOf('{');
        if (jsonStart !== -1) {
          const parsed = JSON.parse(trimmed.slice(jsonStart));
          list = Array.isArray(parsed) ? parsed : [parsed];
        }
      }
    } catch (err2) {
      console.warn('[Agent Detection] Strategy 2 (Get-CimInstance) failed, trying Get-WmiObject...');
    }
  }

  // Strategy 3: Get-WmiObject Win32_Printer
  if (list.length === 0) {
    try {
      const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-WmiObject Win32_Printer | Select-Object Name, DriverName, PortName, PrinterStatus | ConvertTo-Json -Compress"`;
      const { stdout } = await execAsync(cmd, { timeout: 6000 });
      const trimmed = (stdout || '').trim();
      if (trimmed) {
        const jsonStart = trimmed.indexOf('[') !== -1 && (trimmed.indexOf('{') === -1 || trimmed.indexOf('[') < trimmed.indexOf('{'))
          ? trimmed.indexOf('[')
          : trimmed.indexOf('{');
        if (jsonStart !== -1) {
          const parsed = JSON.parse(trimmed.slice(jsonStart));
          list = Array.isArray(parsed) ? parsed : [parsed];
        }
      }
    } catch (err3) {
      console.warn('[Agent Detection] Strategy 3 (Get-WmiObject) failed.');
    }
  }

  if (list.length === 0) return [];

  // Filter out virtual printers (PDF writers, OneNote, Fax, etc.)
  const physicalList = list.filter((p: any) => !isVirtualPrinter(p.Name, p.DriverName, p.PortName));
  const activeList = physicalList.length > 0 ? physicalList : list;

  return activeList.map((p: any, idx: number) => {
    const name = p.Name || `Printer-${idx + 1}`;
    const nameLower = name.toLowerCase();
    const isColor = nameLower.includes('color') || nameLower.includes('c3530') || nameLower.includes('deskjet');

    let status: 'online' | 'offline' | 'out-of-paper' | 'low-ink' = 'online';
    const statusVal = p.PrinterStatus !== undefined && p.PrinterStatus !== null ? p.PrinterStatus.toString().toLowerCase() : '';
    if (statusVal.includes('offline') || statusVal === '7' || statusVal === '8') {
      status = 'offline';
    }

    return {
      id: `win_printer_${idx + 1}`,
      name,
      type: isColor ? 'color' : 'mono',
      status,
      systemName: name,
    };
  });
}

/**
 * Dispatches a document to the Windows print spooler
 */
export async function printToWindows(
  filePath: string,
  options: PrintJobOptions
): Promise<{ success: boolean; message: string }> {
  console.log(`[Printer Spooler] Dispatching document: ${filePath}`);
  console.log(`[Printer Spooler] Settings:`, options);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File to print does not exist on disk: ${filePath}`);
  }

  // Simulation mode check
  if (options.simulate || process.env.SIMULATE_PRINTING === 'true') {
    console.log('[Printer Spooler] Simulation mode active. Emulating hardware spooler & feed...');
    await new Promise((resolve) => setTimeout(resolve, 3000));
    console.log('[Printer Spooler] Hardware simulated print successful.');
    return { success: true, message: 'Print job completed via simulated hardware feed.' };
  }

  const targetPrinter = options.printerName || 'Microsoft Print to PDF';

  try {
    // If target printer is a virtual prompt printer, fallback to fast virtual spooling
    if (targetPrinter.includes('PORTPROMPT') || targetPrinter.includes('Microsoft Print to PDF')) {
      console.log(`[Printer Spooler] Virtual target (${targetPrinter}). Spooling in virtual mode...`);
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return { success: true, message: `Dispatched to virtual printer ${targetPrinter}` };
    }

    // Attempt printing via pdf-to-printer or PowerShell Start-Process
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      const { print } = await import('pdf-to-printer');
      await print(filePath, {
        printer: targetPrinter,
        copies: options.copies || 1,
      });
    } else {
      // Images: print via PowerShell PrintTo verb
      const psCmd = `powershell -NoProfile -Command "Start-Process -FilePath '${filePath}' -Verb PrintTo -ArgumentList '${targetPrinter}' -Wait"`;
      await execAsync(psCmd);
    }

    return { success: true, message: `Successfully printed to ${targetPrinter}` };
  } catch (err: any) {
    console.error('[Printer Spooler] Error during print command execution:', err);
    throw new Error(`Print spooler hardware failure on ${targetPrinter}: ${err.message || 'Unknown error'}`);
  }
}
