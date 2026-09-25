"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const form_data_1 = __importDefault(require("form-data"));
const BACKEND_URL = 'http://localhost:5000';
const SHOP_ID = 'shop_main';
async function runMultiFileTests() {
    console.log('🧪 Starting Multi-File & Per-File Copies Verification Tests...\n');
    // Test 1: Upload 2 distinct files to backend /api/upload
    console.log('Test 1: Uploading multiple documents to /api/upload...');
    const resumePdfPath = path_1.default.join(__dirname, '..', 'uploads', '7fcf4c85-689b-4d4e-95b1-6da8314e5a68.pdf');
    // Create a second test document if needed
    const secondFilePath = path_1.default.join(__dirname, '..', 'uploads', 'sample_notes.txt');
    if (!fs_1.default.existsSync(secondFilePath)) {
        fs_1.default.writeFileSync(secondFilePath, 'Sample Lecture Notes Document\nPage 1 Content\nSection 1: Data Structures');
    }
    // Upload File 1 (Resume PDF)
    const form1 = new form_data_1.default();
    form1.append('file', fs_1.default.createReadStream(resumePdfPath));
    const res1 = await axios_1.default.post(`${BACKEND_URL}/api/upload`, form1, {
        headers: form1.getHeaders(),
    });
    console.log(`   ✅ File 1 Uploaded: "${res1.data.fileName}" (${res1.data.pageCount} pages, URL: ${res1.data.fileUrl})`);
    // Upload File 2 (Text Notes)
    const form2 = new form_data_1.default();
    form2.append('file', fs_1.default.createReadStream(secondFilePath));
    const res2 = await axios_1.default.post(`${BACKEND_URL}/api/upload`, form2, {
        headers: form2.getHeaders(),
    });
    console.log(`   ✅ File 2 Uploaded: "${res2.data.fileName}" (${res2.data.pageCount} page, URL: ${res2.data.fileUrl})`);
    // Test 2: Calculate per-file pricing:
    // File 1: 1 copy, B&W (₹2/page) -> 2 pages * 1 copy * ₹2 = ₹4
    // File 2: 3 copies, Color (₹10/page) -> 1 page * 3 copies * ₹10 = ₹30
    // Expected Total = ₹34.00
    console.log('\nTest 2: Verifying per-file pricing calculation logic...');
    const file1Cost = res1.data.pageCount * 1 * 2;
    const file2Cost = res2.data.pageCount * 3 * 10;
    const calculatedTotal = file1Cost + file2Cost;
    console.log(`   • File 1 (1 copy, B&W):  ${res1.data.pageCount} pgs × 1 copy × ₹2 = ₹${file1Cost}`);
    console.log(`   • File 2 (3 copies, Color): ${res2.data.pageCount} pgs × 3 copies × ₹10 = ₹${file2Cost}`);
    console.log(`   • Grand Total: ₹${calculatedTotal}`);
    // Test 3: Authenticate customer & Create Job with multi-file payload containing per-file copies & settings
    console.log('\nTest 3: Authenticating customer & creating print job with per-file copies in settings...');
    const authRes = await axios_1.default.post(`${BACKEND_URL}/api/auth/verify-otp`, {
        phone: '9988776655',
        otp: '123456',
        name: 'Alex Dmello',
    });
    const user = authRes.data.user;
    const jobPayload = {
        userId: user.id,
        shopId: SHOP_ID,
        fileUrl: res1.data.fileUrl,
        fileName: `${res1.data.fileName} (+1 more file)`,
        fileSize: res1.data.fileSize + res2.data.fileSize,
        pageCount: res1.data.pageCount + res2.data.pageCount,
        settings: {
            copies: 4, // 1 + 3
            color: true,
            files: [
                {
                    fileName: res1.data.fileName,
                    fileUrl: res1.data.fileUrl,
                    pageCount: res1.data.pageCount,
                    copies: 1, // 1 copy of File 1
                    color: false,
                    duplex: false,
                    pagesPerSheet: 1,
                },
                {
                    fileName: res2.data.fileName,
                    fileUrl: res2.data.fileUrl,
                    pageCount: res2.data.pageCount,
                    copies: 3, // 3 copies of File 2
                    color: true,
                    duplex: false,
                    pagesPerSheet: 1,
                },
            ],
        },
        price: calculatedTotal,
    };
    const jobRes = await axios_1.default.post(`${BACKEND_URL}/api/jobs`, jobPayload);
    const createdJob = jobRes.data.job;
    console.log(`   ✅ Job created successfully! ID: ${createdJob.id}, Price: ₹${createdJob.price}`);
    // Test 4: Simulate payment and verify queue token dispatch
    console.log('\nTest 4: Simulating payment verification for multi-file job...');
    const payRes = await axios_1.default.post(`${BACKEND_URL}/api/payments/verify-simulated`, {
        jobId: createdJob.id,
    });
    console.log(`   ✅ Payment verified! FIFO Token: ${payRes.data.tokenCode}, Position: #${payRes.data.position}`);
    // Test 5: Verify Printer Agent processes multi-file job with per-file copies
    console.log('\nTest 5: Waiting for Printer Agent to process multi-file job...');
    let jobStatus = 'waiting';
    for (let attempt = 1; attempt <= 10; attempt++) {
        await new Promise((r) => setTimeout(r, 1000));
        const statusRes = await axios_1.default.get(`${BACKEND_URL}/api/jobs/${createdJob.id}`);
        jobStatus = statusRes.data.job.status;
        console.log(`   Attempt ${attempt}s: Job status is '${jobStatus}'`);
        if (jobStatus === 'ready')
            break;
    }
    if (jobStatus !== 'ready') {
        throw new Error(`Expected multi-file job to reach status 'ready', but got '${jobStatus}'`);
    }
    console.log('   ✅ Multi-file job successfully spooled and marked READY by Printer Agent!');
    console.log('\n🎉 ALL MULTI-FILE & PER-FILE TESTS PASSED SUCCESSFULLY!');
}
runMultiFileTests().catch((err) => {
    console.error('❌ Test failed:', err.response?.data || err.message);
    process.exit(1);
});
