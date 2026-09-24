import fs from 'fs';
import path from 'path';
import axios from 'axios';
import FormData from 'form-data';

const BASE_URL = 'http://localhost:5000';

async function runEndToEndTest() {
  console.log('=============================================================');
  console.log('🧪 Starting PrintSpot End-to-End Automated Verification Test');
  console.log('=============================================================');

  // 1. Health check & Shop query
  console.log('\n[TEST 1] Testing /health and /api/shops...');
  const healthRes = await axios.get(`${BASE_URL}/health`);
  console.log('✓ Health:', healthRes.data);

  const shopsRes = await axios.get(`${BASE_URL}/api/shops`);
  if (!shopsRes.data || shopsRes.data.length === 0) {
    throw new Error('No shops returned from /api/shops');
  }
  const shop = shopsRes.data[0];
  console.log(`✓ Default Shop found: "${shop.name}" (ID: ${shop.id})`);
  console.log(`✓ Connected printers: ${shop.printers.map((p: any) => p.name).join(', ')}`);

  // 2. Test File Upload validation - Reject unsupported file format
  console.log('\n[TEST 2] Testing File Validation: Reject unsupported file format (.txt)...');
  const invalidFilePath = path.join(__dirname, 'test_unsupported.txt');
  fs.writeFileSync(invalidFilePath, 'This is an unsupported text document that should be rejected.');

  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(invalidFilePath));
    await axios.post(`${BASE_URL}/api/upload`, form, { headers: form.getHeaders() });
    throw new Error('FAILED: Server accepted unsupported .txt file!');
  } catch (err: any) {
    if (err.response && err.response.status === 400) {
      console.log('✓ Correctly REJECTED unsupported format with 400:', err.response.data.error);
    } else {
      throw err;
    }
  } finally {
    if (fs.existsSync(invalidFilePath)) fs.unlinkSync(invalidFilePath);
  }

  // 3. Test File Upload validation - Accept valid PDF
  console.log('\n[TEST 3] Testing File Upload: Accept valid PDF document...');
  // Create a minimal 2-page valid PDF buffer
  const samplePdfPath = path.join(__dirname, 'sample_test_doc.pdf');
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([595, 842]); // Page 1 A4
  pdfDoc.addPage([595, 842]); // Page 2 A4
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(samplePdfPath, pdfBytes);

  const formPdf = new FormData();
  formPdf.append('file', fs.createReadStream(samplePdfPath));
  const uploadRes = await axios.post(`${BASE_URL}/api/upload`, formPdf, { headers: formPdf.getHeaders() });
  console.log('✓ Upload successful:', uploadRes.data);
  if (uploadRes.data.pageCount !== 2) {
    throw new Error(`Expected pageCount 2, got ${uploadRes.data.pageCount}`);
  }
  console.log(`✓ PDF Page count accurately detected: ${uploadRes.data.pageCount} pages`);
  const uploadedFileUrl = uploadRes.data.fileUrl;
  const uploadedFileName = uploadRes.data.fileName;
  const storedName = uploadRes.data.storedName;

  // 4. Test Customer Phone OTP Auth
  console.log('\n[TEST 4] Testing Customer Phone OTP Authentication...');
  const testPhone = '9876543210';
  const otpRes = await axios.post(`${BASE_URL}/api/auth/send-otp`, { phone: testPhone });
  const demoOtp = otpRes.data.demoOtp;
  console.log(`✓ OTP generated for +91 ${testPhone}: ${demoOtp}`);

  const verifyRes = await axios.post(`${BASE_URL}/api/auth/verify-otp`, {
    phone: testPhone,
    otp: demoOtp,
    name: 'Priya Sharma',
  });
  console.log('✓ User verified:', verifyRes.data.user);
  const user = verifyRes.data.user;

  // 5. Create Print Job (Pre-payment)
  console.log('\n[TEST 5] Creating Print Job (Pre-payment: 2 copies, Full Color, A4)...');
  const settings = {
    copies: 2,
    color: true,
    duplex: false,
    paperSize: 'A4',
  };
  const pricePerColor = Number(shop.price_per_color);
  const expectedPrice = uploadRes.data.pageCount * settings.copies * pricePerColor; // 2 * 2 * 10 = 40

  const createJobRes = await axios.post(`${BASE_URL}/api/jobs`, {
    userId: user.id,
    shopId: shop.id,
    fileUrl: uploadedFileUrl,
    fileName: uploadedFileName,
    fileSize: uploadRes.data.fileSize,
    pageCount: uploadRes.data.pageCount,
    settings,
    price: expectedPrice,
  });
  const job = createJobRes.data.job;
  console.log(`✓ Job created with status '${job.status}', total price: ₹${job.price}`);

  // 6. Confirm Payment & Enter FIFO Queue
  console.log('\n[TEST 6] Confirming Payment & Strictly Enqueuing Job...');
  const payConfirmRes = await axios.post(`${BASE_URL}/api/payments/verify-simulated`, {
    jobId: job.id,
  });
  console.log('✓ Payment confirmed & token assigned:', payConfirmRes.data);
  const { tokenNumber, tokenCode, pickupCode } = payConfirmRes.data;
  console.log(`✓ Token: ${tokenCode}, Position: ${payConfirmRes.data.position}, Pickup Code: ${pickupCode}`);

  // 7. Wait for Printer Agent to automatically process the job
  console.log('\n[TEST 7] Waiting for Printer Agent to process & print document...');
  let jobStatus = 'waiting';
  for (let attempt = 1; attempt <= 15; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    const statusRes = await axios.get(`${BASE_URL}/api/jobs/${job.id}`);
    jobStatus = statusRes.data.job.status;
    console.log(`   Attempt ${attempt}s: Job status is '${jobStatus}'`);
    if (jobStatus === 'ready') break;
  }

  if (jobStatus !== 'ready') {
    throw new Error(`Expected job status 'ready', but got '${jobStatus}'`);
  }
  console.log('✓ Printer Agent received, spooled, and completed job to READY state!');

  // 8. Verify Admin Stats
  console.log('\n[TEST 8] Verifying Shop Admin Stats...');
  const statsRes = await axios.get(`${BASE_URL}/api/shops/${shop.id}/stats`);
  console.log('✓ Admin stats:', statsRes.data);
  if (statsRes.data.completedJobsToday < 1) {
    throw new Error('Admin stats does not reflect completed job');
  }

  // 9. Confirm Pickup & verify 24h Auto-delete policy shredded the file
  console.log('\n[TEST 9] Customer Confirms Pickup & Auto-Delete Policy Shreds File...');
  const uploadedFilePathOnDisk = path.join(__dirname, 'backend', 'uploads', storedName);
  console.log(`   File before pickup exists on disk: ${fs.existsSync(uploadedFilePathOnDisk)}`);

  const pickupRes = await axios.post(`${BASE_URL}/api/jobs/${job.id}/pickup`, {
    pickupCode,
  });
  console.log('✓ Pickup response:', pickupRes.data);

  const fileExistsAfterPickup = fs.existsSync(uploadedFilePathOnDisk);
  console.log(`   File after pickup exists on disk: ${fileExistsAfterPickup}`);
  if (fileExistsAfterPickup) {
    throw new Error('File was NOT auto-deleted upon pickup!');
  }
  console.log('✓ 24-hour / pickup auto-delete policy successfully destroyed the uploaded file!');

  // Clean up local temp file
  if (fs.existsSync(samplePdfPath)) fs.unlinkSync(samplePdfPath);

  console.log('\n=============================================================');
  console.log('🎉 ALL 9 END-TO-END AUTOMATED VERIFICATION TESTS PASSED!');
  console.log('=============================================================');
}

runEndToEndTest().catch((err) => {
  console.error('\n❌ TEST RUN FAILED:', err.message);
  if (err.response) {
    console.error('Response data:', err.response.data);
  }
  process.exit(1);
});
