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

interface DropdownOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

const DropdownRow: React.FC<{
  label: string;
  sublabel?: string;
  value: string | number;
  options: DropdownOption[];
  onChange: (val: string) => void;
  icon?: React.ReactNode;
  iconBgClass?: string;
}> = ({
  label,
  sublabel,
  value,
  options,
  onChange,
  icon,
  iconBgClass = 'bg-slate-100 text-[#0e7490]',
}) => {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-slate-50/70 border border-slate-200/80 hover:bg-slate-50 hover:border-slate-300 transition-all gap-3">
      {/* Option Name on Left */}
      <div className="flex items-center gap-2.5 min-w-0 pr-1">
        {icon && (
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${iconBgClass}`}>
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <span className="text-xs font-bold text-slate-800 block truncate">
            {label}
          </span>
          {sublabel && (
            <span className="text-[10px] text-slate-500 font-medium block truncate">
              {sublabel}
            </span>
          )}
        </div>
      </div>

      {/* Dropdown Option on Right */}
      <div className="relative shrink-0 w-auto min-w-[145px] max-w-[58%] sm:max-w-[62%]">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none w-full bg-white border border-slate-200 hover:border-slate-300 rounded-lg pl-3 pr-7 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#0e7490] focus:ring-2 focus:ring-[#0e7490]/15 cursor-pointer shadow-2xs transition-all truncate"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" />
      </div>
    </div>
  );
};

const StepperRow: React.FC<{
  label: string;
  sublabel?: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (val: number) => void;
  icon?: React.ReactNode;
  iconBgClass?: string;
}> = ({
  label,
  sublabel,
  value,
  min = 1,
  max = 100,
  onChange,
  icon,
  iconBgClass = 'bg-slate-100 text-[#0e7490]',
}) => {
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-50/70 border border-slate-200/80 hover:bg-slate-50 hover:border-slate-300 transition-all gap-3">
      {/* Option Name on Left */}
      <div className="flex items-center gap-2.5 min-w-0 pr-1">
        {icon && (
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-2xs ${iconBgClass}`}>
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <span className="text-xs font-bold text-slate-800 block truncate">
            {label}
          </span>
          {sublabel && (
            <span className="text-[10px] text-slate-500 font-medium block truncate">
              {sublabel}
            </span>
          )}
        </div>
      </div>

      {/* Stepper on Right */}
      <div className="flex items-center bg-white border border-slate-200 hover:border-slate-300 rounded-lg p-0.5 shadow-2xs transition-colors shrink-0">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label="Decrease copies"
          className="w-7 h-7 rounded-md bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200/80 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center font-bold text-slate-700 text-sm transition-colors cursor-pointer"
        >
          -
        </button>
        <span className="w-10 text-center font-bold text-slate-900 text-xs">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label="Increase copies"
          className="w-7 h-7 rounded-md bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200/80 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center font-bold text-slate-700 text-sm transition-colors cursor-pointer"
        >
          +
        </button>
      </div>
    </div>
  );
};

