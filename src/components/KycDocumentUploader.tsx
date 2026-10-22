"use client"

import { useState, useRef, useEffect } from 'react'
import { KycDocType, DriverDocument, KYC_DOCUMENT_CONFIGS } from '@/types/kyc'
import { uploadDriverKycDocument } from '@/utils/kyc'
import CameraCaptureModal from '@/components/CameraCaptureModal'
import {
  Upload,
  Camera,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  ExternalLink,
  RefreshCw,
  X,
  User,
  Car,
  Disc,
  Eye,
} from 'lucide-react'

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
  const config = KYC_DOCUMENT_CONFIGS[docType] || {
    type: docType,
    title: docType,
    description: '',
    required: true,
    acceptedFormats: ['image/jpeg', 'image/png'],
    maxSizeMb: 10,
  }

  const isSelfie = docType === 'driver_selfie'
  const isVehiclePhoto = docType === 'vehicle_photo'
  const isLicenseDisc = docType === 'license_disc'

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isFullscreenPreviewOpen, setIsFullscreenPreviewOpen] = useState(false)

  // Sync preview url when selectedFile changes
  useEffect(() => {
    if (selectedFile && selectedFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(selectedFile)
      setPreviewUrl(url)
      return () => {
        URL.revokeObjectURL(url)
      }
    } else if (!selectedFile && !existingDoc?.signedUrl) {
      setPreviewUrl(null)
    }
  }, [selectedFile, existingDoc?.signedUrl])

  const processSelectedFile = async (file: File) => {
    setErrorMessage(null)

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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await processSelectedFile(file)
  }

  const handleCameraCapture = async (file: File) => {
    await processSelectedFile(file)
  }

  const handleClearSelection = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (previewUrl && !existingDoc?.signedUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setErrorMessage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (onFileSelect) onFileSelect(null)
  }

  // Open interactive camera modal or fall back to native device camera
  const handleOpenPhotoCapture = () => {
    if (typeof window !== 'undefined' && navigator?.mediaDevices?.getUserMedia) {
      setIsCameraOpen(true)
    } else if (cameraInputRef.current) {
      cameraInputRef.current.click()
    } else {
      fileInputRef.current?.click()
    }
  }

  const status = existingDoc?.status
  const activePreview = previewUrl || existingDoc?.signedUrl

  return (
    <>
      <div
        className={`p-4 sm:p-5 rounded-2xl border transition-all ${
          status === 'approved'
            ? 'border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20'
            : status === 'rejected'
            ? 'border-red-300 dark:border-red-800/60 bg-red-50/50 dark:bg-red-950/20'
            : status === 'pending'
            ? 'border-amber-300 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20'
            : selectedFile
            ? 'border-blue-400 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 shadow-xs'
            : 'border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-gray-300 dark:hover:border-zinc-700'
        }`}
      >
        {/* Hidden File Input for Gallery / Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept={config.acceptedFormats.join(',')}
          onChange={handleFileChange}
          disabled={disabled || isUploading}
          className="hidden"
        />

        {/* Hidden Camera Input for Native Device Camera Fallback */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture={isSelfie ? 'user' : 'environment'}
          onChange={handleFileChange}
          disabled={disabled || isUploading}
          className="hidden"
        />

        {/* Header Info */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div
                className={`p-1.5 rounded-lg shrink-0 ${
                  isSelfie
                    ? 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                    : isLicenseDisc
                    ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                    : isVehiclePhoto
                    ? 'bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400'
                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400'
                }`}
              >
                {isSelfie ? (
                  <User size={16} />
                ) : isLicenseDisc ? (
                  <Disc size={16} />
                ) : isVehiclePhoto ? (
                  <Car size={16} />
                ) : (
                  <FileText size={16} />
                )}
              </div>
              <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100">
                {config.title}
              </h4>
              {config.required ? (
                <span className="text-[10px] uppercase font-black text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/60 px-1.5 py-0.5 rounded">
                  Required
                </span>
              ) : (
                <span className="text-[10px] uppercase font-bold text-gray-500 bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                  Optional
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed pl-8">
              {config.description}
            </p>
          </div>

          {/* Status Badge */}
          <div>
            {status === 'approved' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2.5 py-1 rounded-full">
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
              <span className="inline-flex items-center gap-1 text-[11px] font-black text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60 px-2.5 py-1 rounded-full">
                <CheckCircle2 size={13} />
                Photo Ready
              </span>
            )}
            {!status && !selectedFile && (
              <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                Not captured
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

        {/* Selected File / Captured Photo Card */}
        {selectedFile ? (
          <div className="mt-3 p-3 bg-white dark:bg-zinc-900 rounded-2xl border border-blue-200 dark:border-blue-900/60 flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {activePreview ? (
                <div
                  onClick={() => setIsFullscreenPreviewOpen(true)}
                  className="relative group cursor-pointer shrink-0"
                  title="Click to view large preview"
                >
                  <img
                    src={activePreview}
                    alt="Captured photo"
                    className="w-14 h-14 object-cover rounded-xl border border-gray-200 dark:border-zinc-700 shadow-xs group-hover:opacity-85 transition"
                  />
                  <div className="absolute inset-0 bg-black/30 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition">
                    <Eye size={16} />
                  </div>
                </div>
              ) : (
                <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <FileText size={24} />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold truncate text-gray-900 dark:text-gray-100">
                  {selectedFile.name}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {(selectedFile.size / 1024).toFixed(0)} KB • Ready to submit
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={handleOpenPhotoCapture}
                    disabled={disabled || isUploading}
                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={11} /> Retake
                  </button>
                  <span className="text-gray-300 dark:text-zinc-700">•</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled || isUploading}
                    className="text-[11px] font-bold text-gray-600 dark:text-zinc-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Upload size={11} /> Choose different file
                  </button>
                </div>
              </div>

              {!disabled && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="p-2 text-gray-400 hover:text-red-500 transition rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-800 cursor-pointer"
                  title="Remove file"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
        ) : existingDoc ? (
          <div className="mt-3 flex items-center justify-between w-full pt-2 border-t border-gray-100 dark:border-white/5">
            <div className="flex items-center gap-2.5 text-xs text-gray-500 dark:text-gray-400">
              {activePreview && (
                <img
                  src={activePreview}
                  alt="Document"
                  className="w-10 h-10 object-cover rounded-lg border border-gray-200 dark:border-zinc-700 cursor-pointer"
                  onClick={() => setIsFullscreenPreviewOpen(true)}
                />
              )}
              <div>
                <p className="font-semibold text-gray-700 dark:text-gray-300">
                  Document on file
                </p>
                <p className="text-[11px]">
                  Uploaded{' '}
                  {new Date(existingDoc.updated_at || existingDoc.created_at).toLocaleDateString()}
                </p>
              </div>
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
                  View Full
                </a>
              )}
              {!disabled && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleOpenPhotoCapture}
                    className="flex items-center gap-1 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 px-3 py-1.5 rounded-xl transition cursor-pointer"
                  >
                    <Camera size={13} />
                    Retake Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 px-2.5 py-1.5 rounded-xl transition cursor-pointer"
                    title="Upload replacement file"
                  >
                    <Upload size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Dual Capture Options: Take Photo (Camera) OR Upload File */
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-gray-100 dark:border-white/5">
            <button
              type="button"
              onClick={handleOpenPhotoCapture}
              disabled={disabled || isUploading}
              className="py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl flex items-center justify-center gap-2 text-xs font-extrabold shadow-md shadow-blue-500/20 active:scale-95 transition cursor-pointer"
            >
              <Camera size={16} />
              <span>
                {isSelfie
                  ? 'Take Live Selfie'
                  : isLicenseDisc
                  ? 'Snap License Disc'
                  : isVehiclePhoto
                  ? 'Snap Vehicle Photo'
                  : 'Take Photo with Camera'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading}
              className="py-3 px-4 border border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600 bg-gray-50 hover:bg-gray-100 dark:bg-zinc-800/80 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-200 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition cursor-pointer"
            >
              {isUploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload size={15} />
                  <span>Upload File / Gallery</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="mt-2 text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1">
            <AlertCircle size={13} />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Interactive In-App Camera Viewfinder Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraCapture}
        docType={docType}
        title={`Take Photo: ${config.title}`}
      />

      {/* Fullscreen Photo Inspector Modal */}
      {isFullscreenPreviewOpen && activePreview && (
        <div
          onClick={() => setIsFullscreenPreviewOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm cursor-zoom-out"
        >
          <div className="relative max-w-2xl w-full max-h-[85vh] flex flex-col items-center">
            <button
              onClick={() => setIsFullscreenPreviewOpen(false)}
              className="absolute -top-10 right-0 text-white hover:text-zinc-300 p-2"
            >
              <X size={24} />
            </button>
            <img
              src={activePreview}
              alt={config.title}
              className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl border border-zinc-800"
            />
            <p className="text-xs text-zinc-300 mt-2 font-medium">{config.title}</p>
          </div>
        </div>
      )}
    </>
  )
}
