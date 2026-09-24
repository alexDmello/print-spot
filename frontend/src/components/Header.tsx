'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Printer, Shield, ArrowLeft } from 'lucide-react';

interface HeaderProps {
  shopName?: string;
  stepNumber?: number;
  totalSteps?: number;
  onBack?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  shopName = 'Station Hub 3',
  stepNumber = 1,
  totalSteps = 4,
  onBack,
}) => {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
        {/* Brand & Optional Back Arrow */}
        <div className="flex items-center gap-2">
          {onBack && stepNumber > 1 && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Go back to previous step"
              className="p-1.5 -ml-1.5 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-slate-700" />
            </button>
          )}

          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0e7490] flex items-center justify-center text-white shadow-sm shadow-[#0e7490]/20">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-slate-900">
                Print<span className="text-[#0e7490]">Spot</span>
              </span>
            </div>
          </Link>
        </div>

        {/* Step Indicator or Admin Switch */}
        <div className="flex items-center gap-2">
          {!isAdmin ? (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#0e7490] bg-[#ecfeff] px-2.5 py-1 rounded-full border border-[#a5f3fc]">
                Step {stepNumber} of {totalSteps}
              </span>
              <Link
                href="/admin"
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 text-xs"
                title="Open Shop Admin"
              >
                <Shield className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <Link
              href="/"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-[#0e7490]" />
              <span>Customer Kiosk</span>
            </Link>
          )}
        </div>
      </div>

      {/* Progress Bar under Header */}
      {!isAdmin && (
        <div className="w-full h-1 bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-[#0e7490] transition-all duration-300"
            style={{ width: `${(stepNumber / totalSteps) * 100}%` }}
          />
        </div>
      )}
    </header>
  );
};
