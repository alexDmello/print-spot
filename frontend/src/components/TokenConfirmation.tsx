'use client';

import React from 'react';
import { MobileBottomCta } from './MobileBottomCta';
import { CheckCircle2, Clock, Users, ShieldCheck } from 'lucide-react';

interface TokenConfirmationProps {
  tokenCode: string;
  tokenNumber: number;
  position: number;
  estimatedWaitMinutes: number;
  pickupCode: string;
  totalPrice?: number;
  onProceedToQueue: () => void;
}

export const TokenConfirmation: React.FC<TokenConfirmationProps> = ({
  tokenCode,
  position,
  estimatedWaitMinutes,
  pickupCode,
  totalPrice = 0,
  onProceedToQueue,
}) => {
  const ordersAhead = Math.max(0, position - 1);

  return (
    <div className="w-full max-w-md mx-auto space-y-4 pb-24 text-center">
      {/* Title */}
      <div className="space-y-0.5 pt-1">
        <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">
          Order Confirmed
        </span>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          Your Print Token
        </h1>
        <p className="text-xs text-slate-500 leading-relaxed px-4">
          Keep this token safe. Show this token or your pickup code at the counter to collect your prints when ready.
        </p>
      </div>

      {/* Main Token Hero Card */}
      <div className="figma-card p-6 space-y-4">
        {/* Token Badge */}
        <div className="py-2">
          <span className="text-5xl font-black text-[#0e7490] tracking-tight">
            {tokenCode || '—'}
          </span>
        </div>

        {/* Stat Grid */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-left">
            <span className="text-[10px] font-semibold text-slate-400 block mb-1">
              Estimated Wait Time
            </span>
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#0e7490]">
              <Clock className="w-3.5 h-3.5" />
              <span>~ {estimatedWaitMinutes} mins</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-left">
            <span className="text-[10px] font-semibold text-slate-400 block mb-1">
              Queue Position
            </span>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>{ordersAhead === 0 ? 'Next Up!' : `${ordersAhead} orders ahead`}</span>
            </div>
          </div>
        </div>

        {/* Payment Confirmation Pill */}
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-800 flex items-center justify-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Payment of ₹{totalPrice.toFixed(2)} successfully processed.</span>
        </div>

        {/* Pickup Code Preview */}
        <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-slate-100 text-slate-600">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0e7490]" />
            Pickup Security Code
          </span>
          <span className="font-mono font-bold text-slate-900">{pickupCode}</span>
        </div>
      </div>

      {/* Sticky Bottom CTA */}
      <MobileBottomCta
        label="Token Registered"
        value={`Token ${tokenCode}`}
        buttonText="View Live Queue"
        onButtonClick={onProceedToQueue}
      />
    </div>
  );
};
