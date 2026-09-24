'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Header } from '@/components/Header';
import { FileUpload } from '@/components/FileUpload';
import { PrintSettings } from '@/components/PrintSettings';
import { DocumentPreview } from '@/components/DocumentPreview';
import { CheckoutModal } from '@/components/CheckoutModal';
import { TokenConfirmation } from '@/components/TokenConfirmation';
import { LiveQueueTracker } from '@/components/LiveQueueTracker';
import { PickupReady } from '@/components/PickupReady';
import { Shop, UploadedDocument, User } from '@/lib/types';
import { getSocket } from '@/lib/socket';
import { RotateCw, QrCode, Sparkles, MapPin, Clock, ArrowRight, Layers, Search } from 'lucide-react';

export default function CustomerApp() {
  const [step, setStep] = useState<number>(1);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [isLoadingShop, setIsLoadingShop] = useState<boolean>(true);
  const [isQrScanned, setIsQrScanned] = useState<boolean>(false);

  // Uploaded files list with per-file settings
  const [files, setFiles] = useState<UploadedDocument[]>([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  // User
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Job & Payment state
  const [jobId, setJobId] = useState<string | null>(null);
  const [tokenCode, setTokenCode] = useState<string>('#42');
  const [tokenNumber, setTokenNumber] = useState<number>(42);
  const [queuePosition, setQueuePosition] = useState<number>(2);
  const [estimatedWait, setEstimatedWait] = useState<number>(8);
  const [pickupCode, setPickupCode] = useState<string>('8402');

  useEffect(() => {
    fetchShops();
  }, []);

  // Listen to live shop pricing updates over Socket.IO
  useEffect(() => {
    const socket = getSocket();
    const handleUpdate = (updatedShop: Shop) => {
      setSelectedShop((prev) => (prev && prev.id === updatedShop.id ? { ...prev, ...updatedShop } : prev));
      setShops((prev) => prev.map((s) => (s.id === updatedShop.id ? { ...s, ...updatedShop } : s)));
    };

    socket.on('shop_pricing_updated', handleUpdate);
    socket.on('shop_updated', handleUpdate);

    return () => {
      socket.off('shop_pricing_updated', handleUpdate);
      socket.off('shop_updated', handleUpdate);
    };
  }, []);

  const fetchShops = async () => {
    try {
      const res = await fetch('/api/shops');
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setShops(data);

        // Check if scanned via shop QR code (?shop=<shopId>)
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const shopIdParam = params.get('shop');
          if (shopIdParam) {
            const matched = data.find((s: Shop) => s.id === shopIdParam);
            if (matched) {
              setSelectedShop(matched);
              setIsQrScanned(true);
              setStep(1); // Stay on merged Step 1 (Counter & Upload)!
              return;
            }
          }
        }

        setSelectedShop(data[0]);
      }
    } catch (err) {
      console.error('Failed to load shop:', err);
    } finally {
      setIsLoadingShop(false);
    }
  };

  const calculateTotalPrice = () => {
    if (!selectedShop || files.length === 0) return 0;
    const services = selectedShop.services || [];
    const bwService = services.find(
      (s) => s.name.toLowerCase().includes('black') || s.name.toLowerCase().includes('b&w')
    );
    const colorService = services.find((s) => s.name.toLowerCase().includes('color'));

    const pricePerBw = bwService
      ? Number(bwService.price)
      : Number(selectedShop.price_per_bw) || 2;
    const pricePerColor = colorService
      ? Number(colorService.price)
      : Number(selectedShop.price_per_color) || 10;

    const isImageFile = (f: UploadedDocument) => {
      const ext = (f.fileName.split('.').pop() || '').toLowerCase();
      return (
        ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(ext) ||
        (f.mimeType?.startsWith('image/') ?? false)
      );
    };

    const imageFiles = files.filter(isImageFile);
    const otherFiles = files.filter((f) => !isImageFile(f));
    const hasCombinedImages = imageFiles.length > 0;

    let printTotal = 0;
    let totalCopies = 0;
    let totalPhysicalSheets = 0;

    if (hasCombinedImages) {
      const copies = imageFiles[0]?.copies || 1;
      const isColor = imageFiles.some((f) => f.color);
      const rate = isColor ? pricePerColor : pricePerBw;
      const currentGrid = (imageFiles[0]?.pagesPerSheet as 1 | 2 | 4 | 6 | 9) || (imageFiles.length === 1 ? 1 : imageFiles.length <= 2 ? 2 : 4);
      const rawSheets = Math.max(1, Math.ceil(imageFiles.length / currentGrid));
      const duplex = imageFiles[0]?.duplex ?? false;
      const sheetsPerCopy = duplex ? Math.ceil(rawSheets / 2) : rawSheets;
      printTotal += sheetsPerCopy * copies * rate;
      totalCopies += copies;
      totalPhysicalSheets += sheetsPerCopy * copies;

      otherFiles.forEach((f) => {
        const pagesPerSheet = f.pagesPerSheet || 1;
        const rawSheets = Math.ceil((f.pageCount || 1) / pagesPerSheet);
        const sheetsPerCopy = f.duplex ? Math.ceil(rawSheets / 2) : rawSheets;
        const rate = f.color ? pricePerColor : pricePerBw;
        printTotal += sheetsPerCopy * (f.copies || 1) * rate;
        totalCopies += f.copies || 1;
        totalPhysicalSheets += sheetsPerCopy * (f.copies || 1);
      });
    } else {
      files.forEach((f) => {
        const pagesPerSheet = f.pagesPerSheet || 1;
        const rawSheets = Math.ceil((f.pageCount || 1) / pagesPerSheet);
        const sheetsPerCopy = f.duplex ? Math.ceil(rawSheets / 2) : rawSheets;
        const rate = f.color ? pricePerColor : pricePerBw;
        printTotal += sheetsPerCopy * (f.copies || 1) * rate;
        totalCopies += f.copies || 1;
        totalPhysicalSheets += sheetsPerCopy * (f.copies || 1);
      });
    }

    const customServices = services.filter((s) => !s.is_default && s.enabled);
    let addOnsCost = 0;
    customServices.forEach((srv) => {
      if (selectedServiceIds.includes(srv.id)) {
        if (srv.unit === 'page') {
          addOnsCost += Number(srv.price) * totalPhysicalSheets;
        } else {
          addOnsCost += Number(srv.price) * totalCopies;
        }
      }
    });

    return printTotal + addOnsCost;
  };

  const handleCreateJob = async (): Promise<string> => {
    if (!selectedShop || files.length === 0 || !user) {
      throw new Error('Please ensure you are logged in and documents are uploaded.');
    }

    const totalPrice = calculateTotalPrice();
    const primaryFile = files[0];
    const summaryName =
      files.length === 1
        ? primaryFile.fileName
        : `${primaryFile.fileName} (+${files.length - 1} more)`;
    const totalPages = files.reduce((acc, f) => acc + (f.pageCount || 1), 0);
    const totalCopies = files.reduce((acc, f) => acc + (f.copies || 1), 0);
    const totalSize = files.reduce((acc, f) => acc + (f.fileSize || 0), 0);
    const hasColor = files.some((f) => f.color);

    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        shopId: selectedShop.id,
        fileUrl: primaryFile.fileUrl,
        fileName: summaryName,
        fileSize: totalSize,
        pageCount: totalPages,
        settings: {
          copies: totalCopies,
          color: hasColor,
          files: files.map((f) => ({
            fileName: f.fileName,
            fileUrl: f.fileUrl,
            fileSize: f.fileSize,
            pageCount: f.pageCount,
            mimeType: f.mimeType,
            copies: f.copies || 1,
            color: f.color || false,
            duplex: f.duplex || false,
            pagesPerSheet: f.pagesPerSheet || 1,
            orientation: f.orientation || (f.mimeType?.startsWith('image/') ? 'landscape' : 'portrait'),
          })),
          selectedServiceIds,
        },
        price: totalPrice,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create job');

    setJobId(data.job.id);
    return data.job.id;
  };

  const handleResetFlow = () => {
    setStep(1);
    setFiles([]);
    setSelectedServiceIds([]);
    setJobId(null);
  };

  // Back handler for navigation
  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else if (step === 4) setStep(3);
    else if (step === 6) setStep(1);
  };

  // Mobile swipe-to-go-back gesture support
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const deltaTime = Date.now() - touchStartRef.current.time;
      const startX = touchStartRef.current.x;
      touchStartRef.current = null;

      // Do not trigger back if interacting with form inputs, selects, or horizontal scroll containers
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, .overflow-x-auto, [data-prevent-swipe]')) {
        return;
      }

      // Detect edge swipe right (iOS/Android native pattern: start near edge, swipe right)
      // or general horizontal swipe right with minimal vertical movement
      const isEdgeSwipe = startX < 120 && deltaX > 45 && Math.abs(deltaY) < 65;
      const isGeneralSwipe = deltaX > 75 && Math.abs(deltaY) < 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5;

      if ((isEdgeSwipe || isGeneralSwipe) && deltaTime < 700) {
        if ((step > 1 && step < 5) || step === 6) {
          handleBack();
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [step]);

  if (isLoadingShop || !selectedShop) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-6 text-center">
        <RotateCw className="w-8 h-8 text-[#0e7490] animate-spin mb-3" />
        <p className="text-xs text-slate-500 font-medium">Connecting to PrintSpot Kiosk...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col antialiased">
      <Header
        shopName={selectedShop.name}
        stepNumber={Math.min(4, step)}
        totalSteps={4}
        onBack={step > 1 && step < 5 ? handleBack : undefined}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-lg mx-auto p-4 sm:p-5 flex flex-col justify-start">
        {/* STEP 1: UNIFIED SHOP DETAILS & DIRECT DOCUMENT UPLOAD */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Verified Counter Identity Card */}
            <div className="figma-card p-3.5 bg-gradient-to-r from-[#ecfeff] to-cyan-50/40 border border-[#a5f3fc]">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-white bg-[#0e7490] px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Verified Counter
                    </span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Hardware Online
                    </span>
                  </div>
                  <h2 className="text-sm font-bold text-slate-900 mt-1">
                    {selectedShop.name}
                  </h2>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] text-slate-400 font-medium block">Counter Token</span>
                  <span className="text-xs font-mono font-bold text-[#0e7490]">
                    {selectedShop.nowServingToken || 'Active'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-[11px] text-slate-600 border-t border-cyan-100/80 pt-2">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#0e7490]" />
                  <span>{selectedShop.location}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{selectedShop.opening_time || '9:00 AM'} - {selectedShop.closing_time || '9:00 PM'}</span>
                </span>
                <div className="flex items-center gap-2 ml-auto font-bold text-[#0e7490]">
                  <span>B&W ₹{selectedShop.price_per_bw || 2}/pg</span>
                  <span>•</span>
                  <span>Color ₹{selectedShop.price_per_color || 10}/pg</span>
                </div>
              </div>
            </div>

            {/* Direct Multi-Document Upload Dropzone */}
            <FileUpload
              uploadedFiles={files}
              basePrice={Number(selectedShop.price_per_bw) || 2}
              onSuccess={(uploadedDocs) => {
                setFiles(uploadedDocs);
                setStep(2);
              }}
            />

            {/* Existing Order Lookup Footer */}
            {jobId && (
              <button
                type="button"
                onClick={() => setStep(6)}
                className="w-full py-2.5 px-3 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Search className="w-3.5 h-3.5 text-[#0e7490]" />
                <span>Track Active Order Token ({tokenCode})</span>
              </button>
            )}
          </div>
        )}

        {/* STEP 2: PRINT SETTINGS */}
        {step === 2 && files.length > 0 && (
          <PrintSettings
            files={files}
            shop={selectedShop}
            onFilesChange={setFiles}
            selectedServiceIds={selectedServiceIds}
            onSelectedServicesChange={setSelectedServiceIds}
            onProceed={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}

        {/* STEP 3: DOCUMENT PREVIEW */}
        {step === 3 && files.length > 0 && (
          <DocumentPreview
            files={files}
            totalPrice={calculateTotalPrice()}
            onGridChange={(fileId, g) =>
              setFiles((prev) =>
                prev.map((f) => (f.id === fileId ? { ...f, pagesPerSheet: g } : f))
              )
            }
            onOrientationChange={(fileId, orient) =>
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === fileId || (f.combineImages && prev.find((p) => p.id === fileId)?.combineImages)
                    ? { ...f, orientation: orient }
                    : f
                )
              )
            }
            onProceed={() => setStep(4)}
          />
        )}

        {/* STEP 4: CHECKOUT & PAYMENT */}
        {step === 4 && files.length > 0 && (
          <CheckoutModal
            files={files}
            selectedServiceIds={selectedServiceIds}
            shop={selectedShop}
            user={user}
            onUserAuthenticated={(u, token) => {
              setUser(u);
              setAuthToken(token);
            }}
            jobId={jobId}
            createJob={handleCreateJob}
            onPaymentSuccess={(data) => {
              setTokenCode(data.tokenCode || '#42');
              setTokenNumber(data.tokenNumber || 42);
              setQueuePosition(data.position || 2);
              setPickupCode(data.pickupCode || '8402');
              setEstimatedWait(data.estimatedWaitMinutes || 8);
              setStep(5);
            }}
            onBack={() => setStep(3)}
          />
        )}

        {/* STEP 5: TOKEN CONFIRMATION */}
        {step === 5 && (
          <TokenConfirmation
            tokenCode={tokenCode}
            tokenNumber={tokenNumber}
            position={queuePosition}
            estimatedWaitMinutes={estimatedWait}
            pickupCode={pickupCode}
            totalPrice={calculateTotalPrice()}
            onProceedToQueue={() => setStep(6)}
          />
        )}

        {/* STEP 6: LIVE QUEUE TRACKER */}
        {step === 6 && (
          <LiveQueueTracker
            jobId={jobId || 'demo_job'}
            initialTokenCode={tokenCode}
            initialPosition={queuePosition}
            initialEstimatedWait={estimatedWait}
            pickupCode={pickupCode}
            onReadyForPickup={() => setStep(7)}
          />
        )}

        {/* STEP 7: PICKUP READY PIN & QR */}
        {step === 7 && (
          <PickupReady
            jobId={jobId || 'demo_job'}
            tokenCode={tokenCode}
            pickupCode={pickupCode}
            shopName={selectedShop.name}
            shopLocation={selectedShop.location}
            onReset={handleResetFlow}
          />
        )}
      </main>
    </div>
  );
}
