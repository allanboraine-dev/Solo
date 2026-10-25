"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { KycDocType } from "@/types/kyc";
import {
  Camera,
  X,
  RotateCcw,
  Check,
  SwitchCamera,
  AlertCircle,
  ScanLine,
  Upload,
} from "lucide-react";

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  docType: KycDocType;
  title: string;
}

export default function CameraCaptureModal({
  isOpen,
  onClose,
  onCapture,
  docType,
  title,
}: CameraCaptureModalProps) {
  const isSelfie = docType === "driver_selfie";
  const [facingMode, setFacingMode] = useState<"user" | "environment">(
    isSelfie ? "user" : "environment"
  );
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  // Stop camera tracks cleanly
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Initialize camera stream
  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setCameraError(null);
    stopStream();

    if (
      typeof window === "undefined" ||
      !navigator?.mediaDevices?.getUserMedia
    ) {
      setCameraError(
        "Direct camera access is not supported on this browser. You can use your device camera via file selector below."
      );
      setIsLoading(false);
      return;
    }

    try {
      // Check available devices to see if switching is possible
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === "videoinput");
        setHasMultipleCameras(videoInputs.length > 1);
      } catch {
        // Non-critical check
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {});
          setIsLoading(false);
        };
      }
    } catch (err: any) {
      console.warn("getUserMedia camera error:", err);
      let msg = "Could not access device camera.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        msg = "Camera permission was denied. Please allow camera permissions in your browser or use the fallback capture below.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        msg = "No camera was detected on this device.";
      }
      setCameraError(msg);
      setIsLoading(false);
    }
  }, [facingMode, stopStream]);

  // Restart camera when modal opens or facing mode toggles
  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      setCapturedBlob(null);
      startCamera();
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [isOpen, facingMode, startCamera, stopStream]);

  // Handle Flip Camera
  const toggleCamera = () => {
    setFacingMode((prev) => (prev === "user" ? "environment" : "user"));
  };

  // Capture Frame from Video
  const handleSnap = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Flip horizontally if front-facing selfie camera for natural mirror view
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const preview = URL.createObjectURL(blob);
          setCapturedImage(preview);
          setCapturedBlob(blob);
        }
      },
      "image/jpeg",
      0.92
    );
  };

  // Retake photo
  const handleRetake = () => {
    if (capturedImage) {
      URL.revokeObjectURL(capturedImage);
    }
    setCapturedImage(null);
    setCapturedBlob(null);
    startCamera();
  };

  // Confirm photo and create File object
  const handleConfirm = () => {
    if (!capturedBlob) return;
    const fileName = `${docType}_${Date.now()}.jpg`;
    const file = new File([capturedBlob], fileName, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    onCapture(file);
    handleClose();
  };

  const handleClose = () => {
    if (capturedImage) {
      URL.revokeObjectURL(capturedImage);
    }
    setCapturedImage(null);
    setCapturedBlob(null);
    stopStream();
    onClose();
  };

  // Fallback direct device camera file input handler
  const handleFallbackFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onCapture(file);
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col text-white max-h-[92vh] max-h-[92dvh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
              <Camera size={18} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base">{title}</h3>
              <p className="text-[11px] text-zinc-400">
                {isSelfie
                  ? "Look directly at camera in good lighting"
                  : docType === "license_disc"
                  ? "Align vehicle license disc on windscreen"
                  : docType === "vehicle_photo"
                  ? "Align front of vehicle with plate visible"
                  : "Align document edges inside frame"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition cursor-pointer"
            title="Close camera"
          >
            <X size={20} />
          </button>
        </div>

        {/* Viewfinder / Review Area */}
        <div className="relative aspect-4/3 w-full bg-black flex items-center justify-center overflow-hidden">
          {capturedImage ? (
            /* Review Captured Frame */
            <img
              src={capturedImage}
              alt="Captured"
              className="w-full h-full object-contain bg-zinc-950"
            />
          ) : cameraError ? (
            /* Camera Permission / Error Fallback Screen */
            <div className="p-6 text-center space-y-4 max-w-sm">
              <AlertCircle size={36} className="text-amber-400 mx-auto" />
              <div className="space-y-1">
                <p className="text-xs text-zinc-300">{cameraError}</p>
                <p className="text-[11px] text-zinc-500">
                  You can tap below to snap directly with your phone camera or select from photos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fallbackInputRef.current?.click()}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Camera size={16} />
                <span>Snap with Device Camera</span>
              </button>
              <input
                ref={fallbackInputRef}
                type="file"
                accept="image/*"
                capture={isSelfie ? "user" : "environment"}
                onChange={handleFallbackFile}
                className="hidden"
              />
            </div>
          ) : (
            /* Live Camera Stream with Frame Overlay */
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${
                  facingMode === "user" ? "-scale-x-100" : ""
                }`}
              />

              {/* Viewfinder Targeting Overlays */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                {isSelfie ? (
                  /* Oval Guide for Driver Selfie */
                  <div className="w-52 h-64 border-2 border-dashed border-blue-400/80 rounded-[50%] shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] flex items-end justify-center pb-3">
                    <span className="text-[10px] font-bold text-blue-300 bg-black/70 px-2.5 py-0.5 rounded-full">
                      Align Face in Oval
                    </span>
                  </div>
                ) : docType === "license_disc" ? (
                  /* Circle Guide for License Disc */
                  <div className="w-56 h-56 border-2 border-dashed border-emerald-400/80 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] flex items-end justify-center pb-3">
                    <span className="text-[10px] font-bold text-emerald-300 bg-black/70 px-2.5 py-0.5 rounded-full">
                      Align License Disc
                    </span>
                  </div>
                ) : docType === "vehicle_photo" ? (
                  /* Rectangle Guide for Vehicle */
                  <div className="w-11/12 h-4/5 border-2 border-dashed border-purple-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] flex items-end justify-center pb-3">
                    <span className="text-[10px] font-bold text-purple-300 bg-black/70 px-2.5 py-0.5 rounded-full">
                      Vehicle Front &amp; License Plate
                    </span>
                  </div>
                ) : (
                  /* Card / Document Rectangle Guide */
                  <div className="w-11/12 h-4/5 border-2 border-dashed border-blue-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] flex items-end justify-center pb-3">
                    <span className="text-[10px] font-bold text-blue-300 bg-black/70 px-2.5 py-0.5 rounded-full">
                      Frame Document Corners
                    </span>
                  </div>
                )}
              </div>

              {isLoading && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                  <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between gap-3">
          {capturedImage ? (
            /* Review Controls */
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <RotateCcw size={15} />
                <span>Retake Photo</span>
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-600/30 cursor-pointer"
              >
                <Check size={16} />
                <span>Use This Photo</span>
              </button>
            </>
          ) : (
            /* Live Camera Controls */
            <>
              <div className="w-12">
                {hasMultipleCameras && (
                  <button
                    type="button"
                    onClick={toggleCamera}
                    className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-2xl transition cursor-pointer"
                    title="Switch camera (Front / Rear)"
                  >
                    <SwitchCamera size={18} />
                  </button>
                )}
              </div>

              {/* Shutter Button */}
              <button
                type="button"
                onClick={handleSnap}
                disabled={isLoading || !!cameraError}
                className="w-16 h-16 rounded-full bg-white hover:bg-zinc-200 text-zinc-950 flex items-center justify-center shadow-lg transition active:scale-95 disabled:opacity-40 cursor-pointer ring-4 ring-white/20"
                title="Take picture"
              >
                <Camera size={26} className="text-zinc-900" />
              </button>

              {/* Native device file fallback button */}
              <div className="w-12 flex justify-end">
                <button
                  type="button"
                  onClick={() => fallbackInputRef.current?.click()}
                  className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-2xl transition cursor-pointer"
                  title="Upload from device storage"
                >
                  <Upload size={18} />
                </button>
                <input
                  ref={fallbackInputRef}
                  type="file"
                  accept="image/*"
                  capture={isSelfie ? "user" : "environment"}
                  onChange={handleFallbackFile}
                  className="hidden"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
