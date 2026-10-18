"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  PhoneCall,
  Siren,
  VolumeX,
  MapPin,
  MessageCircle,
  UserPlus,
  Trash2,
  CheckCircle2,
  X,
  Radio,
  Copy,
  Check,
  AlertTriangle,
  Car,
} from "lucide-react";
import {
  SA_EMERGENCY_HOTLINES,
  triggerRapidResponseSos,
  buildWhatsAppEmergencySosUrl,
  buildGoogleMapsPinUrl,
  getTrustedContacts,
  saveTrustedContacts,
  emergencySiren,
  type SafetyRole,
  type EmergencyCategory,
  type SafetyIncidentRecord,
  type TrustedContact,
} from "@/utils/safetyDispatch";
import { encodeGeohash } from "@/lib/solo_realtime_and_ride_service";
import { broadcastEvent } from "@/lib/mockBackend";

interface SafetyShieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  role: SafetyRole;
  userId?: string;
  userName?: string;
  userPhone?: string;
  lat?: number;
  lng?: number;
  tripId?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  driverName?: string;
  driverPhone?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  licensePlate?: string;
  verificationPin?: string;
}

export function SafetyFloatingButton({
  onClick,
  hasActiveAlert = false,
  className = "",
}: {
  onClick: () => void;
  hasActiveAlert?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open SOLO South Africa Rapid-Response Safety & Panic Shield"
      className={`group flex items-center gap-2 px-3.5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-2xl border transition-all active:scale-95 pointer-events-auto touch-manipulation ${
        hasActiveAlert
          ? "bg-red-600 text-white border-red-300 animate-pulse shadow-red-600/50"
          : "bg-red-600/95 hover:bg-red-600 text-white border-red-400/50 shadow-red-600/30"
      } ${className}`}
    >
      <ShieldAlert size={17} className="shrink-0" />
      <span>SOS Panic</span>
      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
    </button>
  );
}

