"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Phone,
  MessageCircle,
  Clock,
  MapPin,
  Car,
  ArrowLeft,
  Search,
  Sparkles,
  Info,
  HelpCircle,
  ChevronRight,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import {
  saveSupportTicket,
  dispatchLostItemDriverAlert,
  findMatchingTripForLostPhone,
  buildOfficialSupportWhatsAppUrl,
  type SupportTicket,
} from "@/utils/supportStore";

export default function LostPhonePage() {
  // Form State
  const [riderIdentifier, setRiderIdentifier] = useState("");
  const [riderName, setRiderName] = useState("");
  const [alternativeContactName, setAlternativeContactName] = useState("");
  const [alternativeContactPhone, setAlternativeContactPhone] = useState("");
  const [phoneMakeModel, setPhoneMakeModel] = useState("");
  const [phoneColor, setPhoneColor] = useState("");
  const [caseOrFeatures, setCaseOrFeatures] = useState("");
  const [lockScreenInfo, setLockScreenInfo] = useState("");
  const [seatLocation, setSeatLocation] = useState<
    "back_seat" | "front_passenger" | "floor" | "boot" | "unknown"
  >("back_seat");
  const [tripDate, setTripDate] = useState("Today");
  const [tripTime, setTripTime] = useState("");
  const [tripPickup, setTripPickup] = useState("");
  const [tripDropoff, setTripDropoff] = useState("");
  const [notes, setNotes] = useState("");

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultTicket, setResultTicket] = useState<SupportTicket | null>(null);
  const [matchedDriverInfo, setMatchedDriverInfo] = useState<{
    name: string;
    vehicle: string;
    plate: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!riderIdentifier.trim()) {
      setErrorMessage("Please enter your registered phone number or email.");
      return;
    }

    if (!alternativeContactPhone.trim()) {
      setErrorMessage("Please enter an alternative contact phone number where we can reach you right now.");
      return;
    }

    if (!phoneMakeModel.trim()) {
      setErrorMessage("Please specify the brand and model of the lost phone (e.g. Samsung Galaxy A54, iPhone 13).");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Submit to server API
      const response = await fetch("/api/support/lost-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          riderIdentifier: riderIdentifier.trim(),
          riderName: riderName.trim() || "Valued Passenger",
          alternativeContactName: alternativeContactName.trim() || "Emergency Contact",
          alternativeContactPhone: alternativeContactPhone.trim(),
          phoneMakeModel: phoneMakeModel.trim(),
          phoneColor: phoneColor.trim() || "Not specified",
          caseOrFeatures: caseOrFeatures.trim(),
          lockScreenInfo: lockScreenInfo.trim(),
          seatLocation,
          tripDate,
          tripTime,
          tripPickup,
          tripDropoff,
          notes,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to submit lost phone report. Please try again.");
      }

      let ticket = data.ticket as SupportTicket;

      // 2. Client-side local lookup & dispatch fallback
      if (typeof window !== "undefined") {
        const localMatch = findMatchingTripForLostPhone(
          riderIdentifier,
          tripDate,
          tripPickup || tripDropoff
        );

        if (localMatch) {
          const { trip, driver } = localMatch;
          ticket = {
            ...ticket,
            tripId: trip.id,
            driverId: trip.driver_id || driver?.id,
            driverName: driver?.fullName || ticket.driverName || "Assigned Driver",
            driverPhone: driver?.phone || ticket.driverPhone,
            vehiclePlate: driver?.licensePlate || ticket.vehiclePlate,
            vehicleModel: driver?.vehicleModel || ticket.vehicleModel,
            pickupLocation: trip.pickup_location || ticket.pickupLocation,
            dropoffLocation: trip.dropoff_location || ticket.dropoffLocation,
            status: "driver_notified",
          };

          if (driver) {
            setMatchedDriverInfo({
              name: driver.fullName,
              vehicle: `${driver.vehicleMake || ""} ${driver.vehicleModel || ""}`.trim() || "SOLO Vehicle",
              plate: driver.licensePlate || "Registered Plate",
            });
          }
        } else if (data.driverSummary) {
          setMatchedDriverInfo({
            name: data.driverSummary.name,
            vehicle: data.driverSummary.vehicle,
            plate: data.driverSummary.licensePlate,
          });
        }

        // Save ticket to local registry
        saveSupportTicket(ticket);

        // Dispatch instant alert to driver terminals
        dispatchLostItemDriverAlert(ticket);
      }

      setResultTicket(ticket);
    } catch (err: any) {
      setErrorMessage(err?.message || "An unexpected error occurred. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-gray-50 to-emerald-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 text-gray-900 dark:text-zinc-100 flex flex-col justify-between">
      {/* Top Navigation Bar */}
      <header className="border-b border-gray-200/80 dark:border-zinc-800/80 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/rider"
            className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition"
          >
            <ArrowLeft size={16} />
            <span>Back to Rider Portal</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/60 px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              Emergency Recovery Desk
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12 flex-1 w-full">
        {!resultTicket ? (
          <div>
            {/* Calming Reassurance Hero */}
            <div className="text-center mb-8 sm:mb-10">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 mb-4 shadow-inner ring-8 ring-emerald-50 dark:ring-emerald-950/30">
                <Smartphone size={32} />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900 dark:text-white">
                Left Your Phone in a SOLO Car?
              </h1>
              <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-zinc-400 max-w-lg mx-auto">
                Take a deep breath — we are here to help you get it back. You{" "}
                <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  do not need a password or SMS code
                </strong>{" "}
                to file this report.
              </p>

              {/* Informational reassurance banner */}
              <div className="mt-5 p-3.5 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 rounded-2xl flex items-start gap-3 text-left max-w-xl mx-auto text-xs sm:text-sm text-emerald-900 dark:text-emerald-200 shadow-2xs">
                <ShieldCheck size={20} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">100% Verified Drivers: </span>
                  Every SOLO driver is identity-verified with licensed vehicle plates and PRDP credentials. Submitting this form sends an immediate priority audio alert to your driver.
                </div>
              </div>
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-2xl text-sm flex items-center gap-2">
                <AlertTriangle size={18} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Recovery Form */}
            <form
              onSubmit={handleSubmit}
              className="bg-white dark:bg-zinc-900 border border-gray-200/80 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
            >
              {/* Step 1: Rider Account */}
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-3 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] flex items-center justify-center font-bold">1</span>
                  Your Account Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1">
                      Your Cell Number or Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 082 123 4567 or rider@gmail.com"
                      value={riderIdentifier}
                      onChange={(e) => setRiderIdentifier(e.target.value)}
                      required
                      className="w-full h-11 px-3.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition"
                    />
                    <span className="text-[11px] text-gray-500 dark:text-zinc-400 mt-1 block">
                      The phone number or email you booked the ride with.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1">
                      Your Full Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Thabo Mokoena"
                      value={riderName}
                      onChange={(e) => setRiderName(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition"
                    />
                  </div>
                </div>
              </div>

              {/* Step 2: Alternative Contact */}
              <div className="pt-4 border-t border-gray-100 dark:border-zinc-800">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-3 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] flex items-center justify-center font-bold">2</span>
                  How to Reach You Right Now
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1">
                      Alternative Contact Phone <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3.5 top-3.5 text-gray-400" />
                      <input
                        type="tel"
                        placeholder="e.g. 083 987 6543"
                        value={alternativeContactPhone}
                        onChange={(e) => setAlternativeContactPhone(e.target.value)}
                        required
                        className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition"
                      />
                    </div>
                    <span className="text-[11px] text-gray-500 dark:text-zinc-400 mt-1 block">
                      A borrowed phone, colleague, family member, or hotel front desk.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1">
                      Who Owns this Alternative Number?
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. My friend Sarah / Hotel Reception"
                      value={alternativeContactName}
                      onChange={(e) => setAlternativeContactName(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition"
                    />
                  </div>
                </div>
              </div>

              {/* Step 3: Phone Details */}
              <div className="pt-4 border-t border-gray-100 dark:border-zinc-800">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-3 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] flex items-center justify-center font-bold">3</span>
                  Phone Identification
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1">
                      Phone Brand & Model <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Samsung Galaxy A54 5G or iPhone 13"
                      value={phoneMakeModel}
                      onChange={(e) => setPhoneMakeModel(e.target.value)}
                      required
                      className="w-full h-11 px-3.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1">
                      Device Colour
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Black / Silver / Blue"
                      value={phoneColor}
                      onChange={(e) => setPhoneColor(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1">
                      Case & Distinguishing Features
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Clear silicone case with a sticker, cracked screen protector"
                      value={caseOrFeatures}
                      onChange={(e) => setCaseOrFeatures(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1">
                      Where in the Car?
                    </label>
                    <select
                      value={seatLocation}
                      onChange={(e) => setSeatLocation(e.target.value as any)}
                      className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition"
                    >
                      <option value="back_seat">Back Seat</option>
                      <option value="front_passenger">Front Passenger</option>
                      <option value="floor">Floor / Under Seat</option>
                      <option value="boot">Boot / Luggage</option>
                      <option value="unknown">Not Sure</option>
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1">
                      Lock Screen Description (Helpful for Driver Verification)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Picture of my dog / sunset wallpaper / initials on screen"
                      value={lockScreenInfo}
                      onChange={(e) => setLockScreenInfo(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition"
                    />
                  </div>
                </div>
              </div>

              {/* Step 4: Approximate Trip Details */}
              <div className="pt-4 border-t border-gray-100 dark:border-zinc-800">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 mb-3 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] flex items-center justify-center font-bold">4</span>
                  Approximate Ride Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1">
                      When did the ride take place?
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={tripDate}
                        onChange={(e) => setTripDate(e.target.value)}
                        className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition"
                      >
                        <option value="Today">Today</option>
                        <option value="Yesterday">Yesterday</option>
                        <option value="Past 3 Days">Past 3 Days</option>
                        <option value="Older">Older</option>
                      </select>
                      <input
                        type="text"
                        placeholder="e.g. 11:30 AM"
                        value={tripTime}
                        onChange={(e) => setTripTime(e.target.value)}
                        className="w-full h-11 px-3.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1">
                      Pickup or Drop-off Landmark
                    </label>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3.5 top-3.5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="e.g. Kimberley Hospital or North Cape Mall"
                        value={tripPickup}
                        onChange={(e) => setTripPickup(e.target.value)}
                        className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none transition"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-bold text-base rounded-2xl transition shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={20} className="animate-spin" />
                      <span>Alerting Driver & Logging Request...</span>
                    </>
                  ) : (
                    <>
                      <Smartphone size={20} />
                      <span>Alert Driver & File Lost Phone Request</span>
                    </>
                  )}
                </button>
                <p className="text-[11px] text-center text-gray-500 dark:text-zinc-400 mt-2.5">
                  Submitting will notify the driver&apos;s active device with high-priority audio and alert our support team.
                </p>
              </div>
            </form>
          </div>
        ) : (
          /* Confirmation Success Screen */
          <div className="bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800/80 rounded-3xl p-6 sm:p-10 shadow-lg text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 mb-5 ring-8 ring-emerald-50 dark:ring-emerald-900/30">
              <CheckCircle2 size={44} />
            </div>

            <span className="inline-block text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">
              Priority Request Dispatched
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
              We&apos;re On It!
            </h2>

            {/* Tracking Reference Code */}
            <div className="mt-4 p-4 bg-gray-50 dark:bg-zinc-800/80 rounded-2xl border border-gray-200 dark:border-zinc-700 inline-block">
              <span className="text-xs text-gray-500 dark:text-zinc-400 block font-medium">
                Your Emergency Tracking Code
              </span>
              <span className="text-xl sm:text-2xl font-mono font-black text-emerald-600 dark:text-emerald-400 tracking-wider">
                {resultTicket.ticketCode}
              </span>
            </div>

            {/* Matched Driver Banner */}
            {matchedDriverInfo ? (
              <div className="mt-6 p-4 sm:p-5 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl text-left max-w-lg mx-auto">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm mb-2">
                  <Car size={18} />
                  <span>Ride Identified & Driver Alerted:</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-700 dark:text-zinc-300">
                  <div>
                    <span className="text-gray-400 dark:text-zinc-500 block">Driver Name</span>
                    <strong className="text-sm">{matchedDriverInfo.name}</strong>
                  </div>
                  <div>
                    <span className="text-gray-400 dark:text-zinc-500 block">Vehicle</span>
                    <strong className="text-sm">{matchedDriverInfo.vehicle}</strong>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-400 dark:text-zinc-500 block">License Plate</span>
                    <strong className="text-sm tracking-wide font-mono bg-white dark:bg-zinc-800 px-2 py-0.5 rounded border border-gray-200 dark:border-zinc-700 inline-block">
                      {matchedDriverInfo.plate}
                    </strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl text-left max-w-lg mx-auto text-xs text-amber-900 dark:text-amber-300 flex items-start gap-3">
                <Info size={18} className="shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">Manual Search Underway: </strong>
                  Our operations team is cross-referencing recent rides in the area to link your report to the exact driver.
                </div>
              </div>
            )}

            {/* What to do next instructions */}
            <div className="mt-8 text-left max-w-lg mx-auto space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                What Happens Next
              </h4>
              <div className="p-3 bg-gray-50 dark:bg-zinc-800/60 rounded-xl text-xs text-gray-700 dark:text-zinc-300 flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">1</span>
                <span>
                  The driver has been notified with a distinct <strong>high-priority audio alert</strong> to safely pull over and inspect the vehicle.
                </span>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-zinc-800/60 rounded-xl text-xs text-gray-700 dark:text-zinc-300 flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">2</span>
                <span>
                  The driver or our support desk will call or WhatsApp your alternative number:{" "}
                  <strong>{resultTicket.alternativeContactPhone}</strong>.
                </span>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-zinc-800/60 rounded-xl text-xs text-gray-700 dark:text-zinc-300 flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">3</span>
                <span>
                  <strong>Tip:</strong> Do not remotely erase or lock your phone yet, as the driver may need to see incoming calls or lock screen indicators to confirm it is yours.
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center max-w-lg mx-auto">
              <a
                href={buildOfficialSupportWhatsAppUrl({
                  ticketCode: resultTicket.ticketCode,
                  category: "lost_phone",
                  riderName: resultTicket.riderName,
                  riderPhone: resultTicket.riderIdentifier,
                  driverName: matchedDriverInfo?.name,
                  vehiclePlate: matchedDriverInfo?.plate,
                  summary: `Lost phone: ${resultTicket.itemDetails?.brandModel} (${resultTicket.itemDetails?.color}). Alternative contact: ${resultTicket.alternativeContactPhone}`,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="h-12 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-md transition active:scale-95"
              >
                <MessageCircle size={18} />
                <span>Chat with Support on WhatsApp</span>
              </a>

              <button
                onClick={() => {
                  setResultTicket(null);
                  setErrorMessage(null);
                }}
                className="h-12 px-5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-zinc-200 font-bold text-sm rounded-xl transition"
              >
                File Another Report
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-zinc-800 py-6 text-center text-xs text-gray-500 dark:text-zinc-400 bg-white/50 dark:bg-zinc-950/50">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>SOLO Lost Property & Rider Support Desk • Boraine Tech (Pty) Ltd</span>
          <div className="flex items-center gap-4">
            <Link href="/rider" className="hover:underline">Rider Home</Link>
            <Link href="/manual" className="hover:underline">Operating Manual</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