const MiniPhotoSheetPreview: React.FC<{
  images: UploadedDocument[];
  grid: 1 | 2 | 4 | 6 | 9;
  orientation: 'portrait' | 'landscape';
  color: boolean;
}> = ({ images, grid, orientation, color }) => {
  const [sheetIndex, setSheetIndex] = useState(0);
  const totalSheets = Math.max(1, Math.ceil(images.length / grid));

  useEffect(() => {
    if (sheetIndex >= totalSheets) {
      setSheetIndex(0);
    }
  }, [totalSheets, sheetIndex]);

  const startIndex = sheetIndex * grid;
  const currentSheetImages = images.slice(startIndex, startIndex + grid);
  const totalSlots = grid;

  const getResolvedUrl = (url?: string) => {
    if (!url) return '';
    const match = url.match(/\/uploads\/[^?#]+/);
    if (match) return match[0];
    return url;
  };

  const getGridClass = () => {
    if (orientation === 'landscape') {
      switch (grid) {
        case 2:
          return 'grid-cols-2 grid-rows-1';
        case 4:
          return 'grid-cols-2 grid-rows-2';
        case 6:
          return 'grid-cols-3 grid-rows-2';
        case 9:
          return 'grid-cols-3 grid-rows-3';
        default:
          return 'grid-cols-1 grid-rows-1';
      }
    } else {
      switch (grid) {
        case 2:
          return 'grid-cols-1 grid-rows-2';
        case 4:
          return 'grid-cols-2 grid-rows-2';
        case 6:
          return 'grid-cols-2 grid-rows-3';
        case 9:
          return 'grid-cols-3 grid-rows-3';
        default:
          return 'grid-cols-1 grid-rows-1';
      }
    }
  };

  return (
    <div className="bg-gradient-to-b from-purple-50/70 to-slate-100/90 rounded-xl p-3 border border-purple-200/70 flex flex-col items-center justify-center shadow-inner">
      {/* Pagination Bar (when photos span across multiple sheets) */}
      {totalSheets > 1 && (
        <div className="w-full flex items-center justify-between text-[11px] font-semibold text-purple-900 mb-2 px-1">
          <span className="text-[10px] text-purple-700 font-bold uppercase tracking-wider">
            Sheet {sheetIndex + 1} of {totalSheets}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSheetIndex((prev) => Math.max(0, prev - 1))}
              disabled={sheetIndex === 0}
              className="w-5 h-5 rounded bg-white border border-purple-200 text-purple-800 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center hover:bg-purple-50 text-xs font-bold cursor-pointer transition-colors shadow-2xs"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setSheetIndex((prev) => Math.min(totalSheets - 1, prev + 1))}
              disabled={sheetIndex === totalSheets - 1}
              className="w-5 h-5 rounded bg-white border border-purple-200 text-purple-800 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center hover:bg-purple-50 text-xs font-bold cursor-pointer transition-colors shadow-2xs"
            >
              ›
            </button>
          </div>
        </div>
      )}

      {/* Realistic Simulated Paper Sheet (White Paper with Margins) */}
      <div
        className={`bg-white border border-slate-300 shadow-md p-2 transition-all duration-300 flex items-center justify-center ${
          orientation === 'landscape'
            ? 'w-full max-w-[250px] aspect-[297/210]'
            : 'w-full max-w-[180px] aspect-[210/297]'
        }`}
        style={{
          filter: !color ? 'grayscale(100%) contrast(115%)' : 'none',
        }}
      >
        <div className={`w-full h-full grid gap-1.5 ${getGridClass()}`}>
          {Array.from({ length: totalSlots }).map((_, slotIdx) => {
            const img = currentSheetImages[slotIdx];

            if (img) {
              return (
                <div
                  key={img.id}
                  className="w-full h-full flex items-center justify-center p-0.5 overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={getResolvedUrl(img.fileUrl)}
                    alt=""
                    className="max-h-full max-w-full object-contain select-none"
                  />
                </div>
              );
            }

            return (
              <div
                key={`empty-${slotIdx}`}
                className="w-full h-full border border-dashed border-slate-200/90 rounded flex items-center justify-center bg-slate-50/20"
              >
                <span className="text-[7.5px] text-slate-300 font-medium select-none">
                  Blank
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Caption below sheet */}
      <div className="mt-2 text-center text-[10px] text-purple-800 font-semibold">
        A4 {orientation === 'landscape' ? 'Landscape' : 'Portrait'} • {grid === 1 ? '1 in 1' : `${grid} in 1`}
      </div>
    </div>
  );
};

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

  const isImageFile = (f: UploadedDocument) => {
    const ext = (f.fileName.split('.').pop() || '').toLowerCase();
    return (
      ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(ext) ||
      (f.mimeType?.startsWith('image/') ?? false)
    );
  };

  const imageFiles = files.filter(isImageFile);
  const otherFiles = files.filter((f) => !isImageFile(f));
  const hasImages = imageFiles.length > 0;

  // Single active open section (accordion behavior: opening one section closes the previous)
  const [openCardId, setOpenCardId] = useState<string | null>(
    hasImages ? '__photo_sheet__' : (files[0]?.id ?? null)
  );

  const toggleCard = (cardId: string) => {
    setOpenCardId((current) => (current === cardId ? null : cardId));
  };

  // Automatically ensure all uploaded images are marked as unified photo sheet
  useEffect(() => {
    if (hasImages && imageFiles.some((f) => !f.combineImages)) {
      const defaultGrid: 1 | 2 | 4 | 6 | 9 =
        imageFiles.length === 1 ? 1 : imageFiles.length <= 2 ? 2 : 4;
      onFilesChange(
        files.map((f) =>
          isImageFile(f)
            ? {
                ...f,
                combineImages: true,
                pagesPerSheet: f.combineImages ? (f.pagesPerSheet || defaultGrid) : defaultGrid,
                orientation: f.orientation || 'landscape',
              }
            : f
        )
      );
    }
  }, [hasImages, imageFiles, files, onFilesChange]);

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
        orientation: sourceFile.orientation,
      }))
    );
  };

  // Keep openCardId pointed to a valid section if files change
  useEffect(() => {
    if (hasImages) {
      if (openCardId !== '__photo_sheet__' && !otherFiles.some((f) => f.id === openCardId)) {
        setOpenCardId('__photo_sheet__');
      }
    } else {
      if (!files.some((f) => f.id === openCardId)) {
        setOpenCardId(files[0]?.id ?? null);
      }
    }
  }, [files, hasImages, otherFiles, openCardId]);

  // Helper to calculate sheets and cost for a single file
  const calculateFileCost = (file: UploadedDocument) => {
    const pagesPerSheet = file.pagesPerSheet || 1;
    const rawSheets = Math.ceil((file.pageCount || 1) / pagesPerSheet);
    const sheetsPerCopy = file.duplex ? Math.ceil(rawSheets / 2) : rawSheets;
    const rate = file.color ? pricePerColor : pricePerBw;
    const total = sheetsPerCopy * (file.copies || 1) * rate;
    return { rawSheets, sheetsPerCopy, rate, total };
  };

  // Photo sheet unified variables
  const photoSheetCopies = imageFiles[0]?.copies || 1;
  const photoSheetColor = imageFiles.some((f) => f.color !== false);
  const photoSheetOrientation: 'portrait' | 'landscape' =
    imageFiles[0]?.orientation || 'landscape';
  const photoSheetGrid: 1 | 2 | 4 | 6 | 9 =
    (imageFiles[0]?.pagesPerSheet as 1 | 2 | 4 | 6 | 9) ||
    (imageFiles.length === 1 ? 1 : imageFiles.length <= 2 ? 2 : 4);
  const photoSheetRawSheets = Math.max(1, Math.ceil(imageFiles.length / photoSheetGrid));
  const photoSheetDuplex = imageFiles[0]?.duplex ?? false;
  const photoSheetSheetsPerCopy = photoSheetDuplex ? Math.ceil(photoSheetRawSheets / 2) : photoSheetRawSheets;
  const photoSheetRate = photoSheetColor ? pricePerColor : pricePerBw;
  const photoSheetTotal = photoSheetSheetsPerCopy * photoSheetCopies * photoSheetRate;

  // Total print cost across all files
  let totalPrintCost = 0;
  let totalCopies = 0;
  let totalPhysicalSheets = 0;

  if (hasImages) {
    totalPrintCost += photoSheetTotal;
    totalCopies += photoSheetCopies;
    totalPhysicalSheets += photoSheetSheetsPerCopy * photoSheetCopies;

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

  const updatePhotoSheetSetting = (updates: Partial<UploadedDocument>) => {
    onFilesChange(
      files.map((f) => (isImageFile(f) ? { ...f, ...updates, combineImages: true } : f))
    );
  };

  const displayFiles = hasImages ? otherFiles : files;
  const totalCards = (hasImages ? 1 : 0) + otherFiles.length;
  const isPhotoSheetOpen = openCardId === '__photo_sheet__';

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

      {/* Multi-file Shortcut Toolbar (for multiple document files) */}
      {otherFiles.length > 1 && !hasImages && (
        <div className="bg-[#ecfeff] border border-[#a5f3fc] rounded-xl p-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-[#0e7490] font-medium">
            <Copy className="w-4 h-4 text-[#0e7490] shrink-0" />
            <span>{otherFiles.length} documents uploaded</span>
          </div>
          <button
            type="button"
            onClick={() => handleApplyToAll(otherFiles[0])}
            className="text-[11px] font-bold text-[#0e7490] hover:text-[#0891b2] underline cursor-pointer"
          >
            Apply Document 1 settings to all
          </button>
        </div>
      )}

      {/* Cards Header Bar (when more than 1 card exists) */}
      {totalCards > 1 && (
        <div className="flex items-center justify-between px-1 text-xs">
          <span className="font-bold text-slate-600">
            Document Settings • {totalCards} {totalCards === 1 ? 'section' : 'sections'}
          </span>
          <span className="text-[11px] text-slate-400 font-medium">
            Tap a card to configure
          </span>
        </div>
      )}

      {/* Per-File / Photo Sheet Settings Cards */}
      <div className="space-y-3">
        {/* UNIFIED SINGLE CONTROL CARD FOR PHOTO SHEET */}
        {hasImages && (
          <div className="figma-card overflow-hidden bg-white border border-purple-300 shadow-sm ring-1 ring-purple-400/20">
            {/* Header: Clickable toggle with single-accordion behavior */}
            <div
              onClick={() => toggleCard('__photo_sheet__')}
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
                      Photo Sheet
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                        photoSheetColor ? 'bg-purple-200 text-purple-800' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {photoSheetColor ? 'Color' : 'B&W'}
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-700">
                      {photoSheetOrientation === 'landscape' ? 'Landscape' : 'Portrait'}
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-700">
                      {photoSheetGrid === 1 ? '1 in 1' : `${photoSheetGrid} in 1`}
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-xs truncate">
                    {imageFiles.length === 1 ? 'Photo • 1 Image' : `Combined Sheet • ${imageFiles.length} Photos`}
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
              <div className="p-3.5 space-y-3.5 bg-white">
                {/* Header info */}
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-800">
                    {imageFiles.length === 1 ? 'Photo Print Preview' : `Photo Sheet Preview • ${imageFiles.length} Photos`}
                  </label>
                  <span className="text-[10px] text-purple-700 font-semibold px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200/80">
                    {photoSheetGrid === 1 ? '1 in 1' : `${photoSheetGrid} in 1`}
                  </span>
                </div>

                {/* Mini Photo Sheet Preview */}
                <MiniPhotoSheetPreview
                  images={imageFiles}
                  grid={photoSheetGrid}
                  orientation={photoSheetOrientation}
                  color={photoSheetColor}
                />

                {/* Photo Sheet Settings List */}
                <div className="space-y-2 pt-1">
                  {/* 1. Sheet Orientation Dropdown */}
                  <DropdownRow
                    label="Orientation"
                    value={photoSheetOrientation}
                    onChange={(val) => updatePhotoSheetSetting({ orientation: val as 'portrait' | 'landscape' })}
                    options={[
                      { value: 'landscape', label: 'Landscape' },
                      { value: 'portrait', label: 'Portrait' },
                    ]}
                    icon={<FileText className="w-3.5 h-3.5 text-purple-700" />}
                    iconBgClass="bg-purple-100 text-purple-700"
                  />

                  {/* 2. Grid Layout Dropdown */}
                  <DropdownRow
                    label="Grid Layout"
                    value={photoSheetGrid}
                    onChange={(val) => updatePhotoSheetSetting({ pagesPerSheet: Number(val) as 1 | 2 | 4 | 6 | 9 })}
                    options={[
                      { value: 1, label: '1 in 1' },
                      { value: 2, label: '2 in 1' },
                      { value: 4, label: '4 in 1' },
                      { value: 6, label: '6 in 1' },
                      { value: 9, label: '9 in 1' },
                    ]}
                    icon={<Layers className="w-3.5 h-3.5 text-purple-700" />}
                    iconBgClass="bg-purple-100 text-purple-700"
                  />

                  {/* 2b. Page Scaling Dropdown */}
                  <DropdownRow
                    label="Page Scaling"
                    value={imageFiles[0]?.pageFit || 'fit'}
                    onChange={(val) => updatePhotoSheetSetting({ pageFit: val as 'fit' | 'fill' })}
                    options={[
                      { value: 'fit', label: 'Fit to Page (With Margins)' },
                      { value: 'fill', label: 'Fill Entire Page (Poster / Borderless)' },
                    ]}
                    icon={<Layers className="w-3.5 h-3.5 text-purple-700" />}
                    iconBgClass="bg-purple-100 text-purple-700"
                  />

                  {/* 3. Print Mode Dropdown */}
                  <DropdownRow
                    label="Print Mode"
                    value={photoSheetColor ? 'color' : 'bw'}
                    onChange={(val) => updatePhotoSheetSetting({ color: val === 'color' })}
                    options={[
                      { value: 'color', label: `Full Color • ₹${pricePerColor}/sheet`, disabled: !isColorEnabled },
                      { value: 'bw', label: `Black & White • ₹${pricePerBw}/sheet`, disabled: !isBwEnabled },
                    ]}
                    icon={<Check className="w-3.5 h-3.5 text-purple-700" />}
                    iconBgClass="bg-purple-100 text-purple-700"
                  />

                  {/* 4. Sides Dropdown (when multi-sheet photo layout) */}
                  {photoSheetRawSheets > 1 && (
                    <DropdownRow
                      label="Sides"
                      value={photoSheetDuplex ? 'duplex' : 'simplex'}
                      onChange={(val) => updatePhotoSheetSetting({ duplex: val === 'duplex' })}
                      options={[
                        { value: 'simplex', label: 'Single-Sided' },
                        { value: 'duplex', label: 'Double-Sided' },
                      ]}
                      icon={<Layers className="w-3.5 h-3.5 text-purple-700" />}
                      iconBgClass="bg-purple-100 text-purple-700"
                    />
                  )}

                  {/* 5. Copies Stepper */}
                  <StepperRow
                    label="Copies"
                    sublabel={`${photoSheetSheetsPerCopy * photoSheetCopies} ${photoSheetSheetsPerCopy * photoSheetCopies === 1 ? 'sheet' : 'sheets'}`}
                    value={photoSheetCopies}
                    onChange={(val) => updatePhotoSheetSetting({ copies: val })}
                    icon={<Copy className="w-3.5 h-3.5 text-purple-700" />}
                    iconBgClass="bg-purple-100 text-purple-700"
                  />
                </div>

              {/* Photo Sheet Cost Calculation Footer */}
              <div className="pt-2 border-t border-purple-100 flex items-center justify-between text-[11px] text-purple-700">
                <span>
                  {photoSheetCopies} {photoSheetCopies === 1 ? 'copy' : 'copies'} × {photoSheetSheetsPerCopy}{' '}
                  {photoSheetSheetsPerCopy === 1 ? 'sheet' : 'sheets'} • ₹{photoSheetRate}/sheet
                </span>
                <strong className="text-purple-950 font-bold text-xs">
                  ₹{photoSheetTotal.toFixed(2)}
                </strong>
              </div>
            </div>
            )}
          </div>
        )}

        {/* Individual Cards: Either for otherFiles (when combined) or for all files (when not combined) */}
        {displayFiles.map((item) => {
          const originalIndex = files.findIndex((f) => f.id === item.id);
          const { sheetsPerCopy, rate, total } = calculateFileCost(item);
          const isExpanded = openCardId === item.id;

          return (
            <div
              key={item.id}
              className={`figma-card overflow-hidden transition-all bg-white border ${
                isExpanded ? 'border-[#0e7490] ring-1 ring-[#0e7490]/20' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Card Header (Clickable toggle with single-accordion behavior) */}
              <div
                onClick={() => toggleCard(item.id)}
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
                <div className="p-3.5 space-y-2 bg-white">
                  {/* 1. Print Mode Dropdown */}
                  <DropdownRow
                    label="Print Mode"
                    value={item.color ? 'color' : 'bw'}
                    onChange={(val) => updateFileSetting(item.id, { color: val === 'color' })}
                    options={[
                      { value: 'bw', label: `Black & White • ₹${pricePerBw}/sheet`, disabled: !isBwEnabled },
                      { value: 'color', label: `Full Color • ₹${pricePerColor}/sheet`, disabled: !isColorEnabled },
                    ]}
                    icon={<Check className="w-3.5 h-3.5 text-[#0e7490]" />}
                  />

                  {/* 2. Sides Dropdown */}
                  <DropdownRow
                    label="Sides"
                    value={item.duplex ? 'duplex' : 'simplex'}
                    onChange={(val) => updateFileSetting(item.id, { duplex: val === 'duplex' })}
                    options={[
                      { value: 'simplex', label: 'Single-Sided' },
                      { value: 'duplex', label: 'Double-Sided' },
                    ]}
                    icon={<Layers className="w-3.5 h-3.5 text-[#0e7490]" />}
                  />

                  {/* 3. Orientation Dropdown */}
                  <DropdownRow
                    label="Orientation"
                    value={item.orientation || (isImageFile(item) ? 'landscape' : 'portrait')}
                    onChange={(val) => updateFileSetting(item.id, { orientation: val as 'portrait' | 'landscape' })}
                    options={[
                      { value: 'portrait', label: 'Portrait' },
                      { value: 'landscape', label: 'Landscape' },
                    ]}
                    icon={<FileText className="w-3.5 h-3.5 text-[#0e7490]" />}
                  />

                  {/* 4. Layout Grid Dropdown */}
                  <DropdownRow
                    label="Layout Grid"
                    value={item.pagesPerSheet || 1}
                    onChange={(val) => {
                      const gridNum = Number(val) as 1 | 2 | 4 | 6 | 9;
                      updateFileSetting(item.id, { pagesPerSheet: gridNum });
                    }}
                    options={[
                      { value: 1, label: '1 Page per Sheet' },
                      { value: 2, label: '2 in 1' },
                      { value: 4, label: '4 in 1' },
                      { value: 6, label: '6 in 1' },
                      { value: 9, label: '9 in 1' },
                    ]}
                    icon={<Layers className="w-3.5 h-3.5 text-[#0e7490]" />}
                  />

                  {/* 4b. Page Scaling Dropdown */}
                  <DropdownRow
                    label="Page Scaling"
                    value={item.pageFit || 'fit'}
                    onChange={(val) => updateFileSetting(item.id, { pageFit: val as 'fit' | 'fill' })}
                    options={[
                      { value: 'fit', label: 'Fit to Page (With Margins)' },
                      { value: 'fill', label: 'Fill Entire Page (Poster / Borderless)' },
                    ]}
                    icon={<Layers className="w-3.5 h-3.5 text-[#0e7490]" />}
                  />

                  {/* 5. Copies Stepper */}
                  <StepperRow
                    label="Copies"
                    sublabel={`${sheetsPerCopy * (item.copies || 1)} ${sheetsPerCopy * (item.copies || 1) === 1 ? 'sheet' : 'sheets'}`}
                    value={item.copies || 1}
                    onChange={(val) => updateFileSetting(item.id, { copies: val })}
                    icon={<Copy className="w-3.5 h-3.5 text-[#0e7490]" />}
                  />

                  {/* File Cost Calculation Footer */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {item.copies} {item.copies === 1 ? 'copy' : 'copies'} × {sheetsPerCopy}{' '}
                      {sheetsPerCopy === 1 ? 'sheet' : 'sheets'} • ₹{rate}/page
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
        label="Total"
        value={`₹${grandTotal.toFixed(2)}`}
        buttonText={`Review Preview • ${totalCopies} ${totalCopies === 1 ? 'copy' : 'copies'}`}
        onButtonClick={onProceed}
      />
    </div>
  );
};
