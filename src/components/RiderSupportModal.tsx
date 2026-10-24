"use client";

import { useState } from "react";
import Link from "next/link";
import {
  X,
  HelpCircle,
  Smartphone,
  ShieldCheck,
  CreditCard,
  MessageCircle,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  MapPin,
  Car,
  Clock,
  Phone,
  Send,
  ChevronRight,
  ExternalLink,
  LifeBuoy,
  RefreshCw,
} from "lucide-react";
import type { MockTrip } from "@/lib/mockBackend";
import {
  saveSupportTicket,
  dispatchLostItemDriverAlert,
  buildOfficialSupportWhatsAppUrl,
  generateTicketCode,
  type SupportTicket,
  type SupportCategory,
} from "@/utils/supportStore";

interface RiderSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  trips?: MockTrip[];
  currentUser?: {
    id?: string;
    fullName?: string;
    phone?: string;
    email?: string;
  } | null;
  onOpenSafetyModal?: () => void;
}

export default function RiderSupportModal({
  isOpen,
  onClose,
  trips = [],
  currentUser,
  onOpenSafetyModal,
}: RiderSupportModalProps) {
  const [activeTab, setActiveTab] = useState<"trips" | "lost" | "whatsapp" | "faq">("trips");
  const [selectedTrip, setSelectedTrip] = useState<MockTrip | null>(null);
  const [issueType, setIssueType] = useState<SupportCategory | null>(null);

  // Form states
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [itemType, setItemType] = useState<string>("phone");
  const [itemColor, setItemColor] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<SupportTicket | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectTripForIssue = (trip: MockTrip, category: SupportCategory) => {
    setSelectedTrip(trip);
    setIssueType(category);
    setFeedbackError(null);
    setSubmittedTicket(null);

    if (category === "lost_item") {
      setSubject(`Lost Item on trip to ${trip.dropoff_location.split(",")[0]}`);
    } else if (category === "fare_dispute") {
      setSubject(`Fare Dispute for trip (${trip.pickup_location.split(",")[0]} -> ${trip.dropoff_location.split(",")[0]})`);
    } else if (category === "driver_conduct") {
      setSubject(`Driver Conduct Report on recent trip`);
    } else {
      setSubject(`Inquiry regarding trip #${trip.id.slice(0, 8)}`);
    }
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackError(null);

    const riderIdentifier = currentUser?.phone || currentUser?.email || "Rider";

    if (!description.trim()) {
      setFeedbackError("Please provide details about what happened.");
      return;
    }

    setIsSubmitting(true);

    try {
      const ticketCode = generateTicketCode(issueType || "other");
      const ticket: SupportTicket = {
        id: crypto.randomUUID(),
        ticketCode,
        category: issueType || "other",
        status: issueType === "lost_item" || issueType === "lost_phone" ? "driver_notified" : "open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        riderIdentifier,
        riderName: currentUser?.fullName || "Valued Passenger",
        alternativeContactPhone: altPhone.trim() || currentUser?.phone,
        tripId: selectedTrip?.id,
        driverId: selectedTrip?.driver_id,
        pickupLocation: selectedTrip?.pickup_location,
        dropoffLocation: selectedTrip?.dropoff_location,
        fareZar: selectedTrip?.fare_amount,
        tripDate: selectedTrip?.created_at ? new Date(selectedTrip.created_at).toLocaleDateString("en-ZA") : "Recent",
        itemDetails:
          issueType === "lost_item" || issueType === "lost_phone"
            ? {
                itemType: itemType as any,
                color: itemColor,
                brandModel: subject,
              }
            : undefined,
        subject,
        description,
      };

      // 1. Save ticket
      saveSupportTicket(ticket);

      // 2. If lost property, dispatch immediate priority alert to driver
      if (issueType === "lost_item" || issueType === "lost_phone") {
        dispatchLostItemDriverAlert(ticket);
      }

      // 3. Post to API backend
      try {
        await fetch("/api/support/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ticket),
        });
      } catch {}

      setSubmittedTicket(ticket);
    } catch (err: any) {
      setFeedbackError(err?.message || "Failed to submit request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedTrip(null);
    setIssueType(null);
    setSubject("");
    setDescription("");
    setItemColor("");
    setAltPhone("");
    setSubmittedTicket(null);
    setFeedbackError(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-gray-50/70 dark:bg-zinc-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <LifeBuoy size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span>Rider Help & Support</span>
              </h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                Disputes, lost property, tax receipts & assistance
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              resetForm();
              onClose();
            }}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-500 dark:text-gray-400 flex items-center justify-center transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900 px-3 pt-2 gap-1 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              resetForm();
              setActiveTab("trips");
            }}
            className={`px-3 py-2 text-xs font-bold rounded-t-xl transition whitespace-nowrap border-b-2 flex items-center gap-1.5 ${
              activeTab === "trips"
                ? "border-amber-600 text-amber-600 dark:text-amber-400 bg-white dark:bg-zinc-800/80"
                : "border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <Car size={14} />
            <span>Trip Issues</span>
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setActiveTab("lost");
            }}
            className={`px-3 py-2 text-xs font-bold rounded-t-xl transition whitespace-nowrap border-b-2 flex items-center gap-1.5 ${
              activeTab === "lost"
                ? "border-amber-600 text-amber-600 dark:text-amber-400 bg-white dark:bg-zinc-800/80"
                : "border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <Smartphone size={14} />
            <span>Lost & Found</span>
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setActiveTab("whatsapp");
            }}
            className={`px-3 py-2 text-xs font-bold rounded-t-xl transition whitespace-nowrap border-b-2 flex items-center gap-1.5 ${
              activeTab === "whatsapp"
                ? "border-amber-600 text-amber-600 dark:text-amber-400 bg-white dark:bg-zinc-800/80"
                : "border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <MessageCircle size={14} />
            <span>WhatsApp Support</span>
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setActiveTab("faq");
            }}
            className={`px-3 py-2 text-xs font-bold rounded-t-xl transition whitespace-nowrap border-b-2 flex items-center gap-1.5 ${
              activeTab === "faq"
                ? "border-amber-600 text-amber-600 dark:text-amber-400 bg-white dark:bg-zinc-800/80"
                : "border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <HelpCircle size={14} />
            <span>FAQs</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 text-sm space-y-4">
          {/* TAB 1: TRIPS & SPECIFIC TRIP ISSUES */}
          {activeTab === "trips" && (
            <div>
              {submittedTicket ? (
                /* Ticket Submitted Success Card */
                <div className="text-center py-6 space-y-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={32} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Ticket Submitted</h3>
                    <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">
                      Reference Code: <strong className="font-mono text-emerald-600 dark:text-emerald-400">{submittedTicket.ticketCode}</strong>
                    </p>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-zinc-300 max-w-sm mx-auto">
                    Your request has been logged with SOLO Operations. Our compliance team will review the ride data and reach out.
                  </p>
                  <button
                    onClick={resetForm}
                    className="h-10 px-5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-zinc-200 rounded-xl text-xs font-bold transition"
                  >
                    Back to Trips
                  </button>
                </div>
              ) : selectedTrip && issueType ? (
                /* Specific Issue Form */
                <form onSubmit={handleSubmitTicket} className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-zinc-800">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-zinc-500 block">
                        Reporting for Ride:
                      </span>
                      <strong className="text-xs text-gray-800 dark:text-zinc-200">
                        {selectedTrip.pickup_location.split(",")[0]} &rarr; {selectedTrip.dropoff_location.split(",")[0]}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={resetForm}
                      className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-bold"
                    >
                      Change Ride
                    </button>
                  </div>

                  {feedbackError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                      <AlertTriangle size={16} />
                      <span>{feedbackError}</span>
                    </div>
                  )}

                  {issueType === "lost_item" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1">
                          Item Category
                        </label>
                        <select
                          value={itemType}
                          onChange={(e) => setItemType(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium"
                        >
                          <option value="phone">Smartphone</option>
                          <option value="wallet">Wallet / Purse</option>
                          <option value="keys">Keys</option>
                          <option value="bag">Bag / Backpack</option>
                          <option value="clothing">Jacket / Clothing</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1">
                          Item Colour / Details
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Black leather, Blue case"
                          value={itemColor}
                          onChange={(e) => setItemColor(e.target.value)}
                          className="w-full h-10 px-3 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      required
                      className="w-full h-10 px-3 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1">
                      Description & Details
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Please describe what occurred or what item was left behind..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                      className="w-full p-3 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-zinc-300 mb-1">
                      Alternative Contact Number (Optional)
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. 082 123 4567"
                      value={altPhone}
                      onChange={(e) => setAltPhone(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-medium"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 h-11 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <Send size={14} />
                          <span>Submit Support Ticket</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-4 h-11 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 font-bold text-xs rounded-xl transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                /* Trip Selection List */
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    Select a completed ride to report an issue, dispute a fare, or download a tax receipt:
                  </p>

                  {trips.length === 0 ? (
                    <div className="p-8 text-center bg-gray-50 dark:bg-zinc-800/40 rounded-2xl border border-gray-100 dark:border-zinc-800">
                      <Car size={28} className="mx-auto text-gray-400 mb-2" />
                      <p className="text-xs text-gray-500">No completed trips found on this device.</p>
                      <button
                        type="button"
                        onClick={() => setActiveTab("whatsapp")}
                        className="mt-3 text-xs font-bold text-amber-600 hover:underline"
                      >
                        Contact Support Directly &rarr;
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                      {trips.slice(0, 5).map((trip) => (
                        <div
                          key={trip.id}
                          className="p-3.5 bg-gray-50/80 dark:bg-zinc-800/50 hover:bg-gray-100 dark:hover:bg-zinc-800 border border-gray-200/80 dark:border-zinc-700/60 rounded-2xl transition"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                                Completed • R{trip.fare_amount}
                              </span>
                              <div className="text-xs font-bold text-gray-900 dark:text-white">
                                {trip.pickup_location.split(",")[0]} &rarr; {trip.dropoff_location.split(",")[0]}
                              </div>
                            </div>
                            <span className="text-[10px] text-gray-400">
                              {trip.created_at ? new Date(trip.created_at).toLocaleDateString("en-ZA") : "Recent"}
                            </span>
                          </div>

                          {/* Action Buttons for this Ride */}
                          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-200/50 dark:border-zinc-700/40 text-[11px]">
                            <button
                              type="button"
                              onClick={() => handleSelectTripForIssue(trip, "lost_item")}
                              className="px-2.5 py-1 bg-white dark:bg-zinc-700/60 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold rounded-lg border border-gray-200 dark:border-zinc-600 transition"
                            >
                              📱 Lost Item
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectTripForIssue(trip, "fare_dispute")}
                              className="px-2.5 py-1 bg-white dark:bg-zinc-700/60 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold rounded-lg border border-gray-200 dark:border-zinc-600 transition"
                            >
                              💳 Dispute Fare
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectTripForIssue(trip, "driver_conduct")}
                              className="px-2.5 py-1 bg-white dark:bg-zinc-700/60 hover:bg-gray-50 dark:hover:bg-zinc-600 text-gray-700 dark:text-zinc-300 font-semibold rounded-lg border border-gray-200 dark:border-zinc-600 transition"
                            >
                              🛡️ Driver Feedback
                            </button>
                            <Link
                              href={`/receipt/${trip.id}`}
                              className="px-2.5 py-1 bg-white dark:bg-zinc-700/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold rounded-lg border border-gray-200 dark:border-zinc-600 transition inline-flex items-center gap-1"
                            >
                              <FileText size={11} />
                              <span>Receipt</span>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LOST & FOUND CALLOUT */}
          {activeTab === "lost" && (
            <div className="space-y-4">
              {/* Highlight Banner for Lost Phone */}
              <div className="p-4 bg-gradient-to-r from-emerald-500/10 via-amber-500/10 to-transparent border border-emerald-500/20 rounded-2xl">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Smartphone size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                      Lost Your Phone in the Vehicle?
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-zinc-300 mt-1">
                      If you or a friend left a smartphone in a car, you can report it from{" "}
                      <strong>any borrowed phone, hotel desk, or PC</strong> without logging in.
                    </p>
                    <Link
                      href="/lost-phone"
                      onClick={onClose}
                      className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
                    >
                      <span>Open Zero-Login Lost Phone Recovery Portal</span>
                      <ExternalLink size={12} />
                    </Link>
                  </div>
                </div>
              </div>

              {/* Other items in vehicle */}
              <div className="p-4 bg-gray-50 dark:bg-zinc-800/40 rounded-2xl border border-gray-100 dark:border-zinc-800 text-xs text-gray-600 dark:text-zinc-300">
                <h4 className="font-bold text-gray-800 dark:text-zinc-200 mb-1.5">
                  Left Keys, Wallet, or Bags?
                </h4>
                <p>
                  Switch to the <strong>&quot;Trip Issues&quot;</strong> tab and tap <strong>&quot;Lost Item&quot;</strong> next to your ride. An immediate high-priority audio alert will be transmitted to your driver to inspect their vehicle.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: OFFICIAL WHATSAPP */}
          {activeTab === "whatsapp" && (
            <div className="space-y-4 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto ring-8 ring-emerald-50 dark:ring-emerald-950/30">
                <MessageCircle size={32} />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                  Official SOLO WhatsApp Support
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
                  Connect with a live SOLO Operations agent in South Africa. Low-data, fast response.
                </p>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-zinc-800/60 rounded-2xl border border-gray-200 dark:border-zinc-700 text-left max-w-sm mx-auto text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-400">Response Time:</span>
                  <strong className="text-emerald-600 dark:text-emerald-400">Typically under 10 minutes</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Operating Hours:</span>
                  <strong>06:00 – 23:00 (Daily)</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Emergency Hotlines:</span>
                  <strong>SAPS 10111 / 112</strong>
                </div>
              </div>

              <a
                href={buildOfficialSupportWhatsAppUrl({
                  riderName: currentUser?.fullName,
                  riderPhone: currentUser?.phone,
                  summary: "General inquiry from SOLO Rider App",
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-2xl shadow-md transition active:scale-95"
              >
                <MessageCircle size={18} />
                <span>Start WhatsApp Chat Now</span>
              </a>
            </div>
          )}

          {/* TAB 4: FAQS & SAFETY DIRECTORY */}
          {activeTab === "faq" && (
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-gray-50 dark:bg-zinc-800/40 rounded-xl border border-gray-100 dark:border-zinc-800">
                <strong className="text-gray-900 dark:text-white block mb-1">
                  How is my fare calculated?
                </strong>
                <p className="text-gray-600 dark:text-zinc-300">
                  SOLO uses transparent South African distance pricing: <strong>R12 base fare + R8/km</strong>, with a minimum fare of R25. Drivers keep 100% of the fare with zero commission deductions.
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-zinc-800/40 rounded-xl border border-gray-100 dark:border-zinc-800">
                <strong className="text-gray-900 dark:text-white block mb-1">
                  How do payments work?
                </strong>
                <p className="text-gray-600 dark:text-zinc-300">
                  You can pay cash or tap your debit/credit card directly on the driver&apos;s in-vehicle mobile card machine (Speedpoint POS).
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-zinc-800/40 rounded-xl border border-gray-100 dark:border-zinc-800">
                <strong className="text-gray-900 dark:text-white block mb-1">
                  Why do I have a 4-digit PIN?
                </strong>
                <p className="text-gray-600 dark:text-zinc-300">
                  Before boarding, you verbally give your 4-digit PIN to the driver. This guarantees you are getting into the correct car and prevents passenger spoofing.
                </p>
              </div>

              {/* Safety Bridge */}
              {onOpenSafetyModal && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSafetyModal();
                    }}
                    className="w-full py-2.5 px-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-red-600 dark:text-red-400 font-bold flex items-center justify-center gap-2 hover:bg-red-100 transition"
                  >
                    <ShieldCheck size={16} />
                    <span>Emergency SOS & Armed Rapid Response</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
