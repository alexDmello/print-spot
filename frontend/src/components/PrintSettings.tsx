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

  // Track expanded cards on mobile (default: all expanded or first expanded)
  const [expandedFileId, setExpandedFileId] = useState<string | null>(files[0]?.id || null);

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
  const isCombinedImages = imageFiles.length > 1 && !!files[0]?.combineImages;

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
    const grid = imageFiles[0]?.pagesPerSheet || 6;
    const copies = imageFiles[0]?.copies || 1;
    const isColor = imageFiles.some((f) => f.color);
    const rate = isColor ? pricePerColor : pricePerBw;
    const rawSheets = Math.ceil(imageFiles.length / grid);
    const sheetsPerCopy = imageFiles[0]?.duplex ? Math.ceil(rawSheets / 2) : rawSheets;
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
          Set copies and options for each file individually (e.g. 1 copy of File 1, multiple copies of File 2).
        </p>
      </div>

      {/* Multi-file Shortcut Toolbar */}
      {files.length > 1 && (
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

      {/* Multi-Image Combine Option (e.g. 6 or 9 images on 1 sheet) */}
      {imageFiles.length > 1 && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-3 flex items-center justify-between shadow-2xs">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
              <ImageIcon className="w-4 h-4 text-purple-600 shrink-0" />
              <span>Multi-Image Photo Sheet</span>
            </div>
            <p className="text-[11px] text-purple-700">
              {isCombinedImages
                ? `Fitting ${imageFiles.length} images onto shared sheet(s) (${imageFiles[0]?.pagesPerSheet || 6} in 1)`
                : `Combine ${imageFiles.length} images into a single sheet (e.g. 6 or 9 images in 1)`}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleCombineImages}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              isCombinedImages
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-white border border-purple-300 text-purple-700 hover:bg-purple-100/50'
            }`}
          >
            {isCombinedImages ? 'Combined ✓' : 'Fit on 1 Sheet'}
          </button>
        </div>
      )}

      {/* Per-File Settings Cards */}
      <div className="space-y-3">
        {files.map((item, index) => {
          const { sheetsPerCopy, rate, total } = calculateFileCost(item);
          const isExpanded = files.length === 1 || expandedFileId === item.id;

          return (
            <div
              key={item.id}
              className={`figma-card overflow-hidden transition-all bg-white border ${
                isExpanded ? 'border-[#0e7490] ring-1 ring-[#0e7490]/20' : 'border-slate-200'
              }`}
            >
              {/* Card Header (Accordion toggle when multiple files) */}
              <div
                onClick={() =>
                  files.length > 1 &&
                  setExpandedFileId(expandedFileId === item.id ? null : item.id)
                }
                className={`p-3.5 flex items-center justify-between cursor-pointer bg-slate-50/70 border-b ${
                  isExpanded ? 'border-slate-200' : 'border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                    {getFileIcon(item.fileName, item.mimeType)}
                  </div>
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#0e7490]">
                        File {index + 1}
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
                  {files.length > 1 && (
                    <div className="text-slate-400">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  )}
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
                            updateFileSetting(item.id, { pagesPerSheet: gridNum });
                            if (isCombinedImages && isImageFile(item)) {
                              onFilesChange(
                                files.map((f) =>
                                  isImageFile(f) ? { ...f, pagesPerSheet: gridNum } : f
                                )
                              );
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
