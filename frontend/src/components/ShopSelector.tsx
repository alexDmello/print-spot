'use client';

import React from 'react';
import { Shop } from '@/lib/types';
import { MobileBottomCta } from './MobileBottomCta';
import { Printer, MapPin, CheckCircle2, ChevronRight, Upload, Sliders, CreditCard } from 'lucide-react';

interface ShopSelectorProps {
  shop: Shop;
  onProceed: () => void;
  onTrackOrder?: () => void;
}

export const ShopSelector: React.FC<ShopSelectorProps> = ({ shop, onProceed, onTrackOrder }) => {
  const onlinePrinters = shop.printers?.filter((p) => p.status === 'online') || [];

  return (
    <div className="w-full max-w-md mx-auto space-y-5 pb-24">
      {/* Title & Hero Section */}
      <div className="space-y-1.5 pt-1">
        <span className="text-xs font-bold text-[#0e7490] uppercase tracking-wider">
          Self-Serve Printing
        </span>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">
          Instant Local Printing
        </h1>
        <p className="text-xs text-slate-600 leading-relaxed">
          Print documents, thesis papers, or professional color graphics directly from your mobile device and pick up at the nearest station.
        </p>
      </div>

      {/* Selected Kiosk Station Card */}
      <div className="figma-card p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Assigned Print Kiosk
            </span>
            <h2 className="text-base font-bold text-slate-900">{shop.name}</h2>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin className="w-3.5 h-3.5 text-[#0e7490]" />
              <span className="truncate">{shop.location}</span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ecfeff] text-[#0e7490] border border-[#a5f3fc]">
            Fast Lane
          </span>
        </div>

        {/* Pricing Badges */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 block">Monochrome Laser</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-bold text-slate-900">₹{shop.price_per_bw}</span>
              <span className="text-[10px] text-slate-500">/ sheet</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 block">Full Color HD</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-bold text-slate-900">₹{shop.price_per_color}</span>
              <span className="text-[10px] text-slate-500">/ sheet</span>
            </div>
          </div>
        </div>

        {/* Printer Status */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2.5">
          <span className="flex items-center gap-1.5">
            <Printer className="w-3.5 h-3.5 text-[#0e7490]" />
            Printers Connected
          </span>
          <span className="font-semibold text-emerald-600 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {onlinePrinters.length} Available Online
          </span>
        </div>
      </div>

      {/* "How It Works" Section */}
      <div className="space-y-2.5">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
          How it works
        </span>

        <div className="space-y-2">
          {/* Step 1 */}
          <div className="figma-card p-3.5 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#ecfeff] text-[#0e7490] flex items-center justify-center font-bold text-xs shrink-0">
              1
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xs">Upload Files</h3>
              <p className="text-[11px] text-slate-500">Select PDFs, PNG, or JPG safely</p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="figma-card p-3.5 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#ecfeff] text-[#0e7490] flex items-center justify-center font-bold text-xs shrink-0">
              2
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xs">Configure Settings</h3>
              <p className="text-[11px] text-slate-500">Choose color, binding, orientation & layout</p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="figma-card p-3.5 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#ecfeff] text-[#0e7490] flex items-center justify-center font-bold text-xs shrink-0">
              3
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-xs">Scan & Pay</h3>
              <p className="text-[11px] text-slate-500">Pay securely via UPI and collect your sheets</p>
            </div>
          </div>
        </div>
      </div>

      {/* Already printed track link */}
      <div className="pt-2 text-center">
        <p className="text-xs text-slate-500">
          Already printed?{' '}
          <button
            type="button"
            onClick={onTrackOrder || onProceed}
            className="text-[#0e7490] font-bold underline hover:text-[#0891b2]"
          >
            Track my order
          </button>
        </p>
      </div>

      {/* Sticky Bottom Bar */}
      <MobileBottomCta
        label="Total"
        value="₹0.00"
        buttonText="Start Printing"
        onButtonClick={onProceed}
      />
    </div>
  );
};
