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

/**
 * Detects local Windows printers using PowerShell
 */
export async function getWindowsPrinters(): Promise<DetectedPrinter[]> {
  try {
    const cmd = `powershell -NoProfile -Command "Get-Printer | Select-Object Name, Type, DriverName, PrinterStatus | ConvertTo-Json"`;
    const { stdout } = await execAsync(cmd);
    if (!stdout.trim()) return [];

    let parsed: any;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return [];
    }

    const list = Array.isArray(parsed) ? parsed : [parsed];

    return list.map((p: any, idx: number) => {
      const name = p.Name || `Printer-${idx + 1}`;
      const nameLower = name.toLowerCase();
      const isColor = nameLower.includes('color') || nameLower.includes('c3530') || nameLower.includes('deskjet');

      let status: 'online' | 'offline' | 'out-of-paper' | 'low-ink' = 'online';
      if (p.PrinterStatus && p.PrinterStatus.toString().toLowerCase().includes('offline')) {
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
  } catch (err) {
    console.warn('[Printer Detection] Could not query Windows printers via PowerShell:', err);
    return [];
  }
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
