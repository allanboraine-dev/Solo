"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  RefreshCw,
  FileText,
  Eye,
  Check,
  X,
  Phone,
  Car,
  ChevronRight,
  ExternalLink,
  Info,
  Calendar,
  CreditCard,
  UserCheck,
  Crown,
} from "lucide-react";
import { DriverDocument, KycDocType, KYC_DOCUMENT_CONFIGS } from "@/types/kyc";
import { DriverKycSummary } from "@/app/api/admin/drivers-kyc/route";
import { isPlatformOwner } from "@/utils/owner";

const REJECTION_PRESETS = [
  "Document is expired according to license card date",
  "Photograph is blurry or unreadable",
  "Name on document does not match driver profile name",
  "Wrong document type uploaded for this category",
  "Edges of the document are cropped or obscured",
  "Professional Driving Permit (PrDP) endorsement missing or unverified",
  "Certificate of Roadworthiness (CoR) is older than 6 months",
];

export default function AdminComplianceDashboard() {
  const [drivers, setDrivers] = useState<DriverKycSummary[]>([]);
  const [metrics, setMetrics] = useState({
    totalDrivers: 0,
    pendingReviewCount: 0,
    verifiedCount: 0,
    rejectedCount: 0,
    incompleteCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "pending_review" | "verified" | "rejected" | "incomplete"
  >("all");

  // Inspection & Review Modal States
  const [selectedDriver, setSelectedDriver] = useState<DriverKycSummary | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DriverDocument | null>(null);
  const [rejectingDoc, setRejectingDoc] = useState<{
    doc: DriverDocument;
    driverId: string;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const fetchComplianceData = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/drivers-kyc?status=${statusFilter}&search=${encodeURIComponent(searchQuery)}`
      );
      const data = await res.json();
      if (data.success) {
        setDrivers(data.drivers || []);
        if (data.metrics) setMetrics(data.metrics);
        // Sync selected driver if open
        if (selectedDriver) {
          const updatedSelected = (data.drivers || []).find(
            (d: DriverKycSummary) => d.id === selectedDriver.id
          );
          if (updatedSelected) setSelectedDriver(updatedSelected);
        }
      }
    } catch (err) {
      console.error("Error loading compliance data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplianceData();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchComplianceData();
  };

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 4000);
  };

  // Review decision handler
  const handleReviewAction = async (
    doc: DriverDocument,
    driverId: string,
    action: "approved" | "rejected",
    reason?: string
  ) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/review-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.id,
          driverId,
          docType: doc.doc_type,
          status: action,
          rejectionReason: reason || undefined,
        }),
      });

      const result = await res.json();
      if (result.success) {
        showToast(
          action === "approved"
            ? `✓ ${KYC_DOCUMENT_CONFIGS[doc.doc_type]?.title || doc.doc_type} approved`
            : `⚠️ ${KYC_DOCUMENT_CONFIGS[doc.doc_type]?.title || doc.doc_type} rejected`
        );
        setRejectingDoc(null);
        setRejectionReason("");
        // Reload compliance summaries
        await fetchComplianceData();
      } else {
        alert(result.error || "Failed to update review decision");
      }
    } catch (err: unknown) {
      const error = err as Error;
      alert(`Error: ${error.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 sm:p-8">
      {/* Toast Notification */}
      {feedbackToast && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-600 text-white text-sm font-bold py-3 px-5 rounded-2xl shadow-2xl animate-in slide-in-from-top duration-300 flex items-center gap-2">
          <CheckCircle2 size={18} />
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* Header */}
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400 mb-1">
              <ShieldCheck size={16} />
              <span>South Africa NLTA & Road Safety Compliance</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight">Driver KYC & Compliance Portal</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Verify South African PrDP permits, driver licenses, and roadworthy inspection certificates.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center">
            <Link
              href="/admin/simulator"
              className="flex items-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs transition shadow-md shadow-blue-600/20 active:scale-95"
            >
              <Zap size={14} className="text-amber-300" />
              <span>Dual-Window Simulator</span>
            </Link>

            <button
              onClick={fetchComplianceData}
              disabled={loading}
              className="flex items-center gap-2 py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl font-bold text-xs transition active:scale-95"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-zinc-900/80 border border-zinc-800 p-5 rounded-2xl">
            <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">Total Drivers</p>
            <h3 className="text-3xl font-extrabold mt-2">{metrics.totalDrivers}</h3>
            <p className="text-[11px] text-zinc-500 mt-1">Registered platform drivers</p>
          </div>

          <div
            onClick={() => setStatusFilter("pending_review")}
            className="bg-amber-950/20 border border-amber-800/40 p-5 rounded-2xl cursor-pointer hover:border-amber-500/60 transition group"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                Pending Review
              </p>
              <Clock size={16} className="text-amber-400 group-hover:scale-110 transition" />
            </div>
            <h3 className="text-3xl font-extrabold mt-2 text-amber-400">{metrics.pendingReviewCount}</h3>
            <p className="text-[11px] text-amber-500/80 mt-1">Awaiting compliance decision</p>
          </div>

          <div
            onClick={() => setStatusFilter("verified")}
            className="bg-emerald-950/20 border border-emerald-800/40 p-5 rounded-2xl cursor-pointer hover:border-emerald-500/60 transition group"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Verified & Active</p>
              <CheckCircle2 size={16} className="text-emerald-400 group-hover:scale-110 transition" />
            </div>
            <h3 className="text-3xl font-extrabold mt-2 text-emerald-400">{metrics.verifiedCount}</h3>
            <p className="text-[11px] text-emerald-500/80 mt-1">All 4 mandatory documents approved</p>
          </div>

          <div
            onClick={() => setStatusFilter("rejected")}
            className="bg-rose-950/20 border border-rose-800/40 p-5 rounded-2xl cursor-pointer hover:border-rose-500/60 transition group"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-rose-400 font-semibold uppercase tracking-wider">Action Needed</p>
              <AlertTriangle size={16} className="text-rose-400 group-hover:scale-110 transition" />
            </div>
            <h3 className="text-3xl font-extrabold mt-2 text-rose-400">
              {metrics.rejectedCount + metrics.incompleteCount}
            </h3>
            <p className="text-[11px] text-rose-500/80 mt-1">
              {metrics.rejectedCount} rejected • {metrics.incompleteCount} incomplete
            </p>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-96">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search driver, phone, plate, PrDP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition"
            />
          </form>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {(
              [
                { id: "all", label: "All Drivers" },
                { id: "pending_review", label: "Pending Review" },
                { id: "verified", label: "Verified" },
                { id: "rejected", label: "Rejected" },
                { id: "incomplete", label: "Incomplete" },
              ] as const
            ).map((filter) => (
              <button
                key={filter.id}
                onClick={() => setStatusFilter(filter.id)}
                className={`py-2 px-3 text-xs font-bold rounded-xl whitespace-nowrap transition ${
                  statusFilter === filter.id
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                    : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Drivers Compliance Table / Cards */}
        {loading ? (
          <div className="py-24 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-zinc-700 border-t-blue-500 rounded-full animate-spin mx-auto" />
            <p className="text-zinc-500 text-xs">Loading driver compliance telemetry...</p>
          </div>
        ) : drivers.length === 0 ? (
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-12 text-center space-y-3">
            <FileText size={40} className="mx-auto text-zinc-600" />
            <h3 className="text-lg font-bold">No drivers match your criteria</h3>
            <p className="text-zinc-500 text-xs max-w-sm mx-auto">
              Try adjusting your search query or switching the compliance filter above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {drivers.map((driver) => {
              const isOwnerDriver = driver.subscriptionPlan === "owner" || isPlatformOwner(driver.email);
              const isFullyVerified = driver.complianceStatus === "verified" || isOwnerDriver;
              const isPending = driver.complianceStatus === "pending_review" && !isOwnerDriver;
              const isRejected = driver.complianceStatus === "rejected" && !isOwnerDriver;

              return (
                <div
                  key={driver.id}
                  className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-5 hover:border-zinc-700 transition space-y-4 flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Driver Info & Status Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-bold text-base text-white truncate flex items-center gap-1.5">
                          {driver.fullName}
                          {isOwnerDriver && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-black">
                              OWNER
                            </span>
                          )}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-zinc-400 mt-0.5">
                          <Phone size={12} className="text-zinc-500" />
                          <a href={`tel:${driver.phone}`} className="hover:text-blue-400 transition">
                            {driver.phone || "No phone"}
                          </a>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1 ${
                          isOwnerDriver
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            : isFullyVerified
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                            : isPending
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse"
                            : isRejected
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                            : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                        }`}
                      >
                        {isOwnerDriver ? (
                          <>
                            <Crown size={11} className="text-amber-400" /> Platform Owner
                          </>
                        ) : isFullyVerified ? (
                          <>
                            <Check size={10} /> Verified
                          </>
                        ) : isPending ? (
                          <>
                            <Clock size={10} /> Review Needed
                          </>
                        ) : isRejected ? (
                          <>
                            <X size={10} /> Rejected
                          </>
                        ) : (
                          "Incomplete"
                        )}
                      </span>
                    </div>

                    {/* Vehicle & Subscription Info */}
                    <div className="mt-3 p-3 bg-zinc-950 rounded-2xl border border-zinc-800/80 space-y-1.5 text-xs text-zinc-400">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-zinc-300 font-semibold">
                          <Car size={13} className="text-blue-400" />
                          {driver.vehicleMake} {driver.vehicleModel || "Vehicle not set"}
                        </span>
                        <span className="font-mono bg-zinc-900 px-2 py-0.5 rounded text-[11px] text-white border border-zinc-800">
                          {driver.licensePlate || "NO-PLATE"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-900">
                        <span className="flex items-center gap-1">
                          <CreditCard size={11} />
                          {isOwnerDriver
                            ? "👑 Lifetime Free (Owner)"
                            : driver.subscriptionPlan === "paid"
                            ? "R499/mo Active"
                            : driver.subscriptionPlan === "trial"
                            ? "7-Day Free Trial"
                            : "Expired"}
                        </span>
                        <span>PrDP: {driver.prdpNumber || "N/A"}</span>
                      </div>
                    </div>

                    {/* 5 Regulatory Document Badges */}
                    <div className="mt-4 space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        Mandatory SA KYC Documents
                      </p>
                      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                        {(
                          [
                            { type: "license_front", label: "License (Front)" },
                            { type: "license_back", label: "License (Back)" },
                            { type: "prdp", label: "PrDP Permit" },
                            { type: "roadworthy", label: "Roadworthy CoR" },
                          ] as const
                        ).map((item) => {
                          const doc = driver.documents.find((d) => d.doc_type === item.type);
                          const isDocApproved = doc?.status === "approved";
                          const isDocPending = doc?.status === "pending";
                          const isDocRejected = doc?.status === "rejected";

                          return (
                            <div
                              key={item.type}
                              className={`p-2 rounded-xl border flex items-center justify-between ${
                                isDocApproved
                                  ? "bg-emerald-950/20 border-emerald-900/40 text-emerald-300"
                                  : isDocPending
                                  ? "bg-amber-950/20 border-amber-900/40 text-amber-300"
                                  : isDocRejected
                                  ? "bg-rose-950/20 border-rose-900/40 text-rose-300"
                                  : "bg-zinc-950/60 border-zinc-800/60 text-zinc-500"
                              }`}
                            >
                              <span className="truncate text-[10px] font-medium">{item.label}</span>
                              {isDocApproved ? (
                                <Check size={12} className="text-emerald-400 shrink-0" />
                              ) : isDocPending ? (
                                <Clock size={12} className="text-amber-400 shrink-0" />
                              ) : isDocRejected ? (
                                <X size={12} className="text-rose-400 shrink-0" />
                              ) : (
                                <span className="text-[9px] text-zinc-600 uppercase">Missing</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Review Button */}
                  <button
                    onClick={() => setSelectedDriver(driver)}
                    className="mt-4 w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 active:scale-95 border border-zinc-700"
                  >
                    <span>Inspect & Review ({driver.totalDocs}/5 Docs)</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Driver Document Inspection Modal */}
      {selectedDriver && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedDriver(null)}
        >
          <div
            className="w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-3xl p-6 text-white space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-zinc-800 pb-4">
              <div>
                <span className="text-xs uppercase font-bold text-blue-400">Driver Compliance Dossier</span>
                <h2 className="text-2xl font-black">{selectedDriver.fullName}</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Phone: {selectedDriver.phone} • Vehicle: {selectedDriver.vehicleMake}{" "}
                  {selectedDriver.vehicleModel} ({selectedDriver.licensePlate})
                </p>
              </div>
              <button
                onClick={() => setSelectedDriver(null)}
                className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Document Review Slots */}
            <div className="space-y-4">
              <h4 className="text-xs uppercase font-bold tracking-wider text-zinc-400">
                Uploaded KYC Verification Documents
              </h4>

              {(
                [
                  "license_front",
                  "license_back",
                  "prdp",
                  "roadworthy",
                  "vehicle_photo",
                ] as KycDocType[]
              ).map((docType) => {
                const config = KYC_DOCUMENT_CONFIGS[docType];
                const doc = selectedDriver.documents.find((d) => d.doc_type === docType);

                return (
                  <div
                    key={docType}
                    className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h5 className="text-sm font-bold text-white truncate">{config.title}</h5>
                        {config.required ? (
                          <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                            Mandatory
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                            Optional
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500">{config.description}</p>

                      {doc && (
                        <div className="flex items-center gap-3 pt-1 text-xs">
                          <span
                            className={`font-semibold text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                              doc.status === "approved"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : doc.status === "rejected"
                                ? "bg-rose-500/20 text-rose-400"
                                : "bg-amber-500/20 text-amber-400"
                            }`}
                          >
                            Status: {doc.status.toUpperCase()}
                          </span>

                          {doc.rejection_reason && (
                            <span className="text-rose-400 text-[11px] truncate max-w-xs">
                              Reason: {doc.rejection_reason}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {doc ? (
                        <>
                          {doc.signedUrl && (
                            <button
                              onClick={() => setPreviewDoc(doc)}
                              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold flex items-center gap-1 border border-zinc-700 transition"
                            >
                              <Eye size={14} />
                              <span>Inspect</span>
                            </button>
                          )}

                          <button
                            onClick={() =>
                              handleReviewAction(doc, selectedDriver.id, "approved")
                            }
                            disabled={actionLoading || doc.status === "approved"}
                            className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition shadow-md shadow-emerald-600/20 active:scale-95"
                          >
                            <Check size={14} />
                            <span>Approve</span>
                          </button>

                          <button
                            onClick={() =>
                              setRejectingDoc({ doc, driverId: selectedDriver.id })
                            }
                            disabled={actionLoading}
                            className="py-2 px-3 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1 transition border border-rose-600/30 active:scale-95"
                          >
                            <X size={14} />
                            <span>Reject</span>
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-zinc-600 italic">Not yet uploaded</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Document Full View Modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-3xl p-6 text-white space-y-4 shadow-2xl max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-bold text-base">
                Inspect: {KYC_DOCUMENT_CONFIGS[previewDoc.doc_type]?.title || previewDoc.doc_type}
              </h3>
              <div className="flex items-center gap-2">
                {previewDoc.signedUrl && (
                  <a
                    href={previewDoc.signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 bg-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs flex items-center gap-1 transition"
                  >
                    <ExternalLink size={14} />
                    <span>Open in new tab</span>
                  </a>
                )}
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-black rounded-2xl overflow-hidden flex items-center justify-center p-2 min-h-[400px]">
              {previewDoc.file_path.toLowerCase().endsWith(".pdf") ? (
                <iframe
                  src={previewDoc.signedUrl}
                  className="w-full h-[550px] rounded-xl border border-zinc-800"
                  title="PDF Preview"
                />
              ) : (
                <img
                  src={previewDoc.signedUrl}
                  alt="KYC Document Preview"
                  className="max-h-[550px] w-auto max-w-full object-contain rounded-xl"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rejection Reason Modal */}
      {rejectingDoc && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setRejectingDoc(null)}
        >
          <div
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 text-white space-y-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <span className="text-xs uppercase font-bold text-rose-400">Compliance Rejection</span>
              <h3 className="text-lg font-bold">
                Reject {KYC_DOCUMENT_CONFIGS[rejectingDoc.doc.doc_type]?.title || rejectingDoc.doc.doc_type}
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Select a standard rejection reason or provide custom instructions so the driver can rectify their upload.
              </p>
            </div>

            {/* Presets */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Quick Rejection Presets
              </label>
              <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                {REJECTION_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setRejectionReason(preset)}
                    className={`w-full text-left p-2 rounded-xl text-xs transition border ${
                      rejectionReason === preset
                        ? "bg-rose-950/40 border-rose-600/60 text-white font-medium"
                        : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-white"
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Notes */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Reason sent to Driver
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain what is missing or required to pass verification..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500 transition"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectingDoc(null)}
                className="w-1/2 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading || !rejectionReason.trim()}
                onClick={() =>
                  handleReviewAction(
                    rejectingDoc.doc,
                    rejectingDoc.driverId,
                    "rejected",
                    rejectionReason
                  )
                }
                className="w-1/2 py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-rose-600/20"
              >
                {actionLoading ? "Submitting..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
