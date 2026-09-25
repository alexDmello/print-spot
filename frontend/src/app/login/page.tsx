'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Store, Shield, ArrowRight, Printer, Sparkles, RotateCw } from 'lucide-react';

export default function GenericLoginPage() {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      if (host.startsWith('admin.')) {
        router.replace('/admin/login');
        return;
      }
      if (host.startsWith('shop.')) {
        router.replace('/shop/login');
        return;
      }
      setIsRedirecting(false);
    }
  }, [router]);

  if (isRedirecting) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex flex-col items-center justify-center p-6 text-center text-slate-100">
        <RotateCw className="w-8 h-8 text-sky-400 animate-spin mb-3" />
        <p className="text-xs text-slate-400 font-medium">Directing to portal login...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col justify-between antialiased selection:bg-sky-500/30 selection:text-sky-200">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-[#0f172a]/70 backdrop-blur-md px-6 py-4 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-[#0e7490] flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 font-bold text-sm">
              <Printer className="w-4 h-4" />
            </div>
            <span className="text-base font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              PrintSpot
            </span>
          </Link>
          <Link
            href="/"
            className="text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            ← Back to Customer Home
          </Link>
        </div>
      </header>

      {/* Main Portal Selector */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 max-w-4xl mx-auto w-full my-8">
        <div className="text-center max-w-lg mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Select Your Portal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            PrintSpot Access Gateways
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-2">
            Please select the portal appropriate for your role. Each portal has its own dedicated, secured authentication URL.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-2xl">
          {/* Shopkeeper Portal Card */}
          <Link
            href="/shop/login"
            className="group relative p-6 rounded-2xl bg-[#0f172a]/80 border border-slate-800 hover:border-cyan-500/50 transition-all duration-200 hover:shadow-xl hover:shadow-cyan-500/5 flex flex-col justify-between text-left"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-cyan-950/80 border border-cyan-800/50 flex items-center justify-center text-cyan-400 mb-4 group-hover:scale-105 transition-transform">
                <Store className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">
                Shopkeeper Counter Portal
              </h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Log in to your local print counter to view incoming customer orders, manage hardware printers, update custom rates, and track daily revenue.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs font-semibold text-cyan-400 group-hover:translate-x-1 transition-transform">
              <span>Go to /shop/login</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          {/* Admin Portal Card */}
          <Link
            href="/admin/login"
            className="group relative p-6 rounded-2xl bg-[#0f172a]/80 border border-slate-800 hover:border-sky-500/50 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/5 flex flex-col justify-between text-left"
          >
            <div>
              <div className="w-12 h-12 rounded-2xl bg-sky-950/80 border border-sky-800/50 flex items-center justify-center text-sky-400 mb-4 group-hover:scale-105 transition-transform">
                <Shield className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-bold text-white group-hover:text-sky-300 transition-colors">
                Platform Super Admin
              </h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Access master platform analytics, onboard new shop counters, assign custom branded subdomains, monitor print fleet status, and reset counter PINs.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs font-semibold text-sky-400 group-hover:translate-x-1 transition-transform">
              <span>Go to /admin/login</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-4 px-6 text-center text-xs text-slate-500">
        PrintSpot Autonomous Cloud Print Network • Dedicated Portal Gateways
      </footer>
    </div>
  );
}
