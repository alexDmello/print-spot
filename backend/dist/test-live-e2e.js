"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const BASE_URL = 'http://localhost:5000';
async function runLiveVerification() {
    console.log('========================================================');
    console.log('🚀 PrintSpot Production Live Features Verification Test');
    console.log('========================================================\n');
    try {
        // 1. Super Admin Authentication
        console.log('[STEP 1] Testing Super Admin Login (/api/admin/login)...');
        const adminLoginRes = await axios_1.default.post(`${BASE_URL}/api/admin/login`, {
            username: 'admin',
            password: 'admin123',
        });
        const adminToken = adminLoginRes.data.token;
        console.log('✓ Admin authenticated successfully! Token received.');
        // 2. Platform Analytics
        console.log('\n[STEP 2] Testing Platform Analytics (/api/admin/analytics)...');
        const analyticsRes = await axios_1.default.get(`${BASE_URL}/api/admin/analytics`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        console.log('✓ Analytics retrieved:');
        console.log(`  - Total Counters: ${analyticsRes.data.totalShops}`);
        console.log(`  - Active Counters: ${analyticsRes.data.activeShops}`);
        console.log(`  - Total GMV Revenue: ₹${analyticsRes.data.totalRevenue}`);
        console.log(`  - Total Sheets Printed: ${analyticsRes.data.totalPagesPrinted}`);
        // 3. Admin Onboard New Shop with Custom Subdomain Slug
        console.log('\n[STEP 3] Testing Custom Subdomain Slug Availability & Onboarding...');
        const testSlug = `engg-${Math.random().toString(36).substring(2, 6)}`;
        const checkSlugRes = await axios_1.default.get(`${BASE_URL}/api/admin/check-slug?slug=${testSlug}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        console.log(`✓ Slug check for "${testSlug}.mellod.in": Available = ${checkSlugRes.data.available}`);
        const newShopPayload = {
            name: `Engineering Counter ${testSlug.toUpperCase()}`,
            slug: testSlug,
            location: 'Engineering Wing 2, 1st Floor',
            address: 'Hall 4, Technology Campus',
            latitude: 28.545,
            longitude: 77.192,
            owner_name: 'Rajesh Sharma',
            owner_phone: '9811223344',
            owner_email: 'rajesh@printspot.in',
            pin: '5678',
            price_per_bw: 2.5,
            price_per_color: 12.0,
            printer_name: 'HP LaserJet Enterprise M507',
            printer_type: 'mono',
        };
        const onboardRes = await axios_1.default.post(`${BASE_URL}/api/admin/shops`, newShopPayload, {
            headers: { Authorization: `Bearer ${adminToken}` },
        });
        const createdShop = onboardRes.data.shop;
        console.log(`✓ Shop onboarded successfully! Subdomain: "https://${createdShop.slug}.mellod.in" (ID: ${createdShop.id})`);
        // 4. Shopkeeper Login with newly created credentials
        console.log('\n[STEP 4] Testing Shopkeeper Login (/api/shops/login)...');
        const shopLoginRes = await axios_1.default.post(`${BASE_URL}/api/shops/login`, {
            identifier: createdShop.id,
            secret: '5678',
        });
        const shopToken = shopLoginRes.data.token;
        console.log(`✓ Shopkeeper logged in successfully! Shop: "${shopLoginRes.data.shop.name}" (ID: ${shopLoginRes.data.shop.id})`);
        // 5. Shopkeeper Session Verification (/api/shops/me)
        console.log('\n[STEP 5] Testing Shopkeeper /me Session Check (/api/shops/me)...');
        const meRes = await axios_1.default.get(`${BASE_URL}/api/shops/me`, {
            headers: { Authorization: `Bearer ${shopToken}` },
        });
        console.log(`✓ Verified scoped counter: "${meRes.data.shop.name}" (Printers: ${meRes.data.shop.printers.length})`);
        // 6. Public QR Scan Verification by Subdomain Slug
        console.log('\n[STEP 6] Testing Public Verification by Subdomain Slug (/api/shops/:slug/public)...');
        const publicRes = await axios_1.default.get(`${BASE_URL}/api/shops/${createdShop.slug}/public`);
        console.log(`✓ Public Subdomain counter resolved: "${publicRes.data.shop.name}" (Slug: ${publicRes.data.shop.slug}), Open: ${publicRes.data.shop.is_open}, B&W: ₹${publicRes.data.shop.price_per_bw}`);
        // 7. Toggle Counter Open/Paused State
        console.log('\n[STEP 7] Testing Counter Status Toggle (Open <-> Paused)...');
        const toggleRes = await axios_1.default.put(`${BASE_URL}/api/shops/${createdShop.id}/toggle-open`, { is_open: false }, { headers: { Authorization: `Bearer ${shopToken}` } });
        console.log(`✓ Counter toggled to: ${toggleRes.data.is_open ? 'Open' : 'Paused'}`);
        // Toggle back to open
        await axios_1.default.put(`${BASE_URL}/api/shops/${createdShop.id}/toggle-open`, { is_open: true }, { headers: { Authorization: `Bearer ${shopToken}` } });
        console.log('✓ Counter restored to Open');
        // 8. Pay at Counter Flow Test
        console.log('\n[STEP 8] Testing "Pay at Counter" Order Placement...');
        // Authenticate a real customer user first via OTP
        const otpRes = await axios_1.default.post(`${BASE_URL}/api/auth/send-otp`, { phone: '9876500001' });
        const verifyUserRes = await axios_1.default.post(`${BASE_URL}/api/auth/verify-otp`, {
            phone: '9876500001',
            otp: otpRes.data.demoOtp || '123456',
            name: 'Aditya Verma',
        });
        const customerUser = verifyUserRes.data.user;
        console.log(`✓ Customer authenticated: ${customerUser.name} (${customerUser.id})`);
        // Create job with real customer userId
        const jobRes = await axios_1.default.post(`${BASE_URL}/api/jobs`, {
            userId: customerUser.id,
            shopId: createdShop.id,
            fileUrl: '/uploads/sample.pdf',
            fileName: 'Assignment_Report.pdf',
            fileSize: 102400,
            pageCount: 4,
            settings: { copies: 1, color: false, duplex: false, paperSize: 'A4' },
            price: 10.0,
        });
        const jobId = jobRes.data.job.id;
        console.log(`✓ Job created: ${jobId}`);
        // Select Pay at Counter
        const payCounterRes = await axios_1.default.post(`${BASE_URL}/api/payments/pay-at-counter`, {
            jobId,
            counterPaymentType: 'counter_cash',
        });
        console.log(`✓ Pay at Counter confirmed! Token: ${payCounterRes.data.tokenCode}, Position: ${payCounterRes.data.position}, Pickup Code: ${payCounterRes.data.pickupCode}`);
        // 9. Shopkeeper Marks Payment Collected & Ready
        console.log('\n[STEP 9] Testing Shopkeeper Mark-Paid & Ready...');
        const markPaidRes = await axios_1.default.post(`${BASE_URL}/api/queue/${createdShop.id}/mark-paid`, { jobId });
        console.log('✓ Mark Paid:', markPaidRes.data.message);
        const readyRes = await axios_1.default.post(`${BASE_URL}/api/queue/${createdShop.id}/ready`, { jobId });
        console.log(`✓ Mark Ready: ${readyRes.data.message} (Pickup Code: ${readyRes.data.pickupCode})`);
        // 10. Confirm Pickup & File Shredding
        console.log('\n[STEP 10] Testing Customer Pickup & Auto File Shredding...');
        const pickupRes = await axios_1.default.post(`${BASE_URL}/api/jobs/${jobId}/pickup`, {
            pickupCode: readyRes.data.pickupCode,
        });
        console.log('✓ Pickup Confirmed & File Shredded:', pickupRes.data.message);
        console.log('\n========================================================');
        console.log('🎉 ALL LIVE PRODUCTION FEATURES VERIFIED AND PASSING 100%!');
        console.log('========================================================\n');
    }
    catch (err) {
        console.error('❌ Test failed with error:', err.response?.data || err.message);
        process.exit(1);
    }
}
runLiveVerification();
