'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Store,
  Lock,
  Phone,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Printer,
  Sparkles,
} from 'lucide-react';

export default function ShopLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [secret, setSecret] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if already authenticated on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      // Detect subdomain or query param for automatic counter prefill
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        let shopParam = params.get('shop');
        if (!shopParam) {
          const host = window.location.hostname.toLowerCase();
          if (host.endsWith('.mellod.in')) {
            const sub = host.replace(/\.mellod\.in$/, '');
            if (!['www', 'admin', 'api'].includes(sub)) shopParam = sub;
          } else if (host.endsWith('.localhost')) {
            const sub = host.replace(/\.localhost$/, '');
            if (!['admin', 'api'].includes(sub)) shopParam = sub;
          }
        }
        if (shopParam) {
          setIdentifier(shopParam);
        }
      }

      const token = typeof window !== 'undefined' ? localStorage.getItem('printspot_shop_token') : null;
      if (!token) {
        setIsCheckingSession(false);
        return;
      }

      try {
        const res = await fetch('/api/shops/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.shop) {
            router.replace('/shop');
            return;
          }
        }
      } catch (err) {
        console.warn('Session verification failed:', err);
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkExistingSession();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !secret.trim()) {
      setError('Please enter your phone number or shop ID, and your PIN.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/shops/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          secret: secret.trim(),
        }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text || `Server error (${res.status})`);
      }

      if (!res.ok) {
        throw new Error(data.error || 'Invalid shop credentials.');
      }

      // Persistent session retention in localStorage
      localStorage.setItem('printspot_shop_token', data.token);
      localStorage.setItem('printspot_shop_data', JSON.stringify(data.shop));

      router.push('/shop');
    } catch (err: any) {
      setError(err.message || 'Login failed.');
      setIsLoading(false);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 text-center">
        <RotateCw className="w-8 h-8 text-[#0e7490] animate-spin mb-3" />
        <p className="text-xs text-slate-500 font-medium">Verifying shopkeeper counter session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col justify-between antialiased">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0e7490] to-cyan-500 flex items-center justify-center text-white shadow-sm font-bold text-sm">
              P
            </div>
            <div>
              <span className="text-sm font-extrabold tracking-tight text-slate-900 block leading-tight">
                PrintSpot
              </span>
              <span className="text-[10px] text-slate-500 font-medium leading-none">
                Counter Console
              </span>
            </div>
          </Link>

          <Link
            href="/admin"
            className="text-xs font-semibold text-slate-600 hover:text-[#0e7490] px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Platform Admin</span>
          </Link>
        </div>
      </header>

      {/* Main Login Card */}
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Header Card */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-[#ecfeff] border border-[#a5f3fc] flex items-center justify-center text-[#0e7490] shadow-sm">
              <Store className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Shopkeeper Counter Login
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Access your real-time print queue, spooler settings, and daily earnings.
            </p>
          </div>

          {/* Form Card */}
          <div className="figma-card p-6 bg-white border border-slate-200 shadow-md space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#0e7490]" />
                  Mobile Number, Shop ID, or Subdomain
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. campus, 9876543210, or shop_main"
                  required
                  className="w-full figma-input px-3.5 py-2.5 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#0e7490]" />
                  4-Digit Counter PIN or Password
                </label>
                <input
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="Enter your PIN (Default: 1234)"
                  required
                  className="w-full figma-input px-3.5 py-2.5 text-xs text-slate-900 font-mono"
                />
              </div>

              {/* Stay Logged In Toggle */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-300 text-[#0e7490] focus:ring-[#0e7490] w-4 h-4"
                  />
                  <span>Retain counter login until logout</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full figma-btn-primary py-3 px-4 text-xs font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Enter Counter Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-3 border-t border-slate-100 text-center">
              <span className="text-[11px] text-slate-400">
                Default Campus Counter: <strong className="text-slate-600">9876543210</strong> / PIN: <strong className="text-slate-600">1234</strong>
              </span>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-2xl bg-white border border-slate-200 text-[11px] text-slate-500 flex items-center justify-center gap-2 text-center">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Counter sessions remain authenticated across tab & browser reloads.</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-400">
        PrintSpot Smart Counter Platform • Multi-Tenant Kiosk Engine
      </footer>
    </div>
  );
}
