'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Shop } from '@/lib/types';
import {
  QrCode,
  Camera,
  Store,
  MapPin,
  Clock,
  ArrowRight,
  Search,
  Sparkles,
  ShieldCheck,
  X,
  AlertCircle,
  ExternalLink,
  Lock,
} from 'lucide-react';
import Link from 'next/link';

interface ScanQrLandingProps {
  shops: Shop[];
  onSelectShop: (shop: Shop) => void;
  errorMessage?: string | null;
}

export const ScanQrLanding: React.FC<ScanQrLandingProps> = ({
  shops,
  onSelectShop,
  errorMessage,
}) => {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Filter shops by search
  const filteredShops = shops.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.location.toLowerCase().includes(q) ||
      (s.address && s.address.toLowerCase().includes(q))
    );
  });

  // Camera start / stop
  const startCamera = async () => {
    setCameraError(null);
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setCameraError('Unable to open camera. Please grant camera permission or select your counter below.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    const clean = manualCode.trim().toLowerCase();
    const matched = shops.find(
      (s) => s.id.toLowerCase() === clean || s.name.toLowerCase().includes(clean)
    );
    if (matched) {
      onSelectShop(matched);
    } else {
      window.location.href = `/?shop=${encodeURIComponent(manualCode.trim())}`;
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col antialiased">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0e7490] to-cyan-500 flex items-center justify-center text-white shadow-sm font-bold text-sm">
              P
            </div>
            <div>
              <span className="text-sm font-extrabold tracking-tight text-slate-900 block leading-tight">
                PrintSpot
              </span>
              <span className="text-[10px] text-slate-500 font-medium leading-none">
                Smart Cloud Printing
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/shop/login"
              className="text-xs font-semibold text-slate-600 hover:text-[#0e7490] px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1"
            >
              <Store className="w-3.5 h-3.5" />
              <span>Shopkeeper</span>
            </Link>
            <Link
              href="/admin"
              className="text-xs font-bold text-[#0e7490] bg-[#ecfeff] hover:bg-cyan-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 border border-[#a5f3fc]"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Admin</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-lg mx-auto p-4 sm:p-5 flex flex-col justify-start space-y-4">
        {/* Error Banner if invalid QR was scanned */}
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5 text-xs shadow-sm">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Counter Scan Notice</span>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Hero Card: Scan Counter QR */}
        <div className="figma-card p-6 bg-gradient-to-br from-white via-cyan-50/20 to-slate-50 border border-slate-200 text-center relative overflow-hidden shadow-sm">
          <div className="w-16 h-16 mx-auto mb-3.5 rounded-2xl bg-[#ecfeff] border border-[#a5f3fc] flex items-center justify-center text-[#0e7490] shadow-sm relative">
            <QrCode className="w-8 h-8" />
            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 animate-ping"></div>
            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500"></div>
          </div>

          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight mb-1.5">
            Scan Counter QR Code
          </h1>
          <p className="text-xs text-slate-600 max-w-xs mx-auto leading-relaxed mb-5">
            PrintSpot connects your device directly to the physical high-speed laser printer at your counter. Please scan the QR code standee located beside the printer.
          </p>

          {/* Camera Scanner View or Action */}
          {isCameraActive ? (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square max-w-[280px] mx-auto border-2 border-[#0e7490] shadow-lg mb-4">
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 border-2 border-cyan-400/40 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-cyan-400 rounded-xl animate-pulse relative">
                  <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 shadow-sm animate-bounce"></div>
                </div>
              </div>
              <button
                onClick={stopCamera}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={startCamera}
              className="w-full figma-btn-primary py-3.5 px-4 text-xs font-bold flex items-center justify-center gap-2 shadow-md cursor-pointer transition-transform active:scale-[0.98]"
            >
              <Camera className="w-4 h-4" />
              <span>Scan QR with Device Camera</span>
            </button>
          )}

          {cameraError && (
            <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg mt-3">
              {cameraError}
            </p>
          )}

          {/* Or Manual Counter Code */}
          <div className="mt-4 pt-4 border-t border-slate-200">
            <span className="text-[11px] text-slate-500 font-medium block mb-2">
              Or enter counter ID code manually
            </span>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="e.g. shop_main"
                className="flex-1 figma-input px-3 py-2 text-xs"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                Connect
              </button>
            </form>
          </div>
        </div>

        {/* Available Counters (Fallback / Quick Access Directory) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-[#0e7490]" />
              Verified Print Counters ({filteredShops.length})
            </span>
            <span className="text-[10px] text-slate-400">Live Counters</span>
          </div>

          {/* Search box if multiple shops */}
          {shops.length > 2 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search counter by name or campus..."
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-[#0e7490]"
              />
            </div>
          )}

          {/* List of Shops */}
          <div className="space-y-2">
            {filteredShops.map((shop) => (
              <div
                key={shop.id}
                onClick={() => onSelectShop(shop)}
                className="figma-card p-3.5 bg-white border border-slate-200 hover:border-[#0e7490] hover:shadow-md transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-bold text-white bg-[#0e7490] px-2 py-0.5 rounded-full">
                        Counter
                      </span>
                      {shop.is_open !== false ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Open Now
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                          Paused
                        </span>
                      )}
                    </div>
                    <h3 className="text-xs font-bold text-slate-900 group-hover:text-[#0e7490] transition-colors truncate">
                      {shop.name}
                    </h3>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1 truncate mt-0.5">
                      <MapPin className="w-3 h-3 text-[#0e7490] shrink-0" />
                      <span>{shop.location}</span>
                    </p>
                  </div>

                  <div className="text-right shrink-0 flex flex-col items-end justify-between self-stretch">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Rates</span>
                      <span className="text-xs font-bold text-slate-900">
                        ₹{shop.price_per_bw}/pg
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-[#0e7490] group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                      Select <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {filteredShops.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-xs bg-white rounded-2xl border border-slate-200">
                No print counters found matching "{searchQuery}".
              </div>
            )}
          </div>
        </div>

        {/* Security / Privacy Trust Footer */}
        <div className="p-3 rounded-2xl bg-white border border-slate-200 flex items-center justify-between text-[11px] text-slate-500 shadow-2xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Files auto-shredded immediately upon counter pickup.</span>
          </div>
          <span className="font-semibold text-slate-700">AES-256</span>
        </div>
      </main>
    </div>
  );
};
