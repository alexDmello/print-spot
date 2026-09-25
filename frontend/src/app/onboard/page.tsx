'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, ArrowRight, Store } from 'lucide-react';

export default function OnboardRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/admin');
    }, 1800);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col items-center justify-center p-6 text-center antialiased">
      <div className="figma-card p-8 bg-white border border-slate-200 max-w-sm w-full space-y-4 shadow-md">
        <div className="w-14 h-14 rounded-2xl bg-[#ecfeff] text-[#0e7490] flex items-center justify-center mx-auto shadow-sm">
          <Shield className="w-7 h-7" />
        </div>
        <h1 className="text-base font-extrabold text-slate-900">
          Admin Shop Onboarding
        </h1>
        <p className="text-xs text-slate-500 leading-relaxed">
          Shop onboarding is managed exclusively through the Platform Super Admin Portal. Redirecting you to the Admin Command Center...
        </p>

        <Link
          href="/admin"
          className="figma-btn-primary py-2.5 px-4 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span>Go to Admin Portal</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
