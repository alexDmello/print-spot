'use client';

import React, { useState } from 'react';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import { Header } from '@/components/Header';
import { MapPicker } from '@/components/MapPicker';
import {
  Building,
  MapPin,
  Clock,
  Printer,
  Sliders,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  QrCode,
  Download,
  ExternalLink,
  RotateCw,
  Sparkles,
  Phone,
  Mail,
  User,
  CreditCard,
  Store,
} from 'lucide-react';

export default function OnboardPage() {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdShop, setCreatedShop] = useState<any>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    address: '',
    latitude: 28.6912,
    longitude: 77.2089,
    owner_name: '',
    owner_phone: '',
    owner_email: '',
    opening_time: '08:00 AM',
    closing_time: '10:00 PM',
    working_days: 'Mon - Sat',
    upi_id: '',
    price_per_bw: 2.0,
    price_per_color: 10.0,
    printer_name: 'Main Counter Laser Spooler',
    printer_type: 'mono' as 'mono' | 'color',
  });

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentStep((prev) => Math.min(4, prev + 1));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const handleSubmitOnboard = async () => {
    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name,
        location: formData.location || formData.address.slice(0, 50),
        address: formData.address,
        latitude: formData.latitude,
        longitude: formData.longitude,
        owner_name: formData.owner_name,
        owner_phone: formData.owner_phone,
        owner_email: formData.owner_email,
        opening_time: formData.opening_time,
        closing_time: formData.closing_time,
        working_days: formData.working_days,
        upi_id: formData.upi_id,
        price_per_bw: formData.price_per_bw,
        price_per_color: formData.price_per_color,
        printers: [
          {
            name: formData.printer_name || `${formData.name} Primary Spooler`,
            type: formData.printer_type,
            status: 'online',
            system_name: 'Microsoft Print to PDF',
          },
        ],
      };

      const res = await fetch('/api/shops/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to onboard shop.');

      const newShop = data.shop;
      setCreatedShop(newShop);

      // Generate QR Code for this shop
      const kioskUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/?shop=${newShop.id}`
          : `http://localhost:3000/?shop=${newShop.id}`;

      QRCode.toDataURL(
        kioskUrl,
        {
          width: 340,
          margin: 2,
          color: {
            dark: '#0e7490',
            light: '#ffffff',
          },
        },
        (err, url) => {
          if (!err && url) {
            setQrCodeDataUrl(url);
          }
        }
      );

      // Trigger Confetti
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {}

      setCurrentStep(5); // Success step
    } catch (err: any) {
      alert(`Onboarding error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const kioskUrl = createdShop
    ? typeof window !== 'undefined'
      ? `${window.location.origin}/?shop=${createdShop.id}`
      : `http://localhost:3000/?shop=${createdShop.id}`
    : '';

  const adminUrl = createdShop ? `/admin?shop=${createdShop.id}` : '/admin';

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col antialiased">
      <Header shopName="Partner Onboarding" stepNumber={currentStep} totalSteps={4} />

      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-8">
        {/* Progress Stepper */}
        {currentStep <= 4 && (
          <div className="mb-6 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500">
              <span className="text-[#0e7490]">Step {currentStep} of 4</span>
              <span>
                {currentStep === 1 && 'Shop & Owner Identity'}
                {currentStep === 2 && 'Location & Map Marking'}
                {currentStep === 3 && 'Timings & Payments'}
                {currentStep === 4 && 'Hardware & Base Rates'}
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0e7490] transition-all duration-300"
                style={{ width: `${(currentStep / 4) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* STEP 1: Shop & Owner Identity */}
        {currentStep === 1 && (
          <form onSubmit={handleNext} className="figma-card p-6 space-y-5">
            <div className="space-y-1 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-[#0e7490]" />
                <h1 className="text-lg font-extrabold text-slate-900">
                  Shop & Owner Details
                </h1>
              </div>
              <p className="text-xs text-slate-500">
                Register your print counter on the PrintSpot network.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Shop / Business Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Xerox & Digital Color Lab"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-[#0e7490]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Short Landmark / Location Note *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ground Floor, Student Union Building (Near Library)"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-[#0e7490]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Owner / Manager Name *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rajesh Sharma"
                      value={formData.owner_name}
                      onChange={(e) =>
                        setFormData({ ...formData, owner_name: e.target.value })
                      }
                      className="w-full pl-9 pr-3 py-2.5 text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0e7490]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Contact Phone Number *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      type="tel"
                      required
                      placeholder="9876543210"
                      value={formData.owner_phone}
                      onChange={(e) =>
                        setFormData({ ...formData, owner_phone: e.target.value })
                      }
                      className="w-full pl-9 pr-3 py-2.5 text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0e7490]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Support Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                  <input
                    type="email"
                    placeholder="contact@printshop.in"
                    value={formData.owner_email}
                    onChange={(e) =>
                      setFormData({ ...formData, owner_email: e.target.value })
                    }
                    className="w-full pl-9 pr-3 py-2.5 text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0e7490]"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-[#0e7490] hover:bg-[#0891b2] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <span>Continue to Map & Address</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Address & Interactive Map Marking */}
        {currentStep === 2 && (
          <form onSubmit={handleNext} className="figma-card p-6 space-y-5">
            <div className="space-y-1 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#0e7490]" />
                <h1 className="text-lg font-extrabold text-slate-900">
                  Address & Interactive Map Marking
                </h1>
              </div>
              <p className="text-xs text-slate-500">
                Pinpoint your exact counter location on the map so customers can easily locate your counter.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Complete Street Address *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Shop 4B, University Commercial Complex, North Campus, New Delhi 110007"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-[#0e7490]"
                />
              </div>

              {/* Interactive Map Picker */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  Mark Shop Coordinates on Map *
                </label>
                <MapPicker
                  latitude={formData.latitude}
                  longitude={formData.longitude}
                  address={formData.address}
                  onChange={({ latitude, longitude, address }) => {
                    setFormData((prev) => ({
                      ...prev,
                      latitude,
                      longitude,
                      address: address || prev.address,
                    }));
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-[#0e7490] hover:bg-[#0891b2] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <span>Continue to Timings</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: Operating Schedule & UPI Details */}
        {currentStep === 3 && (
          <form onSubmit={handleNext} className="figma-card p-6 space-y-5">
            <div className="space-y-1 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#0e7490]" />
                <h1 className="text-lg font-extrabold text-slate-900">
                  Operating Hours & Payouts
                </h1>
              </div>
              <p className="text-xs text-slate-500">
                Specify your active business schedule and UPI ID for customer payment settlements.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Opening Time
                  </label>
                  <input
                    type="text"
                    placeholder="08:00 AM"
                    value={formData.opening_time}
                    onChange={(e) =>
                      setFormData({ ...formData, opening_time: e.target.value })
                    }
                    className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-[#0e7490]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Closing Time
                  </label>
                  <input
                    type="text"
                    placeholder="10:00 PM"
                    value={formData.closing_time}
                    onChange={(e) =>
                      setFormData({ ...formData, closing_time: e.target.value })
                    }
                    className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-[#0e7490]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Working Days
                </label>
                <input
                  type="text"
                  placeholder="e.g. Mon - Sat (or Open Daily)"
                  value={formData.working_days}
                  onChange={(e) =>
                    setFormData({ ...formData, working_days: e.target.value })
                  }
                  className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-[#0e7490]"
                />
              </div>

              <div className="pt-2">
                <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-[#0e7490]" />
                  <span>Shopkeeper UPI ID for Instant Settlements *</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. apexprint@okaxis or 9876543210@paytm"
                  value={formData.upi_id}
                  onChange={(e) => setFormData({ ...formData, upi_id: e.target.value })}
                  className="w-full text-xs font-mono font-bold text-slate-900 bg-white border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-[#0e7490]"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Customer UPI payments will automatically route to this VPA.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-[#0e7490] hover:bg-[#0891b2] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <span>Continue to Hardware & Rates</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 4: Initial Hardware & Base Rates */}
        {currentStep === 4 && (
          <div className="figma-card p-6 space-y-5">
            <div className="space-y-1 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-[#0e7490]" />
                <h1 className="text-lg font-extrabold text-slate-900">
                  Initial Device & Base Print Rates
                </h1>
              </div>
              <p className="text-xs text-slate-500">
                You can add unlimited additional printers and custom services later from your dashboard.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Primary Printer Device Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. HP LaserJet Enterprise M608"
                  value={formData.printer_name}
                  onChange={(e) =>
                    setFormData({ ...formData, printer_name: e.target.value })
                  }
                  className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-[#0e7490]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Primary Device Output Capability
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, printer_type: 'mono' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      formData.printer_type === 'mono'
                        ? 'border-[#0e7490] bg-[#ecfeff] text-[#0e7490] font-bold'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <div className="text-xs">Monochrome / B&W</div>
                    <div className="text-[10px] text-slate-400">High-speed documents</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, printer_type: 'color' })}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      formData.printer_type === 'color'
                        ? 'border-[#0e7490] bg-[#ecfeff] text-[#0e7490] font-bold'
                        : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <div className="text-xs">Color LaserJet / HD</div>
                    <div className="text-[10px] text-slate-400">Color presentations</div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    B&W Page Rate (₹)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formData.price_per_bw}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        price_per_bw: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
                  />
                </div>

                <div className="p-3 rounded-xl bg-purple-50/40 border border-purple-200">
                  <label className="text-[11px] font-bold text-purple-900 block mb-1">
                    Color Page Rate (₹)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formData.price_per_color}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        price_per_color: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full text-xs font-bold text-slate-900 bg-white border border-purple-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-1 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>

              <button
                type="button"
                onClick={handleSubmitOnboard}
                disabled={isSubmitting}
                className="px-6 py-2.5 rounded-xl bg-[#0e7490] hover:bg-[#0891b2] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RotateCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>Complete Onboarding & Launch</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Success & Generated QR Standee */}
        {currentStep === 5 && createdShop && (
          <div className="figma-card p-6 space-y-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 mx-auto flex items-center justify-center shadow-xs">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h1 className="text-xl font-extrabold text-slate-900">
                Congratulations, {createdShop.name}!
              </h1>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Your print shop is officially live on PrintSpot. Your counter QR code has been generated.
              </p>
            </div>

            {/* Counter Standee Card Preview */}
            <div className="p-5 rounded-2xl bg-gradient-to-b from-[#ecfeff] to-white border-2 border-[#a5f3fc] max-w-sm mx-auto space-y-4 shadow-sm">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#0e7490] text-white inline-block">
                  PrintSpot Self-Service Standee
                </span>
                <h3 className="font-extrabold text-base text-slate-900">
                  {createdShop.name}
                </h3>
                <p className="text-[11px] text-slate-500">{createdShop.location}</p>
              </div>

              {qrCodeDataUrl ? (
                <div className="bg-white p-3 rounded-xl border border-slate-200 inline-block shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCodeDataUrl}
                    alt="Counter Standee QR Code"
                    className="w-44 h-44 object-contain mx-auto"
                  />
                </div>
              ) : (
                <div className="w-44 h-44 rounded-xl bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                  <RotateCw className="w-6 h-6 animate-spin text-[#0e7490]" />
                </div>
              )}

              <p className="text-[11px] font-bold text-[#0e7490]">
                Scan with phone camera to print instantly
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <a
                href={adminUrl}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#0e7490] hover:bg-[#0891b2] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
              >
                <Sliders className="w-4 h-4" />
                <span>Open Shop Manager Dashboard</span>
              </a>

              <a
                href={kioskUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 shadow-xs transition-colors"
              >
                <ExternalLink className="w-4 h-4 text-[#0e7490]" />
                <span>Open Customer QR Kiosk</span>
              </a>

              {qrCodeDataUrl && (
                <a
                  href={qrCodeDataUrl}
                  download={`PrintSpot_${createdShop.id}_Standee.png`}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                >
                  <Download className="w-4 h-4 text-slate-500" />
                  <span>Download Standee QR</span>
                </a>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
