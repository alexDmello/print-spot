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
  onGridChange?: (fileId: string, grid: 1 | 2 | 4 | 6) => void;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  files,
  totalPrice,
  onProceed,
  onGridChange,
}) => {
  const [selectedFileId, setSelectedFileId] = useState<string>(files[0]?.id || '');
  const [selectedPage, setSelectedPage] = useState(1);
  const [pdfViewMode, setPdfViewMode] = useState<'canvas' | 'native'>('canvas');

  // Active file being previewed
  const activeFile = files.find((f) => f.id === selectedFileId) || files[0];
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
  const isPdf = ext === 'pdf' || activeFile?.mimeType === 'application/pdf';
  const isImage =
    ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(ext) ||
    activeFile?.mimeType?.startsWith('image/');
  const isSpreadsheet = ['xls', 'xlsx', 'csv'].includes(ext);
  const isWordDoc = ['doc', 'docx'].includes(ext);
  const isCodeOrText = ['txt', 'md', 'json', 'js', 'py', 'ts', 'log', 'html'].includes(ext);

  // Normalize URL to same-origin path to prevent CORS/iframe cross-origin issues
  const getResolvedUrl = (url?: string) => {
    if (!url) return '';
    const match = url.match(/\/uploads\/[^?#]+/);
    if (match) return match[0];
    return url;
  };

  const resolvedUrl = getResolvedUrl(fileUrl);
  const effectivePageCount = (isPdf && pdfDoc?.numPages) ? pdfDoc.numPages : (activeFile?.pageCount || 1);
  const currentGrid = activeFile?.pagesPerSheet || 1;

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
    filter: !activeFile?.color ? 'grayscale(100%) contrast(120%)' : 'none',
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

      {/* Multi-File Switcher Tabs (If multiple documents uploaded) */}
      {files.length > 1 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold px-0.5">
            <span>Select Document to Inspect:</span>
            <span>{files.length} files queued</span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {files.map((f, idx) => {
              const isSelected = f.id === activeFile.id;
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
                    {idx + 1}. {f.fileName}
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
            <span className="text-xs font-bold text-slate-900 truncate max-w-[150px]">
              {fileName}
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                activeFile.color
                  ? 'bg-purple-50 text-purple-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {activeFile.color ? 'Color' : 'Grayscale'}
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
              {activeFile.copies} {activeFile.copies === 1 ? 'copy' : 'copies'}
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
              Single Page Document
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

        {/* PHYSICAL PAPER SHEET CONTAINER: STRICTLY NON-ROUNDED (SHARP 90° CORNERS) */}
        <div
          style={colorFilterStyle}
          className="rounded-none bg-slate-100 border-2 border-slate-300 p-2 sm:p-3 shadow-md transition-all relative"
        >
          {/* Header indicator on paper */}
          <div className="flex items-center justify-between pb-1.5 text-[10px] text-slate-400 font-semibold border-b border-slate-200 mb-2">
            <span>Physical Paper Stock (Sharp 90° Cut)</span>
            <span className="uppercase">
              {ext} • {currentGrid === 1 ? 'Full Page' : `${currentGrid}-in-1 Grid`}
            </span>
          </div>

          {/* 1. PDF DOCUMENT RENDERING */}
          {isPdf && (
            <div>
              {currentGrid === 1 ? (
                pdfViewMode === 'native' ? (
                  /* High-Res Native Embedded PDF Viewer */
                  <div className="w-full h-[400px] sm:h-[450px] bg-white rounded-none border border-slate-300 overflow-hidden shadow-inner">
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
                  /* PDF.js Canvas Render */
                  <div className="w-full flex items-center justify-center bg-white border border-slate-300 p-2 min-h-[380px] overflow-auto">
                    {isPdfLoading ? (
                      <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
                        <RotateCw className="w-6 h-6 animate-spin text-[#0e7490]" />
                        <span className="text-xs font-semibold">
                          Rendering page {selectedPage} vector spool...
                        </span>
                      </div>
                    ) : (
                      <canvas
                        ref={(el) => {
                          canvasRefs.current[0] = el;
                        }}
                        className="max-w-full h-auto shadow-sm rounded-none border border-slate-200"
                      />
                    )}
                  </div>
                )
              ) : (
                /* Multi-Page Grid (2, 4, 6 in 1) using PDF.js */
                <div
                  className={`grid gap-2 bg-white p-2 border border-slate-300 ${
                    currentGrid === 2 ? 'grid-cols-2' : currentGrid === 4 ? 'grid-cols-2' : 'grid-cols-3'
                  }`}
                >
                  {Array.from({ length: currentGrid }).map((_, idx) => (
                    <div
                      key={idx}
                      className="border border-dashed border-slate-300 p-1 flex flex-col items-center justify-between bg-slate-50 min-h-[140px]"
                    >
                      <span className="text-[9px] font-bold text-slate-400 self-start">
                        Slot {idx + 1} (Page {Math.min(idx + 1, effectivePageCount)})
                      </span>
                      <canvas
                        ref={(el) => {
                          canvasRefs.current[idx] = el;
                        }}
                        className="max-w-full max-h-[160px] object-contain shadow-2xs border border-slate-200 bg-white"
                      />
                      <span className="text-[8px] text-slate-400">Print Area</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. IMAGE RENDERING */}
          {isImage && (
            <div className="w-full min-h-[260px] max-h-[440px] bg-white rounded-none border border-slate-300 flex items-center justify-center p-2 overflow-hidden shadow-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolvedUrl}
                alt={fileName}
                className="max-h-[420px] max-w-full object-contain rounded-none"
              />
            </div>
          )}

          {/* 3. WORD DOCUMENT (.DOCX) RENDERING */}
          {isWordDoc && (
            <div className="w-full min-h-[320px] max-h-[450px] bg-white rounded-none border border-slate-300 p-5 overflow-y-auto text-left shadow-inner">
              {isLoadingContent ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                  <RotateCw className="w-6 h-6 animate-spin text-[#0e7490]" />
                  <span className="text-xs">Parsing Word formatting & typography...</span>
                </div>
              ) : wordHtml ? (
                <div
                  className="prose prose-sm max-w-none text-slate-800 text-xs leading-relaxed space-y-2"
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
            <div className="w-full min-h-[280px] max-h-[420px] bg-white rounded-none border border-slate-300 overflow-auto text-left shadow-inner">
              {isLoadingContent ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                  <RotateCw className="w-6 h-6 animate-spin text-[#0e7490]" />
                  <span className="text-xs">Extracting worksheet rows & columns...</span>
                </div>
              ) : excelData && excelData.rows.length > 0 ? (
                <div className="text-[11px] font-mono">
                  <div className="bg-emerald-100 text-emerald-900 px-3 py-1.5 font-bold text-[10px] flex items-center justify-between border-b border-emerald-200">
                    <span>Worksheet: {excelData.sheetName}</span>
                    <span>{excelData.rows.length} rows previewed</span>
                  </div>
                  <table className="w-full border-collapse">
                    <tbody>
                      {excelData.rows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className={rIdx === 0 ? 'bg-slate-100 font-bold border-b border-slate-300' : 'border-b border-slate-100 hover:bg-slate-50'}
                        >
                          <td className="px-2 py-1 text-slate-400 text-[9px] bg-slate-50 border-r border-slate-200 w-8 select-none text-center">
                            {rIdx + 1}
                          </td>
                          {row.map((cell: any, cIdx: number) => (
                            <td key={cIdx} className="px-2.5 py-1 text-slate-800 border-r border-slate-100 truncate max-w-[140px]">
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
            <div className="w-full min-h-[260px] max-h-[420px] bg-slate-900 text-slate-200 rounded-none border border-slate-700 p-3 overflow-auto font-mono text-[11px] text-left">
              <div className="text-slate-400 text-[10px] pb-1.5 mb-2 border-b border-slate-800 flex items-center justify-between">
                <span>{fileName}</span>
                <span>ASCII / UTF-8 Text</span>
              </div>
              <pre className="whitespace-pre-wrap leading-relaxed">{textContent || 'Loading content...'}</pre>
            </div>
          )}

          {/* 6. PRESENTATION OR OTHER UNRECOGNIZED FILE */}
          {!isPdf && !isImage && !isWordDoc && !isSpreadsheet && !isCodeOrText && (
            <div className="w-full min-h-[240px] bg-white rounded-none border border-slate-300 p-8 text-center flex flex-col items-center justify-center space-y-2">
              <File className="w-10 h-10 text-[#0e7490]" />
              <h4 className="font-bold text-slate-900 text-xs">{fileName}</h4>
              <p className="text-[11px] text-slate-500 max-w-[240px]">
                Universal binary file queued for hardware spooling. Document format preserved as uploaded.
              </p>
            </div>
          )}
        </div>

        {/* Footer info: File details & format */}
        <div className="flex items-center justify-between pt-1 text-xs">
          <span className="text-slate-400 text-[11px]">
            Format: <strong className="text-slate-700 uppercase">{ext || 'Document'}</strong> • {effectivePageCount} {effectivePageCount === 1 ? 'page' : 'pages'}
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
