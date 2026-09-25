"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const BACKEND_URL = 'http://localhost:5000';
const FRONTEND_URL = 'http://localhost:3000';
async function runOnboardingAndDeviceTests() {
    console.log('===============================================================');
    console.log('🧪 Starting PrintSpot Onboarding, Devices & Services Test Suite');
    console.log('===============================================================\n');
    try {
        // 1. Test Shop Self-Onboarding
        console.log('▶ TEST 1: Shop Self-Onboarding (POST /api/shops/onboard)');
        const onboardPayload = {
            name: 'Metro QuickPrint Express',
            location: 'Gate 1, Metro Station Concourse',
            address: 'Shop 102, Metro Concourse, Rajiv Chowk, New Delhi, Delhi 110001',
            latitude: 28.6328,
            longitude: 77.2197,
            owner_name: 'Rajesh Kumar',
            owner_phone: '9876500001',
            owner_email: 'rajesh@metroprint.in',
            opening_time: '07:30 AM',
            closing_time: '11:00 PM',
            working_days: 'All 7 Days',
            upi_id: 'metroprint@okaxis',
            price_per_bw: 2.0,
            price_per_color: 10.0,
            printers: [
                {
                    name: 'Front Counter Laser Mono',
                    type: 'mono',
                    status: 'online',
                    system_name: 'Microsoft Print to PDF',
                },
                {
                    name: 'Color Lab LaserJet C300',
                    type: 'color',
                    status: 'online',
                    system_name: 'Microsoft Print to PDF',
                },
            ],
        };
        const onboardRes = await axios_1.default.post(`${BACKEND_URL}/api/shops/onboard`, onboardPayload);
        console.log('   Response status:', onboardRes.status);
        const newShop = onboardRes.data.shop;
        console.log('   Created Shop ID:', newShop.id);
        console.log('   Created Shop Name:', newShop.name);
        console.log('   Marked Coordinates:', {
            latitude: newShop.latitude,
            longitude: newShop.longitude,
        });
        console.log('   Initial Printers Count:', newShop.printers?.length);
        console.log('   Default Services Seeded:', newShop.services?.map((s) => `${s.name} (₹${s.price})`));
        if (!newShop.id || newShop.printers?.length !== 2 || newShop.services?.length < 2) {
            throw new Error('Onboarding failed to set up shop, printers, or services');
        }
        console.log('   ✅ PASS: Shop self-onboarding successful with map coordinates & services.\n');
        const shopId = newShop.id;
        // 2. Test Multiple Device Management (Adding 3rd Device)
        console.log('▶ TEST 2: Add Additional Device / Printer (POST /api/shops/:id/printers)');
        const addPrinterRes = await axios_1.default.post(`${BACKEND_URL}/api/shops/${shopId}/printers`, {
            name: 'High-Volume Backoffice Spooler',
            type: 'mono',
            system_name: 'Microsoft Print to PDF',
            status: 'online',
        });
        console.log('   Response status:', addPrinterRes.status);
        console.log('   Total devices now:', addPrinterRes.data.printers?.length);
        const addedPrinter = addPrinterRes.data.printers.find((p) => p.name === 'High-Volume Backoffice Spooler');
        if (!addedPrinter)
            throw new Error('Added printer not found in shop printers list');
        console.log('   ✅ PASS: Shop owner successfully added additional printer device.\n');
        // 3. Test Device Status Toggle (Toggle to offline)
        console.log('▶ TEST 3: Toggle Device Status (PUT /api/shops/:id/printers/:printerId)');
        const toggleRes = await axios_1.default.put(`${BACKEND_URL}/api/shops/${shopId}/printers/${addedPrinter.id}`, {
            status: 'offline',
        });
        const updatedPrinter = toggleRes.data.printers.find((p) => p.id === addedPrinter.id);
        console.log('   Updated printer status:', updatedPrinter.status);
        if (updatedPrinter.status !== 'offline')
            throw new Error('Device status toggle failed');
        console.log('   ✅ PASS: Device status toggled between Online and Offline.\n');
        // 4. Test Services Catalog (Toggle Color off & Create Custom Service)
        console.log('▶ TEST 4: Services Catalog Management (Toggle Color & Add Custom Service)');
        const servicesRes = await axios_1.default.get(`${BACKEND_URL}/api/shops/${shopId}/services`);
        const servicesList = servicesRes.data;
        const colorService = servicesList.find((s) => s.name.toLowerCase().includes('color'));
        if (colorService) {
            // Toggle Color service OFF (e.g. Out of toner)
            const toggleServiceRes = await axios_1.default.put(`${BACKEND_URL}/api/shops/${shopId}/services/${colorService.id}`, {
                enabled: false,
            });
            const toggled = toggleServiceRes.data.services.find((s) => s.id === colorService.id);
            console.log(`   Toggled Color Service enabled state: ${toggled.enabled}`);
            if (toggled.enabled !== false)
                throw new Error('Failed to toggle Color service');
            console.log('   ✅ PASS: Shopkeeper successfully toggled Color service to disabled.');
        }
        // Add a custom service (e.g. Glossy Photo Paper)
        const addServiceRes = await axios_1.default.post(`${BACKEND_URL}/api/shops/${shopId}/services`, {
            name: 'Ultra Glossy Photo Sheet',
            category: 'paper',
            price: 25.0,
            unit: 'page',
            description: '240 GSM mirror finish photo paper',
        });
        const customService = addServiceRes.data.services.find((s) => s.name === 'Ultra Glossy Photo Sheet');
        if (!customService || Number(customService.price) !== 25.0) {
            throw new Error('Failed to create custom service');
        }
        console.log(`   Created custom service: ${customService.name} @ ₹${customService.price}/${customService.unit}`);
        console.log('   ✅ PASS: Custom service created and verified in shop catalog.\n');
        // 5. Test Shop Profile Update (Location & Map coordinates)
        console.log('▶ TEST 5: Shop Profile & Coordinates Update (PUT /api/shops/:id)');
        const updateProfileRes = await axios_1.default.put(`${BACKEND_URL}/api/shops/${shopId}`, {
            address: 'Shop 102 (Platform Level), Rajiv Chowk Metro, Connaught Place, New Delhi',
            latitude: 28.6335,
            longitude: 77.2185,
            opening_time: '07:00 AM',
        });
        console.log('   Updated coordinates:', {
            latitude: updateProfileRes.data.shop.latitude,
            longitude: updateProfileRes.data.shop.longitude,
        });
        console.log('   Updated address:', updateProfileRes.data.shop.address);
        if (Number(updateProfileRes.data.shop.latitude) !== 28.6335) {
            throw new Error('Coordinates update mismatch');
        }
        console.log('   ✅ PASS: Shop profile and map coordinates successfully updated.\n');
        // 6. Test Frontend Reachability
        console.log('▶ TEST 6: Frontend Route Verifications');
        const [kioskRes, adminRes, onboardPageRes] = await Promise.all([
            axios_1.default.get(`${FRONTEND_URL}/?shop=${shopId}`),
            axios_1.default.get(`${FRONTEND_URL}/admin?shop=${shopId}`),
            axios_1.default.get(`${FRONTEND_URL}/onboard`),
        ]);
        console.log(`   Customer Kiosk (/?shop=${shopId}):`, kioskRes.status);
        console.log(`   Admin Dashboard (/admin?shop=${shopId}):`, adminRes.status);
        console.log(`   Self-Onboarding Wizard (/onboard):`, onboardPageRes.status);
        if (kioskRes.status === 200 && adminRes.status === 200 && onboardPageRes.status === 200) {
            console.log('   ✅ PASS: All frontend routes render with 200 OK.\n');
        }
        console.log('===============================================================');
        console.log('🎉 ALL 6 COMPREHENSIVE ONBOARDING & DEVICE TESTS PASSED!');
        console.log('===============================================================');
    }
    catch (err) {
        console.error('❌ Test failed:', err.response?.data || err.message);
        process.exit(1);
    }
}
runOnboardingAndDeviceTests();
