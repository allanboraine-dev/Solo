"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Play,
  RotateCcw,
  Zap,
  MapPin,
  Car,
  Navigation,
  CheckCircle2,
  Clock,
  ShieldCheck,
  CreditCard,
  MessageSquare,
  KeyRound,
  DollarSign,
  Smartphone,
  ChevronRight,
  Send,
  Sliders,
  Phone,
  Sparkles,
  ArrowRight,
  Activity,
  Layers,
} from "lucide-react";
import dynamic from "next/dynamic";
import { calculateDistanceKm, isWithinRadiusKm, estimateEtaMinutes } from "@/utils/geo";
import { calculateFare } from "@/utils/mapService";

// Presets for South African Metros
interface RoutePreset {
  id: string;
  name: string;
  city: string;
  pickup: { name: string; lat: number; lng: number };
  dropoff: { name: string; lat: number; lng: number };
}

const SA_ROUTE_PRESETS: RoutePreset[] = [
  {
    id: "cpt-camps-bay",
    name: "Camps Bay to V&A Waterfront",
    city: "Cape Town",
    pickup: { name: "Camps Bay Beach, Victoria Rd", lat: -33.9511, lng: 18.3789 },
    dropoff: { name: "V&A Waterfront, Dock Rd", lat: -33.9056, lng: 18.4206 },
  },
  {
    id: "jhb-sandton",
    name: "Sandton City to Rosebank Mall",
    city: "Johannesburg",
    pickup: { name: "Sandton City, 5th St", lat: -26.1076, lng: 28.0567 },
    dropoff: { name: "Rosebank Mall, Cradock Ave", lat: -26.1458, lng: 28.0435 },
  },
  {
    id: "dbn-umhlanga",
    name: "Gateway Umhlanga to Florida Rd",
    city: "Durban",
    pickup: { name: "Gateway Theatre, Umhlanga", lat: -29.7262, lng: 31.0652 },
    dropoff: { name: "Florida Rd, Morningside", lat: -29.8344, lng: 31.0156 },
  },
  {
    id: "pta-menlyn",
    name: "Menlyn Park to Hatfield Gautrain",
    city: "Pretoria",
    pickup: { name: "Menlyn Park Mall, Atterbury Rd", lat: -25.7828, lng: 28.2758 },
    dropoff: { name: "Hatfield Gautrain Station, Grosvenor St", lat: -25.7489, lng: 28.2378 },
  },
];

type TripStep =
  | "idle"
  | "requested"
  | "accepted"
  | "driver_arrived"
  | "in_progress"
  | "payment_pending"
  | "completed";

interface SimLog {
  id: string;
  time: string;
  source: "Rider" | "Driver" | "PostGIS" | "WebPush" | "Paystack";
  message: string;
  type: "info" | "success" | "warn" | "accent";
}

