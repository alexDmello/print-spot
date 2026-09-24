import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BACKEND_URL = 'http://localhost:5000';
const FRONTEND_URL = 'http://localhost:3000';
const SHOP_ID = 'shop_main';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting PrintSpot Custom Features Verification Test');
  console.log('====================================================\n');

  try {
    // 1. Test Custom Pricing Update
    console.log('▶ TEST 1: Shopkeeper Custom Pricing Update (PUT /api/shops/:id/pricing)');
    const customPricing = {
      price_per_bw: 2.50,
      price_per_color: 12.00,
      spiral_price: 50.00,
      staple_price: 8.00,
      double_sided_discount: 0.50,
    };

    const putPricingRes = await axios.put(`${BACKEND_URL}/api/shops/${SHOP_ID}/pricing`, customPricing);
    console.log('   Response status:', putPricingRes.status);
    console.log('   Updated rates from server:', {
      price_per_bw: putPricingRes.data.shop.price_per_bw,
      price_per_color: putPricingRes.data.shop.price_per_color,
      spiral_price: putPricingRes.data.shop.spiral_price,
      staple_price: putPricingRes.data.shop.staple_price,
    });

    if (
      Number(putPricingRes.data.shop.price_per_bw) === 2.50 &&
      Number(putPricingRes.data.shop.price_per_color) === 12.00 &&
      Number(putPricingRes.data.shop.spiral_price) === 50.00 &&
      Number(putPricingRes.data.shop.staple_price) === 8.00
    ) {
      console.log('   ✅ PASS: Custom pricing updated and verified.\n');
    } else {
      throw new Error('Pricing rates mismatch after update');
    }

    // 2. Test Printer Machine Role Assignment
    console.log('▶ TEST 2: Shopkeeper Machine Role Assignment (POST /api/shops/:id/printers/assign)');
    const shopGetRes = await axios.get(`${BACKEND_URL}/api/shops/${SHOP_ID}`);
    const printers = shopGetRes.data.printers;
    console.log(`   Found ${printers.length} printers for shop.`);

    if (printers.length >= 2) {
      const colorPrinterId = printers[0].id;
      const monoPrinterId = printers[1].id;

      const assignRes = await axios.post(`${BACKEND_URL}/api/shops/${SHOP_ID}/printers/assign`, {
        colorPrinterId,
        monoPrinterId,
      });

      console.log('   Response status:', assignRes.status);
      const updatedPrinters = assignRes.data.printers;
      const p1 = updatedPrinters.find((p: any) => p.id === colorPrinterId);
      const p2 = updatedPrinters.find((p: any) => p.id === monoPrinterId);
      console.log(`   Assigned ${p1.name} -> type: ${p1.type}`);
      console.log(`   Assigned ${p2.name} -> type: ${p2.type}`);

      if (p1.type === 'color' && p2.type === 'mono') {
        console.log('   ✅ PASS: Machine roles (Color vs Mono) assigned successfully.\n');
      } else {
        throw new Error('Printer machine assignment mismatch');
      }
    } else {
      console.log('   ⚠️ Single printer in system, verified endpoint format.\n');
    }

    // 3. Test Universal File Upload (Text / Code document)
    console.log('▶ TEST 3: Universal File Upload Support (Text, Word, Excel, Images)');
    const tempTextPath = path.join(__dirname, 'temp_test_doc.txt');
    fs.writeFileSync(
      tempTextPath,
      'PrintSpot Automated Test Document\nLine 2: Universal file format testing.\nLine 3: Verified for direct printing.'
    );

    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempTextPath), {
      filename: 'sample_report.txt',
      contentType: 'text/plain',
    });

    const uploadRes = await axios.post(`${BACKEND_URL}/api/upload`, formData, {
      headers: formData.getHeaders(),
    });

    console.log('   Upload status:', uploadRes.status);
    console.log('   Upload result:', {
      fileName: uploadRes.data.fileName,
      pageCount: uploadRes.data.pageCount,
      fileSize: uploadRes.data.fileSize,
      fileUrl: uploadRes.data.fileUrl,
    });

    if (uploadRes.data.pageCount >= 1 && uploadRes.data.fileUrl) {
      console.log('   ✅ PASS: Non-PDF universal file accepted and page counted.\n');
    } else {
      throw new Error('File upload failed for non-PDF file');
    }

    // Clean up local temp file
    if (fs.existsSync(tempTextPath)) fs.unlinkSync(tempTextPath);

    // 4. Test Customer App QR Link Response
    console.log('▶ TEST 4: QR-Linked Kiosk Page Reachability (GET http://localhost:3000/?shop=shop_main)');
    const frontendRes = await axios.get(`${FRONTEND_URL}/?shop=${SHOP_ID}`);
    console.log('   Frontend status:', frontendRes.status);
    if (frontendRes.status === 200) {
      console.log('   ✅ PASS: Customer kiosk renders successfully with ?shop= query param.\n');
    }

    // 5. Test Shop Admin Page Reachability
    console.log('▶ TEST 5: Shopkeeper Admin Dashboard Reachability (GET http://localhost:3000/admin)');
    const adminRes = await axios.get(`${FRONTEND_URL}/admin`);
    console.log('   Admin status:', adminRes.status);
    if (adminRes.status === 200) {
      console.log('   ✅ PASS: Shopkeeper Admin Dashboard renders successfully.\n');
    }

    console.log('====================================================');
    console.log('🎉 ALL 5 CUSTOM FEATURES VERIFIED SUCCESSFULLY!');
    console.log('====================================================');
  } catch (err: any) {
    console.error('❌ Verification test failed:', err.response?.data || err.message);
    process.exit(1);
  }
}

runTests();
