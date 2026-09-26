'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import Link from 'next/link';
import { getSocket } from '@/lib/socket';
import { Shop, Printer as IPrinter, PrintJob, QueueSnapshot, ShopService, LocalPrinterConfig } from '@/lib/types';
import { initP2PReceiver } from '@/lib/p2pTransfer';
import {
  Activity,
  Printer,
  Banknote,
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
  TrendingUp,
  Edit2,
  BarChart2,
} from 'lucide-react';

type ShopTab = 'queue' | 'printers' | 'rates' | 'standee' | 'analytics';

export default function ShopDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ShopTab>('queue');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shop, setShop] = useState<Shop | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Counter Open/Close in-flight transition state
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  // Rates & Services Editing State
  const [isEditingBaseRates, setIsEditingBaseRates] = useState(false);
  const [editBwPrice, setEditBwPrice] = useState('');
  const [editColorPrice, setEditColorPrice] = useState('');
  const [isSavingBaseRates, setIsSavingBaseRates] = useState(false);

  const [isAddingService, setIsAddingService] = useState(false);
  const [editingService, setEditingService] = useState<ShopService | null>(null);
  const [serviceFormData, setServiceFormData] = useState({
    name: '',
    category: 'finishing',
    price: '',
    unit: 'page',
    description: '',
  });
  const [isSavingService, setIsSavingService] = useState(false);

  // Shop Performance & Revenue Analytics State
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [analyticsRange, setAnalyticsRange] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Queue state
  const [queueSnapshot, setQueueSnapshot] = useState<QueueSnapshot>({
    nowServingToken: null,
    totalWaiting: 0,
    activeJobs: [],
  });

  // Direct WebRTC P2P in-memory file buffers (0 KB server storage)
  const [p2pBlobs, setP2pBlobs] = useState<Record<string, { blobUrl: string; fileName: string; fileSize: number }>>({});
  const [p2pReceivingProgress, setP2pReceivingProgress] = useState<Record<string, number>>({});

  // Today metrics (Phase 5C)
  const [stats, setStats] = useState({
    completedJobsToday: 0,
    revenueToday: 0,
    pagesPrintedToday: 0,
    waitingJobs: 0,
    printingJobs: 0,
    failedJobs: 0,
    cashRevenueToday: 0,
    onlineRevenueToday: 0,
    totalRevenueToday: 0,
    platformFeesToday: 0,
    unsettledCashFee: 0,
    shopNetPayoutToday: 0,
  });

  // Local Physical Printers State (Phase 1B & 1C)
  const [localPrinters, setLocalPrinters] = useState<LocalPrinterConfig[]>([]);
  const localPrintersRef = useRef<LocalPrinterConfig[]>([]);
  useEffect(() => {
    localPrintersRef.current = localPrinters;
  }, [localPrinters]);

  const [selectedSystemPrinter, setSelectedSystemPrinter] = useState<any | null>(null);
  const [customDisplayName, setCustomDisplayName] = useState('');
  const [customRole, setCustomRole] = useState<'mono' | 'color' | 'any'>('mono');

  // Pending Cash Orders awaiting counter verification (Phase 4C)
  const [pendingCashOrders, setPendingCashOrders] = useState<any[]>([]);
  const [cashActionLoadingId, setCashActionLoadingId] = useState<string | null>(null);

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

  // Distinct cash order chime
  const playCashChime = () => {
    if (!audioEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(349.23, audioCtx.currentTime); // F4
      osc.frequency.setValueAtTime(440.0, audioCtx.currentTime + 0.15); // A4
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime + 0.3); // C5
      gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.55);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.55);
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

        // Load locally saved physical printers from localStorage (Phase 1B)
        const storageKey = `printspot_local_printers_${currentShop.id}`;
        let savedPrinters: LocalPrinterConfig[] = [];
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            savedPrinters = JSON.parse(raw);
          }
        } catch (e) {
          console.warn('Error reading saved local printers:', e);
        }

        // Background check against live physical system hardware
        try {
          const sysRes = await fetch(`/api/shops/${currentShop.id}/printers/system-hardware`);
          if (sysRes.ok) {
            const sysData = await sysRes.json();
            const physicalPrinters = sysData.printers || [];
            setSystemPrinters(physicalPrinters);

            if (savedPrinters.length > 0) {
              const updated = savedPrinters.map((p) => {
                const isPresent = physicalPrinters.some(
                  (sp: any) => sp.name === p.systemName || sp.system_name === p.systemName
                );
                return {
                  ...p,
                  status: (isPresent ? 'online' : 'disconnected') as 'online' | 'disconnected',
                  lastSeenAt: isPresent ? new Date().toISOString() : p.lastSeenAt,
                };
              });
              savedPrinters = updated;
              localStorage.setItem(storageKey, JSON.stringify(updated));
            }
          }
        } catch (sysErr) {
          console.warn('Failed background system hardware check:', sysErr);
        }

        setLocalPrinters(savedPrinters);

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
    socket.emit('subscribe_shop', { shopId: shop.id });

    // Periodic shop liveness heartbeat every 10 seconds (Phase 2C)
    const heartbeatInterval = setInterval(() => {
      const activeCount = localPrintersRef.current.filter((p) => p.status !== 'disconnected').length;
      socket.emit('shop_heartbeat', {
        shopId: shop.id,
        connectedPrinterCount: activeCount,
      });
    }, 10000);

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

    const handleCashPending = (cashOrder: any) => {
      playCashChime();
      showToast(`💵 Cash payment awaiting confirmation: ${cashOrder.fileName} (₹${cashOrder.price})`);
      setPendingCashOrders((prev) => {
        if (prev.some((o) => o.jobId === cashOrder.jobId)) return prev;
        return [cashOrder, ...prev];
      });
      fetchQueue(shop.id);
      fetchStats(shop.id);
    };

    const handleCashConfirmed = (data: { jobId: string }) => {
      setPendingCashOrders((prev) => prev.filter((o) => o.jobId !== data.jobId));
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
    socket.on('cash_order_pending', handleCashPending);
    socket.on('cash_order_confirmed', handleCashConfirmed);
    socket.on('shop_updated', handleShopUpdate);

    // Initialize WebRTC Direct P2P + Socket Relay Receiver (Phase 3C)
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
        showToast(`⚡ Direct Transfer: "${meta.fileName}" received directly into browser memory (0 KB server storage)!`);
      },
      (jobId, percent) => {
        setP2pReceivingProgress((prev) => ({ ...prev, [jobId]: percent }));
      }
    );

    return () => {
      clearInterval(heartbeatInterval);
      socket.off('queue_updated', handleQueueUpdate);
      socket.off('new_order_arrived', handleNewOrder);
      socket.off('cash_order_pending', handleCashPending);
      socket.off('cash_order_confirmed', handleCashConfirmed);
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

  // Webpage Unload / Exit Beacon: Automatically close counter on tab close or navigation
  useEffect(() => {
    if (!shop || !token) return;
    const handleUnload = () => {
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(`/api/shops/${shop.id}/close-beacon`);
        } else {
          fetch(`/api/shops/${shop.id}/close`, { method: 'POST', keepalive: true }).catch(() => {});
        }
      } catch (e) {
        console.warn('Unload beacon failed:', e);
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [shop?.id, token]);

  // Toggle Counter Open / Paused State with Connected Printer Gate (Phase 1C & Redesign)
  const handleToggleOpenState = async () => {
    if (!shop || !token || isTogglingStatus) return;

    if (!shop.is_open) {
      const activePrinters = localPrinters.filter((p) => p.status !== 'disconnected');
      if (activePrinters.length === 0) {
        showToast('⚠️ Cannot open counter: Connect at least one active physical printer in Printers & Spoolers.');
        return;
      }
    }

    setIsTogglingStatus(true);
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
    } finally {
      setIsTogglingStatus(false);
    }
  };

  // Base Rates Editing Handlers
  const handleOpenBaseRateEdit = () => {
    if (!shop) return;
    setEditBwPrice(String(shop.price_per_bw));
    setEditColorPrice(String(shop.price_per_color));
    setIsEditingBaseRates(true);
  };

  const handleSaveBaseRates = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !token) return;
    setIsSavingBaseRates(true);
    try {
      const res = await fetch(`/api/shops/${shop.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          price_per_bw: parseFloat(editBwPrice) || 1,
          price_per_color: parseFloat(editColorPrice) || 5,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setShop((prev) =>
        prev
          ? {
              ...prev,
              price_per_bw: parseFloat(editBwPrice) || 1,
              price_per_color: parseFloat(editColorPrice) || 5,
            }
          : null
      );
      setIsEditingBaseRates(false);
      showToast('Base print rates updated successfully.');
    } catch (err: any) {
      showToast(err.message || 'Failed to update rates');
    } finally {
      setIsSavingBaseRates(false);
    }
  };

  // Custom Services CRUD Handlers
  const handleOpenAddService = () => {
    setServiceFormData({
      name: '',
      category: 'finishing',
      price: '',
      unit: 'page',
      description: '',
    });
    setIsAddingService(true);
  };

  const handleOpenEditService = (service: ShopService) => {
    setEditingService(service);
    setServiceFormData({
      name: service.name,
      category: service.category || 'finishing',
      price: String(service.price),
      unit: service.unit || 'page',
      description: service.description || '',
    });
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !token || !serviceFormData.name.trim()) return;
    setIsSavingService(true);
    try {
      const res = await fetch(`/api/shops/${shop.id}/services`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: serviceFormData.name.trim(),
          category: serviceFormData.category,
          price: parseFloat(serviceFormData.price) || 0,
          unit: serviceFormData.unit || 'page',
          description: serviceFormData.description.trim(),
          enabled: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setServices(data.services);
      setIsAddingService(false);
      showToast('New service added successfully.');
    } catch (err: any) {
      showToast(err.message || 'Failed to add service');
    } finally {
      setIsSavingService(false);
    }
  };

  const handleUpdateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !token || !editingService) return;
    setIsSavingService(true);
    try {
      const res = await fetch(`/api/shops/${shop.id}/services/${editingService.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: serviceFormData.name.trim(),
          category: serviceFormData.category,
          price: parseFloat(serviceFormData.price) || 0,
          unit: serviceFormData.unit || 'page',
          description: serviceFormData.description.trim(),
          enabled: editingService.enabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setServices(data.services);
      setEditingService(null);
      showToast('Service updated successfully.');
    } catch (err: any) {
      showToast(err.message || 'Failed to update service');
    } finally {
      setIsSavingService(false);
    }
  };

  const handleToggleServiceEnabled = async (service: ShopService) => {
    if (!shop || !token) return;
    try {
      const res = await fetch(`/api/shops/${shop.id}/services/${service.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled: !service.enabled,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setServices(data.services);
        showToast(`Service "${service.name}" ${!service.enabled ? 'activated' : 'deactivated'}.`);
      }
    } catch (err) {
      showToast('Failed to toggle service.');
    }
  };

  const handleDeleteService = async (serviceId: string, serviceName: string) => {
    if (!shop || !token) return;
    if (!confirm(`Are you sure you want to remove service "${serviceName}"?`)) return;
    try {
      const res = await fetch(`/api/shops/${shop.id}/services/${serviceId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (res.ok) {
        setServices(data.services);
        showToast('Service removed.');
      } else {
        showToast(data.error || 'Failed to delete service.');
      }
    } catch (err) {
      showToast('Error removing service.');
    }
  };

  // Functional Analytics Fetcher
  const fetchAnalytics = async (shopId: string, range: string = 'today') => {
    setIsLoadingAnalytics(true);
    try {
      const res = await fetch(`/api/shops/${shopId}/analytics?range=${range}`);
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'analytics' && shop) {
      fetchAnalytics(shop.id, analyticsRange);
    }
  }, [activeTab, analyticsRange, shop?.id]);

  // Cash Order Confirmation Handlers (Phase 4C)
  const handleConfirmCash = async (jobId: string) => {
    if (!token) return;
    setCashActionLoadingId(jobId);
    try {
      const res = await fetch('/api/payments/confirm-cash', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jobId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast(`✅ Cash payment confirmed for order ${data.tokenCode}! Added to print queue.`);
      setPendingCashOrders((prev) => prev.filter((o) => o.jobId !== jobId));
      if (shop) {
        await fetchQueue(shop.id);
        await fetchStats(shop.id);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to confirm cash order');
    } finally {
      setCashActionLoadingId(null);
    }
  };

  const handleDeclineCash = async (jobId: string, reason?: string) => {
    if (!token) return;
    setCashActionLoadingId(jobId);
    try {
      const res = await fetch('/api/payments/decline-cash', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jobId, reason: reason || 'Declined by counter staff' }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showToast('Cash order declined.');
      setPendingCashOrders((prev) => prev.filter((o) => o.jobId !== jobId));
      if (shop) {
        await fetchQueue(shop.id);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to decline cash order');
    } finally {
      setCashActionLoadingId(null);
    }
  };

  // Local Printer Management Handlers (Phase 1B)
  const handleDetectPrinters = async () => {
    if (!shop) return;
    setIsDetectingSystem(true);
    try {
      const res = await fetch(`/api/shops/${shop.id}/printers/system-hardware`);
      const data = await res.json();
      if (data.printers) {
        setSystemPrinters(data.printers);
        if (data.printers.length === 0) {
          showToast('No physical printers detected on this computer. Virtual PDF drivers are filtered out.');
        } else {
          showToast(`Detected ${data.printers.length} physical printer(s).`);
          if (!selectedSystemPrinter && data.printers.length > 0) {
            setSelectedSystemPrinter(data.printers[0]);
            setCustomDisplayName(data.printers[0].name);
          }
        }
      }
    } catch (err) {
      showToast('Error detecting hardware printers.');
    } finally {
      setIsDetectingSystem(false);
    }
  };

  const handleSaveLocalPrinter = (sysPrinter: any, role: 'mono' | 'color' | 'any', label: string) => {
    if (!shop) return;
    const storageKey = `printspot_local_printers_${shop.id}`;
    const newConfig: LocalPrinterConfig = {
      systemName: sysPrinter.name || sysPrinter.system_name,
      displayName: label.trim() || sysPrinter.name,
      assignedRole: role,
      driverName: sysPrinter.driver,
      portName: sysPrinter.port,
      isDefault: localPrinters.length === 0,
      status: 'online',
      lastSeenAt: new Date().toISOString(),
    };

    const existingIdx = localPrinters.findIndex((p) => p.systemName === newConfig.systemName);
    let updated: LocalPrinterConfig[];
    if (existingIdx >= 0) {
      updated = [...localPrinters];
      updated[existingIdx] = newConfig;
    } else {
      updated = [...localPrinters, newConfig];
    }

    setLocalPrinters(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
    showToast(`Printer "${newConfig.displayName}" connected & saved locally.`);
    setSelectedSystemPrinter(null);
    setCustomDisplayName('');
  };

  const handleRemoveLocalPrinter = (systemName: string) => {
    if (!shop) return;
    const storageKey = `printspot_local_printers_${shop.id}`;
    const updated = localPrinters.filter((p) => p.systemName !== systemName);
    setLocalPrinters(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
    showToast('Printer removed from local configuration.');
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
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex antialiased">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 p-3.5 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-semibold shadow-2xl flex items-center gap-2 animate-bounce">
          <Bell className="w-4 h-4 text-[#0e7490]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Mobile Drawer Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      {/* Responsive Modern Sidebar (Collapsible on mobile, persistent on desktop) */}
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
                Counter Station
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

        {/* Sidebar Shop Summary Box */}
        <div className="px-4 pt-4 pb-2">
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-xs font-extrabold text-slate-900 block truncate">
                  {shop.name}
                </span>
                <span className="text-[10px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3 text-[#0e7490] shrink-0" />
                  <span className="truncate">{shop.location}</span>
                </span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 ${
                  shop.is_open !== false
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    shop.is_open !== false ? 'bg-emerald-600 animate-pulse' : 'bg-amber-600'
                  }`}
                />
                <span>{shop.is_open !== false ? 'Live' : 'Closed'}</span>
              </span>
            </div>
            {shop.slug && (
              <div className="pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                <span className="font-mono text-[#0e7490] font-semibold truncate">
                  {shop.slug}.mellod.in
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Navigation */}
        <div className="flex-1 px-4 py-3 space-y-6 overflow-y-auto">
          {/* Main Counter Navigation Section */}
          <div className="space-y-1.5">
            <span className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
              Counter Operations
            </span>

            {/* Live Order Queue */}
            <button
              onClick={() => {
                setActiveTab('queue');
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'queue'
                  ? 'bg-[#ecfeff] text-[#0e7490] border border-[#a5f3fc] shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Activity className={`w-4 h-4 ${activeTab === 'queue' ? 'text-[#0e7490]' : 'text-slate-400'}`} />
                <span>Live Order Queue</span>
              </div>
              <div className="flex items-center gap-1.5">
                {pendingCashOrders.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                    {pendingCashOrders.length} Cash
                  </span>
                )}
                {queueSnapshot.activeJobs.length > 0 && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    activeTab === 'queue' ? 'bg-[#cffafe] text-[#0e7490]' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {queueSnapshot.activeJobs.length}
                  </span>
                )}
              </div>
            </button>

            {/* Printers & Spoolers */}
            <button
              onClick={() => {
                setActiveTab('printers');
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'printers'
                  ? 'bg-[#ecfeff] text-[#0e7490] border border-[#a5f3fc] shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Printer className={`w-4 h-4 ${activeTab === 'printers' ? 'text-[#0e7490]' : 'text-slate-400'}`} />
                <span>Printers & Spoolers</span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                localPrinters.length > 0
                  ? activeTab === 'printers'
                    ? 'bg-[#cffafe] text-[#0e7490]'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {localPrinters.length} Ready
              </span>
            </button>

            {/* Rates & Services */}
            <button
              onClick={() => {
                setActiveTab('rates');
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'rates'
                  ? 'bg-[#ecfeff] text-[#0e7490] border border-[#a5f3fc] shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Sliders className={`w-4 h-4 ${activeTab === 'rates' ? 'text-[#0e7490]' : 'text-slate-400'}`} />
                <span>Rates & Services</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                {services.length}
              </span>
            </button>

            {/* Counter Standee QR */}
            <button
              onClick={() => {
                setActiveTab('standee');
                setSidebarOpen(false);
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                activeTab === 'standee'
                  ? 'bg-[#ecfeff] text-[#0e7490] border border-[#a5f3fc] shadow-2xs font-extrabold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <QrCode className={`w-4 h-4 ${activeTab === 'standee' ? 'text-[#0e7490]' : 'text-slate-400'}`} />
                <span>Counter Standee QR</span>
              </div>
            </button>

            {/* Performance & Revenue Analytics */}
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
                <span>Analytics & Revenue</span>
              </div>
            </button>
          </div>
        </div>

        {/* Sidebar Footer Controls */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-2.5">
          {/* Audio Chime Toggle */}
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`w-full px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
              audioEnabled
                ? 'bg-cyan-50/80 text-[#0e7490] border-cyan-200/80'
                : 'bg-white text-slate-500 border-slate-200'
            }`}
            title={audioEnabled ? 'Order sound alert active' : 'Sound alert muted'}
          >
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              <span>Order Chime</span>
            </div>
            <span className="text-[10px] font-bold uppercase">{audioEnabled ? 'Active' : 'Muted'}</span>
          </button>

          {/* User Profile & Log Out */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#ecfeff] border border-[#a5f3fc] flex items-center justify-center text-[#0e7490] font-bold text-xs shrink-0">
                <Store className="w-4 h-4" />
              </div>
              <div className="truncate">
                <span className="text-xs font-bold text-slate-800 block truncate">
                  Counter Operator
                </span>
                <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active Terminal
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              title="Log Out of Counter"
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
              aria-label="Open navigation sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-400 font-medium hidden sm:inline">Counter</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 hidden sm:inline" />
              <span className="text-slate-600 font-medium hidden md:inline truncate max-w-[120px]">
                {shop.name}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 hidden md:inline" />
              <h1 className="text-sm font-bold text-slate-900">
                {activeTab === 'queue'
                  ? 'Live Order Queue'
                  : activeTab === 'printers'
                  ? 'Hardware Printers & Spoolers'
                  : activeTab === 'rates'
                  ? 'Rates & Service Catalog'
                  : activeTab === 'standee'
                  ? 'Counter Standee QR'
                  : 'Performance & Revenue Analytics'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Direct Refresh */}
            <button
              onClick={() => {
                if (shop) {
                  fetchQueue(shop.id);
                  fetchStats(shop.id);
                  if (activeTab === 'analytics') fetchAnalytics(shop.id, analyticsRange);
                  showToast('Counter synchronized');
                }
              }}
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
              title="Sync Counter & Queue"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col space-y-6">

          {/* DEDICATED COUNTER STATUS CONTAINER */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                shop.is_open !== false
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  : 'bg-amber-50 text-amber-600 border border-amber-200'
              }`}>
                <Power className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold flex items-center gap-1.5 uppercase tracking-wide ${
                    shop.is_open !== false
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${shop.is_open !== false ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                    <span>{shop.is_open !== false ? 'Counter Live & Accepting Orders' : 'Counter Paused / Closed'}</span>
                  </span>
                  {localPrinters.filter(p => p.status !== 'disconnected').length === 0 && (
                    <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                      0 Printers Connected
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {shop.is_open !== false
                    ? 'Customers scanning your counter QR can place live print jobs. Counter automatically closes when this webpage is closed.'
                    : 'Counter is currently offline. Connect and verify a physical printer, then toggle open when ready to accept jobs.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              {localPrinters.filter(p => p.status !== 'disconnected').length === 0 && !shop.is_open && (
                <button
                  onClick={() => setActiveTab('printers')}
                  className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-[#0e7490] bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 transition-colors cursor-pointer"
                >
                  Connect Printer First →
                </button>
              )}

              <button
                onClick={handleToggleOpenState}
                disabled={isTogglingStatus}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50 ${
                  shop.is_open !== false
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {isTogglingStatus ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>{shop.is_open !== false ? 'Closing Counter...' : 'Opening Counter...'}</span>
                  </>
                ) : (
                  <>
                    <Power className="w-4 h-4" />
                    <span>{shop.is_open !== false ? 'Close / Pause Counter' : 'Open Counter for Orders'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* TAB 1: LIVE QUEUE & ORDERS */}
          {activeTab === 'queue' && (
            <div className="space-y-4">
              {/* Queue Workflow Metrics Cards (Purely Order Operation, No Fees/Earnings) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="figma-card p-3.5 bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                    Waiting in Queue
                  </span>
                  <span className="text-xl font-extrabold text-[#0e7490] block mt-0.5">
                    {queueSnapshot.totalWaiting}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">Orders awaiting print</span>
                </div>

                <div className="figma-card p-3.5 bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                    Printing / Spooling
                  </span>
                  <span className="text-xl font-extrabold text-cyan-600 block mt-0.5">
                    {stats.printingJobs}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">Currently on machine</span>
                </div>

                <div className="figma-card p-3.5 bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                    Now Serving
                  </span>
                  <span className="text-xl font-extrabold text-slate-800 block mt-0.5 font-mono">
                    {queueSnapshot.nowServingToken || 'Idle'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">Active counter token</span>
                </div>

                <div className="figma-card p-3.5 bg-white border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                    Completed Today
                  </span>
                  <span className="text-xl font-extrabold text-emerald-600 block mt-0.5">
                    {stats.completedJobsToday}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">Orders picked up / ready</span>
                </div>
              </div>

            {/* Pending Cash Confirmation Cards (Phase 4C) */}
            {pendingCashOrders.length > 0 && (
              <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
                      <Banknote className="w-4 h-4" />
                    </span>
                    <div>
                      <h3 className="text-xs font-bold text-amber-950">
                        Cash Payment Verification Required ({pendingCashOrders.length})
                      </h3>
                      <p className="text-[11px] text-amber-800">
                        Customer selected Pay at Counter. Confirm cash received to add to the print queue.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {pendingCashOrders.map((order) => (
                    <div
                      key={order.jobId}
                      className="p-3 bg-white rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{order.fileName}</span>
                          <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            ₹{Number(order.price).toFixed(2)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Customer: {order.userName} {order.userPhone ? `(+91 ${order.userPhone})` : ''} • {order.pageCount} page(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleConfirmCash(order.jobId)}
                          disabled={cashActionLoadingId === order.jobId}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Confirm Cash Received (₹{Number(order.price).toFixed(2)})</span>
                        </button>
                        <button
                          onClick={() => handleDeclineCash(order.jobId)}
                          disabled={cashActionLoadingId === order.jobId}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Decline</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

        {/* TAB 2: PRINTERS & SPOOLERS (Phase 1B & 1C) */}
        {activeTab === 'printers' && (
          <div className="space-y-4">
            <div className="figma-card p-5 bg-white border border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Locally Connected Physical Printers</h2>
                  <p className="text-xs text-slate-500">
                    Recognized from this counter machine and saved in this browser. Virtual drivers (PDF, OneNote) are filtered out.
                  </p>
                </div>
                <button
                  onClick={handleDetectPrinters}
                  disabled={isDetectingSystem}
                  className="px-3.5 py-2 rounded-xl bg-[#0e7490] hover:bg-[#0c627a] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isDetectingSystem ? 'animate-spin' : ''}`} />
                  <span>{isDetectingSystem ? 'Detecting OS Hardware...' : 'Detect Printers on This PC'}</span>
                </button>
              </div>

              {/* Connected Local Printers List */}
              <div className="space-y-2.5">
                <span className="text-xs font-bold text-slate-700 block">
                  Active Local Printers ({localPrinters.length})
                </span>

                {localPrinters.length === 0 ? (
                  <div className="p-6 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-center space-y-2">
                    <Printer className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-xs font-bold text-slate-700">No physical printers saved locally yet</p>
                    <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                      Click <strong className="text-[#0e7490]">"Detect Printers on This PC"</strong> above to discover USB, Network, or WSD laser printers. Connecting at least one real printer is required before your counter can go online.
                    </p>
                  </div>
                ) : (
                  localPrinters.map((p) => {
                    const isOnline = p.status !== 'disconnected';
                    return (
                      <div
                        key={p.systemName}
                        className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[#0e7490] shadow-2xs">
                            <Printer className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900">{p.displayName}</span>
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 border border-cyan-200">
                                {p.assignedRole === 'mono' ? 'B&W Laser' : p.assignedRole === 'color' ? 'Color HD' : 'Any'}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono block mt-0.5">
                              Device: {p.systemName} {p.portName ? `• Port: ${p.portName}` : ''}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 border ${
                              isOnline
                                ? 'text-emerald-700 bg-emerald-100 border-emerald-200'
                                : 'text-amber-700 bg-amber-100 border-amber-200'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                              }`}
                            ></span>
                            {isOnline ? 'Connected & Ready' : 'Device Not Found on Host'}
                          </span>

                          <button
                            onClick={() => handleRemoveLocalPrinter(p.systemName)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Remove printer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Detected Hardware Section */}
              {systemPrinters.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      Detected Physical Devices on this Machine ({systemPrinters.length})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Select a printer to assign its role and save it locally for job dispatch.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {systemPrinters.map((sys) => {
                      const isAlreadySaved = localPrinters.some((lp) => lp.systemName === (sys.name || sys.system_name));
                      const isSelected = selectedSystemPrinter?.name === sys.name;
                      return (
                        <div
                          key={sys.name}
                          onClick={() => {
                            setSelectedSystemPrinter(sys);
                            setCustomDisplayName(sys.name);
                          }}
                          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-[#0e7490] bg-cyan-50/50 ring-2 ring-[#0e7490]/20'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900 truncate max-w-[200px]">{sys.name}</span>
                            {isAlreadySaved ? (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                Saved
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                Detected
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono block mt-1">
                            {sys.driver} {sys.port ? `• ${sys.port}` : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {selectedSystemPrinter && (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                      <h4 className="text-xs font-bold text-slate-900">
                        Configure & Connect: {selectedSystemPrinter.name}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Display Label</label>
                          <input
                            type="text"
                            value={customDisplayName}
                            onChange={(e) => setCustomDisplayName(e.target.value)}
                            placeholder="e.g. Counter Main Mono Laser"
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#0e7490]"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-slate-600 block mb-1">Print Role</label>
                          <select
                            value={customRole}
                            onChange={(e: any) => setCustomRole(e.target.value)}
                            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#0e7490]"
                          >
                            <option value="mono">Black & White (Mono Laser)</option>
                            <option value="color">Color HD Laser</option>
                            <option value="any">General / Any Format</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          onClick={() => setSelectedSystemPrinter(null)}
                          className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveLocalPrinter(selectedSystemPrinter, customRole, customDisplayName)}
                          className="px-4 py-1.5 rounded-xl bg-[#0e7490] hover:bg-[#0c627a] text-white text-xs font-bold shadow-sm cursor-pointer"
                        >
                          Save & Connect Printer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: RATES & SERVICES (Full CRUD & Editing) */}
        {activeTab === 'rates' && (
          <div className="space-y-6">
            {/* Modal: Edit Base Print Rates */}
            {isEditingBaseRates && (
              <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900">Edit Counter Base Rates</h3>
                    <button
                      onClick={() => setIsEditingBaseRates(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleSaveBaseRates} className="space-y-3.5">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Black & White Rate per A4 Page (₹)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={editBwPrice}
                        onChange={(e) => setEditBwPrice(e.target.value)}
                        required
                        className="w-full figma-input px-3 py-2 text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Color HD Laser Rate per A4 Page (₹)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        value={editColorPrice}
                        onChange={(e) => setEditColorPrice(e.target.value)}
                        required
                        className="w-full figma-input px-3 py-2 text-xs"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsEditingBaseRates(false)}
                        className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingBaseRates}
                        className="px-4 py-2 bg-[#0e7490] hover:bg-[#0c627a] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        {isSavingBaseRates ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        <span>Save Base Rates</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Modal: Add or Edit Custom Service */}
            {(isAddingService || editingService) && (
              <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900">
                      {editingService ? `Edit Service: ${editingService.name}` : 'Add New Print Service / Add-on'}
                    </h3>
                    <button
                      onClick={() => {
                        setIsAddingService(false);
                        setEditingService(null);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <form
                    onSubmit={editingService ? handleUpdateService : handleCreateService}
                    className="space-y-3.5"
                  >
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Service / Finishing Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Spiral Binding, Glossy Photo Paper, Lamination"
                        value={serviceFormData.name}
                        onChange={(e) => setServiceFormData({ ...serviceFormData, name: e.target.value })}
                        required
                        className="w-full figma-input px-3 py-2 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
                        <select
                          value={serviceFormData.category}
                          onChange={(e) => setServiceFormData({ ...serviceFormData, category: e.target.value })}
                          className="w-full figma-input px-3 py-2 text-xs bg-white"
                        >
                          <option value="finishing">Finishing & Binding</option>
                          <option value="paper">Special Paper</option>
                          <option value="lamination">Lamination</option>
                          <option value="poster">Poster / Large Format</option>
                          <option value="custom">General Custom</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Billing Unit</label>
                        <select
                          value={serviceFormData.unit}
                          onChange={(e) => setServiceFormData({ ...serviceFormData, unit: e.target.value })}
                          className="w-full figma-input px-3 py-2 text-xs bg-white"
                        >
                          <option value="page">per page</option>
                          <option value="sheet">per sheet</option>
                          <option value="book">per book</option>
                          <option value="document">per document</option>
                          <option value="copy">per copy</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Price (₹)</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        placeholder="0.00"
                        value={serviceFormData.price}
                        onChange={(e) => setServiceFormData({ ...serviceFormData, price: e.target.value })}
                        required
                        className="w-full figma-input px-3 py-2 text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Description (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Includes plastic front cover and black spiral coil"
                        value={serviceFormData.description}
                        onChange={(e) => setServiceFormData({ ...serviceFormData, description: e.target.value })}
                        className="w-full figma-input px-3 py-2 text-xs"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingService(false);
                          setEditingService(null);
                        }}
                        className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingService}
                        className="px-4 py-2 bg-[#0e7490] hover:bg-[#0c627a] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        {isSavingService ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        <span>{editingService ? 'Update Service' : 'Add Service'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Base Rates Card */}
            <div className="figma-card p-5 bg-white border border-slate-200 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Base Paper & Laser Print Rates</h2>
                  <p className="text-xs text-slate-500">
                    The core per-page rates applied to all standard document uploads.
                  </p>
                </div>
                <button
                  onClick={handleOpenBaseRateEdit}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5 text-[#0e7490]" />
                  <span>Edit Base Rates</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-2xl border border-slate-200 bg-[#ecfeff]/40 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">Black & White (Mono Laser)</span>
                    <span className="text-[10px] text-slate-500">Standard monochrome document print</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-extrabold text-[#0e7490] block">
                      ₹{Number(shop.price_per_bw).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400">/ A4 page</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-slate-200 bg-[#ecfeff]/40 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">Color HD Laser</span>
                    <span className="text-[10px] text-slate-500">Vibrant full-color laser document print</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-extrabold text-[#0e7490] block">
                      ₹{Number(shop.price_per_color).toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400">/ A4 page</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Services & Finishing Catalog Card */}
            <div className="figma-card p-5 bg-white border border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Custom Finishing, Binding & Add-ons ({services.length})</h2>
                  <p className="text-xs text-slate-500">
                    Add optional finishing options customers can select when ordering at your counter.
                  </p>
                </div>
                <button
                  onClick={handleOpenAddService}
                  className="px-3.5 py-2 rounded-xl bg-[#0e7490] hover:bg-[#0c627a] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add New Service</span>
                </button>
              </div>

              {services.length === 0 ? (
                <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-center space-y-2">
                  <Sliders className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">No custom finishing services configured</p>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    Click "+ Add New Service" to offer spiral binding, lamination, glossy paper, or hard cover options.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {services.map((s) => (
                    <div
                      key={s.id}
                      className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                        s.enabled !== false
                          ? 'border-slate-200 bg-white shadow-2xs'
                          : 'border-slate-200/60 bg-slate-50/60 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{s.name}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              {s.category || 'addon'}
                            </span>
                          </div>
                          {s.description && (
                            <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{s.description}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-extrabold text-slate-900">
                            ₹{Number(s.price).toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400 block">/{s.unit || 'unit'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <button
                          onClick={() => handleToggleServiceEnabled(s)}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                            s.enabled !== false
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          {s.enabled !== false ? '● Active' : '○ Paused'}
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditService(s)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#0e7490] hover:bg-slate-100 cursor-pointer transition-colors"
                            title="Edit Service"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {!s.is_default && (
                            <button
                              onClick={() => handleDeleteService(s.id, s.name)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                              title="Delete Service"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

        {/* TAB 5: FUNCTIONAL ANALYTICS & REVENUE DASHBOARD */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* Range Selector & Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Performance & Revenue Analytics
                </h2>
                <p className="text-xs text-slate-500">
                  Comprehensive audit of daily revenues, settlements, platform deductions, and print volumes.
                </p>
              </div>

              {/* Timeframe Filter Buttons */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
                {(['today', 'week', 'month', 'all'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setAnalyticsRange(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      analyticsRange === r
                        ? 'bg-white text-[#0e7490] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {r === 'today' ? 'Today' : r === 'week' ? 'Last 7 Days' : r === 'month' ? 'This Month' : 'All Time'}
                  </button>
                ))}
              </div>
            </div>

            {/* Financial Revenue Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="figma-card p-4 bg-white border border-slate-200 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Gross Earnings
                </span>
                <span className="text-2xl font-extrabold text-slate-900 block">
                  ₹{Number(analyticsData?.grossRevenue || 0).toFixed(2)}
                </span>
                <div className="flex items-center gap-2 pt-1 text-[11px] font-medium text-slate-500">
                  <span className="flex items-center gap-1">
                    <Banknote className="w-3 h-3 text-amber-600" />
                    Cash: ₹{Number(analyticsData?.cashRevenue || 0).toFixed(0)}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <CreditCard className="w-3 h-3 text-cyan-600" />
                    Online: ₹{Number(analyticsData?.onlineRevenue || 0).toFixed(0)}
                  </span>
                </div>
              </div>

              <div className="figma-card p-4 bg-white border border-slate-200 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Shopkeeper Net Payout
                </span>
                <span className="text-2xl font-extrabold text-emerald-600 block">
                  ₹{Number(analyticsData?.netPayout || 0).toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-500 block pt-1">
                  After platform fee deductions
                </span>
              </div>

              <div className="figma-card p-4 bg-white border border-slate-200 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Platform Fees
                </span>
                <span className="text-2xl font-extrabold text-slate-800 block">
                  ₹{Number(analyticsData?.platformFees || 0).toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-500 block pt-1">
                  ₹0.50 flat fee per completed order
                </span>
              </div>

              <div className="figma-card p-4 bg-white border border-slate-200 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Unsettled Cash Platform Fee
                </span>
                <span className={`text-2xl font-extrabold block ${
                  (analyticsData?.unsettledCashFee || 0) > 0 ? 'text-amber-600' : 'text-slate-800'
                }`}>
                  ₹{Number(analyticsData?.unsettledCashFee || 0).toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-500 block pt-1">
                  {(analyticsData?.unsettledCashFee || 0) > 0
                    ? 'Deducted on next online order'
                    : 'All cash platform fees settled'}
                </span>
              </div>
            </div>

            {/* Volume & Activity Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="figma-card p-4 bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Total Sheets Printed
                </span>
                <span className="text-xl font-extrabold text-[#0e7490] block mt-1">
                  {analyticsData?.totalSheets || 0} sheets
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Mono: {analyticsData?.monoSheets || 0} • Color: {analyticsData?.colorSheets || 0}
                </span>
              </div>

              <div className="figma-card p-4 bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Completed Orders
                </span>
                <span className="text-xl font-extrabold text-slate-800 block mt-1">
                  {analyticsData?.completedOrders || 0} orders
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Total received: {analyticsData?.totalOrders || 0}
                </span>
              </div>

              <div className="figma-card p-4 bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Average Order Value
                </span>
                <span className="text-xl font-extrabold text-slate-800 block mt-1">
                  ₹
                  {analyticsData?.completedOrders && analyticsData?.grossRevenue
                    ? (analyticsData.grossRevenue / analyticsData.completedOrders).toFixed(2)
                    : '0.00'}
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">per customer transaction</span>
              </div>
            </div>

            {/* Distribution Analysis: Cash vs Online & Mono vs Color */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Payment Split Card */}
              <div className="figma-card p-5 bg-white border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900">Payment Channel Breakdown</h3>
                  <span className="text-[10px] text-slate-500 font-mono">Gross Share</span>
                </div>

                {/* Split Bar */}
                {(() => {
                  const gross = analyticsData?.grossRevenue || 0;
                  const cash = analyticsData?.cashRevenue || 0;
                  const online = analyticsData?.onlineRevenue || 0;
                  const cashPct = gross > 0 ? Math.round((cash / gross) * 100) : 50;
                  const onlinePct = 100 - cashPct;
                  return (
                    <div className="space-y-2">
                      <div className="h-3 w-full rounded-full bg-slate-100 flex overflow-hidden">
                        <div style={{ width: `${cashPct}%` }} className="bg-amber-500 h-full" title={`Cash: ${cashPct}%`} />
                        <div style={{ width: `${onlinePct}%` }} className="bg-[#0e7490] h-full" title={`Online: ${onlinePct}%`} />
                      </div>
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <div className="flex items-center gap-1.5 text-amber-800">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          <span>Cash at Counter: ₹{cash.toFixed(0)} ({cashPct}%)</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[#0e7490]">
                          <span className="w-2 h-2 rounded-full bg-[#0e7490]" />
                          <span>Online UPI/Card: ₹{online.toFixed(0)} ({onlinePct}%)</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Color Mode Split Card */}
              <div className="figma-card p-5 bg-white border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900">Print Role Distribution</h3>
                  <span className="text-[10px] text-slate-500 font-mono">Sheet Count</span>
                </div>

                {/* Split Bar */}
                {(() => {
                  const total = analyticsData?.totalSheets || 0;
                  const mono = analyticsData?.monoSheets || 0;
                  const color = analyticsData?.colorSheets || 0;
                  const monoPct = total > 0 ? Math.round((mono / total) * 100) : 50;
                  const colorPct = 100 - monoPct;
                  return (
                    <div className="space-y-2">
                      <div className="h-3 w-full rounded-full bg-slate-100 flex overflow-hidden">
                        <div style={{ width: `${monoPct}%` }} className="bg-slate-700 h-full" title={`B&W: ${monoPct}%`} />
                        <div style={{ width: `${colorPct}%` }} className="bg-cyan-500 h-full" title={`Color: ${colorPct}%`} />
                      </div>
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <span className="w-2 h-2 rounded-full bg-slate-700" />
                          <span>B&W Laser: {mono} sheets ({monoPct}%)</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-cyan-700">
                          <span className="w-2 h-2 rounded-full bg-cyan-500" />
                          <span>Color HD: {color} sheets ({colorPct}%)</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Fee Settlement Policy Note */}
            <div className="p-4 rounded-2xl bg-cyan-50/70 border border-cyan-200/80 flex items-start gap-3">
              <span className="w-7 h-7 rounded-xl bg-[#0e7490] text-white flex items-center justify-center shrink-0 font-bold text-xs">
                ₹
              </span>
              <div className="text-xs text-slate-700 space-y-1">
                <span className="font-bold text-slate-900 block">PrintSpot Automated Settlement Mechanism</span>
                <p>
                  Online customer payments via Razorpay UPI/Cards are settled net of PrintSpot's flat platform fee (₹0.50 per print job). For counter cash payments, customer money remains 100% in your hands; the corresponding platform fee is accumulated and seamlessly deducted from your next online customer settlement.
                </p>
              </div>
            </div>

            {/* Recent Completed Orders Table */}
            <div className="figma-card p-5 bg-white border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900">Recent Completed Orders</h3>
                <span className="text-[10px] text-slate-400">Last 10 transactions</span>
              </div>

              {!analyticsData?.recentTransactions || analyticsData.recentTransactions.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No completed orders found for this timeframe.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-bold text-[10px] uppercase tracking-wider">
                        <th className="py-2">Token</th>
                        <th className="py-2">Document</th>
                        <th className="py-2">Payment</th>
                        <th className="py-2">Mode</th>
                        <th className="py-2">Price</th>
                        <th className="py-2">Fee</th>
                        <th className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {analyticsData.recentTransactions.map((tx: any) => (
                        <tr key={tx.id} className="hover:bg-slate-50/60">
                          <td className="py-2.5 font-mono font-bold text-[#0e7490]">{tx.token_code}</td>
                          <td className="py-2.5 text-slate-800 font-medium truncate max-w-[150px]">
                            {tx.file_name}
                          </td>
                          <td className="py-2.5">
                            {tx.payment_method === 'counter_cash' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                Cash
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-800 border border-cyan-200">
                                Online
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 text-slate-600 font-medium">
                            {tx.is_color === 'true' ? 'Color' : 'B&W'} ({tx.page_count}p)
                          </td>
                          <td className="py-2.5 font-extrabold text-slate-900">₹{Number(tx.price).toFixed(2)}</td>
                          <td className="py-2.5 text-slate-500 font-mono text-[11px]">
                            ₹{Number(tx.platform_fee || 0).toFixed(2)}
                          </td>
                          <td className="py-2.5">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  </div>
);
}
