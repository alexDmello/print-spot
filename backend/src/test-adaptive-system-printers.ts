import assert from 'assert';

async function runTests() {
  console.log('🧪 Starting verification tests for Adaptive Admin, System Printers, & Merged Kiosk...\n');

  const BASE_URL = 'http://localhost:5000';

  // Test 1: System Hardware Printer Detection
  console.log('Test 1: Querying system hardware printer detection endpoint...');
  const detectRes = await fetch(`${BASE_URL}/api/shops/shop_main/printers/system-hardware`);
  assert.strictEqual(detectRes.status, 200, 'detectRes status should be 200');
  const detectData = await detectRes.json();
  assert.strictEqual(detectData.success, true, 'detectData should succeed');
  assert(Array.isArray(detectData.printers), 'printers should be an array');
  assert(detectData.printers.length > 0, 'should detect at least 1 system printer');
  console.log(`   ✅ Successfully detected ${detectData.printers.length} host system printer(s):`);
  detectData.printers.forEach((p: any) => console.log(`      - ${p.name} (${p.driver}) [${p.status}]`));

  // Test 2: One-click Assignment of System Printer to Mono Role
  console.log('\nTest 2: Assigning system printer to B&W (mono) role...');
  const targetPrinter = detectData.printers[0];
  const assignMonoRes = await fetch(`${BASE_URL}/api/shops/shop_main/printers/assign-system`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${targetPrinter.name} (B&W Dedicated)`,
      system_name: targetPrinter.system_name,
      type: 'mono',
    }),
  });
  assert.strictEqual(assignMonoRes.status, 200, 'assignMono status should be 200');
  const assignMonoData = await assignMonoRes.json();
  assert.strictEqual(assignMonoData.success, true);
  const foundMono = assignMonoData.printers.find((p: any) => p.system_name === targetPrinter.system_name);
  assert(foundMono, 'Assigned printer should be in shop printers');
  assert.strictEqual(foundMono.type, 'mono');
  console.log(`   ✅ Successfully assigned "${targetPrinter.name}" as Mono device!`);

  // Test 3: One-click Assignment of System Printer to Color Role
  console.log('\nTest 3: Assigning system printer to Color role...');
  const assignColorRes = await fetch(`${BASE_URL}/api/shops/shop_main/printers/assign-system`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${targetPrinter.name} (Color Dedicated)`,
      system_name: targetPrinter.system_name,
      type: 'color',
    }),
  });
  assert.strictEqual(assignColorRes.status, 200, 'assignColor status should be 200');
  const assignColorData = await assignColorRes.json();
  assert.strictEqual(assignColorData.success, true);
  const foundColor = assignColorData.printers.find((p: any) => p.system_name === targetPrinter.system_name);
  assert.strictEqual(foundColor.type, 'color');
  console.log(`   ✅ Successfully switched "${targetPrinter.name}" to Color device!`);

  // Test 4: Job creation with 4-in-1 Grid Printing layout & payment
  console.log('\nTest 4: Creating a job with 4-in-1 Grid Printing layout...');
  const authRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: '9876543210',
      otp: '123456',
      name: 'College Student (Cheatsheet)',
    }),
  });
  const authData = await authRes.json();
  const userId = authData.user.id;

  const jobRes = await fetch(`${BASE_URL}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      shopId: 'shop_main',
      fileUrl: '/uploads/sample_cheatsheet.pdf',
      fileName: 'Lecture_Notes_Cheatsheet.pdf',
      fileSize: 524288,
      pageCount: 8,
      settings: {
        copies: 1,
        color: false,
        duplex: true,
        pagesPerSheet: 4, // 8 pages in 4-in-1 duplex = 1 physical sheet!
      },
      price: 2.0, // 1 sheet * ₹2
    }),
  });
  assert.strictEqual(jobRes.status, 201, 'job creation status should be 201');
  const jobData = await jobRes.json();
  assert(jobData.job.id, 'Job ID should be created');

  // Verify payment to assign FIFO token
  const payRes = await fetch(`${BASE_URL}/api/payments/verify-simulated`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: jobData.job.id,
    }),
  });
  assert.strictEqual(payRes.status, 200, 'payRes status should be 200');
  const payData = await payRes.json();
  assert(payData.tokenCode, 'Token code should be assigned');
  console.log(`   ✅ Job spooled & paid successfully with FIFO Token Code: ${payData.tokenCode} (Queue Position: #${payData.position})`);

  console.log('\n🎉 ALL TESTS PASSED! All 4 enhancements verified successfully.\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
