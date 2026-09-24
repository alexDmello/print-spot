import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import tmp from 'tmp';
import dotenv from 'dotenv';
import { getWindowsPrinters, printToWindows, DetectedPrinter } from './printer/windowsPrinter';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';
const SHOP_ID = process.env.SHOP_ID || 'shop_main';
const AGENT_KEY = process.env.PRINTER_AGENT_KEY || 'printspot_agent_secret_key_8899';
const SIMULATE_PRINTING = process.env.SIMULATE_PRINTING === 'true';

console.log('====================================================');
console.log('🖨️  PrintSpot Persistent Shop Printer Agent Starting');
console.log(`📡 Backend URL: ${BACKEND_URL}`);
console.log(`🏪 Shop ID:     ${SHOP_ID}`);
console.log(`⚙️  Simulate:    ${SIMULATE_PRINTING}`);
console.log('====================================================');

let socket: Socket;
let isProcessingJob = false;

async function startAgent(): Promise<void> {
  // 1. Detect installed Windows Printers
  console.log('[Agent] Querying local Windows printers...');
  const detectedPrinters = await getWindowsPrinters();
  console.log(`[Agent] Detected ${detectedPrinters.length} local printer(s):`);
  detectedPrinters.forEach((p) => console.log(`   • [${p.type.toUpperCase()}] ${p.name} (${p.status})`));

  // 2. Connect to Backend via WebSocket with resilient auto-reconnect
  socket = io(BACKEND_URL, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
  });

  socket.on('connect', () => {
    console.log(`[Agent] Connected to backend server (Socket ID: ${socket.id})`);

    // Authenticate and register shop printer capabilities
    socket.emit('agent_register', {
      shopId: SHOP_ID,
      agentKey: AGENT_KEY,
      printers: detectedPrinters,
    });
  });

  socket.on('agent_registered', (data: any) => {
    console.log(`[Agent] Registration confirmed by backend: ${data.message}`);
  });

  socket.on('agent_auth_error', (err: any) => {
    console.error(`[Agent] Authentication failed:`, err.message);
  });

  socket.on('disconnect', (reason: string) => {
    console.warn(`[Agent] Disconnected from backend (${reason}). Auto-reconnecting in background...`);
  });

  socket.on('connect_error', (err: any) => {
    console.warn(`[Agent] Connection error: ${err.message}. Retrying...`);
  });

  // 3. Listen for dispatched print jobs
  socket.on('print_job_dispatch', async (jobData: {
    jobId: string;
    shopId: string;
    tokenCode: string;
    fileUrl: string;
    fileName: string;
    pageCount: number;
    settings: any;
    printerId?: string;
    systemPrinterName?: string;
  }) => {
    if (isProcessingJob) {
      console.warn(`[Agent] Busy with active job. Queuing dispatch for job ${jobData.tokenCode}`);
      return;
    }

    await handleDispatchedJob(jobData);
  });

  // 4. Periodic printer telemetry heartbeat (every 30 seconds)
  setInterval(async () => {
    if (socket.connected) {
      const livePrinters = await getWindowsPrinters();
      socket.emit('agent_printer_heartbeat', {
        shopId: SHOP_ID,
        printers: livePrinters,
      });
    }
  }, 30000);
}

/**
 * Handles incoming print job from backend
 */
async function handleDispatchedJob(job: {
  jobId: string;
  shopId: string;
  tokenCode: string;
  fileUrl: string;
  fileName: string;
  pageCount: number;
  settings: any;
  printerId?: string;
  systemPrinterName?: string;
}): Promise<void> {
  isProcessingJob = true;
  console.log(`\n----------------------------------------------------`);
  console.log(`📥 [Agent] New Print Job Received: Token ${job.tokenCode} (${job.fileName})`);
  console.log(`   Copies: ${job.settings?.copies || 1}, Color: ${job.settings?.color ? 'Yes' : 'No'}`);
  console.log(`   Target Printer: ${job.systemPrinterName || 'Default Spooler'}`);

  let tempFilePath: string | null = null;

  try {
    // 1. Report 'printing' state to backend
    socket.emit('agent_job_status', {
      jobId: job.jobId,
      shopId: job.shopId,
      status: 'printing',
      printerId: job.printerId,
    });

    const filesToPrint =
      Array.isArray(job.settings?.files) && job.settings.files.length > 0
        ? job.settings.files
        : [
            {
              fileName: job.fileName,
              fileUrl: job.fileUrl,
              copies: job.settings?.copies || 1,
              color: !!job.settings?.color,
              duplex: !!job.settings?.duplex,
              paperSize: job.settings?.paperSize || 'A4',
            },
          ];

    console.log(`[Agent] Processing ${filesToPrint.length} document(s) for job ${job.tokenCode}...`);

    for (let i = 0; i < filesToPrint.length; i++) {
      const f = filesToPrint[i];
      console.log(`   [Document ${i + 1}/${filesToPrint.length}] ${f.fileName} -> ${f.copies || 1} copies (${f.color ? 'Color' : 'Mono'})`);

      const ext = path.extname(f.fileName) || '.pdf';
      const tmpObj = tmp.fileSync({ postfix: ext, keep: false });
      const currentTempPath = tmpObj.name;

      const targetUrl = f.fileUrl.startsWith('http')
        ? f.fileUrl
        : `${BACKEND_URL}${f.fileUrl.startsWith('/') ? '' : '/'}${f.fileUrl}`;

      const response = await axios({
        url: targetUrl,
        method: 'GET',
        responseType: 'stream',
      });

      const writer = fs.createWriteStream(currentTempPath);
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(true));
        writer.on('error', reject);
      });

      const printResult = await printToWindows(currentTempPath, {
        printerName: job.systemPrinterName,
        copies: f.copies || 1,
        color: !!f.color,
        duplex: !!f.duplex,
        paperSize: f.paperSize || job.settings?.paperSize || 'A4',
        simulate: SIMULATE_PRINTING,
      });

      console.log(`   ✅ Document ${i + 1} spooled successfully: ${printResult.message}`);
      try {
        fs.unlinkSync(currentTempPath);
      } catch {}
    }

    // 4. Report 'ready' status to backend
    socket.emit('agent_job_status', {
      jobId: job.jobId,
      shopId: job.shopId,
      status: 'ready',
      printerId: job.printerId,
    });
  } catch (err: any) {
    console.error(`❌ [Agent] Failed to print job ${job.tokenCode}:`, err.message);

    // 5. On failure, flag job as errored and report to backend & admin panel
    socket.emit('agent_job_status', {
      jobId: job.jobId,
      shopId: job.shopId,
      status: 'failed',
      printerId: job.printerId,
      errorMessage: err.message || 'Hardware printer error occurred during printing.',
    });
  } finally {
    // Clean up temp spool file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        // Ignored
      }
    }
    isProcessingJob = false;
    console.log(`----------------------------------------------------\n`);
  }
}

startAgent();
