'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
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
  Menu,
  ChevronRight,
  Globe,
  Link2,
  Info,
} from 'lucide-react';
import {
  buildCustomerUrl,
  buildShopkeeperUrl,
  buildAdminUrl,
  cleanRootOrigin,
  RoutingScheme,
  PlatformRoutingConfig,
  DEFAULT_ROUTING_CONFIG,
} from '@/lib/routing';

type AdminTab = 'analytics' | 'fleet' | 'onboard' | 'routing';

export default function AdminCommandCenterPage() {
  const router = useRouter();
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('analytics');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Analytics data
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Fleet data
  const [shops, setShops] = useState<any[]>([]);
  const [isLoadingFleet, setIsLoadingFleet] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Platform Routing Settings
  const [routingConfig, setRoutingConfig] = useState<PlatformRoutingConfig>(DEFAULT_ROUTING_CONFIG);
  const [isSavingRouting, setIsSavingRouting] = useState(false);
  const [routingSaveSuccess, setRoutingSaveSuccess] = useState(false);
  const [selectedQrTargetUrl, setSelectedQrTargetUrl] = useState<string>('');
  const [selectedQrScheme, setSelectedQrScheme] = useState<RoutingScheme>('path');

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

  // Verify Admin Session on mount - redirect to /admin/login if unauthenticated
  useEffect(() => {
    const savedToken = localStorage.getItem('printspot_admin_token');
    if (!savedToken) {
      router.replace('/admin/login');
      return;
    }
    setAdminToken(savedToken);
    fetchAnalytics(savedToken);
    fetchFleet(savedToken);
    fetchRoutingConfig();
  }, [router]);

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

  const handleAdminLogout = () => {
    localStorage.removeItem('printspot_admin_token');
    setAdminToken(null);
    router.replace('/admin/login');
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

  const fetchRoutingConfig = async () => {
    try {
      const res = await fetch('/api/admin/settings/routing');
      if (res.ok) {
        const data = await res.json();
        setRoutingConfig({
          scheme: data.scheme || 'path',
          baseUrl: data.baseUrl || '',
          domain: data.domain || 'mellod.in',
        });
        setSelectedQrScheme(data.scheme || 'path');
      }
    } catch (err) {
      console.warn('Failed to load routing config:', err);
    }
  };

  const handleSaveRoutingConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!adminToken) return;
    setIsSavingRouting(true);
    setRoutingSaveSuccess(false);
    try {
      const res = await fetch('/api/admin/settings/routing', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(routingConfig),
      });
      if (res.ok) {
        setRoutingSaveSuccess(true);
        setTimeout(() => setRoutingSaveSuccess(false), 3000);
      } else {
        alert('Failed to save routing configuration.');
      }
    } catch (err) {
      alert('Error updating routing settings.');
    } finally {
      setIsSavingRouting(false);
    }
  };

  const openQrModal = async (shop: any, schemeOverride?: RoutingScheme) => {
    setSelectedQrShop(shop);
    const scheme = schemeOverride || routingConfig.scheme;
    setSelectedQrScheme(scheme);
    try {
      const targetUrl = buildCustomerUrl(shop, scheme, routingConfig.baseUrl, routingConfig.domain);
      setSelectedQrTargetUrl(targetUrl);
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

  // 1. Render Loading State while redirecting to /admin/login
  if (!adminToken) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 text-center text-slate-800">
        <RotateCw className="w-8 h-8 text-[#0e7490] animate-spin mb-3" />
        <p className="text-xs text-slate-500 font-medium">Redirecting to Super Admin Login...</p>
      </div>
    );
  }

  // 2. Render Super Admin Command Center
  const filteredShops = shops.filter((s) => {
    const q = searchQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.location.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex antialiased">
      {/* Mobile Drawer Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      {/* Modern Sidebar (Collapsible on mobile, fixed width on desktop) */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-white border-r border-slate-200/90 flex flex-col transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 shadow-sm lg:shadow-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Brand Header */}
        <div className="h-16 px-6 border-b border-slate-100 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#0e7490] flex items-center justify-center text-white shadow-sm shadow-[#0e7490]/20 font-bold text-sm">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <span className="text-sm font-extrabold tracking-tight text-slate-900 block leading-tight">
                Print<span className="text-[#0e7490]">Spot</span>
              </span>
              <span className="text-[10px] text-[#0e7490] font-semibold leading-none">
                Super Admin Console
              </span>
            </div>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 lg:hidden cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sidebar Navigation */}
        <div className="flex-1 px-4 py-5 space-y-6 overflow-y-auto">
          {/* Main Controls Section */}
          <div className="space-y-1.5">
            <span className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
              Platform Controls
            </span>
            <button
              onClick={() => {
                setActiveTab('analytics');
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'analytics'
                  ? 'bg-[#ecfeff] text-[#0e7490] border border-[#a5f3fc] shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <TrendingUp className={`w-4 h-4 ${activeTab === 'analytics' ? 'text-[#0e7490]' : 'text-slate-400'}`} />
                <span>Analytics & Insights</span>
              </div>
              {activeTab === 'analytics' && <div className="w-1.5 h-1.5 rounded-full bg-[#0e7490]" />}
            </button>

            <button
              onClick={() => {
                setActiveTab('fleet');
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'fleet'
                  ? 'bg-[#ecfeff] text-[#0e7490] border border-[#a5f3fc] shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Store className={`w-4 h-4 ${activeTab === 'fleet' ? 'text-[#0e7490]' : 'text-slate-400'}`} />
                <span>Counter Fleet</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                activeTab === 'fleet' ? 'bg-[#cffafe] text-[#0e7490]' : 'bg-slate-100 text-slate-500'
              }`}>
                {shops.length}
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('onboard');
                setOnboardSuccessShop(null);
                setOnboardStep(1);
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'onboard'
                  ? 'bg-[#ecfeff] text-[#0e7490] border border-[#a5f3fc] shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Plus className={`w-4 h-4 ${activeTab === 'onboard' ? 'text-[#0e7490]' : 'text-slate-400'}`} />
                <span>Onboard New Shop</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                + New
              </span>
            </button>

            <button
              onClick={() => {
                setActiveTab('routing');
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'routing'
                  ? 'bg-[#ecfeff] text-[#0e7490] border border-[#a5f3fc] shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Globe className={`w-4 h-4 ${activeTab === 'routing' ? 'text-[#0e7490]' : 'text-slate-400'}`} />
                <span>URL & QR Routing</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                activeTab === 'routing' ? 'bg-[#cffafe] text-[#0e7490]' : 'bg-slate-100 text-slate-500'
              }`}>
                Config
              </span>
            </button>
          </div>

          {/* Quick Access Portals */}
          <div className="space-y-1.5 pt-4 border-t border-slate-100">
            <span className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
              Portals & Counters
            </span>
            <Link
              href="/"
              className="w-full px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2.5 transition-colors"
            >
              <ExternalLink className="w-4 h-4 text-slate-400" />
              <span>Customer Portal</span>
            </Link>
            <Link
              href="/shop/login"
              className="w-full px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2.5 transition-colors"
            >
              <Store className="w-4 h-4 text-slate-400" />
              <span>Shopkeeper Login</span>
            </Link>
          </div>
        </div>

        {/* Sidebar Footer User Card */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#ecfeff] border border-[#a5f3fc] flex items-center justify-center text-[#0e7490] font-bold text-xs shrink-0">
                <Shield className="w-4 h-4" />
              </div>
              <div className="truncate">
                <span className="text-xs font-bold text-slate-800 block truncate">
                  Master Admin
                </span>
                <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active Session
                </span>
              </div>
            </div>
            <button
              onClick={handleAdminLogout}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Premium Light Top Bar */}
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 lg:hidden cursor-pointer"
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-400 font-medium hidden sm:inline">Admin</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 hidden sm:inline" />
              <h1 className="text-sm font-bold text-slate-900">
                {activeTab === 'analytics'
                  ? 'Platform Analytics & Intelligence'
                  : activeTab === 'fleet'
                  ? 'Counter Fleet Directory'
                  : activeTab === 'routing'
                  ? 'URL Architecture & Routing Directory'
                  : 'Onboard New Shop Counter'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Quick Live Status Pill */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-[11px] font-bold text-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{analytics?.openShops || 0} Open • {shops.length} Counters</span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => {
                if (adminToken) {
                  fetchAnalytics(adminToken);
                  fetchFleet(adminToken);
                }
              }}
              className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="Refresh Data"
            >
              <RotateCw className={`w-3.5 h-3.5 text-[#0e7490] ${isLoadingAnalytics || isLoadingFleet ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline font-semibold">Sync</span>
            </button>

            {/* Quick Action Onboard */}
            {activeTab !== 'onboard' && (
              <button
                onClick={() => {
                  setActiveTab('onboard');
                  setOnboardSuccessShop(null);
                  setOnboardStep(1);
                }}
                className="px-3 py-1.5 rounded-xl bg-[#0e7490] hover:bg-[#0891b2] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-[#0e7490]/20 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Onboard Counter</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Workspace Body */}
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col space-y-6">

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
                            placeholder="e.g. Store Owner Name"
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

        {/* ========================================================================= */}
        {/* 4. TAB: URL ARCHITECTURE & ROUTING CONTROL */}
        {/* ========================================================================= */}
        {activeTab === 'routing' && (
          <div className="space-y-6">
            {/* Context & Hero Banner */}
            <div className="figma-card p-6 bg-gradient-to-r from-white via-cyan-50/20 to-slate-50 border border-slate-200">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#ecfeff] border border-[#a5f3fc] text-[#0e7490] text-[10px] font-bold">
                    <Globe className="w-3.5 h-3.5" />
                    <span>Deterministic URL &amp; Portal Architecture</span>
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                    URL Definitions &amp; QR Routing Directory
                  </h2>
                  <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
                    Strict definitions of which URL leads to which portal. QR codes are configured to direct customers exclusively to their counter&apos;s file upload and live queue screen, with zero possibility of landing on the shopkeeper dashboard or login page.
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto">
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Guaranteed Customer Isolation
                  </span>
                </div>
              </div>
            </div>

            {/* Straight Definition Matrix (3 Roles) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Role 1: Customer Order Gateway */}
              <div className="figma-card p-5 bg-white border border-slate-200 hover:border-[#0e7490] transition-colors relative flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#0e7490] bg-[#ecfeff] border border-[#a5f3fc] px-2.5 py-0.5 rounded-full uppercase">
                      Client-Side Gateway
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      Zero Auth Required
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <span>🛒 Customer Order Station</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      For walk-in customers and students. Uploads documents, selects B&amp;W/Color, configures binding/paper, calculates price, pays, and receives queue token code.
                    </p>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Canonical URL Patterns
                    </span>
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-800 space-y-1">
                      <div className="text-emerald-700 font-semibold truncate">/counter/:slug</div>
                      <div className="text-slate-600 truncate">/?shop=:slug</div>
                      <div className="text-cyan-700 truncate">https://:slug.mellod.in</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-emerald-700 font-medium flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>Never redirects to /shop or prompts for PIN</span>
                </div>
              </div>

              {/* Role 2: Shopkeeper Counter Station */}
              <div className="figma-card p-5 bg-white border border-slate-200 relative flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full uppercase">
                      Counter Station
                    </span>
                    <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                      Phone + PIN Protected
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <span>🏬 Shopkeeper Counter Station</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      For shopkeeper &amp; operators. Manages open/closed toggle, recognizes connected local printers, dispatches print jobs, updates catalog rates, and audits revenue.
                    </p>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Canonical URL Patterns
                    </span>
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-800 space-y-1">
                      <div className="text-amber-800 font-semibold truncate">/shop (Dashboard)</div>
                      <div className="text-slate-600 truncate">/shop/login (Auth)</div>
                      <div className="text-cyan-700 truncate">https://shop.mellod.in</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  <span>Unauthenticated visitors redirect to /shop/login</span>
                </div>
              </div>

              {/* Role 3: Platform Super Admin */}
              <div className="figma-card p-5 bg-white border border-slate-200 relative flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-full uppercase">
                      Platform Control
                    </span>
                    <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                      Admin Credentials
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <span>🛡️ Platform Super Admin</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Master command center for network telemetry, fleet overview, counter onboarding, custom subdomain assignment, platform routing settings, and credentials reset.
                    </p>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Canonical URL Patterns
                    </span>
                    <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 font-mono text-[11px] text-slate-800 space-y-1">
                      <div className="text-purple-800 font-semibold truncate">/admin (Master View)</div>
                      <div className="text-slate-600 truncate">/admin/login (Auth)</div>
                      <div className="text-cyan-700 truncate">https://admin.mellod.in</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 shrink-0 text-purple-600" />
                  <span>Requires master administrator session token</span>
                </div>
              </div>
            </div>

            {/* Global QR Code & Routing Configuration Card */}
            <div className="figma-card p-6 bg-white border border-slate-200 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#0e7490]" />
                    <span>Global QR Code &amp; Routing Scheme Options</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure how customer QR code standees and copyable counter links are constructed across all dashboards.
                  </p>
                </div>
                {routingSaveSuccess && (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl flex items-center gap-1.5 animate-fadeIn">
                    <Check className="w-3.5 h-3.5" />
                    Saved Successfully!
                  </span>
                )}
              </div>

              <form onSubmit={handleSaveRoutingConfig} className="space-y-5">
                {/* Scheme Choice */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-2">
                    Default Customer Standee Target Format:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div
                      onClick={() => setRoutingConfig((p) => ({ ...p, scheme: 'path' }))}
                      className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                        routingConfig.scheme === 'path'
                          ? 'border-[#0e7490] bg-[#ecfeff]/50 shadow-2xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-slate-900">Universal Path</span>
                          <span className="text-[10px] font-bold text-white bg-[#0e7490] px-1.5 py-0.2 rounded">
                            Recommended
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-snug font-mono">
                          {'{origin}'}/counter/{'{slug}'}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-2 leading-tight">
                          Works on all mobile phones, local Wi-Fi, and public domains without DNS setup.
                        </p>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-[#0e7490]">
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          routingConfig.scheme === 'path' ? 'border-[#0e7490] bg-[#0e7490] text-white' : 'border-slate-300'
                        }`}>
                          {routingConfig.scheme === 'path' && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <span>Active Format</span>
                      </div>
                    </div>

                    <div
                      onClick={() => setRoutingConfig((p) => ({ ...p, scheme: 'subdomain' }))}
                      className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                        routingConfig.scheme === 'subdomain'
                          ? 'border-[#0e7490] bg-[#ecfeff]/50 shadow-2xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-slate-900">Branded Subdomain</span>
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                            DNS Wildcard
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-snug font-mono">
                          https://{'{slug}'}.mellod.in
                        </p>
                        <p className="text-[10px] text-slate-400 mt-2 leading-tight">
                          Requires wildcard (*.mellod.in) DNS A-record pointed to production.
                        </p>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-[#0e7490]">
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          routingConfig.scheme === 'subdomain' ? 'border-[#0e7490] bg-[#0e7490] text-white' : 'border-slate-300'
                        }`}>
                          {routingConfig.scheme === 'subdomain' && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <span>Active Format</span>
                      </div>
                    </div>

                    <div
                      onClick={() => setRoutingConfig((p) => ({ ...p, scheme: 'query' }))}
                      className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between ${
                        routingConfig.scheme === 'query'
                          ? 'border-[#0e7490] bg-[#ecfeff]/50 shadow-2xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-slate-900">Root Query Param</span>
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded">
                            Standard
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-snug font-mono">
                          {'{origin}'}/?shop={'{slug}'}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-2 leading-tight">
                          Direct query parameter on the root homepage customer client.
                        </p>
                      </div>
                      <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-[#0e7490]">
                        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          routingConfig.scheme === 'query' ? 'border-[#0e7490] bg-[#0e7490] text-white' : 'border-slate-300'
                        }`}>
                          {routingConfig.scheme === 'query' && <Check className="w-2.5 h-2.5" />}
                        </span>
                        <span>Active Format</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Base Host / Custom Network IP */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Public Host Origin Override (Optional)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={routingConfig.baseUrl}
                        onChange={(e) => setRoutingConfig({ ...routingConfig, baseUrl: e.target.value })}
                        placeholder="e.g. http://192.168.1.15:3000 or leave empty for auto-detect"
                        className="flex-1 figma-input px-3 py-2 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const autoHost = cleanRootOrigin();
                          setRoutingConfig((p) => ({ ...p, baseUrl: autoHost }));
                        }}
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700 hover:bg-slate-100 whitespace-nowrap cursor-pointer"
                        title="Auto-detect origin from your current browser URL"
                      >
                        Auto Detect Host
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Tip: If scanning QR codes with mobile phones on local Wi-Fi, enter your local PC IP (e.g. <code>http://192.168.x.x:3000</code>).
                    </span>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Production Root Domain
                    </label>
                    <input
                      type="text"
                      value={routingConfig.domain}
                      onChange={(e) => setRoutingConfig({ ...routingConfig, domain: e.target.value })}
                      placeholder="mellod.in"
                      className="w-full figma-input px-3 py-2 text-xs"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Used when generating branded subdomain links (e.g. <code>campus.mellod.in</code>).
                    </span>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Info className="w-3.5 h-3.5 text-[#0e7490]" />
                    <span>Changes take effect immediately across all QR codes and generated posters.</span>
                  </div>
                  <button
                    type="submit"
                    disabled={isSavingRouting}
                    className="figma-btn-primary px-5 py-2.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    {isSavingRouting ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving Configuration...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Save Routing Settings</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Live Counter Routing Directory & Link Tester */}
            <div className="figma-card bg-white border border-slate-200 overflow-hidden shadow-2xs">
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Store className="w-4 h-4 text-[#0e7490]" />
                    <span>Live Counter Routing Directory ({shops.length})</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Verify and test exact destination URLs for every onboarded counter in your fleet.
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter counters..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-[#0e7490]"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="p-3.5 pl-4">Counter Details</th>
                      <th className="p-3.5">Customer Client URL (Direct Gateway)</th>
                      <th className="p-3.5">Shopkeeper URL</th>
                      <th className="p-3.5 text-right pr-4">Standee QR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shops
                      .filter((s) => {
                        const q = searchQuery.toLowerCase();
                        return (
                          s.name.toLowerCase().includes(q) ||
                          s.location.toLowerCase().includes(q) ||
                          (s.slug && s.slug.toLowerCase().includes(q))
                        );
                      })
                      .map((s) => {
                        const custUrl = buildCustomerUrl(s, routingConfig.scheme, routingConfig.baseUrl, routingConfig.domain);
                        const shopUrl = buildShopkeeperUrl(routingConfig.baseUrl);

                        return (
                          <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3.5 pl-4">
                              <span className="font-bold text-slate-900 block">{s.name}</span>
                              <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5">
                                <MapPin className="w-3 h-3 text-[#0e7490] shrink-0" />
                                <span className="truncate max-w-[200px]">{s.location}</span>
                              </div>
                              <span className="text-[10px] font-mono text-cyan-800 bg-[#ecfeff] px-1.5 py-0.2 rounded inline-block mt-1">
                                slug: {s.slug || 'none'}
                              </span>
                            </td>

                            <td className="p-3.5">
                              <div className="flex items-center gap-2 max-w-sm">
                                <code className="bg-slate-100 px-2 py-1 rounded text-[11px] font-mono text-emerald-800 truncate block flex-1 border border-slate-200">
                                  {custUrl}
                                </code>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(custUrl);
                                    alert(`Copied Customer URL: ${custUrl}`);
                                  }}
                                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 shrink-0 cursor-pointer"
                                  title="Copy Customer Link"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <a
                                  href={custUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 shrink-0 flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                                  title="Test Customer Gateway in New Tab"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  <span>Test</span>
                                </a>
                              </div>
                              <span className="text-[10px] text-slate-400 mt-0.5 block">
                                Guaranteed to open Document Upload (never login)
                              </span>
                            </td>

                            <td className="p-3.5">
                              <div className="flex items-center gap-2">
                                <code className="bg-slate-100 px-2 py-1 rounded text-[11px] font-mono text-amber-800 border border-slate-200">
                                  {shopUrl}
                                </code>
                                <a
                                  href={shopUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-[10px] font-bold flex items-center gap-1"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Open</span>
                                </a>
                              </div>
                            </td>

                            <td className="p-3.5 text-right pr-4">
                              <button
                                onClick={() => openQrModal(s)}
                                className="px-3 py-1.5 rounded-xl bg-[#ecfeff] text-[#0e7490] hover:bg-cyan-100 border border-[#a5f3fc] transition-colors text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                                <span>View QR</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        </main>
      </div>

      {/* Standee QR Preview Modal */}
      {selectedQrShop && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl relative">
            <button
              onClick={() => setSelectedQrShop(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <span className="text-[10px] font-bold text-white bg-[#0e7490] px-2.5 py-0.5 rounded-full uppercase">
                Official Standee QR
              </span>
              <h3 className="text-base font-extrabold text-slate-900 mt-2">
                {selectedQrShop.name}
              </h3>
              <p className="text-xs text-slate-500">{selectedQrShop.location}</p>
            </div>

            {/* Scheme Selector inside Modal */}
            <div className="flex justify-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              {(['path', 'subdomain', 'query'] as RoutingScheme[]).map((scheme) => (
                <button
                  key={scheme}
                  onClick={() => openQrModal(selectedQrShop, scheme)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    selectedQrScheme === scheme
                      ? 'bg-white text-[#0e7490] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {scheme === 'path' ? 'Universal Path' : scheme === 'subdomain' ? 'Subdomain' : 'Query Param'}
                </button>
              ))}
            </div>

            {/* QR Image */}
            {qrCodeDataUrl && (
              <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 inline-block shadow-md">
                <img src={qrCodeDataUrl} alt="QR" className="w-48 h-48 mx-auto" />
                <span className="text-[10px] font-mono font-bold text-sky-700 block mt-2 break-all max-w-[280px]">
                  {selectedQrTargetUrl || (selectedQrShop.slug ? `${selectedQrShop.slug}.mellod.in` : `ID: ${selectedQrShop.id}`)}
                </span>
              </div>
            )}

            {/* Verified Reassurance Note */}
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium flex items-center justify-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Directs customers straight to Document Upload &amp; Live Queue</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <a
                href={qrCodeDataUrl}
                download={`PrintSpot_${selectedQrShop.slug || selectedQrShop.id}_Standee.png`}
                className="flex-1 figma-btn-primary py-2 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Standee</span>
              </a>

              <a
                href={selectedQrTargetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold hover:bg-emerald-100 flex items-center gap-1.5"
                title="Test this QR destination directly in a new browser tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Test Link</span>
              </a>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedQrTargetUrl);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold hover:bg-slate-100 cursor-pointer flex items-center gap-1"
                title="Copy Destination Link"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
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