export default function SafetyShieldModal({
  isOpen,
  onClose,
  role,
  userId,
  userName,
  userPhone,
  lat,
  lng,
  tripId,
  pickupLocation,
  dropoffLocation,
  driverName,
  driverPhone,
  vehicleMake,
  vehicleModel,
  licensePlate,
  verificationPin,
}: SafetyShieldModalProps) {
  const [activeTab, setActiveTab] = useState<"panic" | "hotlines" | "contacts">("panic");
  const [category, setCategory] = useState<EmergencyCategory>("armed_response");
  const [silentDuress, setSilentDuress] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [activeIncident, setActiveIncident] = useState<SafetyIncidentRecord | null>(null);
  const [sirenActive, setSirenActive] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Trusted Contacts (ICE) state
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactRelation, setNewContactRelation] = useState("Family / Armed Security");

  const resolvedLat = typeof lat === "number" && lat !== 0 ? lat : -26.2041;
  const resolvedLng = typeof lng === "number" && lng !== 0 ? lng : 28.0473;
  const geohashSector = encodeGeohash(resolvedLat, resolvedLng, 6).toUpperCase();
  const liveMapsUrl = buildGoogleMapsPinUrl(resolvedLat, resolvedLng);

  useEffect(() => {
    if (isOpen) {
      setContacts(getTrustedContacts(role));
      setSirenActive(emergencySiren.isRunning());
    }
  }, [isOpen, role]);

  // Handle 3-second accidental-tap countdown before automatic armed response dispatch
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      executePanicDispatch();
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const executePanicDispatch = async () => {
    setIsDispatching(true);
    try {
      const incident = await triggerRapidResponseSos(
        {
          role,
          category,
          silentDuress,
          userId,
          userName: userName || (role === "driver" ? "SOLO Driver" : "SOLO Rider"),
          userPhone,
          lat: resolvedLat,
          lng: resolvedLng,
          tripId,
          pickupLocation,
          dropoffLocation,
          driverName,
          driverPhone,
          vehicleMake,
          vehicleModel,
          licensePlate,
          verificationPin,
        },
        (dispatched) => {
          broadcastEvent("sos_emergency_alert", dispatched);
        }
      );

      setActiveIncident(incident);

      // If not in silent duress mode and armed response or hijack is selected, vibrate device
      if (!silentDuress && typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate([400, 150, 400, 150, 600]);
        } catch {
          // Ignore
        }
      }
    } finally {
      setIsDispatching(false);
    }
  };

  const handleToggleSiren = () => {
    if (sirenActive || emergencySiren.isRunning()) {
      emergencySiren.stop();
      setSirenActive(false);
    } else {
      const started = emergencySiren.start();
      setSirenActive(started);
    }
  };

  const handleCopyGpsLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `SOLO Emergency GPS Location (${geohashSector}): ${liveMapsUrl}`
      );
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName.trim() || !newContactPhone.trim()) return;
    const updated = saveTrustedContacts(role, [
      ...contacts,
      {
        id: crypto.randomUUID(),
        name: newContactName,
        phone: newContactPhone,
        relationship: newContactRelation,
      },
    ]);
    setContacts(updated);
    setNewContactName("");
    setNewContactPhone("");
  };

  const handleRemoveContact = (id: string) => {
    const updated = saveTrustedContacts(
      role,
      contacts.filter((c) => c.id !== id)
    );
    setContacts(updated);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-950 rounded-3xl w-full max-w-lg shadow-2xl border border-red-500/30 dark:border-red-500/40 overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] max-h-[92dvh] flex flex-col">
        {/* Top Security Header */}
        <div className="bg-gradient-to-r from-red-700 via-red-600 to-rose-700 text-white p-4 sm:p-5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-white/15 rounded-2xl border border-white/20 shrink-0">
              <ShieldAlert size={24} className="text-white animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-black text-base sm:text-lg tracking-tight truncate">
                  SOLO SA Rapid-Response Shield
                </h2>
                <span className="text-[10px] font-black uppercase bg-black/30 px-2 py-0.5 rounded-full border border-white/20 shrink-0">
                  24/7 ZA SOS
                </span>
              </div>
              <p className="text-xs text-red-100 truncate">
                Live GPS Sector <span className="font-mono font-bold">{geohashSector}</span> •{" "}
                {resolvedLat.toFixed(4)}, {resolvedLng.toFixed(4)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setCountdown(null);
              if (emergencySiren.isRunning()) {
                emergencySiren.stop();
                setSirenActive(false);
              }
              onClose();
            }}
            className="p-2 rounded-xl bg-black/20 hover:bg-black/40 text-white transition shrink-0"
            aria-label="Close Safety Shield"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 bg-gray-100 dark:bg-zinc-900 p-1.5 gap-1 border-b border-gray-200 dark:border-zinc-800 shrink-0 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab("panic")}
            className={`py-2 px-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
              activeTab === "panic"
                ? "bg-red-600 text-white shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <Radio size={14} />
            <span>SOS Dispatch</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("hotlines")}
            className={`py-2 px-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
              activeTab === "hotlines"
                ? "bg-red-600 text-white shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <PhoneCall size={14} />
            <span>SA Hotlines</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("contacts")}
            className={`py-2 px-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
              activeTab === "contacts"
                ? "bg-red-600 text-white shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <UserPlus size={14} />
            <span>ICE Contacts ({contacts.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4">
          {activeTab === "panic" && (
            <>
              {/* Active Trip / Vehicle Telemetry Strip */}
              <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-zinc-900/90 border border-gray-200/80 dark:border-zinc-800 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 font-bold text-gray-900 dark:text-white">
                    <MapPin size={14} className="text-red-500 shrink-0" />
                    <span className="truncate">
                      GPS Lock: {resolvedLat.toFixed(5)}, {resolvedLng.toFixed(5)}
                    </span>
                  </div>
                  {licensePlate && (
                    <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 font-semibold">
                      <Car size={13} className="text-blue-500 shrink-0" />
                      <span className="truncate">
                        {[vehicleMake, vehicleModel].filter(Boolean).join(" ") || "Vehicle"} •{" "}
                        <strong className="font-mono bg-amber-300 text-black px-1.5 py-0.2 rounded">
                          {licensePlate}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCopyGpsLink}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 font-bold hover:border-red-400 transition"
                >
                  {copiedLink ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                  <span>{copiedLink ? "Copied" : "Copy Pin"}</span>
                </button>
              </div>

              {/* Emergency Category Selector */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                  Select Emergency Threat Type
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                  {(
                    [
                      { id: "armed_response", label: "🚨 Armed Security Panic" },
                      { id: "hijack_duress", label: "🕵️ Hijack / Duress Threat" },
                      { id: "medical_emergency", label: "🚑 Medical / Trauma" },
                      { id: "accident_roadside", label: "💥 Crash / Roadside SOS" },
                    ] as { id: EmergencyCategory; label: string }[]
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setCategory(item.id);
                        if (item.id === "hijack_duress") setSilentDuress(true);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        category === item.id
                          ? "bg-red-50 dark:bg-red-950/50 border-red-500 text-red-700 dark:text-red-300 shadow-2xs"
                          : "bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Silent Duress Protocol Toggle */}
              <div className="p-3 rounded-2xl bg-zinc-900 text-white border border-zinc-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <VolumeX size={18} className="text-amber-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold">Silent Hijack / Duress Mode</p>
                    <p className="text-[11px] text-zinc-400">
                      Transmits live GPS & vehicle plate silently with zero audio or vibration.
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={silentDuress}
                  onChange={(e) => setSilentDuress(e.target.checked)}
                  className="w-5 h-5 accent-red-600 rounded cursor-pointer"
                />
              </div>

              {/* Primary Panic Trigger or Active Incident Card */}
              {!activeIncident ? (
                countdown !== null ? (
                  <div className="p-5 rounded-3xl bg-red-600 text-white text-center space-y-3 animate-pulse shadow-xl shadow-red-600/30">
                    <p className="text-xs font-black uppercase tracking-widest">
                      Dispatching Armed Response & Live GPS Mesh in
                    </p>
                    <div className="text-5xl font-black font-mono">{countdown}s</div>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCountdown(null);
                          executePanicDispatch();
                        }}
                        className="flex-1 py-3 bg-white text-red-700 font-black rounded-xl text-xs uppercase tracking-wider shadow"
                      >
                        Dispatch Immediately
                      </button>
                      <button
                        type="button"
                        onClick={() => setCountdown(null)}
                        className="px-4 py-3 bg-black/30 hover:bg-black/50 text-white font-bold rounded-xl text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isDispatching}
                    onClick={() => setCountdown(3)}
                    className="w-full py-5 px-6 rounded-3xl bg-gradient-to-r from-red-600 via-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-[0.99] text-white font-black text-base sm:text-lg tracking-tight shadow-2xl shadow-red-600/40 border border-red-400/40 flex flex-col items-center justify-center gap-1 transition"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldAlert size={24} />
                      <span>
                        {isDispatching
                          ? "TRANSMITTING LIVE SOS..."
                          : "TRIGGER RAPID-RESPONSE PANIC"}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-red-100">
                      Alerts Control Room, Nearby SOLO Responders & Prepares WhatsApp GPS Beacon
                    </span>
                  </button>
                )
              ) : (
                <div className="p-4 rounded-3xl bg-emerald-950/90 border border-emerald-500/50 text-white space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
                      <CheckCircle2 size={18} />
                      <span>SOS DISPATCHED • {activeIncident.incidentCode}</span>
                    </div>
                    <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      LIVE TRACKING
                    </span>
                  </div>
                  <p className="text-xs text-emerald-100/90 leading-relaxed">
                    Your exact GPS coordinates, Geohash sector (
                    <strong>{activeIncident.geohash6.toUpperCase()}</strong>), and vehicle details
                    have been broadcast over the SOLO Realtime Mesh and logged for emergency
                    responders.
                  </p>

                  {/* 1-Tap WhatsApp SOS Beacon to Trusted Contacts or Any Contact */}
                  <div className="space-y-2 pt-1">
                    <a
                      href={buildWhatsAppEmergencySosUrl(activeIncident, contacts[0]?.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs rounded-2xl flex items-center justify-center gap-2 shadow-lg transition"
                    >
                      <MessageCircle size={16} />
                      <span>
                        {contacts[0]
                          ? `Send Live GPS SOS to ${contacts[0].name} (WhatsApp)`
                          : "Share Live Emergency GPS Pin via WhatsApp"}
                      </span>
                    </a>

                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href="tel:10111"
                        className="py-2.5 px-3 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow"
                      >
                        <PhoneCall size={14} />
                        <span>Call SAPS 10111</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => setActiveIncident(null)}
                        className="py-2.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs rounded-xl"
                      >
                        Reset / New Alert
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Deterrent Siren & Instant WhatsApp Beacon Row */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleToggleSiren}
                  className={`py-3 px-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 border transition ${
                    sirenActive
                      ? "bg-amber-500 text-black border-amber-300 animate-bounce shadow-lg"
                      : "bg-gray-100 dark:bg-zinc-900 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-zinc-800 hover:border-amber-500"
                  }`}
                >
                  <Siren size={16} className={sirenActive ? "text-black" : "text-amber-500"} />
                  <span>{sirenActive ? "Stop Loud Siren" : "Loud Deterrent Siren"}</span>
                </button>

                <a
                  href={buildWhatsAppEmergencySosUrl(
                    activeIncident || {
                      id: "preview",
                      incidentCode: "SOS-ZA-LIVE",
                      role,
                      category,
                      userName: userName || (role === "driver" ? "SOLO Driver" : "SOLO Rider"),
                      userPhone,
                      lat: resolvedLat,
                      lng: resolvedLng,
                      geohash6: geohashSector.toLowerCase(),
                      googleMapsUrl: liveMapsUrl,
                      tripId,
                      pickupLocation,
                      dropoffLocation,
                      driverName,
                      driverPhone,
                      vehicleMake,
                      vehicleModel,
                      licensePlate,
                      verificationPin,
                      status: "dispatched",
                      dispatchedChannels: [],
                      createdAt: new Date().toISOString(),
                    },
                    contacts[0]?.phone
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3 px-3 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                >
                  <MessageCircle size={15} />
                  <span>WhatsApp SOS Pin</span>
                </a>
              </div>
            </>
          )}

          {activeTab === "hotlines" && (
            <div className="space-y-2.5">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Tap any official South African emergency responder below to dial immediately with
                your current GPS sector (<strong className="font-mono">{geohashSector}</strong>)
                ready to read out:
              </p>
              {SA_EMERGENCY_HOTLINES.map((h) => (
                <a
                  key={h.id}
                  href={`tel:${h.number}`}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-gray-50 dark:bg-zinc-900 hover:bg-red-50 dark:hover:bg-red-950/30 border border-gray-200 dark:border-zinc-800 hover:border-red-400 transition group"
                >
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-gray-900 dark:text-white">
                        {h.name}
                      </span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                        {h.badge}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{h.subtitle}</p>
                  </div>
                  <div className="flex items-center gap-1.5 bg-red-600 group-hover:bg-red-500 text-white font-mono font-black text-xs px-3 py-2 rounded-xl shadow shrink-0">
                    <PhoneCall size={14} />
                    <span>{h.number}</span>
                  </div>
                </a>
              ))}
            </div>
          )}

          {activeTab === "contacts" && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 text-xs text-blue-900 dark:text-blue-200">
                Save up to <strong>3 Trusted Emergency Contacts (ICE)</strong>. When you trigger an
                SOS, SOLO pre-addresses your WhatsApp Live GPS Beacon directly to your primary
                contact.
              </div>

              {contacts.length < 3 && (
                <form onSubmit={handleAddContact} className="space-y-2.5 bg-gray-50 dark:bg-zinc-900 p-3.5 rounded-2xl border border-gray-200 dark:border-zinc-800">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Contact Name (e.g. Spouse / Security)"
                      value={newContactName}
                      onChange={(e) => setNewContactName(e.target.value)}
                      className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white"
                      required
                    />
                    <input
                      type="tel"
                      placeholder="SA Mobile (e.g. 082 123 4567)"
                      value={newContactPhone}
                      onChange={(e) => setNewContactPhone(e.target.value)}
                      className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white"
                      required
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Relationship (e.g. Family / Armed Response)"
                      value={newContactRelation}
                      onChange={(e) => setNewContactRelation(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-xl text-xs bg-white dark:bg-zinc-950 border border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-white"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shrink-0 flex items-center gap-1"
                    >
                      <UserPlus size={14} />
                      <span>Save ICE</span>
                    </button>
                  </div>
                </form>
              )}

              {contacts.length === 0 ? (
                <div className="text-center py-6 text-xs text-gray-400">
                  No trusted emergency contacts saved yet. Add one above for 1-tap SOS dispatch.
                </div>
              ) : (
                <div className="space-y-2">
                  {contacts.map((c, idx) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-3 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-gray-900 dark:text-white">
                            {c.name}
                          </span>
                          {idx === 0 && (
                            <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                              Primary SOS
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 font-mono">
                          {c.phone} • {c.relationship}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveContact(c.id)}
                        className="p-2 text-gray-400 hover:text-red-500 transition"
                        aria-label="Remove contact"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
