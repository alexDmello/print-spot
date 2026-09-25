'use client';

import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import Link from 'next/link';
import { MapPicker } from '@/components/MapPicker';
import { getSocket } from '@/lib/socket';
import {
  Shield,
  Lock,
  Building,
  Store,
  MapPin,
  Clock,
  Printer,
  Sliders,
  DollarSign,
  Activity,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Search,
  Plus,
  Trash2,
  Key,
  QrCode,
  Download,
  Copy,
  Check,
  X,
  ExternalLink,
  Phone,
  Mail,
  User,
  LogOut,
  TrendingUp,
  FileText,
  Sparkles,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';

type AdminTab = 'analytics' | 'fleet' | 'onboard';

export default function AdminCommandCenterPage() {
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('analytics');

  // Login form state
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Analytics data
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Fleet data
  const [shops, setShops] = useState<any[]>([]);
  const [isLoadingFleet, setIsLoadingFleet] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected shop for Standee QR Modal
  const [selectedQrShop, setSelectedQrShop] = useState<any | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Selected shop for Reset PIN modal
  const [resetShopId, setResetShopId] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('1234');
  const [isResettingPin, setIsResettingPin] = useState(false);

  // Onboard form state
  const [onboardStep, setOnboardStep] = useState(1);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardSuccessShop, setOnboardSuccessShop] = useState<any | null>(null);
  const [onboardFormData, setOnboardFormData] = useState({
    name: '',
    slug: '',
    location: '',
    address: '',
    latitude: 28.6912,
    longitude: 77.2089,
    owner_name: '',
    owner_phone: '',
    owner_email: '',
    pin: '1234',
    opening_time: '08:00 AM',
    closing_time: '10:00 PM',
    working_days: 'Mon - Sat',
    upi_id: '',
    price_per_bw: 2.0,
    price_per_color: 10.0,
    spiral_price: 45.0,
    staple_price: 5.0,
    printer_name: 'Main Counter Laser Spooler',
    printer_type: 'mono' as 'mono' | 'color',
  });

  // Slug availability check
  const [slugStatus, setSlugStatus] = useState<{ checking: boolean; available?: boolean; error?: string }>({ checking: false });
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const slugCheckTimer = useRef<NodeJS.Timeout | null>(null);

  const checkSlugAvailability = async (slugToCheck: string) => {
    if (!slugToCheck || slugToCheck.length < 2) {
      setSlugStatus({ checking: false });
      return;
    }
    setSlugStatus({ checking: true });
    try {
      const res = await fetch(`/api/admin/check-slug?slug=${encodeURIComponent(slugToCheck)}`);
      const data = await res.json();
      if (data.available) {
        setSlugStatus({ checking: false, available: true });
      } else {
        setSlugStatus({ checking: false, available: false, error: data.reason || 'Slug taken' });
      }
    } catch {
      setSlugStatus({ checking: false });
    }
  };

  const handleNameChange = (name: string) => {
    const updated: any = { ...onboardFormData, name };
    if (!slugManuallyEdited) {
      const generated = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 18);
      updated.slug = generated;
      if (slugCheckTimer.current) clearTimeout(slugCheckTimer.current);
      slugCheckTimer.current = setTimeout(() => checkSlugAvailability(generated), 400);
    }
    setOnboardFormData(updated);
  };

  const handleSlugChange = (raw: string) => {
    setSlugManuallyEdited(true);
    const clean = raw.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
    setOnboardFormData((prev) => ({ ...prev, slug: clean }));
    if (slugCheckTimer.current) clearTimeout(slugCheckTimer.current);
    slugCheckTimer.current = setTimeout(() => checkSlugAvailability(clean), 400);
  };

  // Verify Admin Session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('printspot_admin_token');
    if (savedToken) {
      setAdminToken(savedToken);
      fetchAnalytics(savedToken);
      fetchFleet(savedToken);
    }
  }, []);

  // Listen to socket fleet updates
  useEffect(() => {
    const socket = getSocket();
    const handleUpdate = () => {
      const token = localStorage.getItem('printspot_admin_token');
      if (token) {
        fetchAnalytics(token);
        fetchFleet(token);
      }
    };

    socket.on('shop_fleet_updated', handleUpdate);
    socket.on('queue_updated', handleUpdate);

    return () => {
      socket.off('shop_fleet_updated', handleUpdate);
      socket.off('queue_updated', handleUpdate);
    };
  }, []);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: adminUsername.trim(),
          password: adminPassword.trim(),
        }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text || `Server error (${res.status})`);
      }

      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      localStorage.setItem('printspot_admin_token', data.token);
      setAdminToken(data.token);
      fetchAnalytics(data.token);
      fetchFleet(data.token);
    } catch (err: any) {
      setLoginError(err.message || 'Invalid administrator credentials');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('printspot_admin_token');
    setAdminToken(null);
  };

  const fetchAnalytics = async (token: string) => {
    setIsLoadingAnalytics(true);
    try {
      const res = await fetch('/api/admin/analytics', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  const fetchFleet = async (token: string) => {
    setIsLoadingFleet(true);
    try {
      const res = await fetch('/api/admin/shops', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setShops(data);
      }
    } catch (err) {
      console.error('Failed to load fleet:', err);
    } finally {
      setIsLoadingFleet(false);
    }
  };

  const handleToggleShopActive = async (shopId: string, currentActive: boolean) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/shops/${shopId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      if (res.ok) {
        fetchFleet(adminToken);
        fetchAnalytics(adminToken);
      }
    } catch (err) {
      console.error('Failed to toggle shop status:', err);
    }
  };

  const handleResetPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken || !resetShopId || !newPin.trim()) return;
    setIsResettingPin(true);
    try {
      const res = await fetch(`/api/admin/shops/${resetShopId}/credentials`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ pin: newPin.trim() }),
      });
      if (res.ok) {
        alert('PIN updated successfully!');
        setResetShopId(null);
        fetchFleet(adminToken);
      }
    } catch (err) {
      alert('Failed to reset PIN.');
    } finally {
      setIsResettingPin(false);
    }
  };

  const openQrModal = async (shop: any) => {
    setSelectedQrShop(shop);
    try {
      const isLocal = typeof window !== 'undefined' && window.location.hostname.includes('localhost');
      const targetUrl = shop.slug
        ? (isLocal ? `http://${shop.slug}.localhost:3000` : `https://${shop.slug}.mellod.in`)
        : `${window.location.origin}/?shop=${shop.id}`;

      const url = await QRCode.toDataURL(targetUrl, {
        width: 480,
        margin: 2,
        color: { dark: '#0e7490', light: '#ffffff' },
      });
      setQrCodeDataUrl(url);
    } catch (err) {
      console.error(err);
    }
  };

  // Submit Shop Onboarding
  const handleSubmitOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;

    setIsOnboarding(true);
    try {
      const res = await fetch('/api/admin/shops', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(onboardFormData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to onboard shop');

      setOnboardSuccessShop(data.shop);
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      fetchFleet(adminToken);
      fetchAnalytics(adminToken);
    } catch (err: any) {
      alert(err.message || 'Error onboarding shop');
    } finally {
      setIsOnboarding(false);
    }
  };

  // 1. Render Admin Login screen if not authenticated
  if (!adminToken) {
    return (
      <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col justify-between antialiased">
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-sm font-bold text-sm">
                <Shield className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <span className="text-sm font-extrabold tracking-tight text-slate-900 block leading-tight">
                  PrintSpot Super Admin
                </span>
                <span className="text-[10px] text-slate-500 font-medium leading-none">
                  Platform Operations
                </span>
              </div>
            </Link>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-slate-900 text-cyan-400 flex items-center justify-center shadow-lg">
                <Lock className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Platform Operator Login
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Enter your master credentials to access the fleet control and analytics center.
              </p>
            </div>

            <div className="figma-card p-6 bg-white border border-slate-200 shadow-md space-y-4">
              {loginError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                  {loginError}
                </div>
              )}

              <form onSubmit={handleAdminLogin} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Administrator Username
                  </label>
                  <input
                    type="text"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="e.g. admin"
                    required
                    className="w-full figma-input px-3.5 py-2.5 text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Master Password / Passkey
                  </label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Default: admin123"
                    required
                    className="w-full figma-input px-3.5 py-2.5 text-xs text-slate-900 font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {isLoggingIn ? (
                    <>
                      <RotateCw className="w-4 h-4 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <span>Enter Super Admin Center</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="pt-2 text-center">
                <span className="text-[11px] text-slate-400">
                  Default: <strong className="text-slate-600">admin</strong> / Password: <strong className="text-slate-600">admin123</strong>
                </span>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 2. Render Super Admin Command Center
  const filteredShops = shops.filter((s) => {
    const q = searchQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.location.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col antialiased">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 h-15 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-[#0e7490] flex items-center justify-center text-white shadow-sm font-bold text-sm">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-extrabold tracking-tight">PrintSpot Super Admin</h1>
                <span className="text-[10px] font-bold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-800">
                  Master Control
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Platform Operations & Counter Fleet</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                if (adminToken) {
                  fetchAnalytics(adminToken);
                  fetchFleet(adminToken);
                }
              }}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition-colors"
              title="Refresh platform stats"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleAdminLogout}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-red-900/60 text-slate-300 hover:text-red-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-6 flex flex-col space-y-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'analytics'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-cyan-500" />
            <span>Platform Analytics & Intelligence</span>
          </button>

          <button
            onClick={() => setActiveTab('fleet')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'fleet'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Store className="w-3.5 h-3.5 text-cyan-500" />
            <span>Counter Fleet Directory ({shops.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('onboard');
              setOnboardSuccessShop(null);
              setOnboardStep(1);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'onboard'
                ? 'bg-[#0e7490] text-white shadow-sm'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Onboard New Shop</span>
          </button>
        </div>

        {/* TAB 1: ANALYTICS & INTELLIGENCE */}
        {activeTab === 'analytics' && (
          <div className="space-y-4">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="figma-card p-4 bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                  Platform GMV (Gross)
                </span>
                <span className="text-2xl font-extrabold text-emerald-600 block mt-1">
                  ₹{Number(analytics?.totalRevenue || 0).toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-500">
                  ₹{Number(analytics?.revenueToday || 0).toFixed(2)} earned today
                </span>
              </div>

              <div className="figma-card p-4 bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                  Total Print Jobs
                </span>
                <span className="text-2xl font-extrabold text-slate-900 block mt-1">
                  {analytics?.totalJobs || 0}
                </span>
                <span className="text-[10px] text-slate-500">
                  {analytics?.jobsToday || 0} submitted today
                </span>
              </div>

              <div className="figma-card p-4 bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                  Physical Sheets Printed
                </span>
                <span className="text-2xl font-extrabold text-[#0e7490] block mt-1">
                  {analytics?.totalPagesPrinted || 0}
                </span>
                <span className="text-[10px] text-slate-500">Total laser sheets delivered</span>
              </div>

              <div className="figma-card p-4 bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                  Active Counters Fleet
                </span>
                <span className="text-2xl font-extrabold text-cyan-700 block mt-1">
                  {analytics?.activeShops || 0} / {analytics?.totalShops || 0}
                </span>
                <span className="text-[10px] text-slate-500">
                  {analytics?.openShops || 0} currently open for orders
                </span>
              </div>
            </div>

            {/* Leaderboard & Live Orders Split */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Top Shops Leaderboard */}
              <div className="figma-card p-5 bg-white border border-slate-200 space-y-3">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#0e7490]" />
                  <span>Top Performing Counters Leaderboard</span>
                </h3>

                <div className="space-y-2">
                  {analytics?.topShops?.map((s: any, idx: number) => (
                    <div
                      key={s.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">{s.name}</span>
                          <span className="text-[10px] text-slate-500">{s.location}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-extrabold text-emerald-700 block">
                          ₹{Number(s.total_revenue || 0).toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {s.total_orders || 0} orders • {s.total_sheets || 0} pgs
                        </span>
                      </div>
                    </div>
                  ))}

                  {(!analytics?.topShops || analytics.topShops.length === 0) && (
                    <p className="text-xs text-slate-400 text-center py-4">No completed orders recorded yet.</p>
                  )}
                </div>
              </div>

              {/* Real-time Global Order Stream */}
              <div className="figma-card p-5 bg-white border border-slate-200 space-y-3">
                <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-600" />
                  <span>Real-Time Live Global Order Stream</span>
                </h3>

                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {analytics?.recentJobs?.map((j: any) => (
                    <div
                      key={j.id}
                      className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl bg-slate-100 font-mono font-bold text-xs flex items-center justify-center text-slate-700">
                          {j.token_code || `#${j.token_number}`}
                        </span>
                        <div>
                          <span className="text-xs font-bold text-slate-900 block truncate max-w-[180px]">
                            {j.file_name}
                          </span>
                          <span className="text-[10px] text-slate-500 block truncate max-w-[200px]">
                            {j.shop_name} • {j.user_name || 'Customer'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-extrabold text-slate-900 block">
                          ₹{Number(j.price).toFixed(2)}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            j.status === 'ready' || j.status === 'picked_up'
                              ? 'bg-emerald-100 text-emerald-800'
                              : j.status === 'printing'
                              ? 'bg-cyan-100 text-cyan-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {j.status}
                        </span>
                      </div>
                    </div>
                  ))}

                  {(!analytics?.recentJobs || analytics.recentJobs.length === 0) && (
                    <p className="text-xs text-slate-400 text-center py-4">No incoming orders yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: COUNTER FLEET DIRECTORY */}
        {activeTab === 'fleet' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search counters by name, campus, or owner..."
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-[#0e7490]"
                />
              </div>

              <button
                onClick={() => {
                  setActiveTab('onboard');
                  setOnboardSuccessShop(null);
                  setOnboardStep(1);
                }}
                className="figma-btn-primary py-2 px-3.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Onboard New Counter</span>
              </button>
            </div>

            {/* Shops Table */}
            <div className="figma-card bg-white border border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Counter</th>
                      <th className="p-3">Location</th>
                      <th className="p-3">Owner Contact</th>
                      <th className="p-3">Rates (B&W/Color)</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredShops.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3">
                          <span className="font-bold text-slate-900 block">{s.name}</span>
                          <span className="text-[10px] font-mono text-[#0e7490] font-semibold block">
                            {s.slug ? `${s.slug}.mellod.in` : `ID: ${s.id}`}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 max-w-[180px] truncate">
                          {s.location}
                        </td>
                        <td className="p-3">
                          <span className="font-medium text-slate-800 block">{s.owner_name}</span>
                          <span className="text-[10px] font-mono text-slate-500">+91 {s.owner_phone}</span>
                        </td>
                        <td className="p-3 font-semibold text-slate-700">
                          ₹{s.price_per_bw} / ₹{s.price_per_color}
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => handleToggleShopActive(s.id, s.is_active !== false)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                              s.is_active !== false
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-red-100 text-red-800 hover:bg-red-200'
                            }`}
                          >
                            {s.is_active !== false ? 'Active' : 'Suspended'}
                          </button>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Standee QR Code */}
                            <button
                              onClick={() => openQrModal(s)}
                              className="p-1.5 rounded-lg bg-[#ecfeff] text-[#0e7490] hover:bg-cyan-100 transition-colors"
                              title="View Standee QR"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                            </button>

                            {/* Reset PIN */}
                            <button
                              onClick={() => setResetShopId(s.id)}
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                              title="Reset Login PIN"
                            >
                              <Key className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: ONBOARD NEW SHOP WIZARD */}
        {activeTab === 'onboard' && (
          <div className="space-y-4">
            {onboardSuccessShop ? (
              <div className="figma-card p-6 bg-white border border-slate-200 text-center max-w-md mx-auto space-y-4 shadow-md">
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">
                  Shop Successfully Onboarded!
                </h2>
                <p className="text-xs text-slate-500">
                  {onboardSuccessShop.name} is now registered on PrintSpot. The shopkeeper can log in using their phone number: <strong>{onboardSuccessShop.owner_phone}</strong> and PIN: <strong>{onboardSuccessShop.pin || '1234'}</strong>.
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={() => openQrModal(onboardSuccessShop)}
                    className="flex-1 figma-btn-primary py-2.5 text-xs font-bold"
                  >
                    View Standee QR
                  </button>
                  <button
                    onClick={() => {
                      setOnboardSuccessShop(null);
                      setOnboardStep(1);
                      setActiveTab('fleet');
                    }}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold"
                  >
                    Back to Fleet
                  </button>
                </div>
              </div>
            ) : (
              <div className="figma-card p-6 bg-white border border-slate-200 max-w-xl mx-auto space-y-4 shadow-sm">
                <div>
                  <span className="text-[10px] font-bold text-white bg-[#0e7490] px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Step {onboardStep} of 4
                  </span>
                  <h2 className="text-base font-extrabold text-slate-900 mt-1.5">
                    {onboardStep === 1 && 'Counter Identity & Campus Location'}
                    {onboardStep === 2 && 'Map GPS Coordinates & Physical Address'}
                    {onboardStep === 3 && 'Shop Owner Credentials & Login PIN'}
                    {onboardStep === 4 && 'Rates Card & Printer Setup'}
                  </h2>
                </div>

                <form onSubmit={onboardStep === 4 ? handleSubmitOnboard : (e) => { e.preventDefault(); setOnboardStep((p) => p + 1); }} className="space-y-3.5">
                  {/* STEP 1 */}
                  {onboardStep === 1 && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Counter Name *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. PrintSpot North Campus Hub"
                          value={onboardFormData.name}
                          onChange={(e) => handleNameChange(e.target.value)}
                          className="w-full figma-input px-3.5 py-2 text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Counter Subdomain (*.mellod.in) *
                        </label>
                        <div className="flex items-center">
                          <span className="px-3 py-2 bg-slate-100 border border-r-0 border-slate-200 rounded-l-xl text-xs font-mono text-slate-500">
                            https://
                          </span>
                          <input
                            type="text"
                            required
                            placeholder="e.g. engg, library, campus"
                            value={onboardFormData.slug}
                            onChange={(e) => handleSlugChange(e.target.value)}
                            className="w-full figma-input px-3.5 py-2 text-xs font-mono rounded-none"
                          />
                          <span className="px-3 py-2 bg-slate-100 border border-l-0 border-slate-200 rounded-r-xl text-xs font-mono text-slate-500">
                            .mellod.in
                          </span>
                        </div>
                        {slugStatus.checking ? (
                          <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                            <RotateCw className="w-3 h-3 animate-spin" /> Checking subdomain availability...
                          </p>
                        ) : slugStatus.available === true ? (
                          <p className="text-[10px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Subdomain is available: {onboardFormData.slug}.mellod.in
                          </p>
                        ) : slugStatus.error ? (
                          <p className="text-[10px] text-red-600 font-semibold mt-1 flex items-center gap-1">
                            <X className="w-3 h-3" /> {slugStatus.error}
                          </p>
                        ) : (
                          <p className="text-[10px] text-slate-400 mt-1">
                            Printed standees and customer mobile browsers will connect directly via this URL.
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Location / Campus Description *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Student Center, Ground Floor near Cafeteria"
                          value={onboardFormData.location}
                          onChange={(e) => setOnboardFormData({ ...onboardFormData, location: e.target.value })}
                          className="w-full figma-input px-3.5 py-2 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {/* STEP 2 */}
                  {onboardStep === 2 && (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Full Postal Address
                        </label>
                        <input
                          type="text"
                          placeholder="Shop G-04, Student Activity Center, University Enclave..."
                          value={onboardFormData.address}
                          onChange={(e) => setOnboardFormData({ ...onboardFormData, address: e.target.value })}
                          className="w-full figma-input px-3.5 py-2 text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Map Coordinates Picker
                        </label>
                        <MapPicker
                          latitude={onboardFormData.latitude}
                          longitude={onboardFormData.longitude}
                          address={onboardFormData.address}
                          onChange={({ latitude, longitude, address }) => {
                            setOnboardFormData((prev) => ({
                              ...prev,
                              latitude,
                              longitude,
                              address: address || prev.address,
                            }));
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* STEP 3 */}
                  {onboardStep === 3 && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">
                            Owner / Manager Name
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Vikram Malhotra"
                            value={onboardFormData.owner_name}
                            onChange={(e) => setOnboardFormData({ ...onboardFormData, owner_name: e.target.value })}
                            className="w-full figma-input px-3 py-2 text-xs"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">
                            Owner Phone (Login ID) *
                          </label>
                          <input
                            type="tel"
                            required
                            placeholder="10-digit mobile"
                            value={onboardFormData.owner_phone}
                            onChange={(e) => setOnboardFormData({ ...onboardFormData, owner_phone: e.target.value })}
                            className="w-full figma-input px-3 py-2 text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">
                            Initial Login PIN *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. 1234"
                            maxLength={6}
                            value={onboardFormData.pin}
                            onChange={(e) => setOnboardFormData({ ...onboardFormData, pin: e.target.value })}
                            className="w-full figma-input px-3 py-2 text-xs font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">
                            Owner Email
                          </label>
                          <input
                            type="email"
                            placeholder="hub@printspot.in"
                            value={onboardFormData.owner_email}
                            onChange={(e) => setOnboardFormData({ ...onboardFormData, owner_email: e.target.value })}
                            className="w-full figma-input px-3 py-2 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 4 */}
                  {onboardStep === 4 && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">
                            B&W Price per Page (₹)
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            value={onboardFormData.price_per_bw}
                            onChange={(e) => setOnboardFormData({ ...onboardFormData, price_per_bw: Number(e.target.value) })}
                            className="w-full figma-input px-3 py-2 text-xs"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-bold text-slate-700 block mb-1">
                            Color Price per Page (₹)
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            value={onboardFormData.price_per_color}
                            onChange={(e) => setOnboardFormData({ ...onboardFormData, price_per_color: Number(e.target.value) })}
                            className="w-full figma-input px-3 py-2 text-xs"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Primary Spooler Printer Name
                        </label>
                        <input
                          type="text"
                          value={onboardFormData.printer_name}
                          onChange={(e) => setOnboardFormData({ ...onboardFormData, printer_name: e.target.value })}
                          className="w-full figma-input px-3 py-2 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {/* Navigation Buttons */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    {onboardStep > 1 ? (
                      <button
                        type="button"
                        onClick={() => setOnboardStep((p) => p - 1)}
                        className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                      >
                        Back
                      </button>
                    ) : (
                      <div></div>
                    )}

                    <button
                      type="submit"
                      disabled={isOnboarding}
                      className="figma-btn-primary px-4 py-2 text-xs font-bold cursor-pointer"
                    >
                      {onboardStep === 4 ? (isOnboarding ? 'Registering...' : 'Complete Onboarding') : 'Next'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Standee QR Preview Modal */}
      {selectedQrShop && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl relative">
            <button
              onClick={() => setSelectedQrShop(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <span className="text-[10px] font-bold text-white bg-[#0e7490] px-2.5 py-0.5 rounded-full uppercase">
                Official Standee
              </span>
              <h3 className="text-base font-extrabold text-slate-900 mt-2">
                {selectedQrShop.name}
              </h3>
              <p className="text-xs text-slate-500">{selectedQrShop.location}</p>
            </div>

            {qrCodeDataUrl && (
              <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 inline-block shadow-md">
                <img src={qrCodeDataUrl} alt="QR" className="w-48 h-48 mx-auto" />
                <span className="text-[10px] font-mono font-bold text-sky-700 block mt-1">
                  {selectedQrShop.slug ? `${selectedQrShop.slug}.mellod.in` : `ID: ${selectedQrShop.id}`}
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <a
                href={qrCodeDataUrl}
                download={`PrintSpot_${selectedQrShop.slug || selectedQrShop.id}_Standee.png`}
                className="flex-1 figma-btn-primary py-2 text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Standee</span>
              </a>
              <button
                onClick={() => {
                  const isLocal = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');
                  const cleanUrl = selectedQrShop.slug
                    ? (isLocal ? `http://${selectedQrShop.slug}.localhost:3000` : `https://${selectedQrShop.slug}.mellod.in`)
                    : `${window.location.origin}/?shop=${selectedQrShop.id}`;
                  navigator.clipboard.writeText(cleanUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold hover:bg-slate-100"
                title="Copy Subdomain Link"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset PIN Modal */}
      {resetShopId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-xs w-full text-center space-y-4 shadow-2xl relative">
            <button
              onClick={() => setResetShopId(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-bold text-slate-900">Reset Counter Login PIN</h3>
            <form onSubmit={handleResetPinSubmit} className="space-y-3">
              <input
                type="text"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                maxLength={6}
                placeholder="New 4-digit PIN"
                required
                className="w-full figma-input px-3 py-2 text-xs font-mono text-center"
              />
              <button
                type="submit"
                disabled={isResettingPin}
                className="w-full figma-btn-primary py-2 text-xs font-bold"
              >
                {isResettingPin ? 'Updating...' : 'Save New PIN'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
