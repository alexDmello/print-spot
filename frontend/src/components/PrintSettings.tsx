'use client';

import React, { useEffect, useState } from 'react';
import { UploadedDocument, Shop, ShopService } from '@/lib/types';
import { MobileBottomCta } from './MobileBottomCta';
import {
  Check,
  AlertCircle,
  Layers,
  Copy,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  FileCode,
  File,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface PrintSettingsProps {
  files: UploadedDocument[];
  shop: Shop;
  onFilesChange: (updated: UploadedDocument[]) => void;
  selectedServiceIds?: string[];
  onSelectedServicesChange?: (ids: string[]) => void;
  onProceed: () => void;
  onBack?: () => void;
}

export const PrintSettings: React.FC<PrintSettingsProps> = ({
  files,
  shop,
  onFilesChange,
  selectedServiceIds = [],
  onSelectedServicesChange,
  onProceed,
}) => {
  const services: ShopService[] = shop.services || [];

  // Identify Core Print Rates
  const bwService = services.find(
    (s) => s.name.toLowerCase().includes('black') || s.name.toLowerCase().includes('b&w')
  );
  const colorService = services.find((s) => s.name.toLowerCase().includes('color'));

  const isBwEnabled = bwService ? bwService.enabled : true;
  const isColorEnabled = colorService ? colorService.enabled : true;

  const pricePerBw = bwService ? Number(bwService.price) : Number(shop.price_per_bw) || 2;
  const pricePerColor = colorService ? Number(colorService.price) : Number(shop.price_per_color) || 10;

  // Open/Close states for all document cards & photo sheet
  const [openCardIds, setOpenCardIds] = useState<Record<string, boolean>>({});
  const [isPhotoSheetOpen, setIsPhotoSheetOpen] = useState<boolean>(true);

  // Auto-switch file color mode if disabled by shopkeeper
  useEffect(() => {
    let hasChanges = false;
    const adjusted = files.map((f) => {
      if (!isBwEnabled && !f.color && isColorEnabled) {
        hasChanges = true;
        return { ...f, color: true };
      }
      if (!isColorEnabled && f.color && isBwEnabled) {
        hasChanges = true;
        return { ...f, color: false };
      }
      return f;
    });

    if (hasChanges) {
      onFilesChange(adjusted);
    }
  }, [isBwEnabled, isColorEnabled, files, onFilesChange]);

  const updateFileSetting = (id: string, updates: Partial<UploadedDocument>) => {
    onFilesChange(
      files.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  };

  const handleApplyToAll = (sourceFile: UploadedDocument) => {
    onFilesChange(
      files.map((f) => ({
        ...f,
        copies: sourceFile.copies,
        color: sourceFile.color,
        duplex: sourceFile.duplex,
        pagesPerSheet: sourceFile.pagesPerSheet,
      }))
    );
  };

  const isImageFile = (f: UploadedDocument) => {
    const ext = (f.fileName.split('.').pop() || '').toLowerCase();
    return (
      ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(ext) ||
      (f.mimeType?.startsWith('image/') ?? false)
    );
  };

  const imageFiles = files.filter(isImageFile);
  const otherFiles = files.filter((f) => !isImageFile(f));
  const isCombinedImages = imageFiles.length > 1 && imageFiles.some((f) => f.combineImages);

  const toggleCombineImages = () => {
    const nextCombined = !isCombinedImages;
    const defaultGrid: 1 | 2 | 4 | 6 | 9 =
      imageFiles.length <= 2 ? 2 : imageFiles.length <= 4 ? 4 : imageFiles.length <= 6 ? 6 : 9;
    onFilesChange(
      files.map((f) =>
        isImageFile(f)
          ? {
              ...f,
              combineImages: nextCombined,
              pagesPerSheet: nextCombined ? defaultGrid : 1,
            }
          : f
      )
    );
  };

  // Helper to calculate sheets and cost for a single file
  const calculateFileCost = (file: UploadedDocument) => {
    const pagesPerSheet = file.pagesPerSheet || 1;
    const rawSheets = Math.ceil((file.pageCount || 1) / pagesPerSheet);
    const sheetsPerCopy = file.duplex ? Math.ceil(rawSheets / 2) : rawSheets;
    const rate = file.color ? pricePerColor : pricePerBw;
    const total = sheetsPerCopy * (file.copies || 1) * rate;
    return { rawSheets, sheetsPerCopy, rate, total };
  };

  // Total print cost across all files
  let totalPrintCost = 0;
  let totalCopies = 0;
  let totalPhysicalSheets = 0;

  if (isCombinedImages) {
    const copies = imageFiles[0]?.copies || 1;
    const isColor = imageFiles.some((f) => f.color);
    const rate = isColor ? pricePerColor : pricePerBw;
    const currentGrid = imageFiles.find((f) => f.pagesPerSheet && f.pagesPerSheet > 1)?.pagesPerSheet || imageFiles[0]?.pagesPerSheet || 4;
    const rawSheets = Math.max(1, Math.ceil(imageFiles.length / currentGrid));
    const duplex = imageFiles[0]?.duplex ?? false;
    const sheetsPerCopy = duplex ? Math.ceil(rawSheets / 2) : rawSheets;
    const total = sheetsPerCopy * copies * rate;

    totalPrintCost += total;
    totalCopies += copies;
    totalPhysicalSheets += sheetsPerCopy * copies;

    otherFiles.forEach((f) => {
      const { sheetsPerCopy, total } = calculateFileCost(f);
      totalPrintCost += total;
      totalCopies += f.copies || 1;
      totalPhysicalSheets += sheetsPerCopy * (f.copies || 1);
    });
  } else {
    files.forEach((f) => {
      const { sheetsPerCopy, total } = calculateFileCost(f);
      totalPrintCost += total;
      totalCopies += f.copies || 1;
      totalPhysicalSheets += sheetsPerCopy * (f.copies || 1);
    });
  }

  const grandTotal = totalPrintCost;

  // Photo sheet unified variables
  const photoSheetCopies = imageFiles[0]?.copies || 1;
  const photoSheetColor = imageFiles.some((f) => f.color !== false);
  const photoSheetOrientation: 'portrait' | 'landscape' =
    imageFiles[0]?.orientation || 'landscape';
  const photoSheetGrid =
    imageFiles.find((f) => f.pagesPerSheet && f.pagesPerSheet > 1)?.pagesPerSheet ||
    imageFiles[0]?.pagesPerSheet ||
    4;
  const photoSheetRawSheets = Math.max(1, Math.ceil(imageFiles.length / photoSheetGrid));
  const photoSheetDuplex = imageFiles[0]?.duplex ?? false;
  const photoSheetSheetsPerCopy = photoSheetDuplex ? Math.ceil(photoSheetRawSheets / 2) : photoSheetRawSheets;
  const photoSheetRate = photoSheetColor ? pricePerColor : pricePerBw;
  const photoSheetTotal = photoSheetSheetsPerCopy * photoSheetCopies * photoSheetRate;

  const updatePhotoSheetSetting = (updates: Partial<UploadedDocument>) => {
    onFilesChange(
      files.map((f) => (isImageFile(f) ? { ...f, ...updates } : f))
    );
  };

  const displayFiles = isCombinedImages ? otherFiles : files;
  const totalCards = displayFiles.length + (isCombinedImages ? 1 : 0);

  const isCardOpen = (cardId: string, index: number): boolean => {
    if (openCardIds[cardId] !== undefined) {
      return openCardIds[cardId];
    }
    // Default open: first card, or if only 1 card exists
    return index === 0 || totalCards === 1;
  };

  const toggleCardOpen = (cardId: string, index: number) => {
    const current = isCardOpen(cardId, index);
    setOpenCardIds((prev) => ({
      ...prev,
      [cardId]: !current,
    }));
  };

  const areAllExpanded =
    (isCombinedImages ? isPhotoSheetOpen : true) &&
    displayFiles.every((f, idx) => isCardOpen(f.id, idx));

  const toggleAllCards = () => {
    const targetState = !areAllExpanded;
    const updated: Record<string, boolean> = {};
    displayFiles.forEach((f) => {
      updated[f.id] = targetState;
    });
    setOpenCardIds(updated);
    if (isCombinedImages) {
      setIsPhotoSheetOpen(targetState);
    }
  };

  const getFileIcon = (fileName: string, mime?: string) => {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf' || mime === 'application/pdf') {
      return <FileText className="w-4 h-4 text-red-500" />;
    }
    if (['doc', 'docx'].includes(ext)) {
      return <FileText className="w-4 h-4 text-blue-500" />;
    }
    if (['xls', 'xlsx', 'csv'].includes(ext)) {
      return <FileSpreadsheet className="w-4 h-4 text-emerald-500" />;
    }
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext) || mime?.startsWith('image/')) {
      return <ImageIcon className="w-4 h-4 text-purple-500" />;
    }
    if (['txt', 'md', 'json', 'py', 'js', 'ts'].includes(ext)) {
      return <FileCode className="w-4 h-4 text-amber-500" />;
    }
    return <File className="w-4 h-4 text-[#0e7490]" />;
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4 pb-24">
      {/* Title Section */}
      <div className="space-y-0.5 pt-1">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          Print Configuration
        </h1>
        <p className="text-xs text-slate-500">
          Set copies, orientation, and options for your documents before previewing.
        </p>
      </div>

      {/* Multi-file Shortcut Toolbar */}
      {files.length > 1 && !isCombinedImages && (
        <div className="bg-[#ecfeff] border border-[#a5f3fc] rounded-xl p-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-[#0e7490] font-medium">
            <Copy className="w-4 h-4 text-[#0e7490] shrink-0" />
            <span>{files.length} documents uploaded</span>
          </div>
          <button
            type="button"
            onClick={() => handleApplyToAll(files[0])}
            className="text-[11px] font-bold text-[#0e7490] hover:text-[#0891b2] underline cursor-pointer"
          >
            Apply File 1 settings to all
          </button>
        </div>
      )}

      {/* Multi-Image Combine Option (When NOT yet active) */}
      {imageFiles.length > 1 && !isCombinedImages && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-3 shadow-2xs flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
              <ImageIcon className="w-4 h-4 text-purple-600 shrink-0" />
              <span>Multi-Image Photo Sheet</span>
            </div>
            <p className="text-[11px] text-purple-700">
              Combine {imageFiles.length} photos into 1 A4 sheet (e.g. 2, 4, 6 or 9-in-1 layout)
            </p>
          </div>
          <button
            type="button"
            onClick={toggleCombineImages}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-purple-300 text-purple-700 hover:bg-purple-100/50 shadow-2xs transition-all shrink-0 cursor-pointer"
          >
            Fit into 1 Page
          </button>
        </div>
      )}

      {/* Cards Header Bar (when more than 1 card exists) */}
      {totalCards > 1 && (
        <div className="flex items-center justify-between px-1 text-xs">
          <span className="font-bold text-slate-600">
            Document Settings ({totalCards} {totalCards === 1 ? 'card' : 'cards'})
          </span>
          <button
            type="button"
            onClick={toggleAllCards}
            className="text-[11px] font-bold text-[#0e7490] hover:text-[#0891b2] cursor-pointer"
          >
            {areAllExpanded ? 'Collapse All' : 'Expand All'}
          </button>
        </div>
      )}

      {/* Per-File / Photo Sheet Settings Cards */}
      <div className="space-y-3">
        {/* UNIFIED SINGLE CONTROL CARD FOR PHOTO SHEET (when Fit into 1 Page is active) */}
        {isCombinedImages && (
          <div className="figma-card overflow-hidden bg-white border border-purple-300 shadow-sm ring-1 ring-purple-400/20">
            {/* Header: Clickable dropdown toggle in ALL scenarios */}
            <div
              onClick={() => setIsPhotoSheetOpen(!isPhotoSheetOpen)}
              className={`p-3.5 flex items-center justify-between cursor-pointer bg-gradient-to-r from-purple-50/90 to-indigo-50/70 border-b ${
                isPhotoSheetOpen ? 'border-purple-100' : 'border-transparent'
              } hover:bg-purple-100/50 transition-colors select-none`}
            >
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-800">
                      Unified Photo Sheet
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                        photoSheetColor ? 'bg-purple-200 text-purple-800' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {photoSheetColor ? 'Color' : 'B&W'}
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-700">
                      {photoSheetOrientation === 'landscape' ? 'Landscape (Default)' : 'Portrait'}
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-xs truncate">
                    Combined Sheet ({imageFiles.length} Photos)
                  </h4>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <span className="text-xs font-bold text-purple-950 block">
                    ₹{photoSheetTotal.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-purple-700 font-medium">
                    {photoSheetCopies} {photoSheetCopies === 1 ? 'copy' : 'copies'} • {photoSheetSheetsPerCopy} {photoSheetSheetsPerCopy === 1 ? 'A4 sheet' : 'A4 sheets'}
                  </span>
                </div>
                <div className="text-purple-600 ml-1">
                  {isPhotoSheetOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>
            </div>

            {/* Unified Control Body */}
            {isPhotoSheetOpen && (
              <div className="p-3.5 space-y-4 bg-white">
              {/* Photo Thumbnail Strip */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-800">
                    Included Photos ({imageFiles.length})
                  </label>
                  <button
                    type="button"
                    onClick={toggleCombineImages}
                    className="text-[10.5px] font-bold text-purple-700 hover:text-purple-900 underline cursor-pointer"
                  >
                    Separate into individual files
                  </button>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {imageFiles.map((img, i) => (
                    <div
                      key={img.id}
                      className="w-12 h-12 rounded-lg border border-purple-200 overflow-hidden shrink-0 relative bg-slate-100 flex items-center justify-center shadow-2xs group"
                      title={img.fileName}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.fileUrl.startsWith('http') ? img.fileUrl : img.fileUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[8px] font-bold px-1 rounded-tl">
                        #{i + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 1. Sheet Orientation Option (Landscape Default) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-800">
                    Sheet Orientation
                  </label>
                  <span className="text-[10px] text-purple-600 font-semibold">
                    Landscape recommended for multi-photo sheets
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updatePhotoSheetSetting({ orientation: 'landscape' })}
                    className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${
                      photoSheetOrientation === 'landscape'
                        ? 'border-purple-600 bg-purple-50 text-purple-900 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold">🖼️ Landscape (Default)</div>
                    <div className="text-[10px] text-slate-500 font-normal">Wide A4 (297 × 210 mm)</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => updatePhotoSheetSetting({ orientation: 'portrait' })}
                    className={`p-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${
                      photoSheetOrientation === 'portrait'
                        ? 'border-purple-600 bg-purple-50 text-purple-900 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold">📄 Portrait</div>
                    <div className="text-[10px] text-slate-500 font-normal">Tall A4 (210 × 297 mm)</div>
                  </button>
                </div>
              </div>

              {/* 2. Grid Layout on A4 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-800">
                    Grid Layout on A4 Sheet
                  </label>
                  <span className="text-[10px] text-purple-600 font-semibold">
                    {imageFiles.length > photoSheetGrid
                      ? `${photoSheetRawSheets} A4 sheets required`
                      : photoSheetGrid > imageFiles.length
                      ? `${photoSheetGrid - imageFiles.length} spot(s) blank`
                      : 'Fits 1 A4 sheet'}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {([2, 4, 6, 9] as const).map((g) => {
                    const isSelected = photoSheetGrid === g;
                    const label =
                      photoSheetOrientation === 'landscape'
                        ? g === 2
                          ? '2-in-1 (Left/Right)'
                          : g === 4
                          ? '4-in-1 (2×2)'
                          : g === 6
                          ? '6-in-1 (3×2 Wide)'
                          : '9-in-1 (3×3)'
                        : g === 2
                        ? '2-in-1 (Halves)'
                        : g === 4
                        ? '4-in-1 (2×2)'
                        : g === 6
                        ? '6-in-1 (2×3 Tall)'
                        : '9-in-1 (3×3)';

                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => updatePhotoSheetSetting({ pagesPerSheet: g })}
                        className={`py-2 px-1 rounded-xl text-center text-xs font-bold transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-white text-purple-900 border-purple-200 hover:bg-purple-50'
                        }`}
                      >
                        <div className="text-xs">{g}-in-1</div>
                        <div className="text-[9px] opacity-80 truncate">{label.replace(`${g}-in-1 `, '')}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Copies Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-800">
                    Copies of Photo Sheet:
                  </label>
                  <span className="text-slate-500 text-[11px]">
                    {photoSheetSheetsPerCopy * photoSheetCopies} total A4 sheets
                  </span>
                </div>

                <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-1 w-full">
                  <button
                    type="button"
                    onClick={() => updatePhotoSheetSetting({ copies: Math.max(1, photoSheetCopies - 1) })}
                    className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 shadow-2xs transition-colors cursor-pointer text-base"
                  >
                    -
                  </button>
                  <span className="flex-1 text-center font-bold text-slate-900 text-base">
                    {photoSheetCopies}
                  </span>
                  <button
                    type="button"
                    onClick={() => updatePhotoSheetSetting({ copies: photoSheetCopies + 1 })}
                    className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 shadow-2xs transition-colors cursor-pointer text-base"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 4. Print Mode (Color vs B&W) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 block">
                  Print Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!isBwEnabled}
                    onClick={() => updatePhotoSheetSetting({ color: false })}
                    className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                      !photoSheetColor
                        ? 'border-[#0e7490] bg-[#ecfeff] text-[#0e7490]'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    } ${!isBwEnabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div>
                      <div className="font-bold text-xs">Black & White</div>
                      <div className="text-[10px] text-slate-500">₹{pricePerBw}/sheet</div>
                    </div>
                    {!photoSheetColor && <Check className="w-4 h-4 text-[#0e7490]" />}
                  </button>

                  <button
                    type="button"
                    disabled={!isColorEnabled}
                    onClick={() => updatePhotoSheetSetting({ color: true })}
                    className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                      photoSheetColor
                        ? 'border-purple-600 bg-purple-50 text-purple-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    } ${!isColorEnabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div>
                      <div className="font-bold text-xs">Full Color</div>
                      <div className="text-[10px] text-slate-500">₹{pricePerColor}/sheet</div>
                    </div>
                    {photoSheetColor && <Check className="w-4 h-4 text-purple-600" />}
                  </button>
                </div>
              </div>
            </div>
            )}
          </div>
        )}

        {/* Individual Cards: Either for otherFiles (when combined) or for all files (when not combined) */}
        {displayFiles.map((item, index) => {
          const originalIndex = files.findIndex((f) => f.id === item.id);
          const { sheetsPerCopy, rate, total } = calculateFileCost(item);
          const isExpanded = isCardOpen(item.id, index);

          return (
            <div
              key={item.id}
              className={`figma-card overflow-hidden transition-all bg-white border ${
                isExpanded ? 'border-[#0e7490] ring-1 ring-[#0e7490]/20' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Card Header (Clickable dropdown toggle in ALL scenarios) */}
              <div
                onClick={() => toggleCardOpen(item.id, index)}
                className={`p-3.5 flex items-center justify-between cursor-pointer bg-slate-50/70 border-b ${
                  isExpanded ? 'border-slate-200' : 'border-transparent'
                } hover:bg-slate-100/70 transition-colors select-none`}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                    {getFileIcon(item.fileName, item.mimeType)}
                  </div>
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#0e7490]">
                        File {originalIndex + 1}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                          item.color ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {item.color ? 'Color' : 'B&W'}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-xs truncate max-w-[170px] sm:max-w-[210px]">
                      {item.fileName}
                    </h4>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-900 block">
                      ₹{total.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {item.copies} {item.copies === 1 ? 'copy' : 'copies'} • {item.pageCount} pgs
                    </span>
                  </div>
                  <div className="text-slate-400 ml-1">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
              </div>

              {/* Card Body: Per-File Print Controls */}
              {isExpanded && (
                <div className="p-3.5 space-y-4 bg-white">
                  {/* Copies Selector */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-bold text-slate-800">
                        Copies for this file:
                      </label>
                      <span className="text-slate-500 text-[11px]">
                        {sheetsPerCopy * item.copies} total sheets
                      </span>
                    </div>

                    <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-1 w-full">
                      <button
                        type="button"
                        onClick={() =>
                          updateFileSetting(item.id, {
                            copies: Math.max(1, (item.copies || 1) - 1),
                          })
                        }
                        className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 shadow-2xs transition-colors cursor-pointer text-base"
                      >
                        -
                      </button>
                      <span className="flex-1 text-center font-bold text-slate-900 text-base">
                        {item.copies || 1}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateFileSetting(item.id, {
                            copies: (item.copies || 1) + 1,
                          })
                        }
                        className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-100 shadow-2xs transition-colors cursor-pointer text-base"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Print Mode (Color vs B&W) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 block">
                      Print Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={!isBwEnabled}
                        onClick={() => updateFileSetting(item.id, { color: false })}
                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                          !item.color
                            ? 'border-[#0e7490] bg-[#ecfeff] text-[#0e7490]'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        } ${!isBwEnabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <div>
                          <div className="font-bold text-xs">Black & White</div>
                          <div className="text-[10px] text-slate-500">₹{pricePerBw}/sheet</div>
                        </div>
                        {!item.color && <Check className="w-4 h-4 text-[#0e7490]" />}
                      </button>

                      <button
                        type="button"
                        disabled={!isColorEnabled}
                        onClick={() => updateFileSetting(item.id, { color: true })}
                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                          item.color
                            ? 'border-purple-600 bg-purple-50 text-purple-700'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        } ${!isColorEnabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <div>
                          <div className="font-bold text-xs">Full Color</div>
                          <div className="text-[10px] text-slate-500">₹{pricePerColor}/sheet</div>
                        </div>
                        {item.color && <Check className="w-4 h-4 text-purple-600" />}
                      </button>
                    </div>
                  </div>

                  {/* Sides (Single vs Double sided) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 block">
                      Sides
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateFileSetting(item.id, { duplex: false })}
                        className={`p-2 rounded-xl border text-center font-bold text-xs transition-all ${
                          !item.duplex
                            ? 'border-[#0e7490] bg-[#ecfeff] text-[#0e7490]'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        Single-Sided
                      </button>
                      <button
                        type="button"
                        onClick={() => updateFileSetting(item.id, { duplex: true })}
                        className={`p-2 rounded-xl border text-center font-bold text-xs transition-all ${
                          item.duplex
                            ? 'border-[#0e7490] bg-[#ecfeff] text-[#0e7490]'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        Double-Sided (Duplex)
                      </button>
                    </div>
                  </div>

                  {/* Orientation (Portrait vs Landscape) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 block">
                      Orientation
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => updateFileSetting(item.id, { orientation: 'portrait' })}
                        className={`p-2 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${
                          (item.orientation || (isImageFile(item) ? 'landscape' : 'portrait')) === 'portrait'
                            ? 'border-[#0e7490] bg-[#ecfeff] text-[#0e7490] shadow-2xs'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        Portrait (Tall)
                      </button>
                      <button
                        type="button"
                        onClick={() => updateFileSetting(item.id, { orientation: 'landscape' })}
                        className={`p-2 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${
                          (item.orientation || (isImageFile(item) ? 'landscape' : 'portrait')) === 'landscape'
                            ? 'border-[#0e7490] bg-[#ecfeff] text-[#0e7490] shadow-2xs'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        Landscape (Wide)
                      </button>
                    </div>
                  </div>

                  {/* Pages Per Sheet (Grid Layout) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <label className="font-bold text-slate-800 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-[#0e7490]" />
                        <span>{isImageFile(item) ? 'Images Per Sheet' : 'Pages Per Sheet'}</span>
                      </label>
                      <span className="text-[10px] text-slate-500">
                        {item.pagesPerSheet === 1 ? 'Full Page' : `${item.pagesPerSheet}-in-1 Grid`}
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-1">
                      {([1, 2, 4, 6, 9] as const).map((gridNum) => (
                        <button
                          key={gridNum}
                          type="button"
                          onClick={() => {
                            if (isCombinedImages && isImageFile(item)) {
                              onFilesChange(
                                files.map((f) =>
                                  isImageFile(f) ? { ...f, pagesPerSheet: gridNum } : f
                                )
                              );
                            } else {
                              updateFileSetting(item.id, { pagesPerSheet: gridNum });
                            }
                          }}
                          className={`py-1.5 px-1 rounded-lg border text-center text-xs font-bold transition-all cursor-pointer ${
                            (item.pagesPerSheet || 1) === gridNum
                              ? 'border-[#0e7490] bg-[#ecfeff] text-[#0e7490] shadow-2xs'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {gridNum === 1 ? '1-up' : `${gridNum}-in-1`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* File Cost Calculation Footer */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {item.copies} {item.copies === 1 ? 'copy' : 'copies'} × {sheetsPerCopy}{' '}
                      {sheetsPerCopy === 1 ? 'sheet' : 'sheets'} @ ₹{rate}/page
                    </span>
                    <strong className="text-slate-900 font-bold text-xs">
                      ₹{total.toFixed(2)}
                    </strong>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>



      {/* Sticky Bottom CTA */}
      <MobileBottomCta
        label="Total (incl. tax)"
        value={`₹${grandTotal.toFixed(2)}`}
        buttonText={`Review Preview (${totalCopies} ${totalCopies === 1 ? 'copy' : 'copies'})`}
        onButtonClick={onProceed}
      />
    </div>
  );
};
