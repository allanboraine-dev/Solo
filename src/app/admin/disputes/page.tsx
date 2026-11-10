"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  LifeBuoy,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Phone,
  MessageCircle,
  ExternalLink,
  RefreshCw,
  MapPin,
  User,
  Check,
  Copy,
  PlusCircle,
  Smartphone,
  FileText,
} from "lucide-react";
import {
  getSupportTickets,
  saveSupportTicket,
  updateSupportTicketResolution,
  dispatchLostItemDriverAlert,
  buildOfficialSupportWhatsAppUrl,
  generateTicketCode,
  type SupportTicket,
  type SupportCategory,
  type SupportTicketStatus,
} from "@/utils/supportStore";
import { RandIcon } from "@/components/icons/RandIcon";

export default function AdminDisputesPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [resolutionInput, setResolutionInput] = useState("");
  const [driverNotesInput, setDriverNotesInput] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // Load tickets from both API and local store
  const loadTickets = async () => {
    setLoading(true);
    setStatusFeedback(null);
    try {
      let apiTickets: SupportTicket[] = [];
      try {
        const res = await fetch("/api/support/tickets");
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.tickets)) {
            apiTickets = data.tickets;
          }
        }
      } catch (e) {
        console.warn("Could not fetch remote support tickets:", e);
      }

      // Merge with local storage tickets
      const localTickets = getSupportTickets();
      const mergedMap = new Map<string, SupportTicket>();

      // Put API tickets in map
      for (const t of apiTickets) {
        const key = t.ticketCode || t.id;
        mergedMap.set(key, t);
      }

      // Merge or overwrite with local tickets (to keep any local updates)
      for (const t of localTickets) {
        const key = t.ticketCode || t.id;
        mergedMap.set(key, t);
      }

      const combined = Array.from(mergedMap.values());
      // Sort newest first
      combined.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });

      setTickets(combined);

      // Select first ticket by default if none selected or previous selection gone
      if (combined.length > 0) {
        if (!selectedTicketId || !combined.some((t) => t.id === selectedTicketId)) {
          setSelectedTicketId(combined[0].id);
          setResolutionInput(combined[0].resolutionNotes || "");
          setDriverNotesInput(combined[0].driverNotes || "");
        }
      }
    } catch (err) {
      console.error("Error loading tickets:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  // Update selected ticket detail forms when selection changes
  const activeTicket = useMemo(() => {
    return tickets.find((t) => t.id === selectedTicketId) || null;
  }, [tickets, selectedTicketId]);

  useEffect(() => {
    if (activeTicket) {
      setResolutionInput(activeTicket.resolutionNotes || "");
      setDriverNotesInput(activeTicket.driverNotes || "");
      setStatusFeedback(null);
    }
  }, [activeTicket]);

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // Status filter
      if (statusFilter !== "all" && t.status !== statusFilter) {
        return false;
      }
      // Category filter
      if (categoryFilter !== "all") {
        if (categoryFilter === "lost_property") {
          if (t.category !== "lost_phone" && t.category !== "lost_item") return false;
        } else if (t.category !== categoryFilter) {
          return false;
        }
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = t.ticketCode?.toLowerCase().includes(q);
        const matchSubject = t.subject?.toLowerCase().includes(q);
        const matchDesc = t.description?.toLowerCase().includes(q);
        const matchRider = t.riderName?.toLowerCase().includes(q) || t.riderIdentifier?.toLowerCase().includes(q);
        const matchDriver = t.driverName?.toLowerCase().includes(q) || t.vehiclePlate?.toLowerCase().includes(q);
        const matchTrip = t.tripId?.toLowerCase().includes(q);
        if (!matchCode && !matchSubject && !matchDesc && !matchRider && !matchDriver && !matchTrip) {
          return false;
        }
      }
      return true;
    });
  }, [tickets, statusFilter, categoryFilter, searchQuery]);

  // Metrics summary
  const metrics = useMemo(() => {
    const total = tickets.length;
    const openCount = tickets.filter((t) => t.status === "open" || t.status === "investigating").length;
    const fareDisputes = tickets.filter((t) => t.category === "fare_dispute").length;
    const lostProperty = tickets.filter((t) => t.category === "lost_phone" || t.category === "lost_item").length;
    const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;
    return { total, openCount, fareDisputes, lostProperty, resolved };
  }, [tickets]);

  // Handle Status Update
  const handleUpdateStatus = async (newStatus: SupportTicketStatus) => {
    if (!activeTicket) return;
    setIsUpdating(true);
    setStatusFeedback(null);

    try {
      // 1. Update in local storage
      updateSupportTicketResolution(
        activeTicket.id,
        newStatus,
        resolutionInput.trim(),
        driverNotesInput.trim()
      );

      // 2. Update via API
      try {
        await fetch("/api/support/tickets", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticketId: activeTicket.id,
            ticketCode: activeTicket.ticketCode,
            status: newStatus,
            resolutionNotes: resolutionInput.trim(),
            driverNotes: driverNotesInput.trim(),
          }),
        });
      } catch (apiErr) {
        console.warn("Failed to PATCH remote tickets endpoint:", apiErr);
      }

      // 3. Update component state
      setTickets((prev) =>
        prev.map((t) =>
          t.id === activeTicket.id
            ? {
                ...t,
                status: newStatus,
                resolutionNotes: resolutionInput.trim(),
                driverNotes: driverNotesInput.trim(),
                updatedAt: new Date().toISOString(),
                resolvedAt:
                  newStatus === "resolved" || newStatus === "closed"
                    ? new Date().toISOString()
                    : t.resolvedAt,
              }
            : t
        )
      );

      setStatusFeedback(`Ticket updated to ${newStatus.replace(/_/g, " ")}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update";
      setStatusFeedback(`Error: ${msg}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Save resolution notes
  const handleSaveNotes = async () => {
    if (!activeTicket) return;
    setIsUpdating(true);
    setStatusFeedback(null);

    try {
      updateSupportTicketResolution(
        activeTicket.id,
        activeTicket.status,
        resolutionInput.trim(),
        driverNotesInput.trim()
      );

      await fetch("/api/support/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: activeTicket.id,
          ticketCode: activeTicket.ticketCode,
          resolutionNotes: resolutionInput.trim(),
          driverNotes: driverNotesInput.trim(),
        }),
      });

      setTickets((prev) =>
        prev.map((t) =>
          t.id === activeTicket.id
            ? {
                ...t,
                resolutionNotes: resolutionInput.trim(),
                driverNotes: driverNotesInput.trim(),
                updatedAt: new Date().toISOString(),
              }
            : t
        )
      );

      setStatusFeedback("Resolution notes saved successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save notes";
      setStatusFeedback(`Error: ${msg}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Dispatch live audio alert to driver for lost property
  const handleReAlertDriver = () => {
    if (!activeTicket) return;
    dispatchLostItemDriverAlert(activeTicket);
    handleUpdateStatus("driver_notified");
    alert(`Priority dispatch alert broadcast to driver ${activeTicket.driverName || "terminal"}.`);
  };

  // Inject a quick test dispute
  const handleCreateTestDispute = async () => {
    const testCode = generateTicketCode("fare_dispute");
    const testTicket: SupportTicket = {
      id: crypto.randomUUID(),
      ticketCode: testCode,
      category: "fare_dispute",
      status: "open",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      riderIdentifier: "+27 71 888 9900",
      riderName: "Nandi Zuma",
      alternativeContactPhone: "+27 71 888 9900",
      tripId: `trip_test_${Math.floor(1000 + Math.random() * 9000)}`,
      driverId: "drv_test_sim",
      driverName: "David Khumalo",
      driverPhone: "+27 82 456 7890",
      vehiclePlate: "CA 812-904",
      vehicleModel: "Toyota Rumion",
      pickupLocation: "Greenmarket Square, Cape Town",
      dropoffLocation: "Camps Bay Beach",
      fareZar: 110.0,
      tripDate: "Just now",
      subject: "Waiting time fee dispute on short trip",
      description: "App showed R85 base estimate, but driver charged R110 in cash claiming traffic delay.",
    };

    saveSupportTicket(testTicket);

    try {
      await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testTicket),
      });
    } catch {}

    setTickets((prev) => [testTicket, ...prev]);
    setSelectedTicketId(testTicket.id);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Category badge formatting
  const getCategoryBadge = (cat: SupportCategory) => {
    switch (cat) {
      case "fare_dispute":
        return {
          label: "Fare Dispute",
          bg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
        };
      case "lost_phone":
        return {
          label: "Lost Phone",
          bg: "bg-purple-500/10 text-purple-400 border-purple-500/30",
        };
      case "lost_item":
        return {
          label: "Lost Property",
          bg: "bg-violet-500/10 text-violet-400 border-violet-500/30",
        };
      case "safety_concern":
        return {
          label: "Safety Incident",
          bg: "bg-rose-500/10 text-rose-400 border-rose-500/30",
        };
      case "driver_conduct":
        return {
          label: "Driver Conduct",
          bg: "bg-orange-500/10 text-orange-400 border-orange-500/30",
        };
      case "receipt_inquiry":
        return {
          label: "Receipt / SARS",
          bg: "bg-blue-500/10 text-blue-400 border-blue-500/30",
        };
      default:
        return {
          label: "General Inquiry",
          bg: "bg-zinc-500/10 text-zinc-300 border-zinc-700",
        };
    }
  };

  // Status badge formatting
  const getStatusBadge = (status: SupportTicketStatus) => {
    switch (status) {
      case "open":
        return {
          label: "Open",
          bg: "bg-amber-500/15 text-amber-400 border-amber-500/30",
          dot: "bg-amber-400",
        };
      case "investigating":
        return {
          label: "Investigating",
          bg: "bg-blue-500/15 text-blue-400 border-blue-500/30",
          dot: "bg-blue-400 animate-pulse",
        };
      case "driver_notified":
        return {
          label: "Driver Alerted",
          bg: "bg-violet-500/15 text-violet-400 border-violet-500/30",
          dot: "bg-violet-400",
        };
      case "driver_confirmed_found":
        return {
          label: "Item Secured",
          bg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
          dot: "bg-emerald-400",
        };
      case "driver_checked_not_found":
        return {
          label: "Not Found",
          bg: "bg-rose-500/15 text-rose-400 border-rose-500/30",
          dot: "bg-rose-400",
        };
      case "resolved":
        return {
          label: "Resolved",
          bg: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
          dot: "bg-emerald-400",
        };
      case "closed":
        return {
          label: "Closed",
          bg: "bg-zinc-800 text-zinc-400 border-zinc-700",
          dot: "bg-zinc-500",
        };
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <LifeBuoy size={22} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Dispute Resolution & Support Desk
              </h1>
              <p className="text-xs text-zinc-400">
                Manage passenger fare discrepancies, lost property recoveries, driver conduct claims, and audit logs.
              </p>
            </div>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateTestDispute}
            className="px-3 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            title="Inject a test dispute into the manager queue"
          >
            <PlusCircle size={14} className="text-amber-400" />
            <span>Simulate Ticket</span>
          </button>

          <button
            onClick={loadTickets}
            disabled={loading}
            className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
            title="Refresh disputes feed"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-emerald-400" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 5 KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
        {/* Total Tickets */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-zinc-400">Total Inquiries</span>
            <FileText size={16} className="text-zinc-500" />
          </div>
          <span className="text-2xl font-black text-white">{metrics.total}</span>
          <p className="text-[10px] text-zinc-500 mt-1">Logged tickets</p>
        </div>

        {/* Open & Action Needed */}
        <div className="bg-zinc-900/80 border border-amber-500/30 rounded-2xl p-4 relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-amber-400">Action Needed</span>
            <AlertTriangle size={16} className="text-amber-400" />
          </div>
          <span className="text-2xl font-black text-amber-300">{metrics.openCount}</span>
          <p className="text-[10px] text-amber-400/80 mt-1">Open / Investigating</p>
        </div>

        {/* Fare Disputes */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-zinc-400">Fare Disputes</span>
            <RandIcon size={16} className="text-amber-400" />
          </div>
          <span className="text-2xl font-black text-white">{metrics.fareDisputes}</span>
          <p className="text-[10px] text-zinc-500 mt-1">Cash / quote queries</p>
        </div>

        {/* Lost Property */}
        <div className="bg-zinc-900/80 border border-purple-500/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-purple-400">Lost Property</span>
            <Smartphone size={16} className="text-purple-400" />
          </div>
          <span className="text-2xl font-black text-purple-300">{metrics.lostProperty}</span>
          <p className="text-[10px] text-purple-400/80 mt-1">Phones & items</p>
        </div>

        {/* Resolved */}
        <div className="bg-zinc-900/80 border border-emerald-500/30 rounded-2xl p-4 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-emerald-400">Resolved</span>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <span className="text-2xl font-black text-emerald-300">{metrics.resolved}</span>
          <p className="text-[10px] text-emerald-400/80 mt-1">Settled disputes</p>
        </div>
      </div>

      {/* Main Two-Pane Split: List View on Left, Dossier on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-[560px]">
        {/* Left Column: Tickets Queue List (5 cols) */}
        <div className="lg:col-span-5 flex flex-col bg-zinc-900/80 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
          {/* Filter Bar */}
          <div className="p-4 border-b border-zinc-800 space-y-3 bg-zinc-950/40">
            {/* Search Input */}
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ticket code, rider, driver, trip..."
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-amber-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-hidden transition"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-zinc-500 mr-1 flex items-center gap-1">
                <Filter size={11} /> Filter:
              </span>
              {(["all", "open", "investigating", "resolved"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition capitalize ${
                    statusFilter === st
                      ? "bg-amber-500 text-black shadow-sm"
                      : "bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  {st}
                </button>
              ))}

              <span className="text-zinc-700 mx-1">|</span>

              {(["all", "fare_dispute", "lost_property", "safety_concern"] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    categoryFilter === cat
                      ? "bg-zinc-700 text-white"
                      : "bg-zinc-900 text-zinc-400 hover:text-white"
                  }`}
                >
                  {cat === "fare_dispute"
                    ? "Fares"
                    : cat === "lost_property"
                    ? "Lost Items"
                    : cat === "safety_concern"
                    ? "Safety"
                    : "All Types"}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Tickets Queue */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60 max-h-[640px]">
            {filteredTickets.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
                <LifeBuoy size={28} className="text-zinc-600" />
                <p className="text-xs font-semibold text-zinc-400">No disputes matching criteria</p>
                <p className="text-[11px] text-zinc-500">
                  Try adjusting search or status filters, or click &quot;Simulate Ticket&quot;.
                </p>
              </div>
            ) : (
              filteredTickets.map((t) => {
                const isSelected = t.id === selectedTicketId;
                const catBadge = getCategoryBadge(t.category);
                const stBadge = getStatusBadge(t.status);

                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTicketId(t.id)}
                    className={`w-full text-left p-4 transition flex flex-col gap-2 relative ${
                      isSelected
                        ? "bg-amber-500/10 border-l-4 border-l-amber-500"
                        : "hover:bg-zinc-800/40 border-l-4 border-l-transparent"
                    }`}
                  >
                    {/* Header line: Ticket Code + Status + Time */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-white tracking-wide">
                          {t.ticketCode}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${catBadge.bg}`}
                        >
                          {catBadge.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${stBadge.bg}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${stBadge.dot}`} />
                          {stBadge.label}
                        </span>
                      </div>
                    </div>

                    {/* Subject */}
                    <h3 className="text-xs font-semibold text-zinc-200 line-clamp-1 leading-snug">
                      {t.subject}
                    </h3>

                    {/* Meta line: Rider & Route & Fare */}
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span className="flex items-center gap-1 truncate max-w-[180px]">
                        <User size={12} className="text-zinc-500 shrink-0" />
                        <span className="truncate">{t.riderName || t.riderIdentifier}</span>
                      </span>

                      {t.fareZar ? (
                        <span className="font-mono font-semibold text-amber-400 flex items-center gap-0.5">
                          R {Number(t.fareZar).toFixed(2)}
                        </span>
                      ) : null}
                    </div>

                    {/* Locations snippet if available */}
                    {t.pickupLocation && (
                      <div className="text-[10px] text-zinc-500 flex items-center gap-1 truncate">
                        <MapPin size={10} className="text-zinc-600 shrink-0" />
                        <span className="truncate">
                          {t.pickupLocation.split(",")[0]} &rarr; {t.dropoffLocation?.split(",")[0] || "Destination"}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Deep Ticket Dossier & Resolution Command (7 cols) */}
        <div className="lg:col-span-7 bg-zinc-900/80 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl flex flex-col">
          {activeTicket ? (
            <div className="flex-1 flex flex-col overflow-y-auto max-h-[780px]">
              {/* Dossier Header */}
              <div className="p-5 border-b border-zinc-800 bg-zinc-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-base sm:text-lg font-black text-white">
                      {activeTicket.ticketCode}
                    </span>
                    <button
                      onClick={() => copyToClipboard(activeTicket.ticketCode)}
                      className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition"
                      title="Copy Ticket Code"
                    >
                      {copiedCode ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                        getCategoryBadge(activeTicket.category).bg
                      }`}
                    >
                      {getCategoryBadge(activeTicket.category).label}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-1.5">
                    <Clock size={12} className="text-zinc-500" />
                    <span>
                      Logged: {new Date(activeTicket.createdAt).toLocaleDateString("en-ZA")} at{" "}
                      {new Date(activeTicket.createdAt).toLocaleTimeString("en-ZA", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </p>
                </div>

                {/* Status Switcher Action Group */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-zinc-500 mr-1">Status:</span>
                  {(["open", "investigating", "resolved", "closed"] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => handleUpdateStatus(st)}
                      disabled={isUpdating}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition capitalize ${
                        activeTicket.status === st
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-750"
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Feedback banner if any */}
              {statusFeedback && (
                <div className="px-5 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
                  <span>{statusFeedback}</span>
                  <button
                    onClick={() => setStatusFeedback(null)}
                    className="text-emerald-400 hover:text-white text-[10px]"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Dossier Body */}
              <div className="p-5 sm:p-6 space-y-6 flex-1">
                {/* Rider Statement Box */}
                <div className="p-4 bg-zinc-950/70 border border-zinc-800/80 rounded-2xl space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-bold block">
                    Passenger Statement & Complaint
                  </span>
                  <h4 className="text-sm font-bold text-white">{activeTicket.subject}</h4>
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
                    {activeTicket.description}
                  </p>
                </div>

                {/* 2-Column Dossier: Passenger on Left, Trip & Driver on Right */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Passenger Dossier Card */}
                  <div className="p-4 bg-zinc-950/50 border border-zinc-800/70 rounded-2xl space-y-3">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">
                      Passenger Information
                    </span>

                    <div>
                      <span className="text-xs font-bold text-white block">
                        {activeTicket.riderName || "Valued Passenger"}
                      </span>
                      <span className="text-xs text-zinc-400 font-mono">
                        {activeTicket.riderIdentifier}
                      </span>
                    </div>

                    {activeTicket.alternativeContactPhone && (
                      <div className="pt-2 border-t border-zinc-800/60">
                        <span className="text-[10px] text-zinc-500 block">Emergency Alternate Contact:</span>
                        <span className="text-xs font-semibold text-purple-300 font-mono">
                          {activeTicket.alternativeContactName ? `${activeTicket.alternativeContactName}: ` : ""}
                          {activeTicket.alternativeContactPhone}
                        </span>
                      </div>
                    )}

                    {/* Quick Comms with Rider */}
                    <div className="pt-2 flex items-center gap-2">
                      <a
                        href={`tel:${activeTicket.alternativeContactPhone || activeTicket.riderIdentifier}`}
                        className="flex-1 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                      >
                        <Phone size={12} className="text-emerald-400" />
                        <span>Call Passenger</span>
                      </a>
                      <a
                        href={`https://wa.me/${(activeTicket.alternativeContactPhone || activeTicket.riderIdentifier).replace(
                          /[^0-9]/g,
                          ""
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="py-1.5 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <MessageCircle size={12} />
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  </div>

                  {/* Trip & Driver Telematics Card */}
                  <div className="p-4 bg-zinc-950/50 border border-zinc-800/70 rounded-2xl space-y-3">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">
                      Trip & Driver Telematics
                    </span>

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">
                          {activeTicket.driverName || "Driver Terminal"}
                        </span>
                        {activeTicket.fareZar && (
                          <span className="text-xs font-black text-amber-400 font-mono">
                            R {Number(activeTicket.fareZar).toFixed(2)}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-zinc-400 font-mono">
                        {activeTicket.vehiclePlate || "No Plate"} &bull; {activeTicket.vehicleModel || "Vehicle"}
                      </span>
                    </div>

                    {activeTicket.tripId && (
                      <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                        <span className="text-[11px] text-zinc-400 font-mono">
                          ID: #{activeTicket.tripId.slice(0, 12)}
                        </span>
                        <Link
                          href={`/receipt/${activeTicket.tripId}`}
                          target="_blank"
                          className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                        >
                          <span>Open Receipt</span>
                          <ExternalLink size={10} />
                        </Link>
                      </div>
                    )}

                    {/* Quick Comms with Driver */}
                    {activeTicket.driverPhone && (
                      <div className="pt-2 flex items-center gap-2">
                        <a
                          href={`tel:${activeTicket.driverPhone}`}
                          className="flex-1 py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                        >
                          <Phone size={12} className="text-blue-400" />
                          <span>Call Driver</span>
                        </a>
                        <a
                          href={`https://wa.me/${activeTicket.driverPhone.replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                        >
                          <MessageCircle size={12} />
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Route Context Banner */}
                {(activeTicket.pickupLocation || activeTicket.dropoffLocation) && (
                  <div className="p-3 bg-zinc-950/40 border border-zinc-800/60 rounded-xl text-xs text-zinc-300 flex items-center gap-2">
                    <MapPin size={14} className="text-amber-400 shrink-0" />
                    <div className="truncate">
                      <span className="text-zinc-400">Route: </span>
                      <span className="text-white font-medium">{activeTicket.pickupLocation}</span>
                      <span className="text-zinc-500 mx-1">&rarr;</span>
                      <span className="text-white font-medium">{activeTicket.dropoffLocation}</span>
                    </div>
                  </div>
                )}

                {/* Lost Item Specific Box if applicable */}
                {activeTicket.itemDetails && (
                  <div className="p-4 bg-purple-950/20 border border-purple-500/30 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-purple-400 font-bold">
                        Lost Property Specifications
                      </span>
                      <button
                        onClick={handleReAlertDriver}
                        className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 transition"
                      >
                        <Smartphone size={11} />
                        <span>Re-Alert Driver&apos;s Terminal</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-zinc-500 block">Item / Model:</span>
                        <span className="font-semibold text-zinc-200">
                          {activeTicket.itemDetails.brandModel || activeTicket.itemDetails.itemType}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block">Color / Case:</span>
                        <span className="font-semibold text-zinc-200">
                          {activeTicket.itemDetails.color || "Not specified"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block">Seat Location:</span>
                        <span className="font-semibold text-purple-300 capitalize">
                          {activeTicket.itemDetails.approximateSeatLocation?.replace(/_/g, " ") || "Unknown"}
                        </span>
                      </div>
                    </div>

                    {activeTicket.itemDetails.caseOrFeatures && (
                      <p className="text-[11px] text-zinc-400 pt-1">
                        <span className="text-zinc-500">Distinctive features: </span>
                        {activeTicket.itemDetails.caseOrFeatures}
                      </p>
                    )}
                  </div>
                )}

                {/* Driver Response / Notes if present */}
                <div className="p-4 bg-zinc-950/40 border border-zinc-800 rounded-2xl space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 font-bold block">
                    Driver Terminal Feedback / Driver Notes
                  </span>
                  <input
                    type="text"
                    value={driverNotesInput}
                    onChange={(e) => setDriverNotesInput(e.target.value)}
                    placeholder="e.g. Driver confirmed item kept safely in glovebox / Passenger paid R85 cash."
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-hidden"
                  />
                </div>

                {/* Manager Resolution & Statutory Action Notes */}
                <div className="p-4 bg-zinc-950/80 border border-zinc-800 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold">
                      Operations Manager Resolution & Audit Notes
                    </span>
                    <button
                      onClick={handleSaveNotes}
                      disabled={isUpdating}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
                    >
                      <Check size={12} />
                      <span>Save Notes</span>
                    </button>
                  </div>

                  <textarea
                    rows={3}
                    value={resolutionInput}
                    onChange={(e) => setResolutionInput(e.target.value)}
                    placeholder="Record notes on resolution, fare adjustment, driver warning, or SAPS reporting details..."
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-emerald-500 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-hidden leading-relaxed"
                  />

                  {activeTicket.resolvedAt && (
                    <p className="text-[10px] text-zinc-500">
                      Settled at: {new Date(activeTicket.resolvedAt).toLocaleString("en-ZA")}
                    </p>
                  )}
                </div>

                {/* WhatsApp Support Deep Link & Escalation */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-zinc-800/80">
                  <span className="text-[11px] text-zinc-500">
                    Need further investigation? Escalate directly via SOLO Support WhatsApp:
                  </span>
                  <a
                    href={buildOfficialSupportWhatsAppUrl({
                      ticketCode: activeTicket.ticketCode,
                      category: activeTicket.category,
                      riderName: activeTicket.riderName,
                      riderPhone: activeTicket.alternativeContactPhone || activeTicket.riderIdentifier,
                      tripId: activeTicket.tripId,
                      driverName: activeTicket.driverName,
                      vehiclePlate: activeTicket.vehiclePlate,
                      summary: activeTicket.description,
                    })}
                    target="_blank"
                    rel="noreferrer"
                    className="py-1.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-md shadow-emerald-600/20"
                  >
                    <MessageCircle size={14} />
                    <span>Open Official WhatsApp Escalation</span>
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-500">
              <LifeBuoy size={36} className="text-zinc-600 mb-2" />
              <h3 className="text-sm font-bold text-zinc-300">Select a dispute ticket</h3>
              <p className="text-xs text-zinc-500 max-w-sm mt-1">
                Choose any ticket from the queue on the left to inspect passenger statements, telemetry, driver details, and record resolution notes.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
