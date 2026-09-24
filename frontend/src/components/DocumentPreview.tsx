'use client';

import React, { useState, useEffect, useRef } from 'react';
import { UploadedDocument } from '@/lib/types';
import { MobileBottomCta } from './MobileBottomCta';
import {
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  FileCode,
  RotateCw,
  File,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface DocumentPreviewProps {
  files: UploadedDocument[];
  totalPrice: number;
  onProceed: () => void;
  onGridChange?: (fileId: string, grid: 1 | 2 | 4 | 6 | 9) => void;
  onOrientationChange?: (fileId: string, orientation: 'portrait' | 'landscape') => void;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  files,
  totalPrice,
  onProceed,
  onGridChange,
  onOrientationChange,
}) => {
  const isImageFile = (f: UploadedDocument) => {
    const fileExt = (f.fileName.split('.').pop() || '').toLowerCase();
    return (
      ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(fileExt) ||
      (f.mimeType?.startsWith('image/') ?? false)
    );
  };

  const imageFiles = files.filter(isImageFile);
  const otherFiles = files.filter((f) => !isImageFile(f));
  const isCombinedImages = imageFiles.length > 1 && imageFiles.some((f) => f.combineImages);

  const [selectedFileId, setSelectedFileId] = useState<string>(
    isCombinedImages ? '__photo_sheet__' : files[0]?.id || ''
  );
  const [selectedPage, setSelectedPage] = useState(1);
  const [pdfViewMode, setPdfViewMode] = useState<'canvas' | 'native'>('canvas');

  // If combined images is active, determine if inspecting Photo Sheet or another document (e.g. PDF)
  const isPreviewingPhotoSheet = isCombinedImages && (
    selectedFileId === '__photo_sheet__' ||
    imageFiles.some((img) => img.id === selectedFileId) ||
    !otherFiles.some((doc) => doc.id === selectedFileId)
  );

  // Active file being previewed
  const activeFile = isPreviewingPhotoSheet
    ? imageFiles[0]
    : files.find((f) => f.id === selectedFileId) || otherFiles[0] || files[0];
  const activeFileIndex = files.findIndex((f) => f.id === activeFile?.id);

  // Parsed content states for non-image formats
  const [wordHtml, setWordHtml] = useState<string | null>(null);
  const [excelData, setExcelData] = useState<{ sheetName: string; rows: any[][] } | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  // PDF.js Canvas state
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const renderTasksRef = useRef<any[]>([]);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  const fileName = activeFile?.fileName || '';
  const fileUrl = activeFile?.fileUrl || '';
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const isPdf = !isPreviewingPhotoSheet && (ext === 'pdf' || activeFile?.mimeType === 'application/pdf');
  const isImage = isPreviewingPhotoSheet || (
    ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(ext) ||
    (activeFile?.mimeType?.startsWith('image/') ?? false)
  );
  const isSpreadsheet = !isPreviewingPhotoSheet && ['xls', 'xlsx', 'csv'].includes(ext);
  const isWordDoc = !isPreviewingPhotoSheet && ['doc', 'docx'].includes(ext);
  const isCodeOrText = !isPreviewingPhotoSheet && ['txt', 'md', 'json', 'js', 'py', 'ts', 'log', 'html'].includes(ext);

  // For images and combined photo sheet, default orientation is 'landscape'
  const defaultOrientation: 'portrait' | 'landscape' =
    activeFile?.orientation || (isImage || isPreviewingPhotoSheet ? 'landscape' : 'portrait');

  const [localOrientation, setLocalOrientation] = useState<'portrait' | 'landscape'>(defaultOrientation);

  useEffect(() => {
    setLocalOrientation(
      activeFile?.orientation || (isImage || isPreviewingPhotoSheet ? 'landscape' : 'portrait')
    );
  }, [activeFile?.id, activeFile?.orientation, isImage, isPreviewingPhotoSheet]);

  const handleOrientationToggle = (orient: 'portrait' | 'landscape') => {
    setLocalOrientation(orient);
    if (onOrientationChange && activeFile) {
      onOrientationChange(activeFile.id, orient);
    }
  };

  // Normalize URL to same-origin path to prevent CORS/iframe cross-origin issues
  const getResolvedUrl = (url?: string) => {
    if (!url) return '';
    const match = url.match(/\/uploads\/[^?#]+/);
    if (match) return match[0];
    return url;
  };

  const resolvedUrl = getResolvedUrl(fileUrl);

  const currentGrid = isPreviewingPhotoSheet
    ? (imageFiles.find((f) => f.pagesPerSheet && f.pagesPerSheet > 1)?.pagesPerSheet || imageFiles[0]?.pagesPerSheet || 4)
    : (activeFile?.pagesPerSheet || 1);

  // Calculate physical sheets required for Photo Sheet (e.g. 10 photos on 9-in-1 = 2 sheets)
  const photoSheetPages = Math.max(1, Math.ceil(imageFiles.length / currentGrid));

  const effectivePageCount = isPreviewingPhotoSheet
    ? photoSheetPages
    : (isPdf && pdfDoc?.numPages)
    ? pdfDoc.numPages
    : (activeFile?.pageCount || 1);

  // Color mode detection for Photo Sheet vs standalone document
  const isPhotoSheetColor = imageFiles.some((f) => f.color !== false);
  const isCurrentItemColor = isPreviewingPhotoSheet ? isPhotoSheetColor : !!activeFile?.color;

  // Proportional grid layouts on A4 paper sheet adapting to Portrait vs Landscape
  const getGridClass = (grid: number, orientation: 'portrait' | 'landscape') => {
    if (orientation === 'landscape') {
      switch (grid) {
        case 2:
          return 'grid-cols-2 grid-rows-1'; // 2 side-by-side halves on wide A4
        case 4:
          return 'grid-cols-2 grid-rows-2'; // 2x2 quadrants
        case 6:
          return 'grid-cols-3 grid-rows-2'; // 3 across, 2 down on wide A4
        case 9:
          return 'grid-cols-3 grid-rows-3'; // 3 across, 3 down
        default:
          return 'grid-cols-1 grid-rows-1';
      }
    } else {
      switch (grid) {
        case 2:
          return 'grid-cols-1 grid-rows-2'; // 2 stacked halves on portrait A4
        case 4:
          return 'grid-cols-2 grid-rows-2'; // 2x2 quadrants
        case 6:
          return 'grid-cols-2 grid-rows-3'; // 2 across, 3 down on portrait A4
        case 9:
          return 'grid-cols-3 grid-rows-3'; // 3 across, 3 down
        default:
          return 'grid-cols-1 grid-rows-1';
      }
    }
  };

  // Reset page when switching files
  useEffect(() => {
    setSelectedPage(1);
    setPdfDoc(null);
    setWordHtml(null);
    setExcelData(null);
    setTextContent(null);
  }, [selectedFileId]);

  // Load Real Content for Word, Excel, and Text files
  useEffect(() => {
    if (!resolvedUrl) return;

    let isMounted = true;

    async function loadRealContent() {
      setIsLoadingContent(true);

      try {
        if (isWordDoc && ext === 'docx') {
          const res = await fetch(resolvedUrl);
          const arrayBuffer = await res.arrayBuffer();
          const mammoth = (await import('mammoth')).default;
          const result = await mammoth.convertToHtml({ arrayBuffer });
          if (isMounted) setWordHtml(result.value || '<p>No text content found in document.</p>');
        } else if (isSpreadsheet && (ext === 'xlsx' || ext === 'xls')) {
          const res = await fetch(resolvedUrl);
          const arrayBuffer = await res.arrayBuffer();
          const XLSX = await import('xlsx');
          const wb = XLSX.read(arrayBuffer, { type: 'array' });
          const firstSheetName = wb.SheetNames[0] || 'Sheet1';
          const worksheet = wb.Sheets[firstSheetName];
          const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          if (isMounted) {
            setExcelData({
              sheetName: firstSheetName,
              rows: rows.slice(0, 30),
            });
          }
        } else if (isCodeOrText || ext === 'csv') {
          const res = await fetch(resolvedUrl);
          const text = await res.text();
          if (isMounted) setTextContent(text.slice(0, 8000));
        }
      } catch (err: any) {
        console.warn('Error loading real document content:', err);
      } finally {
        if (isMounted) setIsLoadingContent(false);
      }
    }

    if (isWordDoc || isSpreadsheet || isCodeOrText) {
      loadRealContent();
    }

    return () => {
      isMounted = false;
    };
  }, [resolvedUrl, isWordDoc, isSpreadsheet, isCodeOrText, ext]);

  // Load PDF.js for Canvas Rendering
  useEffect(() => {
    if (!isPdf || !resolvedUrl) return;

    let isMounted = true;

    async function loadPdfWithPdfJs() {
      setIsPdfLoading(true);
      try {
        const pdfjs = await import('pdfjs-dist');
        const pdfjsLib: any = (pdfjs as any).default || pdfjs;
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

        const res = await fetch(resolvedUrl);
        const arrayBuffer = await res.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const doc = await loadingTask.promise;
        if (isMounted) {
          setPdfDoc(doc);
          setPdfViewMode('canvas');
        }
      } catch (err) {
        console.warn('PDF.js loading failed, falling back to native iframe viewer:', err);
        if (isMounted) setPdfViewMode('native');
      } finally {
        if (isMounted) setIsPdfLoading(false);
      }
    }

    loadPdfWithPdfJs();

    return () => {
      isMounted = false;
    };
  }, [isPdf, resolvedUrl]);

  // Render PDF.js page onto Canvas
  useEffect(() => {
    if (!pdfDoc) return;

    async function renderPages() {
      renderTasksRef.current.forEach((t) => {
        try {
          t.cancel();
        } catch {}
      });
      renderTasksRef.current = [];

      const totalPgs = pdfDoc.numPages || activeFile?.pageCount || 1;
      const slots =
        currentGrid === 1
          ? [selectedPage]
          : Array.from({ length: currentGrid }).map((_, idx) => Math.min(idx + 1, totalPgs));

      for (let i = 0; i < slots.length; i++) {
        const pgNum = slots[i];
        const canvas = canvasRefs.current[i];
        if (!canvas) continue;

        try {
          const page = await pdfDoc.getPage(pgNum);
          const scale = currentGrid === 1 ? 1.4 : 0.8;
          const viewport = page.getViewport({ scale });
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const task = page.render({ canvasContext: ctx, viewport });
            renderTasksRef.current.push(task);
            await task.promise;
          }
        } catch (e: any) {
          if (e?.name !== 'RenderingCancelledException') {
            console.warn(`Error rendering PDF page ${pgNum}:`, e);
          }
        }
      }
    }

    if (pdfViewMode === 'canvas' || currentGrid > 1) {
      renderPages();
    }
  }, [pdfDoc, selectedPage, currentGrid, pdfViewMode, activeFile?.pageCount]);

  // Dynamic filter style for Black & White simulation
  const colorFilterStyle: React.CSSProperties = {
    filter: !isCurrentItemColor ? 'grayscale(100%) contrast(120%)' : 'none',
  };

  if (!activeFile) {
    return null;
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-3 pb-24">
      {/* Title Section */}
      <div className="space-y-0.5 pt-1">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          Document Preview
        </h1>
        <p className="text-xs text-slate-500">
          Verify formatting and content fidelity before sending to hardware printer.
        </p>
      </div>

      {/* Document / Photo Sheet Switcher Tabs */}
      {((isCombinedImages && otherFiles.length > 0) || (!isCombinedImages && files.length > 1)) && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold px-0.5">
            <span>Select Item to Inspect:</span>
            <span>
              {isCombinedImages
                ? `1 Photo Sheet + ${otherFiles.length} document(s)`
                : `${files.length} files queued`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {/* If combined images, first tab is the Photo Sheet */}
            {isCombinedImages && (
              <button
                type="button"
                onClick={() => setSelectedFileId('__photo_sheet__')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                  isPreviewingPhotoSheet
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'bg-white border border-purple-200 text-purple-800 hover:bg-purple-50'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Photo Sheet ({imageFiles.length} Photos)</span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                    isPreviewingPhotoSheet ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-700'
                  }`}
                >
                  {photoSheetPages} {photoSheetPages === 1 ? 'A4 sheet' : 'A4 sheets'}
                </span>
              </button>
            )}

            {/* Other files (or all files if not combined) */}
            {(isCombinedImages ? otherFiles : files).map((f, idx) => {
              const isSelected = !isPreviewingPhotoSheet && f.id === activeFile.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedFileId(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-[#0e7490] text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <span className="truncate max-w-[130px]">
                    {isCombinedImages ? f.fileName : `${idx + 1}. ${f.fileName}`}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {f.copies} {f.copies === 1 ? 'copy' : 'copies'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Document Preview Card */}
      <div className="figma-card p-4 space-y-3 bg-white border border-slate-200 shadow-2xs">
        {/* Document Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-xs font-bold text-slate-900 truncate max-w-[170px]">
              {isPreviewingPhotoSheet ? `Photo Sheet (${imageFiles.length} Photos)` : fileName}
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                isCurrentItemColor
                  ? 'bg-purple-50 text-purple-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {isCurrentItemColor ? 'Color' : 'Grayscale'}
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
              {isPreviewingPhotoSheet ? imageFiles[0]?.copies || 1 : activeFile.copies}{' '}
              {(isPreviewingPhotoSheet ? imageFiles[0]?.copies || 1 : activeFile.copies) === 1 ? 'copy' : 'copies'}
            </span>
          </div>
        </div>

        {/* View Mode & Page Navigation Header */}
        <div className="flex items-center justify-between text-[11px] pb-0.5">
          {/* TWO ARROWS: Shown if effectivePageCount > 1 */}
          {effectivePageCount > 1 ? (
            <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg">
              <button
                type="button"
                disabled={selectedPage <= 1}
                onClick={() => setSelectedPage((p) => Math.max(1, p - 1))}
                className="p-1 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-2xs transition-colors"
                title="Previous Page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <span className="text-slate-800 font-bold text-xs px-1">
                Page {selectedPage} of {effectivePageCount}
              </span>

              <button
                type="button"
                disabled={selectedPage >= effectivePageCount}
                onClick={() => setSelectedPage((p) => Math.min(effectivePageCount, p + 1))}
                className="p-1 rounded-md bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed shadow-2xs transition-colors"
                title="Next Page"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <span className="text-slate-500 font-medium text-[11px]">
              {isPreviewingPhotoSheet ? '1 A4 Sheet' : 'Single Page Document'}
            </span>
          )}

          {/* PDF View Mode Switcher */}
          {isPdf && currentGrid === 1 && (
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md">
              <button
                type="button"
                onClick={() => setPdfViewMode('canvas')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  pdfViewMode === 'canvas'
                    ? 'bg-white text-[#0e7490] shadow-2xs font-extrabold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Canvas Spool
              </button>
              <button
                type="button"
                onClick={() => setPdfViewMode('native')}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  pdfViewMode === 'native'
                    ? 'bg-white text-[#0e7490] shadow-2xs font-extrabold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Native PDF
              </button>
            </div>
          )}
        </div>

        {/* PHYSICAL A4 PAPER SHEET CONTAINER (Adapts to Portrait 210x297 mm or Landscape 297x210 mm) */}
        <div className="bg-slate-200/60 p-2.5 sm:p-4 rounded-2xl flex flex-col items-center justify-center border border-slate-200/80 shadow-inner">
          {/* Header indicator & Orientation Switcher above paper */}
          <div className={`w-full ${localOrientation === 'landscape' ? 'max-w-[420px] sm:max-w-[460px]' : 'max-w-[340px] sm:max-w-[365px]'} flex items-center justify-between pb-1.5 text-[10px] text-slate-500 font-semibold mb-1`}>
            <div className="flex items-center gap-1.5 font-bold text-slate-700">
              <FileText className="w-3.5 h-3.5 text-[#0e7490]" />
              <span>
                {localOrientation === 'landscape' ? 'A4 Landscape (297 × 210 mm)' : 'A4 Portrait (210 × 297 mm)'}
              </span>
              <span className="text-[9px] bg-white px-1.5 py-0.2 rounded border border-slate-300 font-bold text-slate-600 uppercase ml-1">
                {isCombinedImages ? `${currentGrid}-in-1 Grid` : currentGrid === 1 ? 'Full Page' : `${currentGrid}-in-1 Grid`}
              </span>
            </div>

            {/* Quick Orientation Switcher */}
            <div className="flex items-center gap-0.5 bg-white p-0.5 rounded-lg border border-slate-300 shadow-2xs">
              <button
                type="button"
                onClick={() => handleOrientationToggle('portrait')}
                className={`px-2 py-0.5 rounded text-[9.5px] font-bold transition-all cursor-pointer ${
                  localOrientation === 'portrait'
                    ? 'bg-[#0e7490] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Switch to Portrait"
              >
                Portrait
              </button>
              <button
                type="button"
                onClick={() => handleOrientationToggle('landscape')}
                className={`px-2 py-0.5 rounded text-[9.5px] font-bold transition-all cursor-pointer ${
                  localOrientation === 'landscape'
                    ? 'bg-[#0e7490] text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Switch to Landscape (Recommended for photos)"
              >
                Landscape
              </button>
            </div>
          </div>

          {/* PHYSICAL A4 PAPER: STRICTLY NON-ROUNDED (SHARP 90° CUT), EXACT 210:297 OR 297:210 RATIO */}
          <div
            style={{
              aspectRatio: localOrientation === 'landscape' ? '297 / 210' : '210 / 297',
              ...colorFilterStyle,
            }}
            className={`w-full ${
              localOrientation === 'landscape' ? 'max-w-[420px] sm:max-w-[460px]' : 'max-w-[340px] sm:max-w-[365px]'
            } bg-white rounded-none border border-slate-300 shadow-xl shadow-slate-900/10 p-2 sm:p-2.5 transition-all relative flex flex-col justify-between select-none overflow-hidden`}
          >
            {/* 1. PDF DOCUMENT RENDERING */}
            {isPdf && (
              <div className="h-full w-full overflow-hidden flex flex-col">
                {currentGrid === 1 ? (
                  pdfViewMode === 'native' ? (
                    <div className="w-full h-full bg-white rounded-none overflow-hidden">
                      <object
                        data={`${resolvedUrl}#page=${selectedPage}&toolbar=0&navpanes=0`}
                        type="application/pdf"
                        className="w-full h-full border-0 rounded-none"
                      >
                        <iframe
                          src={`${resolvedUrl}#page=${selectedPage}&toolbar=0&navpanes=0`}
                          className="w-full h-full border-0 rounded-none"
                          title={fileName}
                        />
                      </object>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-white overflow-hidden p-1">
                      {isPdfLoading ? (
                        <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
                          <RotateCw className="w-6 h-6 animate-spin text-[#0e7490]" />
                          <span className="text-xs font-semibold">
                            Rendering A4 page {selectedPage}...
                          </span>
                        </div>
                      ) : (
                        <canvas
                          ref={(el) => {
                            canvasRefs.current[0] = el;
                          }}
                          className="max-w-full max-h-full object-contain shadow-2xs rounded-none border border-slate-200 bg-white"
                        />
                      )}
                    </div>
                  )
                ) : (
                  /* Multi-Page Grid (2, 4, 6, 9 in 1) using PDF.js inside A4 */
                  <div className={`grid ${getGridClass(currentGrid, localOrientation)} gap-1.5 w-full h-full`}>
                    {Array.from({ length: currentGrid }).map((_, idx) => (
                      <div
                        key={idx}
                        className="border border-dashed border-slate-300 p-1 flex flex-col items-center justify-between bg-slate-50 overflow-hidden h-full w-full"
                      >
                        <span className="text-[8px] font-bold text-slate-400 self-start">
                          Slot {idx + 1} (Pg {Math.min(idx + 1, effectivePageCount)})
                        </span>
                        <div className="flex-1 min-h-0 w-full flex items-center justify-center p-0.5 overflow-hidden">
                          <canvas
                            ref={(el) => {
                              canvasRefs.current[idx] = el;
                            }}
                            className="max-w-full max-h-full object-contain shadow-2xs border border-slate-200 bg-white"
                          />
                        </div>
                        <span className="text-[7px] text-slate-400">Print Area</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 2. IMAGE RENDERING (Clean physical print appearance without text overlays) */}
            {isImage && (
              <div className="h-full w-full overflow-hidden flex flex-col">
                {currentGrid === 1 && !isCombinedImages ? (
                  <div className="w-full h-full bg-white flex items-center justify-center p-1 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolvedUrl}
                      alt=""
                      className="max-h-full max-w-full object-contain select-none shadow-none"
                    />
                  </div>
                ) : (
                  /* Multi-Image Grid (2, 4, 6, 9 in 1) arranged on A4 sheet */
                  <div className={`grid ${getGridClass(currentGrid, localOrientation)} gap-1.5 w-full h-full`}>
                    {Array.from({ length: currentGrid }).map((_, idx) => {
                      const itemIndex = isPreviewingPhotoSheet
                        ? (selectedPage - 1) * currentGrid + idx
                        : isCombinedImages
                        ? (selectedPage - 1) * currentGrid + idx
                        : idx;

                      const currentImg = (isPreviewingPhotoSheet || isCombinedImages)
                        ? imageFiles[itemIndex]
                        : idx === 0
                        ? activeFile
                        : null;

                      if (currentImg) {
                        const imgUrl = getResolvedUrl(currentImg.fileUrl);
                        return (
                          <div
                            key={idx}
                            className="bg-white flex items-center justify-center p-0.5 overflow-hidden h-full w-full relative"
                          >
                            {/* Clean image display with zero text overlay */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imgUrl}
                              alt=""
                              className="max-h-full max-w-full object-contain select-none"
                            />
                          </div>
                        );
                      }

                      // Empty Spot - Unfilled area on paper, clean with subtle guide
                      return (
                        <div
                          key={idx}
                          className="border border-dashed border-slate-200/90 bg-slate-50/20 p-1 flex items-center justify-center select-none h-full w-full"
                        >
                          <span className="text-[7.5px] text-slate-300 font-medium select-none">Blank Area</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 3. WORD DOCUMENT (.DOCX) RENDERING */}
            {isWordDoc && (
              <div className="w-full h-full bg-white p-3 sm:p-4 overflow-y-auto text-left shadow-inner">
                {isLoadingContent ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                    <RotateCw className="w-6 h-6 animate-spin text-[#0e7490]" />
                    <span className="text-xs">Parsing Word formatting...</span>
                  </div>
                ) : wordHtml ? (
                  <div
                    className="prose prose-sm max-w-none text-slate-800 text-[11px] leading-relaxed space-y-1.5"
                    dangerouslySetInnerHTML={{ __html: wordHtml }}
                  />
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-bold text-slate-700">Word Document Ready</p>
                    <p>{fileName}</p>
                  </div>
                )}
              </div>
            )}

            {/* 4. EXCEL SPREADSHEET RENDERING */}
            {isSpreadsheet && (
              <div className="w-full h-full bg-white overflow-auto text-left shadow-inner text-[10px]">
                {isLoadingContent ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                    <RotateCw className="w-6 h-6 animate-spin text-[#0e7490]" />
                    <span className="text-xs">Extracting worksheet rows...</span>
                  </div>
                ) : excelData && excelData.rows.length > 0 ? (
                  <div className="font-mono text-[10px]">
                    <div className="bg-emerald-100 text-emerald-900 px-2 py-1 font-bold text-[9px] flex items-center justify-between border-b border-emerald-200">
                      <span>Worksheet: {excelData.sheetName}</span>
                      <span>{excelData.rows.length} rows</span>
                    </div>
                    <table className="w-full border-collapse">
                      <tbody>
                        {excelData.rows.map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className={rIdx === 0 ? 'bg-slate-100 font-bold border-b border-slate-300' : 'border-b border-slate-100'}
                          >
                            <td className="px-1.5 py-0.5 text-slate-400 text-[8px] bg-slate-50 border-r border-slate-200 w-6 select-none text-center">
                              {rIdx + 1}
                            </td>
                            {row.map((cell: any, cIdx: number) => (
                              <td key={cIdx} className="px-2 py-0.5 text-slate-800 border-r border-slate-100 truncate max-w-[120px]">
                                {String(cell ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-bold text-slate-700">Spreadsheet Ready</p>
                    <p>{fileName}</p>
                  </div>
                )}
              </div>
            )}

            {/* 5. TEXT / CODE RENDERING */}
            {isCodeOrText && (
              <div className="w-full h-full bg-slate-900 text-slate-200 p-2.5 overflow-auto font-mono text-[10px] text-left">
                <div className="text-slate-400 text-[9px] pb-1 mb-1.5 border-b border-slate-800 flex items-center justify-between">
                  <span>{fileName}</span>
                  <span>ASCII / UTF-8</span>
                </div>
                <pre className="whitespace-pre-wrap leading-relaxed">{textContent || 'Loading content...'}</pre>
              </div>
            )}

            {/* 6. PRESENTATION OR OTHER UNRECOGNIZED FILE */}
            {!isPdf && !isImage && !isWordDoc && !isSpreadsheet && !isCodeOrText && (
              <div className="w-full h-full bg-white rounded-none p-6 text-center flex flex-col items-center justify-center space-y-2">
                <File className="w-8 h-8 text-[#0e7490]" />
                <h4 className="font-bold text-slate-900 text-xs">{fileName}</h4>
                <p className="text-[10px] text-slate-500 max-w-[220px]">
                  Universal binary file queued for hardware spooling. Document format preserved.
                </p>
              </div>
            )}
          </div>

          {/* Paper scale caption */}
          <div className="w-full max-w-[340px] sm:max-w-[365px] text-center pt-2 text-[10px] text-slate-400 font-medium">
            Scale-accurate print simulation on standard 80 GSM A4 paper
          </div>
        </div>

        {/* Footer info: File details & format */}
        <div className="flex items-center justify-between pt-1 text-xs">
          <span className="text-slate-400 text-[11px]">
            {isCombinedImages ? (
              <>
                Layout: <strong className="text-slate-700">{imageFiles.length} Photos in {currentGrid}-in-1 Grid</strong> • 1 A4 Sheet
              </>
            ) : (
              <>
                Format: <strong className="text-slate-700 uppercase">{ext || 'Document'}</strong> • {effectivePageCount} {effectivePageCount === 1 ? 'page' : 'pages'}
              </>
            )}
          </span>
          <span className="text-slate-500 text-[11px] font-medium">
            Copies to print: <strong className="text-[#0e7490]">{activeFile.copies}</strong>
          </span>
        </div>
      </div>

      {/* Sticky Bottom CTA */}
      <MobileBottomCta
        label="Total (incl. tax)"
        value={`₹${totalPrice.toFixed(2)}`}
        buttonText="Proceed to Pay"
        onButtonClick={onProceed}
      />
    </div>
  );
};
