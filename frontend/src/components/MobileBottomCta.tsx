'use client';

import React from 'react';
import { ArrowRight, RotateCw } from 'lucide-react';

interface MobileBottomCtaProps {
  label?: string;
  value?: string;
  buttonText: string;
  onButtonClick: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export const MobileBottomCta: React.FC<MobileBottomCtaProps> = ({
  label,
  value,
  buttonText,
  onButtonClick,
  isLoading = false,
  disabled = false,
}) => {
  const hasPrice = Boolean(label || value);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 figma-bottom-bar bg-white/95 backdrop-blur-md py-3.5 px-4 border-t border-slate-200 shadow-bottomBar">
      <div className={`max-w-md mx-auto flex items-center ${hasPrice ? 'justify-between' : 'justify-center'} gap-4`}>
        {/* Left Side: Context / Price */}
        {hasPrice && (
          <div className="flex flex-col">
            {label && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {label}
              </span>
            )}
            {value && (
              <span className="text-xl font-extrabold text-slate-900 tracking-tight">
                {value}
              </span>
            )}
          </div>
        )}

        {/* Primary CTA */}
        <button
          onClick={onButtonClick}
          disabled={disabled || isLoading}
          className={`figma-btn-primary ${hasPrice ? 'px-6' : 'w-full'} py-3 text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98] cursor-pointer`}
        >
          {isLoading ? (
            <>
              <RotateCw className="w-4 h-4 animate-spin text-white" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <span>{buttonText}</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
