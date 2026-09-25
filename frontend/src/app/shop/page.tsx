'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import Link from 'next/link';
import { getSocket } from '@/lib/socket';
import { Shop, Printer as IPrinter, PrintJob, QueueSnapshot, ShopService } from '@/lib/types';
import { initP2PReceiver } from '@/lib/p2pTransfer';
import {
  Activity,
  Printer,
  QrCode,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  XCircle,
  ArrowUp,
  ArrowDown,
  DollarSign,
  Layers,
  FileText,
  User,
  Phone,
  RefreshCw,
  Download,
  Copy,
  ExternalLink,
  Save,
  Check,
  Plus,
  Trash2,
  Power,
  Store,
  Compass,
  Palette,
  CreditCard,
  Mail,
  ChevronRight,
  Menu,
  X,
  LogOut,
  Bell,
  Sliders,
  Volume2,
  Zap,
  Sparkles,
} from 'lucide-react';

type ShopTab = 'queue' | 'printers' | 'rates' | 'standee' | 'profile';

export default function ShopDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ShopTab>('queue');
  const [shop, setShop] = useState<Shop | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Queue state
  const [queueSnapshot, setQueueSnapshot] = useState<QueueSnapshot>({
    nowServingToken: null,
    totalWaiting: 0,
    activeJobs: [],
  });

  // Direct WebRTC P2P in-memory file buffers (0 KB server storage)
  const [p2pBlobs, setP2pBlobs] = useState<Record<string, { blobUrl: string; fileName: string; fileSize: number }>>({});
  const [p2pReceivingProgress, setP2pReceivingProgress] = useState<Record<string, number>>({});

  // Today metrics
  const [stats, setStats] = useState({
    completedJobsToday: 0,
    revenueToday: 0,
    pagesPrintedToday: 0,
    waitingJobs: 0,
    printingJobs: 0,
    failedJobs: 0,
  });

  // Printers & Services
  const [printers, setPrinters] = useState<IPrinter[]>([]);
  const [services, setServices] = useState<ShopService[]>([]);
  const [systemPrinters, setSystemPrinters] = useState<any[]>([]);
  const [isDetectingSystem, setIsDetectingSystem] = useState(false);

  // Standee QR Code
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // UI state
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Audio Chime generator using Web Audio API
  const playChime = () => {
    if (!audioEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
      console.warn('Audio chime blocked by browser:', e);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Authenticate & load counter data
  useEffect(() => {
    const initSession = async () => {
      const storedToken = localStorage.getItem('printspot_shop_token');
      if (!storedToken) {
        router.replace('/shop/login');
        return;
      }

      setToken(storedToken);

      try {
        const res = await fetch('/api/shops/me', {
          headers: { Authorization: `Bearer ${storedToken}` },
        });

        if (!res.ok) {
          localStorage.removeItem('printspot_shop_token');
          router.replace('/shop/login');
          return;
        }

        const data = await res.json();
        const currentShop: Shop = data.shop;
        setShop(currentShop);
        setPrinters(currentShop.printers || []);
        setServices(currentShop.services || []);

        // Load Queue & Daily Stats
        await Promise.all([
          fetchQueue(currentShop.id),
          fetchStats(currentShop.id),
          generateQrCode(currentShop.id),
        ]);
      } catch (err) {
        console.error('Failed to initialize shop session:', err);
        router.replace('/shop/login');
      } finally {
        setIsLoading(false);
      }
    };

    initSession();
  }, [router]);

  // 2. Realtime WebSocket listener
  useEffect(() => {
    if (!shop) return;
    const socket = getSocket();

    socket.emit('join_shop', shop.id);

    const handleQueueUpdate = (snapshot: QueueSnapshot) => {
      setQueueSnapshot(snapshot);
      fetchStats(shop.id);
    };

    const handleNewOrder = (orderInfo: any) => {
      playChime();
      showToast(`🔔 New Order received: ${orderInfo.tokenCode} (₹${orderInfo.price})`);
      fetchQueue(shop.id);
      fetchStats(shop.id);
    };

    const handleShopUpdate = (updatedShop: Shop) => {
      if (updatedShop.id === shop.id) {
        setShop((prev) => (prev ? { ...prev, ...updatedShop } : updatedShop));
      }
    };

    socket.on('queue_updated', handleQueueUpdate);
    socket.on('new_order_arrived', handleNewOrder);
    socket.on('shop_updated', handleShopUpdate);

    // Initialize WebRTC Direct P2P Receiver for zero-cloud file transfers
    const cleanupP2P = initP2PReceiver(
      socket,
      (jobId, blobUrl, meta) => {
        setP2pBlobs((prev) => ({
          ...prev,
          [jobId]: { blobUrl, fileName: meta.fileName, fileSize: meta.fileSize },
        }));
        setP2pReceivingProgress((prev) => {
          const updated = { ...prev };
          delete updated[jobId];
          return updated;
        });
        playChime();
        showToast(`⚡ Direct P2P: "${meta.fileName}" received directly from customer phone (0 KB server storage)!`);
      },
      (jobId, percent) => {
        setP2pReceivingProgress((prev) => ({ ...prev, [jobId]: percent }));
      }
    );

    return () => {
      socket.off('queue_updated', handleQueueUpdate);
      socket.off('new_order_arrived', handleNewOrder);
      socket.off('shop_updated', handleShopUpdate);
      cleanupP2P();
    };
  }, [shop?.id, audioEnabled]);

  const fetchQueue = async (shopId: string) => {
    try {
      const res = await fetch(`/api/queue/${shopId}`);
      if (res.ok) {
        const data = await res.json();
        setQueueSnapshot(data);
      }
    } catch (err) {
      console.error('Error loading queue:', err);
    }
  };

  const fetchStats = async (shopId: string) => {
    try {
      const res = await fetch(`/api/shops/${shopId}/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const generateQrCode = async (shopId: string) => {
    try {
      const isLocal = typeof window !== 'undefined' && window.location.hostname.includes('localhost');
      const targetUrl = shop?.slug
        ? (isLocal ? `http://${shop.slug}.localhost:3000` : `https://${shop.slug}.mellod.in`)
        : `${window.location.origin}/?shop=${shopId}`;

      const url = await QRCode.toDataURL(targetUrl, {
        width: 480,
        margin: 2,
        color: { dark: '#0e7490', light: '#ffffff' },
      });
      setQrCodeDataUrl(url);
    } catch (err) {
      console.error('Error generating QR code:', err);
    }
  };

  // Toggle Counter Open / Paused State
  const handleToggleOpenState = async () => {
    if (!shop || !token) return;
    try {
      const res = await fetch(`/api/shops/${shop.id}/toggle-open`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_open: !shop.is_open }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setShop((prev) => (prev ? { ...prev, is_open: data.is_open } : null));
      showToast(data.message);
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle counter status');
    }
  };

  // Order Queue Actions
  const handleMarkPaid = async (jobId: string) => {
    if (!shop) return;
    setActionLoadingId(jobId);
    try {
      const res = await fetch(`/api/queue/${shop.id}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      if (res.ok) {
        showToast('Payment marked as collected at counter.');
        await fetchQueue(shop.id);
        await fetchStats(shop.id);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMarkReady = async (jobId: string) => {
    if (!shop) return;
    setActionLoadingId(jobId);
    try {
      const res = await fetch(`/api/queue/${shop.id}/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Job ready! Pickup code: ${data.pickupCode}`);
        await fetchQueue(shop.id);
        await fetchStats(shop.id);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirmPickup = async (jobId: string) => {
    if (!shop) return;
    setActionLoadingId(jobId);
    try {
      const res = await fetch(`/api/jobs/${jobId}/pickup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        showToast('Order confirmed picked up. File securely shredded.');
        await fetchQueue(shop.id);
        await fetchStats(shop.id);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    if (!shop || !confirm('Are you sure you want to cancel this job?')) return;
    setActionLoadingId(jobId);
    try {
      const res = await fetch(`/api/queue/${shop.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, reason: 'Cancelled by counter manager' }),
      });
      if (res.ok) {
        showToast('Job cancelled.');
        await fetchQueue(shop.id);
        await fetchStats(shop.id);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to log out from this counter?')) {
      localStorage.removeItem('printspot_shop_token');
      localStorage.removeItem('printspot_shop_data');
      router.replace('/shop/login');
    }
  };

  if (isLoading || !shop) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 text-center">
        <RotateCw className="w-8 h-8 text-[#0e7490] animate-spin mb-3" />
        <p className="text-xs text-slate-500 font-medium">Connecting to shop counter session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col antialiased">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 p-3.5 rounded-2xl bg-slate-900 text-white text-xs font-semibold shadow-2xl flex items-center gap-2 animate-bounce border border-slate-700">
          <Bell className="w-4 h-4 text-cyan-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Counter Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-15 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0e7490] to-cyan-500 flex items-center justify-center text-white shadow-sm font-bold text-sm">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-extrabold text-slate-900">{shop.name}</h1>
                {/* Counter Open / Paused Status Toggle */}
                <button
                  onClick={handleToggleOpenState}
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 transition-colors cursor-pointer ${
                    shop.is_open !== false
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200'
                  }`}
                  title="Click to toggle counter open / paused"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      shop.is_open !== false ? 'bg-emerald-600 animate-pulse' : 'bg-amber-600'
                    }`}
                  ></span>
                  <span>{shop.is_open !== false ? 'Open for Orders' : 'Counter Paused'}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-[#0e7490]" />
                <span>{shop.location}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Audio chime toggle */}
            <button
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                audioEnabled
                  ? 'bg-cyan-50 text-[#0e7490] border-cyan-200'
                  : 'bg-slate-100 text-slate-400 border-slate-200'
              }`}
              title={audioEnabled ? 'New order audio chime active' : 'Audio chime muted'}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{audioEnabled ? 'Chime ON' : 'Muted'}</span>
            </button>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer border border-slate-200"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Log Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-5 flex flex-col space-y-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'queue'
                ? 'bg-[#0e7490] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Live Order Queue</span>
            {queueSnapshot.activeJobs.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-cyan-400 text-slate-900 text-[10px] flex items-center justify-center font-bold">
                {queueSnapshot.activeJobs.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('printers')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'printers'
                ? 'bg-[#0e7490] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Printers & Spoolers</span>
          </button>

          <button
            onClick={() => setActiveTab('rates')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'rates'
                ? 'bg-[#0e7490] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Rates & Services</span>
          </button>

          <button
            onClick={() => setActiveTab('standee')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'standee'
                ? 'bg-[#0e7490] text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Counter Standee QR</span>
          </button>
        </div>

        {/* TAB 1: LIVE QUEUE & ORDERS */}
        {activeTab === 'queue' && (
          <div className="space-y-4">
            {/* Quick Metrics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="figma-card p-3.5 bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                  Today's Earnings
                </span>
                <span className="text-xl font-extrabold text-emerald-600 block mt-0.5">
                  ₹{stats.revenueToday.toFixed(2)}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {stats.completedJobsToday} jobs completed
                </span>
              </div>

              <div className="figma-card p-3.5 bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                  Pages Printed
                </span>
                <span className="text-xl font-extrabold text-slate-900 block mt-0.5">
                  {stats.pagesPrintedToday}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">Physical laser sheets</span>
              </div>

              <div className="figma-card p-3.5 bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                  Waiting in Queue
                </span>
                <span className="text-xl font-extrabold text-[#0e7490] block mt-0.5">
                  {queueSnapshot.totalWaiting}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">Ready to spool</span>
              </div>

              <div className="figma-card p-3.5 bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                  Now Serving
                </span>
                <span className="text-xl font-extrabold text-cyan-600 block mt-0.5 font-mono">
                  {queueSnapshot.nowServingToken || 'Idle'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">Active counter token</span>
              </div>
            </div>

            {/* Active Queue Orders */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[#0e7490]" />
                  <span>Incoming Print Queue ({queueSnapshot.activeJobs.length})</span>
                </h2>
                <button
                  onClick={() => {
                    fetchQueue(shop.id);
                    fetchStats(shop.id);
                  }}
                  className="text-xs text-[#0e7490] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh Queue</span>
                </button>
              </div>

              {queueSnapshot.activeJobs.length === 0 ? (
                <div className="figma-card p-8 bg-white border border-slate-200 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">Queue is Clear!</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    All jobs are printed. When customers scan your counter QR and place an order, it will appear here in real time with an audio chime.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {queueSnapshot.activeJobs.map((job) => {
                    const isPayAtCounter = job.payment_status === 'pay_at_counter';
                    return (
                      <div
                        key={job.id}
                        className={`figma-card p-4 border transition-all ${
                          job.status === 'printing'
                            ? 'bg-cyan-50/40 border-cyan-300 ring-2 ring-cyan-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                          <div className="flex items-center gap-3">
                            <span className="w-11 h-11 rounded-2xl bg-[#0e7490] text-white flex items-center justify-center font-extrabold text-sm font-mono shadow-sm">
                              {job.token_code || `#${job.token_number}`}
                            </span>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-slate-900 truncate max-w-[220px]">
                                  {job.file_name}
                                </span>
                                {/* P2P Direct Transfer Badge */}
                                {p2pBlobs[job.id] ? (
                                  <span className="text-[10px] font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded-full flex items-center gap-1 border border-teal-300">
                                    <Zap className="w-3 h-3 text-teal-600 fill-teal-500" />
                                    <span>Direct P2P (0 KB Cloud)</span>
                                  </span>
                                ) : job.file_url?.startsWith('p2p://') ? (
                                  <span className="text-[10px] font-bold text-cyan-800 bg-cyan-100 px-2 py-0.5 rounded-full flex items-center gap-1 border border-cyan-300">
                                    <Zap className="w-3 h-3 text-cyan-600" />
                                    <span>P2P Transfer</span>
                                  </span>
                                ) : null}

                                {/* Payment Badge */}
                                {isPayAtCounter ? (
                                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1 border border-amber-300">
                                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                                    <span>Pay at Counter: ₹{Number(job.price).toFixed(2)}</span>
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                                    Paid ₹{Number(job.price).toFixed(2)} (Online)
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3 text-slate-400" />
                                  <span>{job.user_name || 'Customer'}</span>
                                </span>
                                {job.user_phone && (
                                  <span className="flex items-center gap-1 font-mono">
                                    <Phone className="w-3 h-3 text-slate-400" />
                                    <span>+91 {job.user_phone}</span>
                                  </span>
                                )}
                              </p>

                              {/* P2P Receiving In Progress Bar */}
                              {p2pReceivingProgress[job.id] !== undefined && (
                                <div className="mt-1 flex items-center gap-2">
                                  <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-teal-500 transition-all duration-150"
                                      style={{ width: `${p2pReceivingProgress[job.id]}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-bold text-teal-700">
                                    Receiving P2P: {p2pReceivingProgress[job.id]}%
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500 font-medium">
                              {job.page_count} {job.page_count === 1 ? 'page' : 'pages'} •{' '}
                              {job.settings?.color ? 'Color' : 'B&W'} •{' '}
                              {job.settings?.copies || 1} {(job.settings?.copies || 1) === 1 ? 'copy' : 'copies'}
                            </span>
                          </div>
                        </div>

                        {/* Action Buttons Row */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
                          <div className="flex items-center gap-2">
                            {/* Document Preview / Download (Points to local P2P Blob or Cloud URL) */}
                            <a
                              href={p2pBlobs[job.id]?.blobUrl || job.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={p2pBlobs[job.id]?.fileName || job.file_name}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                                p2pBlobs[job.id]
                                  ? 'bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              }`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>{p2pBlobs[job.id] ? 'Open Direct P2P File' : 'View Document'}</span>
                            </a>

                            {/* Mark Paid button for Pay at Counter */}
                            {isPayAtCounter && (
                              <button
                                onClick={() => handleMarkPaid(job.id)}
                                disabled={actionLoadingId === job.id}
                                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Collect Cash (₹{Number(job.price).toFixed(2)})</span>
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Mark Ready */}
                            {job.status !== 'ready' ? (
                              <button
                                onClick={() => handleMarkReady(job.id)}
                                disabled={actionLoadingId === job.id}
                                className="figma-btn-primary px-3.5 py-1.5 text-xs font-bold cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Mark Printed & Ready</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleConfirmPickup(job.id)}
                                disabled={actionLoadingId === job.id}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Handover & Shred File</span>
                              </button>
                            )}

                            {/* Cancel */}
                            <button
                              onClick={() => handleCancelJob(job.id)}
                              disabled={actionLoadingId === job.id}
                              className="p-1.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Cancel job"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: PRINTERS & SPOOLERS */}
        {activeTab === 'printers' && (
          <div className="space-y-4">
            <div className="figma-card p-5 bg-white border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Registered Counter Printers</h2>
                  <p className="text-xs text-slate-500">
                    High-speed mono laser and vibrant color HD laser units connected to this counter.
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                {printers.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[#0e7490]">
                        <Printer className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">{p.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Driver: {p.system_name || 'System Spooler'} • {p.type.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full flex items-center gap-1 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Online
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: RATES & SERVICES */}
        {activeTab === 'rates' && (
          <div className="space-y-4">
            <div className="figma-card p-5 bg-white border border-slate-200 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Counter Print Rates Card</h2>
                <p className="text-xs text-slate-500">
                  Customers ordering at your counter will be charged these exact rates.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl border border-slate-200 bg-[#ecfeff]/50">
                  <span className="text-[11px] font-bold text-slate-600 block">Black & White Print Rate</span>
                  <span className="text-xl font-extrabold text-[#0e7490] block mt-1">
                    ₹{Number(shop.price_per_bw).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400">per physical A4 page</span>
                </div>

                <div className="p-3.5 rounded-2xl border border-slate-200 bg-[#ecfeff]/50">
                  <span className="text-[11px] font-bold text-slate-600 block">Color HD Laser Rate</span>
                  <span className="text-xl font-extrabold text-[#0e7490] block mt-1">
                    ₹{Number(shop.price_per_color).toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400">per physical A4 page</span>
                </div>
              </div>

              {/* Services List */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold text-slate-700 block">Custom Finishing & Add-ons</span>
                {services.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-xl border border-slate-200 flex items-center justify-between"
                  >
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">{s.name}</span>
                      <span className="text-[10px] text-slate-500">{s.description || s.category}</span>
                    </div>
                    <span className="text-xs font-extrabold text-slate-900">
                      ₹{Number(s.price).toFixed(2)}/{s.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: COUNTER STANDEE QR */}
        {activeTab === 'standee' && (
          <div className="space-y-4">
            <div className="figma-card p-6 bg-white border border-slate-200 text-center max-w-md mx-auto space-y-4">
              <div>
                <span className="text-[10px] font-bold text-white bg-[#0e7490] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Official Counter Standee
                </span>
                <h2 className="text-base font-extrabold text-slate-900 mt-2">
                  {shop.name}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{shop.location}</p>
              </div>

              {/* QR Image */}
              {qrCodeDataUrl && (
                <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 inline-block shadow-md">
                  <img
                    src={qrCodeDataUrl}
                    alt="Counter Standee QR"
                    className="w-56 h-56 mx-auto object-contain"
                  />
                  <span className="text-xs font-mono font-bold text-[#0e7490] block mt-2">
                    {shop.slug ? `${shop.slug}.mellod.in` : `COUNTER ID: ${shop.id}`}
                  </span>
                </div>
              )}

              <p className="text-xs text-slate-600 max-w-xs mx-auto">
                Print and display this QR code at your shop counter. Customers scanning this QR will instantly connect to <strong>{shop.slug ? `${shop.slug}.mellod.in` : 'this counter'}</strong>.
              </p>

              <div className="flex gap-2">
                <a
                  href={qrCodeDataUrl}
                  download={`PrintSpot_${shop.slug || shop.id}_Standee.png`}
                  className="flex-1 figma-btn-primary py-2.5 px-4 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Standee Poster</span>
                </a>
                <button
                  onClick={() => {
                    const isLocal = typeof window !== 'undefined' && window.location.hostname.includes('localhost');
                    const cleanUrl = shop.slug
                      ? (isLocal ? `http://${shop.slug}.localhost:3000` : `https://${shop.slug}.mellod.in`)
                      : `${window.location.origin}/?shop=${shop.id}`;
                    navigator.clipboard.writeText(cleanUrl);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold hover:bg-slate-100 flex items-center gap-1"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
