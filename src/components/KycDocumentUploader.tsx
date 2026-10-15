"use client"

import { useState, useRef } from 'react'
import { KycDocType, DriverDocument, KYC_DOCUMENT_CONFIGS } from '@/types/kyc'
import { uploadDriverKycDocument } from '@/utils/kyc'
import { Upload, CheckCircle2, Clock, AlertCircle, FileText, ExternalLink, RefreshCw, X } from 'lucide-react'

interface KycDocumentUploaderProps {
  docType: KycDocType;
  driverId?: string;
  existingDoc?: DriverDocument;
  selectedFile?: File | null;
  onFileSelect?: (file: File | null) => void;
  onUploadSuccess?: (doc: DriverDocument) => void;
  autoUpload?: boolean;
  disabled?: boolean;
}

export default function KycDocumentUploader({
  docType,
  driverId,
  existingDoc,
  selectedFile,
  onFileSelect,
  onUploadSuccess,
  autoUpload = false,
  disabled = false,
}: KycDocumentUploaderProps) {
  const config = KYC_DOCUMENT_CONFIGS[docType]
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setErrorMessage(null)

    // Generate local preview if it's an image
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
    } else {
      setPreviewUrl(null)
    }

    if (onFileSelect) {
      onFileSelect(file)
    }

    if (autoUpload && driverId) {
      setIsUploading(true)
      const res = await uploadDriverKycDocument(driverId, docType, file)
      setIsUploading(false)
      if (res.success && res.document) {
        if (onUploadSuccess) onUploadSuccess(res.document)
      } else {
        setErrorMessage(res.error || 'Failed to upload document')
      }
    }
  }

  const handleClearSelection = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setErrorMessage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (onFileSelect) onFileSelect(null)
  }

  const status = existingDoc?.status
  const isUploaded = !!existingDoc || !!selectedFile

  return (
    <div className={`p-4 rounded-2xl border transition-all ${
      status === 'approved' 
        ? 'border-green-300 dark:border-green-800/60 bg-green-50/50 dark:bg-green-950/20' 
        : status === 'rejected'
          ? 'border-red-300 dark:border-red-800/60 bg-red-50/50 dark:bg-red-950/20'
          : status === 'pending'
            ? 'border-amber-300 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20'
            : selectedFile
              ? 'border-blue-400 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/20'
              : 'border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-gray-300 dark:hover:border-zinc-700'
    }`}>
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={config.acceptedFormats.join(',')}
        onChange={handleFileChange}
        disabled={disabled || isUploading}
        className="hidden"
      />

      {/* Header Info */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100">{config.title}</h4>
            {config.required ? (
              <span className="text-[10px] uppercase font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/60 px-1.5 py-0.5 rounded">
                Required
              </span>
            ) : (
              <span className="text-[10px] uppercase font-bold text-gray-500 bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                Optional
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
            {config.description}
          </p>
        </div>

        {/* Status Badge */}
        <div>
          {status === 'approved' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/60 px-2.5 py-1 rounded-full">
              <CheckCircle2 size={13} />
              Approved
            </span>
          )}
          {status === 'pending' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 px-2.5 py-1 rounded-full">
              <Clock size={13} />
              In Review
            </span>
          )}
          {status === 'rejected' && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/60 px-2.5 py-1 rounded-full">
              <AlertCircle size={13} />
              Rejected
            </span>
          )}
          {!status && selectedFile && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60 px-2.5 py-1 rounded-full">
              <CheckCircle2 size={13} />
              Ready
            </span>
          )}
          {!status && !selectedFile && (
            <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">
              Not uploaded
            </span>
          )}
        </div>
      </div>

      {/* Rejection Reason Display */}
      {status === 'rejected' && existingDoc?.rejection_reason && (
        <div className="mb-3 p-2.5 bg-red-100/70 dark:bg-red-950/50 border border-red-200 dark:border-red-900/40 rounded-xl text-xs text-red-700 dark:text-red-300">
          <strong>Correction needed:</strong> {existingDoc.rejection_reason}
        </div>
      )}

      {/* File Action & Preview Zone */}
      <div className="mt-3 flex items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-white/5">
        {selectedFile ? (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" className="w-10 h-10 object-cover rounded-lg border border-gray-200 dark:border-zinc-700 shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <FileText size={20} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate text-gray-800 dark:text-gray-200">{selectedFile.name}</p>
              <p className="text-[11px] text-gray-400">{(selectedFile.size / 1024).toFixed(0)} KB • Ready to submit</p>
            </div>
            {!disabled && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="p-1.5 text-gray-400 hover:text-red-500 transition rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800"
                title="Remove file"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ) : existingDoc ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <FileText size={16} className="text-gray-400" />
              <span>Uploaded {new Date(existingDoc.updated_at || existingDoc.created_at).toLocaleDateString()}</span>
            </div>

            <div className="flex items-center gap-2">
              {existingDoc.signedUrl && (
                <a
                  href={existingDoc.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 rounded"
                >
                  <ExternalLink size={13} />
                  View
                </a>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 px-3 py-1.5 rounded-xl transition"
                >
                  <RefreshCw size={13} />
                  Re-upload
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isUploading}
            className="w-full py-3 px-4 border-2 border-dashed border-gray-300 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-xl flex items-center justify-center gap-2 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition bg-gray-50/50 dark:bg-zinc-900/30"
          >
            {isUploading ? (
              <>
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span>Uploading document...</span>
              </>
            ) : (
              <>
                <Upload size={16} />
                <span>Upload {config.title} (PDF, JPG, PNG)</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="mt-2 text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertCircle size={13} />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  )
}
