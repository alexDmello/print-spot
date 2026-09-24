'use client';

import React, { useState } from 'react';
import { User, Shop, UploadedDocument } from '@/lib/types';
import { MobileBottomCta } from './MobileBottomCta';
import {
  CreditCard,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Tag,
  Phone,
  RotateCw,
  Lock,
  ArrowRight,
  FileText,
} from 'lucide-react';

interface CheckoutModalProps {
  files: UploadedDocument[];
  selectedServiceIds?: string[];
  shop: Shop;
  user: User | null;
  onUserAuthenticated: (user: User, token: string) => void;
  onPaymentSuccess: (paymentData: any) => void;
  onBack: () => void;
  jobId: string | null;
  createJob: () => Promise<string>;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  files,
  selectedServiceIds = [],
  shop,
  user,
  onUserAuthenticated,
  onPaymentSuccess,
  jobId,
  createJob,
}) => {
  // Auth state
  const [phone, setPhone] = useState(user?.phone || '');
  const [name, setName] = useState(user?.name || '');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Promo code state
  const [promoCode, setPromoCode] = useState('SAVE15');
  const [promoApplied, setPromoApplied] = useState(true);

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking'>('upi');
  const [showUpiQrSheet, setShowUpiQrSheet] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'scan' | 'verifying' | 'success'>('scan');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Calculations across all files
  const pricePerBw = Number(shop.price_per_bw) || 2;
  const pricePerColor = Number(shop.price_per_color) || 10;

  const isImageFile = (f: UploadedDocument) => {
    const ext = (f.fileName.split('.').pop() || '').toLowerCase();
    return (
      ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(ext) ||
      (f.mimeType?.startsWith('image/') ?? false)
    );
  };

  const imageFiles = files.filter(isImageFile);
  const otherFiles = files.filter((f) => !isImageFile(f));
  const hasCombinedImages = imageFiles.length > 1 && !!files[0]?.combineImages;

  let printTotal = 0;
  let totalCopies = 0;
  let totalPhysicalSheets = 0;

  if (hasCombinedImages) {
    const grid = imageFiles[0]?.pagesPerSheet || 6;
    const copies = imageFiles[0]?.copies || 1;
    const isColor = imageFiles.some((f) => f.color);
    const rate = isColor ? pricePerColor : pricePerBw;
    const rawSheets = Math.ceil(imageFiles.length / grid);
    const sheetsPerCopy = imageFiles[0]?.duplex ? Math.ceil(rawSheets / 2) : rawSheets;
    printTotal += sheetsPerCopy * copies * rate;
    totalCopies += copies;
    totalPhysicalSheets += sheetsPerCopy * copies;

    otherFiles.forEach((f) => {
      const pagesPerSheet = f.pagesPerSheet || 1;
      const rawSheets = Math.ceil((f.pageCount || 1) / pagesPerSheet);
      const sheetsPerCopy = f.duplex ? Math.ceil(rawSheets / 2) : rawSheets;
      const rate = f.color ? pricePerColor : pricePerBw;
      printTotal += sheetsPerCopy * (f.copies || 1) * rate;
      totalCopies += f.copies || 1;
      totalPhysicalSheets += sheetsPerCopy * (f.copies || 1);
    });
  } else {
    files.forEach((f) => {
      const pagesPerSheet = f.pagesPerSheet || 1;
      const rawSheets = Math.ceil((f.pageCount || 1) / pagesPerSheet);
      const sheetsPerCopy = f.duplex ? Math.ceil(rawSheets / 2) : rawSheets;
      const rate = f.color ? pricePerColor : pricePerBw;
      printTotal += sheetsPerCopy * (f.copies || 1) * rate;
      totalCopies += f.copies || 1;
      totalPhysicalSheets += sheetsPerCopy * (f.copies || 1);
    });
  }

  const customServices = (shop.services || []).filter((s) => !s.is_default && s.enabled);
  let addOnsCost = 0;
  customServices.forEach((srv) => {
    if (selectedServiceIds.includes(srv.id)) {
      if (srv.unit === 'page') {
        addOnsCost += Number(srv.price) * totalPhysicalSheets;
      } else {
        addOnsCost += Number(srv.price) * totalCopies;
      }
    }
  });

  const subtotal = printTotal + addOnsCost;
  const discount = promoApplied ? Math.min(15, Math.floor(subtotal * 0.15)) : 0;
  const grandTotal = Math.max(1, subtotal - discount);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.trim().length < 10) {
      setAuthError('Please enter a valid 10-digit mobile number.');
      return;
    }
    setAuthError(null);
    setIsSubmittingAuth(true);

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP');

      setOtpSent(true);
      if (data.demoOtp) {
        setDemoOtp(data.demoOtp);
        setOtp(data.demoOtp);
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.trim().length < 6) {
      setAuthError('Please enter the 6-digit OTP.');
      return;
    }
    setAuthError(null);
    setIsSubmittingAuth(true);

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid OTP code');

      onUserAuthenticated(data.user, data.token);
      setOtpSent(false);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handlePayNow = async () => {
    if (!user) {
      setAuthError('Please enter mobile number to receive pickup token.');
      return;
    }

    setIsProcessingPayment(true);
    setPaymentError(null);

    try {
      let activeJobId = jobId;
      if (!activeJobId) {
        activeJobId = await createJob();
      }

      const orderRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: activeJobId,
          amount: grandTotal,
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error || 'Order creation failed');

      if (paymentMethod === 'upi') {
        setShowUpiQrSheet(true);
        setPaymentStep('scan');
      } else {
        await executeMockPayment(activeJobId, orderData.orderId);
      }
    } catch (err: any) {
      setPaymentError(err.message || 'Payment initiation failed.');
      setIsProcessingPayment(false);
    }
  };

  const executeMockPayment = async (activeJobId: string, orderId: string) => {
    setPaymentStep('verifying');
    try {
      const res = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: activeJobId,
          razorpay_order_id: orderId,
          razorpay_payment_id: `pay_${Date.now()}`,
          razorpay_signature: 'demo_valid_sig',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Payment verification failed');

      setPaymentStep('success');
      setTimeout(() => {
        onPaymentSuccess(data);
      }, 1200);
    } catch (err: any) {
      setPaymentError(err.message);
      setIsProcessingPayment(false);
      setShowUpiQrSheet(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4 pb-24">
      {/* Title */}
      <div className="space-y-0.5 pt-1">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          Checkout & Spool
        </h1>
        <p className="text-xs text-slate-500">
          Complete payment to receive your FIFO queue token and start printing.
        </p>
      </div>

      {/* 1. Itemized Order Summary Card */}
      <div className="figma-card p-4 space-y-3 bg-white border border-slate-200 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-xs font-bold text-slate-900">
            Order Summary ({files.length} {files.length === 1 ? 'file' : 'files'})
          </span>
          <span className="text-[11px] font-bold text-[#0e7490]">
            {totalCopies} {totalCopies === 1 ? 'copy' : 'copies'} total
          </span>
        </div>

        {/* Per-File Line Items */}
        <div className="space-y-2 border-b border-slate-100 pb-2.5">
          {files.map((f, idx) => {
            const pagesPerSheet = f.pagesPerSheet || 1;
            const rawSheets = Math.ceil((f.pageCount || 1) / pagesPerSheet);
            const sheetsPerCopy = f.duplex ? Math.ceil(rawSheets / 2) : rawSheets;
            const rate = f.color ? pricePerColor : pricePerBw;
            const fileCost = sheetsPerCopy * (f.copies || 1) * rate;

            return (
              <div key={f.id} className="flex items-center justify-between text-xs gap-2">
                <div className="truncate max-w-[210px] sm:max-w-[250px]">
                  <span className="font-bold text-slate-800 block truncate">
                    {idx + 1}. {f.fileName}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {f.copies} {f.copies === 1 ? 'copy' : 'copies'} × {sheetsPerCopy}{' '}
                    {sheetsPerCopy === 1 ? 'sheet' : 'sheets'} ({f.color ? 'Color' : 'B&W'}
                    {pagesPerSheet > 1 ? `, ${pagesPerSheet}-in-1` : ''}
                    {f.duplex ? ', Duplex' : ''})
                  </span>
                </div>
                <span className="font-bold text-slate-900 shrink-0">
                  ₹{fileCost.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Add-ons line items */}
        {addOnsCost > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">Finishing & Add-ons</span>
            <span className="font-bold text-slate-900">₹{addOnsCost.toFixed(2)}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs pt-1 font-bold">
          <span className="text-slate-900">Subtotal</span>
          <span className="text-slate-900">₹{subtotal.toFixed(2)}</span>
        </div>

        {/* Promo Code Input */}
        <div className="pt-1 flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <Tag className="w-3.5 h-3.5 text-[#0e7490]" />
            <input
              type="text"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              placeholder="Promo Code"
              className="bg-transparent text-slate-900 font-bold focus:outline-none w-full uppercase text-xs"
            />
          </div>
          {promoApplied && (
            <span className="text-[11px] font-bold text-[#0e7490] bg-[#ecfeff] px-2.5 py-2 rounded-xl border border-[#a5f3fc]">
              Applied (-₹{discount})
            </span>
          )}
        </div>
      </div>

      {/* 2. Customer Phone Auth Card */}
      {!user ? (
        <div className="figma-card p-4 space-y-3 bg-white border border-slate-200 shadow-2xs">
          <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-[#0e7490]" />
            Customer Mobile Number (For Queue Token & Pickup)
          </span>

          {!otpSent ? (
            <form onSubmit={handleSendOtp} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="tel"
                  placeholder="Enter 10-digit mobile"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="flex-1 figma-input px-3 py-2 text-xs"
                  required
                />
                <button
                  type="submit"
                  disabled={isSubmittingAuth}
                  className="figma-btn-primary px-3.5 py-2 text-xs font-semibold cursor-pointer"
                >
                  {isSubmittingAuth ? 'Sending...' : 'Send OTP'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Code sent to +91 {phone}</span>
                {demoOtp && <span className="font-bold text-[#0e7490]">Demo: {demoOtp}</span>}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="6-digit OTP"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="flex-1 figma-input px-3 py-2 text-xs text-center font-mono tracking-widest"
                  required
                />
                <button
                  type="submit"
                  disabled={isSubmittingAuth}
                  className="figma-btn-primary px-4 py-2 text-xs font-semibold cursor-pointer"
                >
                  Verify
                </button>
              </div>
            </form>
          )}

          {authError && <p className="text-[11px] text-red-500 font-medium">{authError}</p>}
        </div>
      ) : (
        <div className="figma-card p-3 flex items-center justify-between bg-emerald-50/60 border border-emerald-200">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
              ✓
            </div>
            <div>
              <span className="text-xs font-bold text-emerald-900 block">
                Logged in as {user.name || 'Customer'}
              </span>
              <span className="text-[10px] text-emerald-700 font-mono">+91 {user.phone}</span>
            </div>
          </div>
          <span className="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
            Token Ready
          </span>
        </div>
      )}

      {/* 3. Payment Method Selection */}
      <div className="figma-card p-4 space-y-3 bg-white border border-slate-200 shadow-2xs">
        <span className="text-xs font-bold text-slate-900 block">
          Select Payment Method
        </span>

        <div className="space-y-2">
          {/* UPI */}
          <div
            onClick={() => setPaymentMethod('upi')}
            className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
              paymentMethod === 'upi'
                ? 'border-[#0e7490] bg-[#ecfeff]'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[#0e7490] shadow-2xs">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">UPI Instant Pay</span>
                <span className="text-[10px] text-slate-500">Google Pay, PhonePe, Paytm, CRED</span>
              </div>
            </div>
            {paymentMethod === 'upi' && <CheckCircle2 className="w-4 h-4 text-[#0e7490]" />}
          </div>

          {/* Cards */}
          <div
            onClick={() => setPaymentMethod('card')}
            className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
              paymentMethod === 'card'
                ? 'border-[#0e7490] bg-[#ecfeff]'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[#0e7490] shadow-2xs">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">Debit / Credit Card</span>
                <span className="text-[10px] text-slate-500">Visa, Mastercard, RuPay</span>
              </div>
            </div>
            {paymentMethod === 'card' && <CheckCircle2 className="w-4 h-4 text-[#0e7490]" />}
          </div>
        </div>

        {paymentError && <p className="text-[11px] text-red-500 font-medium">{paymentError}</p>}
      </div>

      {/* Trust Badge */}
      <div className="flex items-center justify-center gap-2 text-slate-400 text-[11px]">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>Hardware spool triggers immediately upon payment receipt.</span>
      </div>

      {/* Sticky Bottom CTA */}
      <MobileBottomCta
        label="Amount to Pay"
        value={`₹${grandTotal.toFixed(2)}`}
        buttonText={isProcessingPayment ? 'Processing...' : `Pay ₹${grandTotal.toFixed(2)} & Get Token`}
        disabled={isProcessingPayment}
        onButtonClick={handlePayNow}
      />

      {/* UPI QR Simulation Modal */}
      {showUpiQrSheet && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-5 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {paymentStep === 'scan' && (
              <>
                <div className="space-y-1">
                  <h3 className="font-bold text-slate-900 text-base">Scan & Pay via UPI</h3>
                  <p className="text-xs text-slate-500">
                    Pay <strong>₹{grandTotal.toFixed(2)}</strong> for {files.length} document(s)
                  </p>
                </div>

                <div className="w-48 h-48 mx-auto bg-slate-50 border-2 border-dashed border-[#0e7490]/40 rounded-2xl p-3 flex flex-col items-center justify-center relative">
                  <QrCode className="w-36 h-36 text-slate-800" />
                  <span className="text-[9px] font-mono text-slate-400 mt-1">UPI ID: printspot@icici</span>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => executeMockPayment(jobId || 'demo_job', 'order_demo_123')}
                    className="w-full figma-btn-primary py-3 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Simulate Successful UPI Payment</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setShowUpiQrSheet(false);
                      setIsProcessingPayment(false);
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}

            {paymentStep === 'verifying' && (
              <div className="py-8 space-y-3">
                <RotateCw className="w-10 h-10 text-[#0e7490] animate-spin mx-auto" />
                <h4 className="font-bold text-slate-900 text-sm">Verifying UPI Payment...</h4>
                <p className="text-xs text-slate-500">Allocating FIFO token & queuing print job...</p>
              </div>
            )}

            {paymentStep === 'success' && (
              <div className="py-8 space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Payment Verified!</h4>
                <p className="text-xs text-slate-500">Routing documents to shop hardware printer...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
