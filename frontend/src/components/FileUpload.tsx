'use client';

import React, { useState, useRef } from 'react';
import { UploadedDocument } from '@/lib/types';
import { MobileBottomCta } from './MobileBottomCta';
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  RotateCw,
  Trash2,
  Plus,
  FileCode,
  File,
} from 'lucide-react';

interface FileUploadProps {
  onSuccess: (files: UploadedDocument[]) => void;
  onBack?: () => void;
  uploadedFiles?: UploadedDocument[];
  basePrice?: number;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onSuccess,
  uploadedFiles = [],
  basePrice = 2,
}) => {
  const [files, setFiles] = useState<UploadedDocument[]>(uploadedFiles);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFileName, setUploadingFileName] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (selectedFile: File): boolean => {
    if (selectedFile.size > 50 * 1024 * 1024) {
      setErrorMessage(`"${selectedFile.name}" exceeds the 50MB size limit.`);
      return false;
    }
    return true;
  };

  const uploadSingleFile = (file: File): Promise<UploadedDocument> => {
    return new Promise((resolve, reject) => {
      setUploadingFileName(file.name);
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload', true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 90);
          setUploadProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const resp = JSON.parse(xhr.responseText);
            const fileExt = (file.name.split('.').pop() || '').toLowerCase();
            const isImg = (resp.mimeType || file.type || '').startsWith('image/') ||
              ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'].includes(fileExt);

            const doc: UploadedDocument = {
              id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              fileName: resp.fileName || file.name,
              fileUrl: resp.fileUrl,
              fileSize: resp.fileSize || file.size,
              pageCount: resp.pageCount || 1,
              mimeType: resp.mimeType || file.type,
              copies: 1,
              color: isImg ? true : false,
              duplex: false,
              pagesPerSheet: 1,
              orientation: isImg ? 'landscape' : 'portrait',
            };
            resolve(doc);
          } catch {
            reject(new Error('Failed to parse server response.'));
          }
        } else {
          try {
            const errResp = JSON.parse(xhr.responseText);
            reject(new Error(errResp.error || 'Upload failed.'));
          } catch {
            reject(new Error('Upload failed.'));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload.'));
      xhr.send(formData);
    });
  };

  const handleFilesUpload = async (fileList: FileList | File[]) => {
    const rawFiles = Array.from(fileList);
    if (rawFiles.length === 0) return;

    const validFiles = rawFiles.filter(validateFile);
    if (validFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(10);
    setErrorMessage(null);

    const newlyUploaded: UploadedDocument[] = [];

    try {
      for (let i = 0; i < validFiles.length; i++) {
        const curFile = validFiles[i];
        setUploadingFileName(curFile.name);
        const uploadedDoc = await uploadSingleFile(curFile);
        newlyUploaded.push(uploadedDoc);
      }

      setFiles((prev) => [...prev, ...newlyUploaded]);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error uploading one or more files.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadingFileName('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesUpload(e.target.files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesUpload(e.dataTransfer.files);
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const getFileIcon = (fileName: string, mime?: string) => {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf' || mime === 'application/pdf') {
      return <FileText className="w-5 h-5 text-red-500" />;
    }
    if (['doc', 'docx'].includes(ext)) {
      return <FileText className="w-5 h-5 text-blue-500" />;
    }
    if (['xls', 'xlsx', 'csv'].includes(ext)) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-500" />;
    }
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(ext) || mime?.startsWith('image/')) {
      return <ImageIcon className="w-5 h-5 text-purple-500" />;
    }
    if (['txt', 'md', 'json', 'py', 'js', 'ts'].includes(ext)) {
      return <FileCode className="w-5 h-5 text-amber-500" />;
    }
    return <File className="w-5 h-5 text-[#0e7490]" />;
  };

  const totalPages = files.reduce((acc, f) => acc + (f.pageCount || 1), 0);

  return (
    <div className="w-full max-w-md mx-auto space-y-4 pb-24">
      {/* Title Section */}
      <div className="space-y-0.5 pt-1">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">
          Upload Documents
        </h1>
        <p className="text-xs text-slate-500">
          Upload 1 or more documents. You can customize copies and color for each file.
        </p>
      </div>

      {/* Format Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#ecfeff] text-[#0e7490] border border-[#a5f3fc]">
          All Formats
        </span>
        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          PDF
        </span>
        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          Word (.docx)
        </span>
        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          Excel / PPT
        </span>
        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          Images
        </span>
        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          Text / Code
        </span>
        <span className="text-[10px] text-slate-400 ml-auto font-medium">
          Multi-file enabled
        </span>
      </div>

      {/* Upload Drop Zone Card */}
      <div
        onClick={() => !isUploading && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`figma-card p-6 border-2 border-dashed transition-all cursor-pointer text-center flex flex-col items-center justify-center min-h-[170px] relative ${
          isDragOver
            ? 'border-[#0e7490] bg-[#ecfeff]/50'
            : errorMessage
            ? 'border-red-400 bg-red-50/50'
            : 'border-slate-300 hover:border-[#0e7490] hover:bg-slate-50/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="*/*"
          onChange={handleInputChange}
          className="hidden"
        />

        <div className="w-12 h-12 rounded-xl bg-[#ecfeff] border border-[#a5f3fc] flex items-center justify-center mb-2.5 text-[#0e7490]">
          <UploadCloud className="w-6 h-6" />
        </div>

        <h3 className="font-bold text-slate-900 text-sm">
          {files.length > 0 ? 'Tap or drag to add more files' : 'Tap to upload files (multiple supported)'}
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Select single or multiple files • Up to 50MB each
        </p>

        {isUploading && (
          <div className="absolute inset-0 bg-white/95 rounded-2xl flex flex-col items-center justify-center p-6 space-y-3 z-10">
            <RotateCw className="w-6 h-6 text-[#0e7490] animate-spin" />
            <div className="w-full max-w-xs space-y-1">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span className="truncate max-w-[200px]">Uploading {uploadingFileName}...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-[#0e7490] transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="font-medium flex-1">{errorMessage}</p>
        </div>
      )}

      {/* Uploaded Files Section */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
              Queued Documents ({files.length})
            </span>
            <span className="text-[11px] font-bold text-[#0e7490] bg-[#ecfeff] px-2 py-0.5 rounded-md border border-[#a5f3fc]">
              {totalPages} total pages
            </span>
          </div>

          <div className="space-y-2">
            {files.map((item, idx) => (
              <div
                key={item.id}
                className="figma-card p-3 flex items-center justify-between gap-3 bg-white border border-slate-200 shadow-2xs"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    {getFileIcon(item.fileName, item.mimeType)}
                  </div>
                  <div className="truncate">
                    <h4 className="font-bold text-slate-900 text-xs truncate max-w-[210px] sm:max-w-[260px]">
                      {idx + 1}. {item.fileName}
                    </h4>
                    <p className="text-[10px] text-slate-500">
                      {(item.fileSize / 1024 < 1024
                        ? `${(item.fileSize / 1024).toFixed(0)} KB`
                        : `${(item.fileSize / (1024 * 1024)).toFixed(1)} MB`)} •{' '}
                      <strong className="text-slate-700">
                        {item.pageCount} {item.pageCount === 1 ? 'page' : 'pages'}
                      </strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(item.id)}
                    className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Remove file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 text-xs font-semibold text-[#0e7490] hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add more documents</span>
          </button>
        </div>
      )}

      {/* Sticky Bottom CTA */}
      <MobileBottomCta
        buttonText={
          files.length > 0
            ? `Proceed to Settings (${files.length} ${files.length === 1 ? 'file' : 'files'})`
            : 'Select Document to Proceed'
        }
        disabled={files.length === 0 || isUploading}
        onButtonClick={() => files.length > 0 && onSuccess(files)}
      />
    </div>
  );
};
