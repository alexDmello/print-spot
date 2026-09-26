'use client';

import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { MobileBottomCta } from './MobileBottomCta';
import { CheckCircle2, QrCode, ShieldCheck, MapPin, Printer, Trash2 } from 'lucide-react';

interface PickupReadyProps {
  jobId: string;
  tokenCode: string;
  pickupCode: string;
  shopName: string;
  shopLocation: string;
  onReset: () => void;
}

export const PickupReady: React.FC<PickupReadyProps> = ({
  jobId,
  tokenCode,
  pickupCode,
  shopName,
  shopLocation,
  onReset,
}) => {
  const [isConfirmedPickedUp, setIsConfirmedPickedUp] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    try {
      confetti({
        particleCount: 90,
        spread: 80,
        origin: { y: 0.6 },
      });
    } catch {
      // Ignored
    }
  }, []);

  const handleConfirmPickup = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickupCode }),
      });
      if (res.ok) {
        setIsConfirmedPickedUp(true);
      }
    } catch (err) {
      console.error('Error confirming pickup:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4 pb-24 text-center">
      {/* Title */}
      <div className="space-y-0.5 pt-1">
        <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
          Ready for Pickup
        </span>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          Document Is Waiting!
        </h1>
      </div>

      {/* 1. Hero Ready Card */}
      <div className="figma-card p-5 bg-emerald-50/60 border-emerald-200 space-y-3">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div className="space-y-1">
          <h2 className="text-lg font-black text-slate-900">
            Ready at {shopName || 'Print Counter'}!
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed px-2">
            Your print job has been printed, verified, and placed safely on the pickup counter.
          </p>
        </div>
      </div>

      {/* 2. QR Code to Release Card */}
      <div className="figma-card p-5 space-y-3">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
          Show QR Code or PIN at Counter
        </span>

        {/* QR Code Container */}
        <div className="w-40 h-40 mx-auto rounded-2xl bg-slate-50 border border-slate-200 p-3 flex flex-col items-center justify-center">
          <QrCode className="w-28 h-28 text-slate-800" />
          <span className="text-[10px] font-mono font-bold text-[#0e7490] mt-1">
            CODE: {pickupCode}
          </span>
        </div>

        <div className="pt-1">
          <span className="text-base font-extrabold text-slate-900 block">
            Token Code: {tokenCode}
          </span>
        </div>
      </div>

      {/* 3. Pickup Instructions Card */}
      <div className="figma-card p-4 space-y-2 text-left">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
          Pickup Instructions
        </span>
        <ol className="text-xs text-slate-600 space-y-1.5 list-decimal list-inside leading-relaxed">
          <li>Walk up to the print counter at <strong className="text-slate-900">{shopName || 'the shop'}</strong>.</li>
          <li>Show this QR code or tell the operator your pickup PIN (<strong className="text-slate-900">{pickupCode}</strong>).</li>
          <li>Collect your completed prints!</li>
        </ol>
      </div>

      {/* Privacy shredding badge */}
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
        <Trash2 className="w-3.5 h-3.5 text-[#0e7490]" />
        <span>Auto-delete: Original file is shredded immediately upon release.</span>
      </div>

      {/* Sticky Bottom CTA */}
      <MobileBottomCta
        label={isConfirmedPickedUp ? "Order Finished" : "Print Counter"}
        value={isConfirmedPickedUp ? "Completed" : (shopName || "Active Counter")}
        buttonText={isConfirmedPickedUp ? "Print Another" : "Mark Collected"}
        isLoading={isProcessing}
        onButtonClick={isConfirmedPickedUp ? onReset : handleConfirmPickup}
      />
    </div>
  );
};
