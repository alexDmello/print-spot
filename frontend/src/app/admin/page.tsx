'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Header } from '@/components/Header';
import { MapPicker } from '@/components/MapPicker';
import { getSocket } from '@/lib/socket';
import { Shop, Printer as IPrinter, PrintJob, QueueSnapshot, ShopService } from '@/lib/types';
import {
  Activity,
  Sliders,
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
  FileSpreadsheet,
  X,
  CreditCard,
  Mail,
  ChevronRight,
  Menu,
} from 'lucide-react';

type AdminTab = 'queue' | 'services' | 'devices' | 'standee' | 'profile';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('queue');
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);

  const [allShops, setAllShops] = useState<Shop[]>([]);
  const [shop, setShop] = useState<Shop | null>(null);
  const [printers, setPrinters] = useState<IPrinter[]>([]);
  const [services, setServices] = useState<ShopService[]>([]);

  const [queueSnapshot, setQueueSnapshot] = useState<QueueSnapshot>({
    nowServingToken: null,
    totalWaiting: 0,
    activeJobs: [],
  });

  const [stats, setStats] = useState({
    completedJobsToday: 0,
    revenueToday: 0,
    pagesPrintedToday: 0,
    waitingJobs: 0,
    printingJobs: 0,
    failedJobs: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // QR Code State
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Machine Roles
  const [colorPrinterId, setColorPrinterId] = useState<string>('');
  const [monoPrinterId, setMonoPrinterId] = useState<string>('');
  const [isSavingPrinters, setIsSavingPrinters] = useState(false);

  // System Hardware Detected Printers
  const [systemPrinters, setSystemPrinters] = useState<
    Array<{ name: string; system_name: string; driver: string; status: string }>
  >([]);
  const [isDetectingSystemPrinters, setIsDetectingSystemPrinters] = useState(false);

  // Add Device Modal
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState(false);
  const [newDevice, setNewDevice] = useState({
    name: '',
    type: 'mono' as 'mono' | 'color',
    system_name: 'Microsoft Print to PDF',
    status: 'online' as 'online' | 'offline',
  });
  const [isAddingDevice, setIsAddingDevice] = useState(false);

  // Add Custom Service Modal
  const [isAddServiceOpen, setIsAddServiceOpen] = useState(false);
  const [newService, setNewService] = useState({
    name: '',
    category: 'custom',
    price: 15,
    unit: 'page',
    description: '',
  });
  const [isAddingService, setIsAddingService] = useState(false);

  // Shop Profile State
  const [profileForm, setProfileForm] = useState({
    name: '',
    location: '',
    address: '',
    latitude: 28.6912,
    longitude: 77.2089,
    owner_name: '',
    owner_phone: '',
    owner_email: '',
    opening_time: '08:00 AM',
    closing_time: '10:00 PM',
    working_days: 'Mon - Sat',
    upi_id: '',
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadInitialData = async () => {
    try {
      const res = await fetch('/api/shops');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setAllShops(data);

        // Check if specific shop requested via URL query ?shop=...
        let targetShop = data[0];
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const shopParam = params.get('shop');
          if (shopParam) {
            const matched = data.find((s: Shop) => s.id === shopParam);
            if (matched) targetShop = matched;
          }
        }

        populateShop(targetShop);
        setupSocket(targetShop.id);
      }
    } catch (err) {
      console.error('Error loading initial data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const populateShop = (currentShop: Shop) => {
    setShop(currentShop);
    const printerList: IPrinter[] = currentShop.printers || [];
    setPrinters(printerList);
    setServices(currentShop.services || []);

    // Set Machine Roles
    const colorP = printerList.find((p) => p.type === 'color');
    const monoP = printerList.find((p) => p.type === 'mono');
    if (colorP) setColorPrinterId(colorP.id);
    else if (printerList[0]) setColorPrinterId(printerList[0].id);

    if (monoP) setMonoPrinterId(monoP.id);
    else if (printerList[1]) setMonoPrinterId(printerList[1].id);
    else if (printerList[0]) setMonoPrinterId(printerList[0].id);

    // Profile form
    setProfileForm({
      name: currentShop.name || '',
      location: currentShop.location || '',
      address: currentShop.address || currentShop.location || '',
      latitude: Number(currentShop.latitude) || 28.6912,
      longitude: Number(currentShop.longitude) || 77.2089,
      owner_name: currentShop.owner_name || '',
      owner_phone: currentShop.owner_phone || '',
      owner_email: currentShop.owner_email || '',
      opening_time: currentShop.opening_time || '08:00 AM',
      closing_time: currentShop.closing_time || '10:00 PM',
      working_days: currentShop.working_days || 'Mon - Sat',
      upi_id: currentShop.upi_id || '',
    });

    // Generate QR
    const kioskUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/?shop=${currentShop.id}`
        : `http://localhost:3000/?shop=${currentShop.id}`;

    QRCode.toDataURL(
      kioskUrl,
      {
        width: 320,
        margin: 2,
        color: {
          dark: '#0e7490',
          light: '#ffffff',
        },
      },
      (err, url) => {
        if (!err && url) setQrCodeDataUrl(url);
      }
    );

    fetchQueue(currentShop.id);
    fetchStats(currentShop.id);
    fetchServices(currentShop.id);
    fetchSystemPrinters(currentShop.id);
  };

  const fetchQueue = async (shopId: string) => {
    try {
      const res = await fetch(`/api/queue/${shopId}`);
      const data = await res.json();
      setQueueSnapshot(data);
    } catch (err) {
      console.error('Error fetching queue:', err);
    }
  };

  const fetchStats = async (shopId: string) => {
    try {
      const res = await fetch(`/api/shops/${shopId}/stats`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const fetchServices = async (shopId: string) => {
    try {
      const res = await fetch(`/api/shops/${shopId}/services`);
      const data = await res.json();
      if (Array.isArray(data)) setServices(data);
    } catch (err) {
      console.error('Error fetching services:', err);
    }
  };

  const setupSocket = (shopId: string) => {
    const socket = getSocket();
    socket.emit('subscribe_shop', { shopId });

    socket.on('queue_updated', (snapshot: QueueSnapshot) => {
      setQueueSnapshot(snapshot);
      fetchStats(shopId);
    });

    socket.on('printers_updated', (updatedPrinters: IPrinter[]) => {
      setPrinters(updatedPrinters);
    });

    socket.on('services_updated', (updatedServices: ShopService[]) => {
      setServices(updatedServices);
    });

    socket.on('shop_updated', (updatedShop: Shop) => {
      setShop(updatedShop);
      if (updatedShop.printers) setPrinters(updatedShop.printers);
      if (updatedShop.services) setServices(updatedShop.services);
    });

    return () => {
      socket.off('queue_updated');
      socket.off('printers_updated');
      socket.off('services_updated');
      socket.off('shop_updated');
    };
  };

  // Switch active shop
  const handleSwitchShop = (newShopId: string) => {
    const matched = allShops.find((s) => s.id === newShopId);
    if (matched) {
      populateShop(matched);
      setupSocket(matched.id);
      showToast(`Switched counter to ${matched.name}`);
    }
  };

  // Device Management Actions
  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !newDevice.name) return;

    setIsAddingDevice(true);
    try {
      const res = await fetch(`/api/shops/${shop.id}/printers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDevice),
      });
      const data = await res.json();
      if (res.ok) {
        setPrinters(data.printers);
        setIsAddDeviceOpen(false);
        setNewDevice({
          name: '',
          type: 'mono',
          system_name: 'Microsoft Print to PDF',
          status: 'online',
        });
        showToast('New device added successfully!');
      } else {
        alert(data.error || 'Failed to add device.');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsAddingDevice(false);
    }
  };

  const handleToggleDeviceStatus = async (printer: IPrinter) => {
    if (!shop) return;
    const nextStatus = printer.status === 'online' ? 'offline' : 'online';
    try {
      const res = await fetch(`/api/shops/${shop.id}/printers/${printer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        setPrinters(data.printers);
        showToast(`${printer.name} marked as ${nextStatus}`);
      }
    } catch (err) {
      console.error('Error toggling printer status:', err);
    }
  };

  const handleDeleteDevice = async (printerId: string) => {
    if (!shop || !confirm('Are you sure you want to remove this printer device?')) return;
    try {
      const res = await fetch(`/api/shops/${shop.id}/printers/${printerId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        setPrinters(data.printers);
        showToast('Device removed from counter.');
      }
    } catch (err) {
      console.error('Error deleting device:', err);
    }
  };

  const handleSavePrinterRoles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop) return;
    setIsSavingPrinters(true);
    try {
      const res = await fetch(`/api/shops/${shop.id}/printers/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colorPrinterId, monoPrinterId }),
      });
      if (res.ok) {
        showToast('Hardware machine assignments saved!');
      }
    } catch (err) {
      console.error('Failed to assign printer roles:', err);
    } finally {
      setIsSavingPrinters(false);
    }
  };

  const fetchSystemPrinters = async (shopId: string) => {
    setIsDetectingSystemPrinters(true);
    try {
      const res = await fetch(`/api/shops/${shopId}/printers/system-hardware`);
      const data = await res.json();
      if (data.success && Array.isArray(data.printers)) {
        setSystemPrinters(data.printers);
      }
    } catch (err) {
      console.error('Error detecting system printers:', err);
    } finally {
      setIsDetectingSystemPrinters(false);
    }
  };

  const handleAssignSystemPrinter = async (
    systemPrinter: { name: string; system_name: string },
    role: 'mono' | 'color'
  ) => {
    if (!shop) return;
    try {
      const res = await fetch(`/api/shops/${shop.id}/printers/assign-system`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_name: systemPrinter.system_name,
          name: systemPrinter.name,
          type: role,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPrinters(data.printers);
        showToast(
          `Assigned "${systemPrinter.name}" as ${role === 'color' ? 'Color' : 'B&W'} device!`
        );
      } else {
        alert(data.error || 'Failed to assign system printer.');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  // Services & Pricing Actions
  const handleToggleService = async (service: ShopService) => {
    if (!shop) return;
    const nextEnabled = !service.enabled;
    try {
      const res = await fetch(`/api/shops/${shop.id}/services/${service.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const data = await res.json();
      if (res.ok) {
        setServices(data.services);
        showToast(`${service.name} ${nextEnabled ? 'enabled' : 'disabled'}!`);
      }
    } catch (err) {
      console.error('Error toggling service:', err);
    }
  };

  const handleUpdateServicePrice = async (serviceId: string, newPrice: number) => {
    if (!shop) return;
    try {
      const res = await fetch(`/api/shops/${shop.id}/services/${serviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: newPrice }),
      });
      const data = await res.json();
      if (res.ok) {
        setServices(data.services);
        showToast('Service price updated!');
      }
    } catch (err) {
      console.error('Error updating service price:', err);
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    if (!shop || !confirm('Are you sure you want to delete this custom service?')) return;
    try {
      const res = await fetch(`/api/shops/${shop.id}/services/${serviceId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        setServices(data.services);
        showToast('Custom service deleted.');
      } else {
        alert(data.error || 'Cannot delete this service.');
      }
    } catch (err) {
      console.error('Error deleting service:', err);
    }
  };

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !newService.name) return;

    setIsAddingService(true);
    try {
      const res = await fetch(`/api/shops/${shop.id}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newService),
      });
      const data = await res.json();
      if (res.ok) {
        setServices(data.services);
        setIsAddServiceOpen(false);
        setNewService({
          name: '',
          category: 'custom',
          price: 15,
          unit: 'page',
          description: '',
        });
        showToast('Custom service added to counter catalog!');
      } else {
        alert(data.error || 'Failed to add service.');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsAddingService(false);
    }
  };

  // Profile Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop) return;
    setIsSavingProfile(true);
    try {
      const res = await fetch(`/api/shops/${shop.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });
      const data = await res.json();
      if (res.ok) {
        setShop(data.shop);
        showToast('Shop profile and map coordinates saved!');
      } else {
        alert(data.error || 'Failed to update profile.');
      }
    } catch (err) {
      console.error('Error saving profile:', err);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Queue Overrides
  const handleReorder = async (jobId: string, currentPos: number, direction: 'up' | 'down') => {
    if (!shop) return;
    const newPos = direction === 'up' ? Math.max(1, currentPos - 1) : currentPos + 1;
    setActionLoadingId(jobId);

    try {
      await fetch(`/api/queue/${shop.id}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, newPosition: newPos }),
      });
      await fetchQueue(shop.id);
    } catch (err) {
      console.error('Failed to reorder:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    if (!shop || !confirm('Are you sure you want to cancel this job?')) return;
    setActionLoadingId(jobId);
    try {
      await fetch(`/api/queue/${shop.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, reason: 'Cancelled by shop manager' }),
      });
      await fetchQueue(shop.id);
      await fetchStats(shop.id);
      showToast('Job cancelled.');
    } catch (err) {
      console.error('Failed to cancel job:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    if (!shop) return;
    setActionLoadingId(jobId);
    try {
      await fetch(`/api/queue/${shop.id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      await fetchQueue(shop.id);
      await fetchStats(shop.id);
      showToast('Retrying job spooling...');
    } catch (err) {
      console.error('Failed to retry job:', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCopyKioskLink = () => {
    if (!shop) return;
    const kioskUrl = `${window.location.origin}/?shop=${shop.id}`;
    navigator.clipboard.writeText(kioskUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  if (isLoading || !shop) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <RotateCw className="w-8 h-8 text-[#0e7490] animate-spin" />
      </div>
    );
  }

  const kioskUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?shop=${shop.id}`
      : `http://localhost:3000/?shop=${shop.id}`;

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-slate-900 antialiased">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpenMobile(!isSidebarOpenMobile)}
              className="lg:hidden p-2 rounded-xl text-slate-600 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#0e7490] text-white flex items-center justify-center font-black text-sm shadow-xs">
                P
              </div>
              <span className="font-black text-slate-900 text-base tracking-tight hidden sm:inline">
                PrintSpot <span className="text-[#0e7490] font-bold text-xs uppercase px-1.5 py-0.5 rounded bg-[#ecfeff] border border-[#a5f3fc]">Manager</span>
              </span>
            </div>

            {/* Shop Selector Dropdown */}
            {allShops.length > 1 && (
              <select
                value={shop.id}
                onChange={(e) => handleSwitchShop(e.target.value)}
                className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg py-1 px-2.5 ml-2 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
              >
                {allShops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2">
            {toastMessage && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                {toastMessage}
              </span>
            )}

            <button
              onClick={() => {
                fetchQueue(shop.id);
                fetchStats(shop.id);
                showToast('Queue refreshed');
              }}
              title="Refresh queue"
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 shadow-2xs transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-[#0e7490]" />
            </button>

            <a
              href={kioskUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0e7490] hover:bg-[#0891b2] text-white text-xs font-bold shadow-2xs transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open Kiosk</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Layout Container with Sidebar */}
      <div className="flex-1 max-w-7xl w-full mx-auto flex">
        {/* SIDEBAR NAVIGATION */}
        <aside
          className={`fixed lg:sticky top-16 left-0 z-20 h-[calc(100vh-4rem)] w-64 bg-white border-r border-slate-200 flex flex-col justify-between p-4 transition-transform duration-200 ease-in-out ${
            isSidebarOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <div className="space-y-6">
            {/* Active Shop Identity Card */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-b from-[#ecfeff] to-white border border-[#a5f3fc]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold uppercase text-[#0e7490] tracking-wider">
                  Counter Active
                </span>
              </div>
              <h2 className="font-extrabold text-xs text-slate-900 mt-1 truncate">
                {shop.name}
              </h2>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                {shop.location}
              </p>
            </div>

            {/* Sidebar Navigation Links */}
            <nav className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('queue');
                  setIsSidebarOpenMobile(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'queue'
                    ? 'bg-[#0e7490] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4" />
                  <span>Live Queue</span>
                </div>
                {queueSnapshot.activeJobs.length > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      activeTab === 'queue'
                        ? 'bg-white text-[#0e7490]'
                        : 'bg-[#ecfeff] text-[#0e7490]'
                    }`}
                  >
                    {queueSnapshot.activeJobs.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('services');
                  setIsSidebarOpenMobile(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'services'
                    ? 'bg-[#0e7490] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Sliders className="w-4 h-4" />
                  <span>Services & Pricing</span>
                </div>
                <span className="text-[10px] opacity-75 font-semibold">
                  {services.filter((s) => s.enabled).length} on
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('devices');
                  setIsSidebarOpenMobile(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'devices'
                    ? 'bg-[#0e7490] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Printer className="w-4 h-4" />
                  <span>Devices & Hardware</span>
                </div>
                <span className="text-[10px] opacity-75 font-semibold">
                  {printers.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('standee');
                  setIsSidebarOpenMobile(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'standee'
                    ? 'bg-[#0e7490] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span>QR Standee & Kiosk</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('profile');
                  setIsSidebarOpenMobile(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'profile'
                    ? 'bg-[#0e7490] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <MapPin className="w-4 h-4" />
                <span>Shop Profile & Map</span>
              </button>
            </nav>
          </div>

          {/* Sidebar Footer: Onboarding Link */}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <a
              href="/onboard"
              className="w-full py-2 px-3 rounded-xl border border-dashed border-[#0e7490] text-[#0e7490] bg-[#ecfeff]/50 hover:bg-[#ecfeff] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Onboard New Shop</span>
            </a>

            <div className="text-[10px] text-slate-400 text-center">
              PrintSpot Fleet OS v2.4 • Live
            </div>
          </div>
        </aside>

        {/* Mobile Sidebar Overlay */}
        {isSidebarOpenMobile && (
          <div
            onClick={() => setIsSidebarOpenMobile(false)}
            className="fixed inset-0 z-10 bg-black/40 lg:hidden"
          />
        )}

        {/* TAB CONTENTS CONTAINER */}
        <main className="flex-1 p-3.5 sm:p-6 lg:p-8 space-y-6 overflow-x-hidden w-full max-w-full">
          {/* Adaptive Mobile & Tablet Navigation Tabs Strip */}
          <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto pb-2 -mx-3.5 px-3.5 sm:-mx-6 sm:px-6 scrollbar-none border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-all ${
                activeTab === 'queue'
                  ? 'bg-[#0e7490] text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Queue {queueSnapshot.activeJobs.length > 0 ? `(${queueSnapshot.activeJobs.length})` : ''}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('services')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-all ${
                activeTab === 'services'
                  ? 'bg-[#0e7490] text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Pricing</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('devices')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-all ${
                activeTab === 'devices'
                  ? 'bg-[#0e7490] text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Devices ({printers.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('standee')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-all ${
                activeTab === 'standee'
                  ? 'bg-[#0e7490] text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Standee</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-all ${
                activeTab === 'profile'
                  ? 'bg-[#0e7490] text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Profile & Map</span>
            </button>
          </div>

          {/* TAB 1: LIVE QUEUE & SPOOLER */}
          {activeTab === 'queue' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">
                    Live Spooler & Queue Monitor
                  </h1>
                  <p className="text-xs text-slate-500">
                    Strict FIFO hardware queue engine with live job telemetry & manual overrides.
                  </p>
                </div>
              </div>

              {/* 4 Stat Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="figma-card p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#ecfeff] border border-[#a5f3fc] flex items-center justify-center text-[#0e7490] shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Queue Waiting</span>
                    <span className="text-lg font-black text-slate-900">{stats.waitingJobs}</span>
                    <span className="text-[10px] text-[#0e7490] font-semibold block">
                      {stats.printingJobs > 0 ? `${stats.printingJobs} printing` : 'Idle'}
                    </span>
                  </div>
                </div>

                <div className="figma-card p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Completed</span>
                    <span className="text-lg font-black text-slate-900">{stats.completedJobsToday}</span>
                    <span className="text-[10px] text-emerald-600 font-semibold block">Today Total</span>
                  </div>
                </div>

                <div className="figma-card p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-[#0e7490] shrink-0">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Revenue</span>
                    <span className="text-lg font-black text-slate-900">₹{stats.revenueToday.toFixed(0)}</span>
                    <span className="text-[10px] text-[#0e7490] font-semibold block">Auto Settled</span>
                  </div>
                </div>

                <div className="figma-card p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block font-medium">Sheets</span>
                    <span className="text-lg font-black text-slate-900">{stats.pagesPrintedToday}</span>
                    <span className="text-[10px] text-blue-600 font-semibold block">Pages Spooled</span>
                  </div>
                </div>
              </div>

              {/* Queue Table */}
              <div className="figma-card overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#0e7490]" />
                    <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                      Active Print Queue ({queueSnapshot.activeJobs.length})
                    </h3>
                  </div>
                  {queueSnapshot.nowServingToken && (
                    <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                      Now Spooling: {queueSnapshot.nowServingToken}
                    </span>
                  )}
                </div>

                {queueSnapshot.activeJobs.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-xs">
                    <Printer className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-bold text-slate-700 text-sm">Print Queue is Clear</p>
                    <p>New paid orders will appear here in real time as customers upload.</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop & Tablet Wide Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                          <tr>
                            <th className="p-3.5">Token</th>
                            <th className="p-3.5">Customer</th>
                            <th className="p-3.5">Document</th>
                            <th className="p-3.5">Settings</th>
                            <th className="p-3.5">Amount</th>
                            <th className="p-3.5">Status</th>
                            <th className="p-3.5 text-right">Overrides</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {queueSnapshot.activeJobs.map((job, idx) => {
                            const settings =
                              typeof job.settings === 'string'
                                ? JSON.parse(job.settings)
                                : job.settings;
                            const isPrinting = job.status === 'printing';
                            const isFailed = job.status === 'failed';
                            const isLoadingThis = actionLoadingId === job.id;

                            return (
                              <tr
                                key={job.id}
                                className={`hover:bg-slate-50/50 transition-colors ${
                                  isPrinting
                                    ? 'bg-[#ecfeff]/50'
                                    : isFailed
                                    ? 'bg-red-50/50'
                                    : ''
                                }`}
                              >
                                <td className="p-3.5 font-bold">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-900 text-sm">
                                      {job.token_code || `#${job.token_number}`}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-normal">
                                      (#{idx + 1})
                                    </span>
                                  </div>
                                </td>

                                <td className="p-3.5">
                                  <p className="font-bold text-slate-900">
                                    {job.user_name || 'Customer'}
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    +91 {job.user_phone}
                                  </p>
                                </td>

                                <td className="p-3.5">
                                  <p className="font-bold text-slate-900 truncate max-w-[150px]">
                                    {job.file_name}
                                  </p>
                                  <p className="text-[10px] text-slate-400">
                                    {job.page_count} pages • {(job.file_size / 1024).toFixed(0)} KB
                                  </p>
                                </td>

                                <td className="p-3.5">
                                  <span>{settings.copies} copy</span> •{' '}
                                  <span>{settings.color ? 'Color' : 'Mono'}</span>
                                </td>

                                <td className="p-3.5 font-bold text-slate-900">
                                  ₹{Number(job.price).toFixed(2)}
                                </td>

                                <td className="p-3.5">
                                  {isPrinting ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#ecfeff] text-[#0e7490] border border-[#a5f3fc]">
                                      <RotateCw className="w-3 h-3 animate-spin" />
                                      Spooling
                                    </span>
                                  ) : isFailed ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                                      <AlertTriangle className="w-3 h-3" />
                                      Errored
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                      Waiting
                                    </span>
                                  )}
                                </td>

                                <td className="p-3.5 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      title="Move up in queue"
                                      disabled={idx === 0 || isLoadingThis}
                                      onClick={() => handleReorder(job.id, idx + 1, 'up')}
                                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 text-slate-600 transition-colors"
                                    >
                                      <ArrowUp className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      title="Move down in queue"
                                      disabled={
                                        idx === queueSnapshot.activeJobs.length - 1 ||
                                        isLoadingThis
                                      }
                                      onClick={() => handleReorder(job.id, idx + 1, 'down')}
                                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 text-slate-600 transition-colors"
                                    >
                                      <ArrowDown className="w-3.5 h-3.5" />
                                    </button>

                                    {isFailed && (
                                      <button
                                        title="Retry print job"
                                        disabled={isLoadingThis}
                                        onClick={() => handleRetryJob(job.id)}
                                        className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                                      >
                                        <RotateCw className="w-3.5 h-3.5" />
                                      </button>
                                    )}

                                    <button
                                      title="Cancel order"
                                      disabled={isLoadingThis}
                                      onClick={() => handleCancelJob(job.id)}
                                      className="p-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Fluid Card View */}
                    <div className="block md:hidden divide-y divide-slate-100">
                      {queueSnapshot.activeJobs.map((job, idx) => {
                        const settings =
                          typeof job.settings === 'string'
                            ? JSON.parse(job.settings)
                            : job.settings;
                        const isPrinting = job.status === 'printing';
                        const isFailed = job.status === 'failed';
                        const isLoadingThis = actionLoadingId === job.id;

                        return (
                          <div
                            key={job.id}
                            className={`p-4 space-y-3 ${
                              isPrinting
                                ? 'bg-[#ecfeff]/40'
                                : isFailed
                                ? 'bg-red-50/40'
                                : ''
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-sm text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                                  {job.token_code || `#${job.token_number}`}
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold">
                                  Queue #{idx + 1}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                {isPrinting ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#ecfeff] text-[#0e7490] border border-[#a5f3fc]">
                                    <RotateCw className="w-3 h-3 animate-spin" />
                                    Spooling
                                  </span>
                                ) : isFailed ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                                    <AlertTriangle className="w-3 h-3" />
                                    Errored
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    Waiting
                                  </span>
                                )}
                                <span className="font-black text-xs text-slate-900">
                                  ₹{Number(job.price).toFixed(2)}
                                </span>
                              </div>
                            </div>

                            <div>
                              <p className="text-xs font-bold text-slate-900 truncate">
                                {job.file_name}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {job.user_name || 'Customer'} • +91 {job.user_phone}
                              </p>
                              <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                                <span>{job.page_count} pages</span>
                                <span>•</span>
                                <span>{settings.copies} copy</span>
                                <span>•</span>
                                <span className="font-semibold text-[#0e7490]">
                                  {settings.color ? 'Color' : 'Monochrome'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2">
                              <div className="flex items-center gap-1.5">
                                <button
                                  disabled={idx === 0 || isLoadingThis}
                                  onClick={() => handleReorder(job.id, idx + 1, 'up')}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold disabled:opacity-30 text-slate-700 flex items-center gap-1"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                  <span>Up</span>
                                </button>
                                <button
                                  disabled={
                                    idx === queueSnapshot.activeJobs.length - 1 ||
                                    isLoadingThis
                                  }
                                  onClick={() => handleReorder(job.id, idx + 1, 'down')}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold disabled:opacity-30 text-slate-700 flex items-center gap-1"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                  <span>Down</span>
                                </button>
                              </div>

                              <div className="flex items-center gap-1.5">
                                {isFailed && (
                                  <button
                                    disabled={isLoadingThis}
                                    onClick={() => handleRetryJob(job.id)}
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1"
                                  >
                                    <RotateCw className="w-3.5 h-3.5" />
                                    <span>Retry</span>
                                  </button>
                                )}
                                <button
                                  disabled={isLoadingThis}
                                  onClick={() => handleCancelJob(job.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-bold flex items-center gap-1"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Cancel</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SERVICES & PRICING */}
          {activeTab === 'services' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">
                    Services & Pricing Catalog
                  </h1>
                  <p className="text-xs text-slate-500">
                    Toggle services on/off (e.g. disable Color if out of ink) and configure custom offerings.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddServiceOpen(true)}
                  className="self-start sm:self-auto px-4 py-2 rounded-xl bg-[#0e7490] hover:bg-[#0891b2] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Custom Service</span>
                </button>
              </div>

              {/* Service Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {services.map((srv) => {
                  const isBw = srv.name.toLowerCase().includes('black') || srv.name.toLowerCase().includes('b&w');
                  const isColor = srv.name.toLowerCase().includes('color');

                  return (
                    <div
                      key={srv.id}
                      className={`figma-card p-5 space-y-3 transition-all ${
                        !srv.enabled ? 'opacity-60 bg-slate-50/80' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                isColor
                                  ? 'bg-purple-100 text-purple-700'
                                  : isBw
                                  ? 'bg-slate-200 text-slate-700'
                                  : 'bg-[#ecfeff] text-[#0e7490]'
                              }`}
                            >
                              {srv.category}
                            </span>
                            {srv.is_default && (
                              <span className="text-[10px] font-semibold text-slate-400">
                                Core Service
                              </span>
                            )}
                          </div>
                          <h3 className="font-extrabold text-sm text-slate-900">
                            {srv.name}
                          </h3>
                          <p className="text-xs text-slate-500">
                            {srv.description || 'Custom print service'}
                          </p>
                        </div>

                        {/* Enable/Disable Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleService(srv)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            srv.enabled ? 'bg-[#0e7490]' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                              srv.enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Pricing Row */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-400">Rate:</span>
                          <div className="relative">
                            <span className="absolute left-2 top-1.5 text-xs font-bold text-slate-500">
                              ₹
                            </span>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              defaultValue={srv.price}
                              onBlur={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val !== Number(srv.price)) {
                                  handleUpdateServicePrice(srv.id, val);
                                }
                              }}
                              className="w-24 pl-5 pr-2 py-1 text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
                            />
                          </div>
                          <span className="text-[11px] text-slate-500">/ {srv.unit}</span>
                        </div>

                        {!srv.is_default && (
                          <button
                            type="button"
                            onClick={() => handleDeleteService(srv.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete service"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: DEVICES & HARDWARE */}
          {activeTab === 'devices' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">
                    Connected Hardware & Devices
                  </h1>
                  <p className="text-xs text-slate-500">
                    Add unlimited printer machines, toggle status, and assign Color vs Monochrome machines.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddDeviceOpen(true)}
                  className="self-start sm:self-auto px-4 py-2 rounded-xl bg-[#0e7490] hover:bg-[#0891b2] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New Printer Device</span>
                </button>
              </div>

              {/* Connected Host Hardware Detection & Fast Assignment */}
              <div className="figma-card p-5 space-y-4 bg-gradient-to-br from-[#ecfeff]/40 via-white to-white border-2 border-[#a5f3fc]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <h3 className="font-extrabold text-sm text-slate-900">
                        Detected Host System Printers (Windows / OS Hardware)
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Physical and virtual printers discovered on this machine. Tap to assign directly to Color or B&W queues.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isDetectingSystemPrinters}
                    onClick={() => fetchSystemPrinters(shop.id)}
                    className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-all shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-[#0e7490] ${isDetectingSystemPrinters ? 'animate-spin' : ''}`} />
                    <span>Scan Hardware</span>
                  </button>
                </div>

                {systemPrinters.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                    <p className="font-semibold text-slate-600">No system printers detected yet</p>
                    <p className="mt-1">Click "Scan Hardware" to query the Windows print spooler.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                    {systemPrinters.map((sp, idx) => {
                      const assigned = printers.find(
                        (p) => p.system_name?.toLowerCase() === sp.system_name?.toLowerCase()
                      );

                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs flex flex-col justify-between gap-3 hover:border-[#a5f3fc] transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-start justify-between gap-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <Printer className="w-4 h-4 text-[#0e7490] shrink-0" />
                                <h4 className="font-bold text-xs text-slate-900 truncate" title={sp.name}>
                                  {sp.name}
                                </h4>
                              </div>
                              {assigned ? (
                                <span
                                  className={`px-2 py-0.5 rounded text-[9px] font-black uppercase shrink-0 ${
                                    assigned.type === 'color'
                                      ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                                  }`}
                                >
                                  {assigned.type === 'color' ? 'Color' : 'B&W'}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                                  Unassigned
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 font-mono truncate" title={sp.driver}>
                              {sp.driver}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => handleAssignSystemPrinter(sp, 'mono')}
                              className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-colors flex items-center justify-center gap-1 ${
                                assigned && assigned.type === 'mono'
                                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              <Check className="w-3 h-3" />
                              <span>Set B&W</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleAssignSystemPrinter(sp, 'color')}
                              className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-colors flex items-center justify-center gap-1 ${
                                assigned && assigned.type === 'color'
                                  ? 'bg-[#0e7490] text-white border-[#0e7490] shadow-xs'
                                  : 'bg-[#ecfeff] hover:bg-[#cffafe] text-[#0e7490] border-[#a5f3fc]'
                              }`}
                            >
                              <Palette className="w-3 h-3" />
                              <span>Set Color</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Machine Assignment Card */}
              <div className="figma-card p-5 space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Palette className="w-4 h-4 text-[#0e7490]" />
                    <span>Hardware Machine Role Routing</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    The queue engine automatically dispatches color documents to the Color machine and grayscale documents to the B&W machine.
                  </p>
                </div>

                <form onSubmit={handleSavePrinterRoles} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/40 space-y-1.5">
                    <label className="text-xs font-bold text-purple-900 block">
                      Color Printing Machine
                    </label>
                    <select
                      value={colorPrinterId}
                      onChange={(e) => setColorPrinterId(e.target.value)}
                      className="w-full text-xs font-semibold text-slate-900 bg-white border border-purple-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      {printers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 block">
                      Grayscale / B&W Machine
                    </label>
                    <select
                      value={monoPrinterId}
                      onChange={(e) => setMonoPrinterId(e.target.value)}
                      className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
                    >
                      {printers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={isSavingPrinters || printers.length === 0}
                      className="px-5 py-2.5 rounded-xl bg-[#0e7490] hover:bg-[#0891b2] text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-all"
                    >
                      {isSavingPrinters ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>Save Machine Assignments</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* All Devices List */}
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                  All Registered Printer Devices ({printers.length})
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {printers.map((printer) => {
                    const isOnline = printer.status === 'online';

                    return (
                      <div
                        key={printer.id}
                        className="figma-card p-4 space-y-3 flex flex-col justify-between"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-2.5 h-2.5 rounded-full ${
                                  isOnline ? 'bg-emerald-500' : 'bg-red-500'
                                }`}
                              />
                              <h4 className="font-bold text-slate-900 text-xs">
                                {printer.name}
                              </h4>
                            </div>

                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                printer.type === 'color'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {printer.type}
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-500">
                            OS Target Spooler:{' '}
                            <code className="text-[#0e7490] font-mono">
                              {printer.system_name || 'OS Default'}
                            </code>
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                          <button
                            type="button"
                            onClick={() => handleToggleDeviceStatus(printer)}
                            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1.5 transition-colors ${
                              isOnline
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-red-50 text-red-700 hover:bg-red-100'
                            }`}
                          >
                            <Power className="w-3 h-3" />
                            <span>{isOnline ? 'Online (Active)' : 'Offline'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteDevice(printer.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                            title="Remove device"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: QR STANDEE & KIOSK */}
          {activeTab === 'standee' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-extrabold text-slate-900">
                  Counter QR Standee & Customer Kiosk
                </h1>
                <p className="text-xs text-slate-500">
                  Place this QR standee on your physical shop counter for customers to scan and submit print jobs.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Standee Acrylic Card Preview */}
                <div className="figma-card p-6 flex flex-col items-center text-center space-y-4 bg-gradient-to-b from-[#ecfeff] to-white border-2 border-[#a5f3fc]">
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#0e7490] text-white shadow-xs">
                    PrintSpot Self-Service Standee
                  </span>

                  <div>
                    <h2 className="text-lg font-black text-slate-900">{shop.name}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">{shop.location}</p>
                  </div>

                  {qrCodeDataUrl ? (
                    <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-md">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrCodeDataUrl}
                        alt="Counter QR Code"
                        className="w-48 h-48 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="w-48 h-48 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                      <RotateCw className="w-6 h-6 animate-spin text-[#0e7490]" />
                    </div>
                  )}

                  <div className="space-y-1">
                    <p className="text-xs font-extrabold text-[#0e7490]">
                      1. Scan QR • 2. Upload Document • 3. Instant Spooling
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono">{kioskUrl}</p>
                  </div>
                </div>

                {/* Standee Actions & Specs */}
                <div className="figma-card p-6 space-y-5 flex flex-col justify-between">
                  <div className="space-y-3">
                    <h3 className="font-extrabold text-sm text-slate-900">
                      Counter Standee Materials & Specifications
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Download the high-resolution vector QR code below to print onto A5/A6 acrylic stands, counter table tents, or front door posters.
                    </p>

                    <div className="space-y-2 pt-2 text-xs">
                      <div className="flex items-center gap-2 text-slate-700">
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>Instant counter-locking (auto-selects this branch)</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>Direct UPI payment routing to your shop VPA</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span>Works with any Android/iPhone camera scanner</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleCopyKioskLink}
                      className="w-full py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center justify-center gap-2 transition-colors"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-600" />
                          <span className="text-emerald-600 font-bold">Kiosk Link Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-slate-500" />
                          <span>Copy Customer Kiosk URL</span>
                        </>
                      )}
                    </button>

                    {qrCodeDataUrl && (
                      <a
                        href={qrCodeDataUrl}
                        download={`PrintSpot_${shop.id}_Counter_QR.png`}
                        className="w-full py-2.5 px-4 rounded-xl bg-[#0e7490] hover:bg-[#0891b2] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-all"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download High-Res Standee (.PNG)</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SHOP PROFILE & MAP */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl font-extrabold text-slate-900">
                  Shop Profile & Map Location
                </h1>
                <p className="text-xs text-slate-500">
                  Manage physical address, exact map pinpoint marker, operating schedule, and UPI payout details.
                </p>
              </div>

              <form onSubmit={handleSaveProfile} className="figma-card p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Shop / Counter Name
                    </label>
                    <input
                      type="text"
                      required
                      value={profileForm.name}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, name: e.target.value })
                      }
                      className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Short Location Note / Campus Landmark
                    </label>
                    <input
                      type="text"
                      required
                      value={profileForm.location}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, location: e.target.value })
                      }
                      className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Complete Street Address
                    </label>
                    <textarea
                      rows={2}
                      value={profileForm.address}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, address: e.target.value })
                      }
                      className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
                    />
                  </div>
                </div>

                {/* Interactive Map Picker */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#0e7490]" />
                    <span>Exact Map Marker & GPS Coordinates</span>
                  </label>
                  <MapPicker
                    latitude={profileForm.latitude}
                    longitude={profileForm.longitude}
                    address={profileForm.address}
                    onChange={({ latitude, longitude, address }) => {
                      setProfileForm((prev) => ({
                        ...prev,
                        latitude,
                        longitude,
                        address: address || prev.address,
                      }));
                    }}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Operating Schedule
                    </label>
                    <input
                      type="text"
                      placeholder="08:00 AM - 10:00 PM"
                      value={profileForm.opening_time}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, opening_time: e.target.value })
                      }
                      className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Working Days
                    </label>
                    <input
                      type="text"
                      placeholder="Mon - Sat"
                      value={profileForm.working_days}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, working_days: e.target.value })
                      }
                      className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Shop UPI ID (Settlements)
                    </label>
                    <input
                      type="text"
                      placeholder="shop@upi"
                      value={profileForm.upi_id}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, upi_id: e.target.value })
                      }
                      className="w-full text-xs font-mono font-bold text-slate-900 bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="px-6 py-2.5 rounded-xl bg-[#0e7490] hover:bg-[#0891b2] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50"
                  >
                    {isSavingProfile ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    <span>Save Shop Profile & Location</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: ADD NEW PRINTER DEVICE */}
      {isAddDeviceOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-[#0e7490]" />
                <h3 className="font-extrabold text-sm text-slate-900">
                  Register New Printer Device
                </h3>
              </div>
              <button
                onClick={() => setIsAddDeviceOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddDevice} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Device Friendly Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Brother HL-L2321D (Front Desk)"
                  value={newDevice.name}
                  onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                  className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Output Capability
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewDevice({ ...newDevice, type: 'mono' })}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                      newDevice.type === 'mono'
                        ? 'border-[#0e7490] bg-[#ecfeff] text-[#0e7490]'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    B&W / Monochrome
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewDevice({ ...newDevice, type: 'color' })}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                      newDevice.type === 'color'
                        ? 'border-[#0e7490] bg-[#ecfeff] text-[#0e7490]'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Color HD Spool
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  System Printer Spooler Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Microsoft Print to PDF"
                  value={newDevice.system_name}
                  onChange={(e) =>
                    setNewDevice({ ...newDevice, system_name: e.target.value })
                  }
                  className="w-full text-xs font-mono font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Exact name in Windows Control Panel & Printers
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddDeviceOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingDevice}
                  className="px-5 py-2 rounded-xl bg-[#0e7490] hover:bg-[#0891b2] text-white text-xs font-bold shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isAddingDevice && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Register Device</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD CUSTOM SERVICE */}
      {isAddServiceOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#0e7490]" />
                <h3 className="font-extrabold text-sm text-slate-900">
                  Add Custom Service Offering
                </h3>
              </div>
              <button
                onClick={() => setIsAddServiceOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddService} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Service Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Thermal Lamination (A4)"
                  value={newService.name}
                  onChange={(e) =>
                    setNewService({ ...newService, name: e.target.value })
                  }
                  className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Rate (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    value={newService.price}
                    onChange={(e) =>
                      setNewService({
                        ...newService,
                        price: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Billing Unit
                  </label>
                  <select
                    value={newService.unit}
                    onChange={(e) =>
                      setNewService({ ...newService, unit: e.target.value })
                    }
                    className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
                  >
                    <option value="page">per page</option>
                    <option value="doc">per document</option>
                    <option value="copy">per copy</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Category
                </label>
                <select
                  value={newService.category}
                  onChange={(e) =>
                    setNewService({ ...newService, category: e.target.value })
                  }
                  className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
                >
                  <option value="binding">Binding Add-on</option>
                  <option value="finishing">Finishing / Lamination</option>
                  <option value="paper">Special Paper</option>
                  <option value="custom">General Custom</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. 125-micron heat sealed waterproof lamination"
                  value={newService.description}
                  onChange={(e) =>
                    setNewService({ ...newService, description: e.target.value })
                  }
                  className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#0e7490]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddServiceOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingService}
                  className="px-5 py-2 rounded-xl bg-[#0e7490] hover:bg-[#0891b2] text-white text-xs font-bold shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isAddingService && <RotateCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Service</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