export default function DualWindowSimulator() {
  const [selectedRoute, setSelectedRoute] = useState<RoutePreset>(SA_ROUTE_PRESETS[0]);
  const [tripStep, setTripStep] = useState<TripStep>("idle");
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);

  // Rider state
  const [riderPhone] = useState<string>("+27 82 555 1234");
  const [riderPin] = useState<string>("4892");
  const [chatMessages, setChatMessages] = useState<
    { sender: "rider" | "driver"; text: string; time: string }[]
  >([]);
  const [riderChatInput, setRiderChatInput] = useState<string>("");
  const [driverChatInput, setDriverChatInput] = useState<string>("");

  // Driver state
  const [isDriverOnline, setIsDriverOnline] = useState<boolean>(true);
  const [driverName] = useState<string>("Sipho Ndlovu");
  const [driverVehicle] = useState<string>("Toyota Corolla Quest (White)");
  const [driverPlate] = useState<string>("CA 492-810");
  const [pinInput, setPinInput] = useState<string>("");
  const [pinError, setPinError] = useState<boolean>(false);

  // Telemetry logs
  const [logs, setLogs] = useState<SimLog[]>([]);
  const [tripProgressPct, setTripProgressPct] = useState<number>(0);

  // Computed Trip Data
  const distanceKm = useMemo(() => {
    return calculateDistanceKm(
      selectedRoute.pickup.lat,
      selectedRoute.pickup.lng,
      selectedRoute.dropoff.lat,
      selectedRoute.dropoff.lng
    );
  }, [selectedRoute]);

  const fareZar = useMemo(() => {
    return calculateFare(distanceKm);
  }, [distanceKm]);

  const etaMinutes = useMemo(() => {
    return estimateEtaMinutes(distanceKm);
  }, [distanceKm]);

  const addLog = (
    source: SimLog["source"],
    message: string,
    type: SimLog["type"] = "info"
  ) => {
    const newLog: SimLog = {
      id: Math.random().toString(36).substring(7),
      time: new Date().toLocaleTimeString([], { hour12: false }),
      source,
      message,
      type,
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 49)]);
  };

  // Initial greeting log
  useEffect(() => {
    addLog("PostGIS", `Simulator initialized for ${selectedRoute.city} (${selectedRoute.name})`, "info");
  }, []);

  // Handle auto-play workflow
  useEffect(() => {
    if (!isAutoPlaying) return;

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms / speedMultiplier));
    let cancelled = false;

    const runAutoFlow = async () => {
      // Step 1: Rider requests
      if (tripStep === "idle" && !cancelled) {
        handleRiderRequest();
        await delay(2500);
      }

      // Step 2: Driver accepts
      if (!cancelled) {
        handleDriverAccept();
        await delay(3000);
      }

      // Step 3: Driver arrives
      if (!cancelled) {
        handleDriverArrive();
        await delay(2500);
      }

      // Step 4: PIN verification
      if (!cancelled) {
        setPinInput(riderPin);
        await delay(1000);
        handleVerifyPin(riderPin);
        await delay(3500);
      }

      // Step 5: Complete trip
      if (!cancelled) {
        handleDriverCompleteDropoff();
        await delay(2500);
      }

      // Step 6: Settle payment
      if (!cancelled) {
        handlePaystackSettlement();
        setIsAutoPlaying(false);
      }
    };

    runAutoFlow();

    return () => {
      cancelled = true;
    };
  }, [isAutoPlaying]);

  // Actions
  const handleRiderRequest = () => {
    setTripStep("requested");
    setTripProgressPct(10);
    addLog(
      "Rider",
      `Requested ride: ${selectedRoute.pickup.name} -> ${selectedRoute.dropoff.name} (R${fareZar})`,
      "accent"
    );
    addLog(
      "PostGIS",
      `Driver match within 15km dispatch radius: ${driverName} found 2.1km away`,
      "info"
    );
    addLog(
      "WebPush",
      `Dispatched background push alert to driver: "🚖 New Trip Request! R${fareZar} • Pickup: ${selectedRoute.pickup.name}"`,
      "info"
    );
  };

  const handleDriverAccept = () => {
    setTripStep("accepted");
    setTripProgressPct(35);
    addLog(
      "Driver",
      `${driverName} accepted trip. Atomic RPC accept_trip executed successfully`,
      "success"
    );
    addLog(
      "WebPush",
      `Rider notified: "${driverName} is on the way in ${driverVehicle}. PIN: ${riderPin}"`,
      "info"
    );
  };

  const handleDriverArrive = () => {
    setTripStep("driver_arrived");
    setTripProgressPct(50);
    addLog("Driver", `${driverName} marked arrived at pickup spot`, "info");
    addLog(
      "WebPush",
      `Rider notified: "Your driver has arrived! Share PIN ${riderPin} to start trip"`,
      "accent"
    );
  };

  const handleVerifyPin = (pin: string) => {
    if (pin === riderPin) {
      setPinError(false);
      setTripStep("in_progress");
      setTripProgressPct(75);
      addLog(
        "Driver",
        `PIN ${pin} verified successfully. Trip status transitioned to 'in_progress'`,
        "success"
      );
      addLog(
        "PostGIS",
        `Live GPS telemetry broadcasting coordinates from ${selectedRoute.pickup.name} to ${selectedRoute.dropoff.name}`,
        "info"
      );
    } else {
      setPinError(true);
      addLog("Driver", `Invalid PIN "${pin}" rejected. Verification failed`, "warn");
    }
  };

  const handleDriverCompleteDropoff = () => {
    setTripStep("payment_pending");
    setTripProgressPct(95);
    addLog("Driver", `Trip arrived at dropoff destination. Fare settlement initiated: R${fareZar}`, "accent");
  };

  const handlePaystackSettlement = () => {
    setTripStep("completed");
    setTripProgressPct(100);
    addLog(
      "Paystack",
      `PCI-DSS Charge Success: R${fareZar} (100% credited to driver; ZERO commission deducted)`,
      "success"
    );
    addLog(
      "WebPush",
      `Both parties notified of completed trip and payment confirmation.`,
      "info"
    );
  };

  const handleReset = () => {
    setTripStep("idle");
    setTripProgressPct(0);
    setPinInput("");
    setPinError(false);
    setIsAutoPlaying(false);
    setChatMessages([]);
    addLog("PostGIS", `Simulation reset for ${selectedRoute.name}`, "info");
  };

  const handleSendRiderChat = () => {
    if (!riderChatInput.trim()) return;
    const msg = {
      sender: "rider" as const,
      text: riderChatInput,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setChatMessages((prev) => [...prev, msg]);
    setRiderChatInput("");
    addLog("Rider", `Chat message sent: "${msg.text}"`, "info");
  };

  const handleSendDriverChat = () => {
    if (!driverChatInput.trim()) return;
    const msg = {
      sender: "driver" as const,
      text: driverChatInput,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setChatMessages((prev) => [...prev, msg]);
    setDriverChatInput("");
    addLog("Driver", `Chat message sent: "${msg.text}"`, "info");
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 sm:p-6 flex flex-col">
      {/* Top Simulator Control Bar */}
      <div className="max-w-7xl mx-auto w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-5 mb-6 shadow-2xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
              <Zap size={14} className="text-amber-400" />
              <span>Real-Time E-Hailing Testbed</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Interactive Dual-Window Simulator
            </h1>
            <p className="text-xs text-zinc-400">
              Simulate full trip state machines side-by-side: Rider booking vs Driver dispatch, PIN verification, and Paystack settlement.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsAutoPlaying(!isAutoPlaying)}
              className={`py-2.5 px-4 font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-2 active:scale-95 ${
                isAutoPlaying
                  ? "bg-amber-600 hover:bg-amber-500 text-white animate-pulse"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20"
              }`}
            >
              <Play size={14} className={isAutoPlaying ? "animate-spin" : ""} />
              <span>{isAutoPlaying ? "Auto-Playing Full Trip..." : "Auto-Play Journey"}</span>
            </button>

            <button
              onClick={handleReset}
              className="py-2.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-zinc-700"
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>

            {/* Speed Multiplier */}
            <div className="flex items-center bg-zinc-950 rounded-xl p-1 border border-zinc-800 text-xs font-bold">
              {[1, 2, 5].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setSpeedMultiplier(spd)}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    speedMultiplier === spd
                      ? "bg-blue-600 text-white"
                      : "text-zinc-500 hover:text-white"
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Route Preset Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pt-2 border-t border-zinc-800/80">
          <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider shrink-0 flex items-center gap-1">
            <MapPin size={12} /> Route Preset:
          </span>
          {SA_ROUTE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => {
                setSelectedRoute(preset);
                handleReset();
              }}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold transition shrink-0 border ${
                selectedRoute.id === preset.id
                  ? "bg-blue-600/20 text-blue-400 border-blue-500/50"
                  : "bg-zinc-950 text-zinc-400 hover:text-white border-zinc-800"
              }`}
            >
              {preset.city}: {preset.name}
            </button>
          ))}
        </div>

        {/* Global Progress Bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400">
            <span>Trip State: {tripStep.toUpperCase()}</span>
            <span>Fare: R{fareZar} (100% Driver Kept) • {distanceKm.toFixed(1)} km</span>
          </div>
          <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-800">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${tripProgressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Split-Screen Section */}
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
        {/* ==================================================== */}
        {/* LEFT WINDOW: RIDER PHONE VIEW (BLUE THEME)           */}
        {/* ==================================================== */}
        <div className="bg-zinc-900 border-2 border-blue-900/60 rounded-[2.5rem] p-4 sm:p-6 shadow-2xl flex flex-col justify-between relative overflow-hidden">
          {/* Phone Speaker Notch */}
          <div className="w-24 h-4 bg-zinc-950 rounded-full mx-auto mb-4 border border-zinc-800 flex items-center justify-center">
            <div className="w-8 h-1 bg-zinc-800 rounded-full" />
          </div>

          <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
              <span className="font-bold text-sm text-blue-400">Rider App (PWA)</span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">{riderPhone}</span>
          </div>

          {/* Rider Content Body */}
          <div className="flex-1 space-y-4">
            {tripStep === "idle" && (
              <div className="space-y-4 animate-in fade-in">
                <div className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-3 text-xs">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-zinc-500">Pickup Location</label>
                    <p className="font-semibold text-white mt-0.5">{selectedRoute.pickup.name}</p>
                  </div>
                  <div className="border-t border-zinc-900 pt-2">
                    <label className="text-[10px] uppercase font-bold text-zinc-500">Destination</label>
                    <p className="font-semibold text-white mt-0.5">{selectedRoute.dropoff.name}</p>
                  </div>
                </div>

                <div className="p-4 bg-blue-950/20 border border-blue-900/40 rounded-2xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Guaranteed Fair Fare</span>
                    <span className="text-2xl font-black text-blue-400">R{fareZar}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-normal">
                    Calculated using standard formula: R20 base fare + R10/km ({distanceKm.toFixed(1)} km). Zero platform surge or hidden commissions.
                  </p>
                </div>

                <button
                  onClick={handleRiderRequest}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-extrabold rounded-2xl shadow-xl shadow-blue-600/30 transition text-sm flex items-center justify-center gap-2"
                >
                  <Navigation size={18} />
                  <span>Request SOLO Ride (R{fareZar})</span>
                </button>
              </div>
            )}

            {tripStep === "requested" && (
              <div className="py-12 text-center space-y-4 animate-in fade-in">
                <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <h3 className="text-lg font-bold">Matching nearby verified drivers...</h3>
                <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                  Broadcasting dispatch request to available drivers within 15km of {selectedRoute.pickup.name}.
                </p>
              </div>
            )}

            {(tripStep === "accepted" || tripStep === "driver_arrived" || tripStep === "in_progress") && (
              <div className="space-y-4 animate-in fade-in">
                {/* Driver Info Card */}
                <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-emerald-400">
                        {tripStep === "driver_arrived" ? "Driver Arrived Outside!" : tripStep === "in_progress" ? "Trip In Progress" : "Driver En Route"}
                      </span>
                      <h4 className="font-bold text-base text-white">{driverName}</h4>
                      <p className="text-xs text-zinc-400">{driverVehicle}</p>
                    </div>
                    <span className="font-mono bg-zinc-900 border border-zinc-800 text-xs px-2.5 py-1 rounded-lg text-white font-bold">
                      {driverPlate}
                    </span>
                  </div>

                  {/* 4-digit verification PIN display */}
                  <div className="p-3 bg-blue-950/30 border border-blue-900/50 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-blue-300">
                      <KeyRound size={16} className="text-blue-400" />
                      <span className="font-semibold">Your Trip Safety PIN:</span>
                    </div>
                    <span className="font-mono text-xl font-black text-white tracking-widest bg-blue-600 px-3 py-0.5 rounded-lg">
                      {riderPin}
                    </span>
                  </div>
                </div>

                {/* In-Trip Chat Box */}
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 flex flex-col h-44">
                  <p className="text-[10px] font-bold uppercase text-zinc-500 mb-2 flex items-center gap-1">
                    <MessageSquare size={12} /> Direct Chat with Driver
                  </p>
                  <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                    {chatMessages.length === 0 ? (
                      <p className="text-xs text-zinc-600 italic text-center pt-8">No messages yet. Say hello!</p>
                    ) : (
                      chatMessages.map((m, i) => (
                        <div
                          key={i}
                          className={`text-xs p-2 rounded-xl max-w-[80%] ${
                            m.sender === "rider"
                              ? "bg-blue-600 text-white ml-auto"
                              : "bg-zinc-800 text-zinc-200"
                          }`}
                        >
                          <span className="block">{m.text}</span>
                          <span className="text-[9px] opacity-70 block text-right mt-0.5">{m.time}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-zinc-900">
                    <input
                      type="text"
                      placeholder="Message driver..."
                      value={riderChatInput}
                      onChange={(e) => setRiderChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendRiderChat()}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handleSendRiderChat}
                      className="p-1.5 bg-blue-600 text-white rounded-xl active:scale-95 transition"
                    >
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tripStep === "payment_pending" && (
              <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-3xl text-center space-y-4 animate-in fade-in">
                <div className="w-12 h-12 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto">
                  <CreditCard size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Trip Arrived! Settle Fare</h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Pay driver directly via Paystack 3D-Secure or Cash.
                  </p>
                </div>
                <div className="text-4xl font-black text-blue-400">R{fareZar}</div>
                <button
                  onClick={handlePaystackSettlement}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-2xl shadow-lg transition text-sm flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={18} />
                  <span>Pay R{fareZar} via Paystack</span>
                </button>
              </div>
            )}

            {tripStep === "completed" && (
              <div className="p-6 bg-emerald-950/20 border border-emerald-800/40 rounded-3xl text-center space-y-4 animate-in fade-in">
                <CheckCircle2 size={48} className="text-emerald-400 mx-auto" />
                <h3 className="text-xl font-black text-emerald-400">Payment Confirmed!</h3>
                <p className="text-xs text-zinc-300">
                  R{fareZar} paid directly to {driverName}. Zero platform commission was subtracted.
                </p>
                <button
                  onClick={handleReset}
                  className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-xs transition"
                >
                  Book Another Ride
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ==================================================== */}
        {/* RIGHT WINDOW: DRIVER PHONE VIEW (GREEN THEME)        */}
        {/* ==================================================== */}
        <div className="bg-zinc-900 border-2 border-emerald-900/60 rounded-[2.5rem] p-4 sm:p-6 shadow-2xl flex flex-col justify-between relative overflow-hidden">
          {/* Phone Speaker Notch */}
          <div className="w-24 h-4 bg-zinc-950 rounded-full mx-auto mb-4 border border-zinc-800 flex items-center justify-center">
            <div className="w-8 h-1 bg-zinc-800 rounded-full" />
          </div>

          <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold text-sm text-emerald-400">Driver Portal (PWA)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-zinc-400">{driverName}</span>
              <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30">
                100% Earnings
              </span>
            </div>
          </div>

          {/* Driver Content Body */}
          <div className="flex-1 space-y-4">
            {tripStep === "idle" && (
              <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-2xl text-center space-y-4 animate-in fade-in">
                <div className="w-14 h-14 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-3xl flex items-center justify-center mx-auto">
                  <Car size={32} />
                </div>
                <div>
                  <h3 className="text-xl font-bold">You are Online</h3>
                  <p className="text-xs text-zinc-400 mt-1">
                    Waiting for incoming ride requests near {selectedRoute.pickup.name}...
                  </p>
                </div>
                <div className="p-3 bg-zinc-900 rounded-xl text-xs text-zinc-400 flex items-center justify-between">
                  <span>GPS Coords:</span>
                  <span className="font-mono text-zinc-300">
                    {selectedRoute.pickup.lat.toFixed(4)}, {selectedRoute.pickup.lng.toFixed(4)}
                  </span>
                </div>
              </div>
            )}

            {tripStep === "requested" && (
              <div className="p-5 bg-gradient-to-br from-emerald-950/40 to-green-950/20 border-2 border-emerald-500/60 rounded-3xl space-y-4 animate-in zoom-in-95">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase font-extrabold text-emerald-400 tracking-wider flex items-center gap-1.5 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Incoming Ride Request!
                  </span>
                  <span className="text-2xl font-black text-white">R{fareZar}</span>
                </div>

                <div className="p-3.5 bg-zinc-950/80 rounded-2xl border border-zinc-800 space-y-2 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Pickup</span>
                    <p className="text-white font-semibold">{selectedRoute.pickup.name}</p>
                  </div>
                  <div className="border-t border-zinc-900 pt-2">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Dropoff</span>
                    <p className="text-white font-semibold">{selectedRoute.dropoff.name}</p>
                  </div>
                  <div className="text-[11px] text-zinc-400 pt-1 flex justify-between">
                    <span>Est. Distance: {distanceKm.toFixed(1)} km</span>
                    <span className="text-emerald-400 font-bold">Your Take: R{fareZar} (0% Fee)</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleDriverAccept}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black rounded-2xl shadow-xl shadow-emerald-600/30 transition text-sm flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={18} />
                    <span>Accept Ride (R{fareZar})</span>
                  </button>
                </div>
              </div>
            )}

            {tripStep === "accepted" && (
              <div className="p-5 bg-zinc-950 border border-zinc-800 rounded-2xl space-y-4 animate-in fade-in">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-xs text-zinc-500 font-bold uppercase">En Route to Pickup</span>
                    <h4 className="font-bold text-white text-base">{selectedRoute.pickup.name}</h4>
                  </div>
                  <span className="text-xl font-bold text-emerald-400">~{etaMinutes} min</span>
                </div>

                <button
                  onClick={handleDriverArrive}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5"
                >
                  <MapPin size={16} />
                  <span>Simulate Arrival at Pickup</span>
                </button>
              </div>
            )}

            {tripStep === "driver_arrived" && (
              <div className="p-5 bg-zinc-950 border-2 border-amber-500/50 rounded-2xl space-y-4 animate-in fade-in">
                <div>
                  <span className="text-xs text-amber-400 font-bold uppercase">Arrived at Pickup</span>
                  <h4 className="font-bold text-white text-base">Enter Rider 4-Digit PIN to Start</h4>
                  <p className="text-xs text-zinc-400 mt-1">Ask rider for their 4-digit safety PIN shown on their screen.</p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="Enter PIN..."
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    className={`flex-1 bg-zinc-900 border ${
                      pinError ? "border-rose-500" : "border-zinc-800"
                    } rounded-xl px-4 py-3 text-lg font-mono text-center tracking-widest text-white focus:outline-none`}
                  />
                  <button
                    onClick={() => handleVerifyPin(pinInput)}
                    className="py-3 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs active:scale-95 transition"
                  >
                    Verify & Start
                  </button>
                </div>
                {pinError && <p className="text-xs text-rose-400 font-bold">Invalid PIN! Rider PIN is {riderPin}</p>}
              </div>
            )}

            {tripStep === "in_progress" && (
              <div className="p-5 bg-zinc-950 border border-zinc-800 rounded-2xl space-y-4 animate-in fade-in">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-xs text-emerald-400 font-bold uppercase">Trip in Progress</span>
                    <h4 className="font-bold text-white text-base">Driving to {selectedRoute.dropoff.name}</h4>
                  </div>
                  <span className="text-xl font-bold text-white">R{fareZar}</span>
                </div>

                <button
                  onClick={handleDriverCompleteDropoff}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black rounded-2xl shadow-lg transition text-sm flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={18} />
                  <span>Arrived at Destination (Complete)</span>
                </button>
              </div>
            )}

            {(tripStep === "payment_pending" || tripStep === "completed") && (
              <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-3xl text-center space-y-4 animate-in fade-in">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
                  <DollarSign size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold">
                    {tripStep === "completed" ? "Payment Settled!" : "Awaiting Rider Settlement"}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">Total Trip Fare: R{fareZar}</p>
                </div>
                <div className="p-3 bg-zinc-900 rounded-xl text-xs text-zinc-300 flex justify-between">
                  <span>Platform Commission:</span>
                  <span className="text-emerald-400 font-bold">R0.00 (Zero Fee)</span>
                </div>
                <div className="text-3xl font-black text-emerald-400">You Keep: R{fareZar}</div>
              </div>
            )}

            {/* Driver Chat View */}
            {(tripStep === "accepted" || tripStep === "driver_arrived" || tripStep === "in_progress") && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-3 flex flex-col h-44">
                <p className="text-[10px] font-bold uppercase text-zinc-500 mb-2 flex items-center gap-1">
                  <MessageSquare size={12} /> Direct Chat with Rider
                </p>
                <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                  {chatMessages.length === 0 ? (
                    <p className="text-xs text-zinc-600 italic text-center pt-8">No messages yet.</p>
                  ) : (
                    chatMessages.map((m, i) => (
                      <div
                        key={i}
                        className={`text-xs p-2 rounded-xl max-w-[80%] ${
                          m.sender === "driver"
                            ? "bg-emerald-600 text-white ml-auto"
                            : "bg-zinc-800 text-zinc-200"
                        }`}
                      >
                        <span className="block">{m.text}</span>
                        <span className="text-[9px] opacity-70 block text-right mt-0.5">{m.time}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2 pt-2 border-t border-zinc-900">
                  <input
                    type="text"
                    placeholder="Message rider..."
                    value={driverChatInput}
                    onChange={(e) => setDriverChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendDriverChat()}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={handleSendDriverChat}
                    className="p-1.5 bg-emerald-600 text-white rounded-xl active:scale-95 transition"
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Telemetry Event Stream Drawer */}
      <div className="max-w-7xl mx-auto w-full mt-6 bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-emerald-400" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-300">
              Live Telemetry Event Log Stream
            </h3>
          </div>
          <span className="text-[11px] text-zinc-500 font-mono">{logs.length} events logged</span>
        </div>

        <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1.5 font-mono text-xs">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`p-2 rounded-lg flex items-start gap-3 border ${
                log.type === "success"
                  ? "bg-emerald-950/20 border-emerald-900/40 text-emerald-300"
                  : log.type === "accent"
                  ? "bg-blue-950/20 border-blue-900/40 text-blue-300"
                  : log.type === "warn"
                  ? "bg-rose-950/20 border-rose-900/40 text-rose-300"
                  : "bg-zinc-950 border-zinc-800/80 text-zinc-400"
              }`}
            >
              <span className="text-[10px] text-zinc-500 shrink-0">{log.time}</span>
              <span className="font-bold uppercase text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 shrink-0 border border-zinc-800 text-zinc-300">
                {log.source}
              </span>
              <span className="flex-1 break-words">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
