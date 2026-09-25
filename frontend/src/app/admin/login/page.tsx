'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Shield, Lock, User, ArrowRight, RotateCw, AlertCircle, Store, Sparkles } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if admin is already authenticated on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('printspot_admin_token') : null;
      if (!token) {
        setIsCheckingSession(false);
        return;
      }

      try {
        const res = await fetch('/api/admin/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.admin) {
            router.replace('/admin');
            return;
          }
        }
      } catch (err) {
        console.warn('Admin session verification failed:', err);
      } finally {
        setIsCheckingSession(false);
      }
    };

    checkExistingSession();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please provide administrator username and password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
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
        throw new Error(data.error || 'Authentication failed. Please verify credentials.');
      }

      localStorage.setItem('printspot_admin_token', data.token);
      router.replace('/admin');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check administrator credentials.');
      setIsLoading(false);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex flex-col items-center justify-center p-6 text-center text-slate-100">
        <RotateCw className="w-8 h-8 text-sky-400 animate-spin mb-3" />
        <p className="text-xs text-slate-400 font-medium">Verifying administrator session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col antialiased selection:bg-sky-500/30 selection:text-sky-200">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-[#0f172a]/70 backdrop-blur-md px-6 py-3.5 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md font-bold text-sm">
              P
            </div>
            <div>
              <span className="text-sm font-extrabold tracking-tight text-white block leading-tight">
                PrintSpot
              </span>
              <span className="text-[10px] text-sky-400 font-mono font-medium leading-none">
                Super Admin Console
              </span>
            </div>
          </Link>

          <Link
            href="/shop/login"
            className="text-xs font-semibold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800/60 transition-colors flex items-center gap-1.5"
          >
            <Store className="w-3.5 h-3.5 text-cyan-400" />
            <span>Shopkeeper Counter Login</span>
          </Link>
        </div>
      </header>

      {/* Main Login Card */}
      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Header Card */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shadow-inner">
              <Shield className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-extrabold text-white tracking-tight">
              Platform Super Admin Login
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Secure access for fleet monitoring, shop onboarding, and platform analytics.
            </p>
          </div>

          {/* Form Card */}
          <div className="p-6 bg-[#0f172a]/90 border border-slate-800 rounded-3xl shadow-2xl space-y-4 backdrop-blur-md">
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-sky-400" />
                  Admin Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-sky-400" />
                  Admin Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter administrator password"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/20 flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Authenticate Super Admin</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-3 border-t border-slate-800 text-center">
              <span className="text-[10px] text-slate-500 font-mono">
                Default Credentials: <span className="text-slate-400">admin / admin123</span>
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
