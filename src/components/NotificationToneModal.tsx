"use client";

import { useState, useEffect, useRef } from "react";
import {
  Volume2,
  VolumeX,
  Play,
  Square,
  Upload,
  Check,
  X,
  Smartphone,
  Music,
  Trash2,
  AlertCircle,
  Vibrate,
  Sparkles,
} from "lucide-react";
import {
  PRESET_TONES,
  type ToneId,
  getSelectedTone,
  setSelectedTone,
  getCustomToneMeta,
  saveCustomToneFile,
  removeCustomTone,
  playTone,
  getToneVolume,
  setToneVolume,
  unlockAudio,
} from "@/utils/notificationTones";
import { audioAlert } from "@/utils/audioAlert";

interface NotificationToneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToneSaved?: (toneId: ToneId) => void;
}

export function NotificationToneModal({
  isOpen,
  onClose,
  onToneSaved,
}: NotificationToneModalProps) {
  const [selectedId, setSelectedId] = useState<ToneId>("default");
  const [customMeta, setCustomMeta] = useState<{ name: string; size: number; mimeType: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState<ToneId | null>(null);
  const [volume, setVolumeState] = useState<number>(0.85);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    try {
      unlockAudio();
    } catch {}
    setSelectedId(getSelectedTone());
    setCustomMeta(getCustomToneMeta());
    setVolumeState(getToneVolume());
    setUploadError(null);
    setUploadSuccess(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectPreset = async (toneId: ToneId) => {
    setSelectedId(toneId);
    setSelectedTone(toneId);
    const toneObj = PRESET_TONES.find((t) => t.id === toneId);
    setUploadSuccess(`Alert tone set to "${toneObj?.name || toneId}"`);
    setUploadError(null);
    if (onToneSaved) onToneSaved(toneId);
    await handlePlayPreview(toneId);
  };

  const handlePlayPreview = async (toneId: ToneId, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsPlaying(toneId);
    try {
      await playTone(toneId);
    } catch (err) {
      console.warn('[NotificationToneModal] preview error:', err);
    } finally {
      setTimeout(() => setIsPlaying(null), 850);
    }
  };

  const handleClose = () => {
    setSelectedTone(selectedId);
    if (onToneSaved) onToneSaved(selectedId);
    onClose();
  };

  const handleTestFullAlert = () => {
    audioAlert.playTripAlertChime(selectedId);
    audioAlert.triggerDeviceVibration();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    const result = await saveCustomToneFile(file);
    setIsUploading(false);

    if (result.success) {
      setCustomMeta(getCustomToneMeta());
      setSelectedId("custom");
      setUploadSuccess(`Custom sound "${result.name}" set as your active alert tone!`);
      if (onToneSaved) onToneSaved("custom");
      // Play a quick test of the newly uploaded tone
      setTimeout(() => {
        handlePlayPreview("custom");
      }, 200);
    } else {
      setUploadError(result.error || "Failed to load audio file.");
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveCustom = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await removeCustomTone();
    setCustomMeta(null);
    setSelectedId("default");
    setUploadSuccess("Custom tone removed. Reverted to default SOLO harmony.");
    if (onToneSaved) onToneSaved("default");
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolumeState(val);
    setToneVolume(val);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-zinc-950 border border-gray-200 dark:border-white/10 rounded-3xl p-5 sm:p-6 text-gray-900 dark:text-white space-y-5 shadow-2xl relative max-h-[92vh] max-h-[92dvh] overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 dark:border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Volume2 size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">Notification Alert Tones</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Choose a preset tone or select any audio file from your device.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition touch-manipulation"
          >
            <X size={18} />
          </button>
        </div>

        {/* Feedback Banners */}
        {uploadError && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-2xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}
        {uploadSuccess && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <Check size={15} className="shrink-0" />
            <span>{uploadSuccess}</span>
          </div>
        )}

        {/* Device Audio Upload Card */}
        <div className="bg-gradient-to-br from-blue-50/70 to-indigo-50/40 dark:from-blue-950/30 dark:to-indigo-950/20 border border-blue-200/80 dark:border-blue-800/40 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone size={16} className="text-blue-600 dark:text-blue-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-200">
                Select from Device
              </span>
            </div>
            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-100/80 dark:bg-blue-900/60 px-2 py-0.5 rounded-full">
              MP3, WAV, M4A, OGG
            </span>
          </div>

          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            Pick your personal ringtone or sound file stored on your phone or computer.
          </p>

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {customMeta ? (
            <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-blue-200 dark:border-blue-900/50 flex items-center justify-between gap-2 shadow-sm">
              <div
                className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                onClick={() => handleSelectPreset("custom")}
              >
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                  selectedId === "custom"
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-300 dark:border-zinc-600"
                }`}>
                  {selectedId === "custom" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <Music size={16} className="text-blue-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate text-gray-900 dark:text-white">
                    {customMeta.name}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {(customMeta.size / 1024).toFixed(0)} KB • Custom Audio
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) => handlePlayPreview("custom", e)}
                  className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/40 dark:hover:bg-blue-800/50 text-blue-600 dark:text-blue-300 transition touch-manipulation"
                  title="Preview Custom Tone"
                >
                  {isPlaying === "custom" ? <Square size={13} className="fill-current" /> : <Play size={13} className="fill-current ml-0.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-200 text-xs font-semibold transition touch-manipulation"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={handleRemoveCustom}
                  className="p-2 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-500 transition touch-manipulation"
                  title="Remove Custom Tone"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full py-3 px-4 bg-white dark:bg-zinc-900 border-2 border-dashed border-blue-300 dark:border-blue-800/60 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 flex items-center justify-center gap-2 transition active:scale-98 touch-manipulation shadow-sm"
            >
              <Upload size={15} />
              <span>{isUploading ? "Uploading audio..." : "Choose Audio File from Device"}</span>
            </button>
          )}
        </div>

        {/* Built-in Presets */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Built-In Presets
            </span>
            <span className="text-[10px] text-gray-400">Instant • Zero network lag</span>
          </div>

          <div className="space-y-1.5">
            {PRESET_TONES.filter((t) => !t.isCustom).map((tone) => {
              const isSelected = selectedId === tone.id;
              const isThisPlaying = isPlaying === tone.id;

              return (
                <div
                  key={tone.id}
                  onClick={() => handleSelectPreset(tone.id)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 touch-manipulation ${
                    isSelected
                      ? "bg-blue-50/60 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800/80 shadow-sm"
                      : "bg-gray-50 dark:bg-zinc-900/60 border-gray-100 dark:border-white/5 hover:border-gray-200 dark:hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      isSelected
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-300 dark:border-zinc-600"
                    }`}>
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                          {tone.name}
                        </span>
                        {tone.badge && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300 shrink-0">
                            {tone.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                        {tone.description}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handlePlayPreview(tone.id, e)}
                    className={`p-2 rounded-xl border transition-all shrink-0 touch-manipulation ${
                      isThisPlaying
                        ? "bg-blue-600 text-white border-blue-600 scale-105"
                        : "bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-zinc-700"
                    }`}
                    title={`Play ${tone.name}`}
                  >
                    {isThisPlaying ? (
                      <Square size={13} className="fill-current" />
                    ) : (
                      <Play size={13} className="fill-current ml-0.5" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Volume Slider */}
        <div className="p-3 bg-gray-50 dark:bg-zinc-900/60 rounded-2xl border border-gray-100 dark:border-white/5 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
              {volume === 0 ? <VolumeX size={14} className="text-gray-400" /> : <Volume2 size={14} className="text-blue-500" />}
              Alert Volume
            </span>
            <span className="font-bold text-gray-700 dark:text-gray-300 font-mono">
              {Math.round(volume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={handleVolumeChange}
            className="w-full accent-blue-600 h-1.5 bg-gray-200 dark:bg-zinc-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* Action Controls */}
        <div className="pt-1 space-y-2.5">
          <button
            type="button"
            onClick={handleTestFullAlert}
            className="w-full py-3 px-4 min-h-[44px] bg-gray-100 hover:bg-gray-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-gray-800 dark:text-gray-200 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition active:scale-98 touch-manipulation border border-gray-200 dark:border-white/5"
          >
            <Vibrate size={15} className="text-blue-500" />
            <span>Test Sound & Phone Vibration</span>
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="w-full py-3.5 px-4 min-h-[48px] bg-black dark:bg-white text-white dark:text-black font-black text-sm rounded-2xl transition shadow-lg active:scale-98 touch-manipulation flex items-center justify-center gap-2"
          >
            <Check size={16} />
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
}
