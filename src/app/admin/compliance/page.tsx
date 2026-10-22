"use client";

import { useEffect, useState, useMemo, useRef } from "react";
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
  Users,
  Bell,
  Volume2,
  VolumeX,
  Radio,
  Trash2,
} from "lucide-react";
import { DriverDocument, KycDocType, KycDocStatus, KYC_DOCUMENT_CONFIGS } from "@/types/kyc";
import { DriverKycSummary } from "@/app/api/admin/drivers-kyc/route";
import { isPlatformOwner } from "@/utils/owner";
import { audioAlert } from "@/utils/audioAlert";
import { createClient } from "@/utils/supabase/client";
import { DriverSignupAlert } from "@/utils/kycStore";

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

  // Real-time Driver Verification Command Centre Notification States
  const [liveAlert, setLiveAlert] = useState<DriverSignupAlert | null>(null);
  const [signupAlerts, setSignupAlerts] = useState<DriverSignupAlert[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [desktopAlertsEnabled, setDesktopAlertsEnabled] = useState(false);
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);
  const lastAlertIdRef = useRef<string>("");

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

  const handleNewDriverAlert = (alert: DriverSignupAlert) => {
    if (!alert || !alert.fullName) return;
    if (lastAlertIdRef.current === alert.id) return;
    lastAlertIdRef.current = alert.id;

    setLiveAlert(alert);
    setSignupAlerts((prev) => {
      const exists = prev.some(
        (a) => a.id === alert.id || (a.driverId && a.driverId === alert.driverId)
      );
      if (exists) return prev;
      return [alert, ...prev];
    });

    // 1. Play distinct notification chime if audio alerts are enabled
    if (soundEnabled) {
      audioAlert.playAdminNewDriverChime();
    }

    // 2. Trigger native OS desktop notification if window is minimized / backgrounded
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      try {
        const vehicleInfo = [alert.vehicleMake, alert.vehicleModel, alert.licensePlate]
          .filter(Boolean)
          .join(" ");
        const n = new Notification(`🚨 New Driver Signup: ${alert.fullName}`, {
          body: `${vehicleInfo || "New applicant"} - Tap to inspect & verify documents.`,
          icon: "/driver-icon-192.png",
          badge: "/icon-192.png",
          tag: `driver-signup-${alert.driverId || alert.id}`,
        });
        n.onclick = () => {
          window.focus();
          inspectDriverById(alert.driverId, alert);
          n.close();
        };
      } catch {}
    }

    // 3. Immediately refresh compliance data so new driver shows up in the table
    fetchComplianceData(false);
  };

  const inspectDriverById = (driverId: string, fallbackAlert?: DriverSignupAlert) => {
    const existing = drivers.find((d) => d.id === driverId);
    if (existing) {
      setSelectedDriver(existing);
    } else if (fallbackAlert) {
      const provisional: DriverKycSummary = {
        id: fallbackAlert.driverId,
        fullName: fallbackAlert.fullName,
        phone: fallbackAlert.phone,
        email: fallbackAlert.email,
        vehicleMake: fallbackAlert.vehicleMake,
        vehicleModel: fallbackAlert.vehicleModel,
        licensePlate: fallbackAlert.licensePlate,
        prdpNumber: fallbackAlert.prdpNumber || "",
        isVerified: false,
        subscriptionPlan: "trial",
        createdAt: fallbackAlert.createdAt || new Date().toISOString(),
        documents: [],
        totalDocs: 0,
        approvedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        complianceStatus: "incomplete",
      };
      setSelectedDriver(provisional);
      fetchComplianceData(false);
    }
  };

  const requestDesktopNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("Browser desktop notifications are not supported in this browser.");
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        setDesktopAlertsEnabled(true);
        showToast("✓ Desktop notifications enabled for driver signups");
        new Notification("SOLO Command Centre Alerts Active", {
          body: "You will receive desktop alerts when new drivers register on the platform.",
          icon: "/driver-icon-192.png",
        });
      } else {
        setDesktopAlertsEnabled(false);
        alert("Notifications were disabled. Please allow notifications in your browser settings.");
      }
    } catch (e) {
      console.warn("Notification permission request error:", e);
    }
  };

  const fetchComplianceData = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/drivers-kyc?status=${statusFilter}&search=${encodeURIComponent(searchQuery)}`
      );
      const data = await res.json();
      let serverDrivers: DriverKycSummary[] = data.drivers || [];

      if (Array.isArray(data.signupAlerts) && data.signupAlerts.length > 0) {
        setSignupAlerts(data.signupAlerts);
      }

      // Check localStorage for local driver registrations so local test drivers appear
      if (typeof window !== "undefined") {
        try {
          const profilesToSync: any[] = [];
          const localProfileStr = localStorage.getItem("mock_driver_profile");
          if (localProfileStr) {
            profilesToSync.push(JSON.parse(localProfileStr));
          }
          const allRegStr = localStorage.getItem("all_registered_drivers");
          if (allRegStr) {
            const allReg = JSON.parse(allRegStr);
            if (Array.isArray(allReg)) {
              for (const p of allReg) {
                if (!profilesToSync.some((x) => x.id === p.id)) {
                  profilesToSync.push(p);
                }
              }
            }
          }

          for (const localProf of profilesToSync) {
            const exists = serverDrivers.some(
              (d) => d.id === localProf.id || (localProf.phone && d.phone === localProf.phone)
            );
            if (!exists && localProf.fullName && localProf.id) {
              const localDocStore = localStorage.getItem(`driver_kyc_documents_${localProf.id}`);
              const localDocs: DriverDocument[] = localDocStore ? JSON.parse(localDocStore) : [];

              const pendingCount = localDocs.filter((d) => d.status === "pending").length;
              const approvedCount = localDocs.filter((d) => d.status === "approved").length;
              const rejectedCount = localDocs.filter((d) => d.status === "rejected").length;

              const localSummary: DriverKycSummary = {
                id: localProf.id,
                fullName: localProf.fullName,
                phone: localProf.phone || "",
                email: localProf.email || "",
                vehicleMake: localProf.vehicleMake || "",
                vehicleModel: localProf.vehicleModel || "",
                licensePlate: localProf.licensePlate || "",
                prdpNumber: localProf.prdpNumber || "",
                isVerified: !!localProf.isVerified,
                subscriptionPlan: localProf.subscriptionPlan || "trial",
                trialStartedAt: localProf.trialStartedAt
                  ? new Date(localProf.trialStartedAt).toISOString()
                  : null,
                createdAt: new Date().toISOString(),
                documents: localDocs,
                totalDocs: localDocs.length,
                approvedCount,
                pendingCount,
                rejectedCount,
                complianceStatus: localProf.isVerified
                  ? "verified"
                  : pendingCount > 0
                  ? "pending_review"
                  : rejectedCount > 0
                  ? "rejected"
                  : "incomplete",
              };

              serverDrivers = [localSummary, ...serverDrivers];
            }
          }
        } catch (e) {
          console.warn("Local driver sync notice:", e);
        }
      }

      setDrivers(serverDrivers);
      if (data.metrics) {
        setMetrics({
          ...data.metrics,
          totalDrivers: Math.max(data.metrics.totalDrivers, serverDrivers.length),
        });
      }

      // Sync selected driver if modal is open
      if (selectedDriver) {
        const updatedSelected = serverDrivers.find(
          (d: DriverKycSummary) => d.id === selectedDriver.id
        );
        if (updatedSelected) setSelectedDriver(updatedSelected);
      }
    } catch (err) {
      console.error("Error loading compliance data:", err);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlStatus = params.get("status");
      const urlSearch = params.get("search");
      if (urlStatus && ["all", "pending_review", "verified", "rejected", "incomplete"].includes(urlStatus)) {
        setStatusFilter(urlStatus as any);
      }
      if (urlSearch) {
        setSearchQuery(urlSearch);
      }

      const storedSound = localStorage.getItem("solo_admin_sound_enabled");
      if (storedSound !== null) {
        setSoundEnabled(storedSound === "true");
      }
      if ("Notification" in window && Notification.permission === "granted") {
        setDesktopAlertsEnabled(true);
      }
    }
  }, []);

  // Multi-source Real-time Update Listeners (BroadcastChannel + LocalStorage + Supabase Channel + Polling)
  useEffect(() => {
    // 1. BroadcastChannel across all open browser tabs/windows
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        bc = new BroadcastChannel("solo_driver_signup_channel");
        bc.onmessage = (e) => {
          if (e.data?.type === "NEW_DRIVER_SIGNUP" && e.data.alert) {
            handleNewDriverAlert(e.data.alert);
          }
        };
      } catch {}
    }

    // 2. Cross-tab storage listener
    const onStorage = (e: StorageEvent) => {
      if (e.key === "solo_new_driver_signup_alert" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          handleNewDriverAlert(parsed);
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);

    // 3. Supabase Realtime Channel
    const supabase = createClient();
    const realtimeChannel = supabase
      .channel("solo-admin-alerts")
      .on("broadcast", { event: "NEW_DRIVER_SIGNUP" }, (msg: any) => {
        if (msg.payload) {
          handleNewDriverAlert(msg.payload);
        }
      })
      .subscribe();

    // 4. Background polling heartbeat every 8 seconds
    const pollInterval = setInterval(() => {
      fetchComplianceData(false);
    }, 8000);

    return () => {
      if (bc) bc.close();
      window.removeEventListener("storage", onStorage);
      supabase.removeChannel(realtimeChannel);
      clearInterval(pollInterval);
    };
  }, [soundEnabled, drivers]);

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

  // Review single document
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

        // Optimistically update selectedDriver in place immediately
        if (selectedDriver && selectedDriver.id === driverId) {
          const updatedDocs = selectedDriver.documents.map((d) =>
            d.doc_type === doc.doc_type
              ? {
                  ...d,
                  status: action as KycDocStatus,
                  rejection_reason: action === "rejected" ? reason || null : null,
                }
              : d
          );

          if (!updatedDocs.some((d) => d.doc_type === doc.doc_type)) {
            updatedDocs.push({
              ...doc,
              status: action as KycDocStatus,
              rejection_reason: action === "rejected" ? reason || null : null,
            });
          }

          const requiredTypes: KycDocType[] = [
            "license_front",
            "license_back",
            "prdp",
            "roadworthy",
          ];
          const allMandatoryApproved = requiredTypes.every((t) =>
            updatedDocs.some((d) => d.doc_type === t && d.status === "approved")
          );

          const approvedCount = updatedDocs.filter((d) => d.status === "approved").length;
          const pendingCount = updatedDocs.filter((d) => d.status === "pending").length;
          const rejectedCount = updatedDocs.filter((d) => d.status === "rejected").length;

          const updatedSummary: DriverKycSummary = {
            ...selectedDriver,
            documents: updatedDocs,
            approvedCount,
            pendingCount,
            rejectedCount,
            isVerified: allMandatoryApproved || selectedDriver.isVerified,
            complianceStatus:
              allMandatoryApproved || selectedDriver.isVerified
                ? "verified"
                : pendingCount > 0
                ? "pending_review"
                : rejectedCount > 0
                ? "rejected"
                : "incomplete",
          };

          setSelectedDriver(updatedSummary);

          // Also update previewDoc if currently open
          if (previewDoc && previewDoc.doc_type === doc.doc_type) {
            setPreviewDoc({ ...previewDoc, status: action as KycDocStatus });
          }

          // Sync localStorage mock_driver_profile so driver app immediately updates
          if (typeof window !== "undefined") {
            try {
              const localProfStr = localStorage.getItem("mock_driver_profile");
              if (localProfStr) {
                const localProf = JSON.parse(localProfStr);
                if (localProf.id === driverId) {
                  if (allMandatoryApproved) localProf.isVerified = true;
                  if (doc.doc_type === "license_front" || doc.doc_type === "license_back")
                    localProf.hasLicense = true;
                  if (doc.doc_type === "prdp") localProf.hasPrdp = true;
                  if (doc.doc_type === "roadworthy") localProf.hasRoadworthy = true;
                  localStorage.setItem("mock_driver_profile", JSON.stringify(localProf));
                }
              }
              localStorage.setItem(
                `driver_kyc_documents_${driverId}`,
                JSON.stringify(updatedDocs)
              );
            } catch {}
          }
        }

        // Reload compliance summaries in background
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

  // Review all documents & verify driver in one click
  const handleApproveAll = async (driverId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/review-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId,
          status: "approve_all",
        }),
      });

      const result = await res.json();
      if (result.success) {
        showToast("✓ All documents approved & driver verified!");

        if (selectedDriver && selectedDriver.id === driverId) {
          const updatedDocs = selectedDriver.documents.map((d) => ({
            ...d,
            status: "approved" as KycDocStatus,
            rejection_reason: null,
          }));
          setSelectedDriver({
            ...selectedDriver,
            isVerified: true,
            complianceStatus: "verified",
            approvedCount: updatedDocs.length,
            pendingCount: 0,
            rejectedCount: 0,
            documents: updatedDocs,
          });

          // Sync localStorage mock_driver_profile
          if (typeof window !== "undefined") {
            try {
              const localProfStr = localStorage.getItem("mock_driver_profile");
              if (localProfStr) {
                const localProf = JSON.parse(localProfStr);
                if (localProf.id === driverId) {
                  localProf.isVerified = true;
                  localProf.hasLicense = true;
                  localProf.hasPrdp = true;
                  localProf.hasRoadworthy = true;
                  localStorage.setItem("mock_driver_profile", JSON.stringify(localProf));
                }
              }
              localStorage.setItem(
                `driver_kyc_documents_${driverId}`,
                JSON.stringify(updatedDocs)
              );
            } catch {}
          }
        }

        await fetchComplianceData();
      } else {
        alert(result.error || "Failed to approve all documents");
      }
    } catch (err: unknown) {
      alert(`Error: ${(err as Error).message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDriver = async (driver: DriverKycSummary) => {
    const isOwner = driver.subscriptionPlan === "owner" || isPlatformOwner(driver.email);
    if (isOwner) {
      alert("Platform Founder (Allan Boraine) cannot be deleted.");
      return;
    }

    const confirmed = window.confirm(
      `Permanently remove bogus driver registration for "${driver.fullName}" (${driver.email || driver.phone || driver.licensePlate || "No plate"})?\n\nThis will purge all submitted KYC documents, audits, and profile records from the compliance portal.`
    );
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/drivers-kyc?driverId=${encodeURIComponent(driver.id)}`, {
        method: "DELETE",
      });

      const result = await res.json();
      if (result.success) {
        showToast(`✓ Removed bogus registration: ${driver.fullName}`);

        // Immediately purge from local state
        setDrivers((prev) => prev.filter((d) => d.id !== driver.id));

        // Close modal if open on this driver
        if (selectedDriver?.id === driver.id) {
          setSelectedDriver(null);
        }

        // Clean up client-side test localStorage records
        if (typeof window !== "undefined") {
          try {
            const localProfStr = localStorage.getItem("mock_driver_profile");
            if (localProfStr) {
              const parsed = JSON.parse(localProfStr);
              if (parsed.id === driver.id) {
                localStorage.removeItem("mock_driver_profile");
              }
            }
            const allRegStr = localStorage.getItem("all_registered_drivers");
            if (allRegStr) {
              const all = JSON.parse(allRegStr);
              if (Array.isArray(all)) {
                localStorage.setItem(
                  "all_registered_drivers",
                  JSON.stringify(all.filter((x: any) => x.id !== driver.id))
                );
              }
            }
            localStorage.removeItem(`driver_kyc_documents_${driver.id}`);
          } catch {}
        }

        // Re-fetch live metrics
        await fetchComplianceData();
      } else {
        alert(result.error || "Failed to delete driver registration");
      }
    } catch (err: unknown) {
      alert(`Error deleting registration: ${(err as Error).message}`);
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

          <div className="flex items-center flex-wrap gap-2 self-start md:self-center">
            {/* Realtime Live Indicator */}
            <div className="hidden lg:flex items-center gap-1.5 py-2 px-3 bg-emerald-950/30 border border-emerald-900/50 text-emerald-400 rounded-xl text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>Command Centre Live</span>
            </div>

            {/* Audio Chime Notification Toggle */}
            <button
              type="button"
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                if (typeof window !== "undefined") {
                  localStorage.setItem("solo_admin_sound_enabled", String(next));
                }
                if (next) {
                  audioAlert.playAdminNewDriverChime();
                  showToast("🔔 Driver signup audio chime enabled");
                } else {
                  showToast("🔕 Driver signup audio chime muted");
                }
              }}
              className={`flex items-center gap-1.5 py-2.5 px-3.5 rounded-xl font-bold text-xs transition border active:scale-95 ${
                soundEnabled
                  ? "bg-blue-600/20 border-blue-500/40 text-blue-300 hover:bg-blue-600/30"
                  : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800"
              }`}
              title="Toggle Audio Chime when new drivers register"
            >
              {soundEnabled ? <Volume2 size={15} className="text-blue-400" /> : <VolumeX size={15} />}
              <span>{soundEnabled ? "Chime: On" : "Chime: Off"}</span>
            </button>

            {/* Browser Desktop Push Notification Toggle */}
            <button
              type="button"
              onClick={requestDesktopNotificationPermission}
              className={`flex items-center gap-1.5 py-2.5 px-3.5 rounded-xl font-bold text-xs transition border active:scale-95 ${
                desktopAlertsEnabled
                  ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                  : "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-300"
              }`}
              title="Receive desktop alerts when new drivers sign up"
            >
              <Bell size={15} className={desktopAlertsEnabled ? "text-emerald-400" : "text-zinc-400"} />
              <span className="hidden sm:inline">{desktopAlertsEnabled ? "Desktop Alerts: Active" : "Enable Desktop Alerts"}</span>
              <span className="sm:hidden">Alerts</span>
            </button>

            <Link
              href="/admin"
              className="flex items-center gap-2 py-2.5 px-3.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl font-bold text-xs transition active:scale-95"
            >
              <Users size={14} />
              <span>Overview</span>
            </Link>

            <Link
              href="/admin/simulator"
              className="flex items-center gap-2 py-2.5 px-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs transition shadow-md shadow-blue-600/20 active:scale-95"
            >
              <Zap size={14} className="text-amber-300" />
              <span>Simulator</span>
            </Link>

            <button
              onClick={() => fetchComplianceData(true)}
              disabled={loading}
              className="flex items-center gap-2 py-2.5 px-3.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl font-bold text-xs transition active:scale-95"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Real-time Driver Signup Alert Banner */}
        {liveAlert && (
          <div className="bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-emerald-500/20 border-2 border-amber-500/80 rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in slide-in-from-top-6 duration-300">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="p-3.5 rounded-2xl bg-amber-500 text-black font-black shrink-0 animate-pulse shadow-lg shadow-amber-500/30">
                <Bell size={24} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500 text-black shadow-xs">
                    🚨 New Driver Signup Alert
                  </span>
                  <span className="text-xs text-amber-200/80 font-medium">Verification Action Required</span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white">
                  {liveAlert.fullName} just registered on SOLO
                </h3>
                <p className="text-xs sm:text-sm text-zinc-300 flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-blue-300 font-semibold">
                    <Car size={14} />
                    {liveAlert.vehicleMake} {liveAlert.vehicleModel} ({liveAlert.licensePlate || "Pending Plate"})
                  </span>
                  {liveAlert.phone && (
                    <>
                      <span className="text-zinc-600">•</span>
                      <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold">
                        <Phone size={14} />
                        {liveAlert.phone}
                      </span>
                    </>
                  )}
                  {liveAlert.email && (
                    <>
                      <span className="text-zinc-600">•</span>
                      <span className="text-zinc-400">{liveAlert.email}</span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-end md:self-center shrink-0">
              <button
                type="button"
                onClick={() => {
                  inspectDriverById(liveAlert.driverId, liveAlert);
                  setLiveAlert(null);
                }}
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-black font-black text-xs sm:text-sm flex items-center gap-2 transition active:scale-95 shadow-xl shadow-amber-500/25"
              >
                <span>Inspect & Verify KYC</span>
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                onClick={() => setLiveAlert(null)}
                className="p-3 rounded-2xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition"
                title="Dismiss Alert"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}

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
            <p className="text-[11px] text-emerald-500/80 mt-1">All 7 mandatory documents approved</p>
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
                            { type: "driver_selfie", label: "Selfie (Face)" },
                            { type: "license_front", label: "License (Front)" },
                            { type: "license_back", label: "License (Back)" },
                            { type: "prdp", label: "PrDP Permit" },
                            { type: "license_disc", label: "License Disc" },
                            { type: "vehicle_photo", label: "Vehicle Photo" },
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

                  {/* Actions: Review Button & Delete Bogus Driver */}
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      onClick={() => setSelectedDriver(driver)}
                      className="flex-1 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 active:scale-95 border border-zinc-700"
                    >
                      <span>Inspect & Review ({driver.totalDocs}/7 Docs)</span>
                      <ChevronRight size={14} />
                    </button>
                    {!isOwnerDriver && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDriver(driver);
                        }}
                        disabled={actionLoading}
                        className="py-2.5 px-3 bg-rose-950/40 hover:bg-rose-900/80 border border-rose-800/60 hover:border-rose-600 text-rose-300 rounded-xl transition active:scale-95 flex items-center justify-center"
                        title="Delete Bogus Registration"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
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
              <div className="flex items-center gap-2">
                {!(selectedDriver.subscriptionPlan === "owner" || isPlatformOwner(selectedDriver.email)) && (
                  <button
                    type="button"
                    onClick={() => handleDeleteDriver(selectedDriver)}
                    disabled={actionLoading}
                    className="py-2 px-3 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/80 hover:border-rose-600 text-rose-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-950/40 transition active:scale-95"
                    title="Delete Bogus Registration"
                  >
                    <Trash2 size={14} />
                    <span>Delete Bogus</span>
                  </button>
                )}
                {!selectedDriver.isVerified && (
                  <button
                    onClick={() => handleApproveAll(selectedDriver.id)}
                    disabled={actionLoading}
                    className="py-2 px-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition active:scale-95"
                  >
                    <CheckCircle2 size={14} />
                    <span>Approve All & Verify</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedDriver(null)}
                  className="p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Document Review Slots */}
            <div className="space-y-4">
              <h4 className="text-xs uppercase font-bold tracking-wider text-zinc-400">
                Uploaded KYC Verification Documents
              </h4>

              {(
                [
                  "driver_selfie",
                  "license_front",
                  "license_back",
                  "prdp",
                  "license_disc",
                  "vehicle_photo",
                  "roadworthy",
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
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-600 italic">Not yet uploaded</span>
                          <button
                            onClick={() => {
                              const placeholderDoc: DriverDocument = {
                                id: crypto.randomUUID(),
                                driver_id: selectedDriver.id,
                                doc_type: docType,
                                file_path: `${selectedDriver.id}/${docType}.jpg`,
                                status: "pending",
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString(),
                              };
                              handleReviewAction(placeholderDoc, selectedDriver.id, "approved");
                            }}
                            disabled={actionLoading}
                            className="py-1 px-2.5 bg-zinc-800 hover:bg-emerald-600/30 text-zinc-300 hover:text-emerald-300 border border-zinc-700 hover:border-emerald-500/40 rounded-xl text-[10px] font-bold transition flex items-center gap-1 active:scale-95"
                          >
                            <Check size={11} />
                            <span>Verify Slot</span>
                          </button>
                        </div>
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
              <div>
                <h3 className="font-bold text-base">
                  Inspect: {KYC_DOCUMENT_CONFIGS[previewDoc.doc_type]?.title || previewDoc.doc_type}
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-1 ${
                    previewDoc.status === "approved"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : previewDoc.status === "rejected"
                      ? "bg-rose-500/20 text-rose-400"
                      : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  Status: {previewDoc.status.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {selectedDriver && previewDoc.status !== "approved" && (
                  <button
                    onClick={() =>
                      handleReviewAction(previewDoc, selectedDriver.id, "approved")
                    }
                    disabled={actionLoading}
                    className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition shadow-md shadow-emerald-600/20 active:scale-95"
                  >
                    <Check size={14} />
                    <span>Approve</span>
                  </button>
                )}

                {selectedDriver && previewDoc.status !== "rejected" && (
                  <button
                    onClick={() =>
                      setRejectingDoc({ doc: previewDoc, driverId: selectedDriver.id })
                    }
                    disabled={actionLoading}
                    className="py-1.5 px-3 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1 transition border border-rose-600/30 active:scale-95"
                  >
                    <X size={14} />
                    <span>Reject</span>
                  </button>
                )}

                {previewDoc.signedUrl && (
                  <a
                    href={previewDoc.signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 bg-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs flex items-center gap-1 transition"
                  >
                    <ExternalLink size={14} />
                    <span>Open in tab</span>
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
