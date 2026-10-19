"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  FileCheck2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  UserCheck,
  Search,
  Car,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { DriverKycSummary } from "@/app/api/admin/drivers-kyc/route";
import { isPlatformOwner } from "@/utils/owner";

export default function AdminOverviewDashboard() {
  const [drivers, setDrivers] = useState<DriverKycSummary[]>([]);
  const [metrics, setMetrics] = useState({
    totalDrivers: 0,
    pendingReviewCount: 0,
    verifiedCount: 0,
    rejectedCount: 0,
    incompleteCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/drivers-kyc");
      const data = await res.json();
      let serverDrivers: DriverKycSummary[] = data.drivers || [];

      // Check localStorage for local driver registrations
      if (typeof window !== "undefined") {
        try {
          const profilesToSync: any[] = [];
          const localProfileStr = localStorage.getItem("mock_driver_profile");
          if (localProfileStr) profilesToSync.push(JSON.parse(localProfileStr));
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
              const localDocs = localDocStore ? JSON.parse(localDocStore) : [];
              const pendingCount = localDocs.filter((d: any) => d.status === "pending").length;
              const approvedCount = localDocs.filter((d: any) => d.status === "approved").length;
              const rejectedCount = localDocs.filter((d: any) => d.status === "rejected").length;

              serverDrivers.unshift({
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
              });
            }
          }
        } catch (e) {
          console.warn("Local sync notice:", e);
        }
      }

      setDrivers(serverDrivers);
      setMetrics({
        totalDrivers: serverDrivers.length,
        pendingReviewCount: serverDrivers.filter((d) => d.complianceStatus === "pending_review").length,
        verifiedCount: serverDrivers.filter((d) => d.complianceStatus === "verified").length,
        rejectedCount: serverDrivers.filter((d) => d.complianceStatus === "rejected").length,
        incompleteCount: serverDrivers.filter((d) => d.complianceStatus === "incomplete").length,
      });
    } catch (e) {
      console.error("Error loading overview data:", e);
    } finally {
      setLoading(false);
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

    try {
      const res = await fetch(`/api/admin/drivers-kyc?driverId=${encodeURIComponent(driver.id)}`, {
        method: "DELETE",
      });

      const result = await res.json();
      if (result.success) {
        setDrivers((prev) => prev.filter((d) => d.id !== driver.id));

        if (typeof window !== "undefined") {
          try {
            const localProfStr = localStorage.getItem("mock_driver_profile");
            if (localProfStr) {
              const parsed = JSON.parse(localProfStr);
              if (parsed.id === driver.id) localStorage.removeItem("mock_driver_profile");
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

        await loadData();
      } else {
        alert(result.error || "Failed to delete driver registration");
      }
    } catch (err: unknown) {
      alert(`Error deleting registration: ${(err as Error).message}`);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredDrivers = drivers.filter(
    (d) =>
      d.fullName.toLowerCase().includes(search.toLowerCase()) ||
      d.phone.includes(search) ||
      d.licensePlate.toLowerCase().includes(search.toLowerCase()) ||
      d.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 bg-zinc-950 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-950/60 via-zinc-900 to-indigo-950/40 border border-emerald-500/20 rounded-3xl p-6 sm:p-8">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <ShieldCheck size={14} />
              <span>Operations & Compliance Management</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Driver Verification Command Center
            </h1>
            <p className="text-zinc-400 text-xs sm:text-sm max-w-xl">
              Inspect uploaded driver licenses, PrDP permits, and roadworthy certificates. Manually verify and clear commercial drivers for 100% fare duty in South Africa.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-3 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white rounded-2xl transition"
              title="Refresh Queue"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
            <Link
              href="/admin/compliance"
              className="py-3 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm rounded-2xl flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition active:scale-98"
            >
              <FileCheck2 size={16} />
              <span>Open KYC Approval Center</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending Review Card */}
        <Link
          href="/admin/compliance?status=pending_review"
          className="bg-zinc-900/80 border border-amber-500/30 hover:border-amber-400/60 rounded-2xl p-5 transition group hover:shadow-xl hover:shadow-amber-500/5 relative overflow-hidden"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-zinc-400">Pending Review</span>
            <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400">
              <Clock size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{metrics.pendingReviewCount}</span>
            <span className="text-[11px] font-medium text-amber-400">Requires Action</span>
          </div>
          <div className="mt-3 text-[11px] text-zinc-500 group-hover:text-amber-300 flex items-center gap-1 transition">
            <span>Review pending queue</span>
            <ChevronRight size={12} />
          </div>
        </Link>

        {/* Verified Drivers Card */}
        <Link
          href="/admin/compliance?status=verified"
          className="bg-zinc-900/80 border border-emerald-500/30 hover:border-emerald-400/60 rounded-2xl p-5 transition group hover:shadow-xl hover:shadow-emerald-500/5 relative overflow-hidden"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-zinc-400">Active Verified</span>
            <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{metrics.verifiedCount}</span>
            <span className="text-[11px] font-medium text-emerald-400">Cleared for Duty</span>
          </div>
          <div className="mt-3 text-[11px] text-zinc-500 group-hover:text-emerald-300 flex items-center gap-1 transition">
            <span>View active fleet</span>
            <ChevronRight size={12} />
          </div>
        </Link>

        {/* Rejected Submissions Card */}
        <Link
          href="/admin/compliance?status=rejected"
          className="bg-zinc-900/80 border border-rose-500/30 hover:border-rose-400/60 rounded-2xl p-5 transition group hover:shadow-xl hover:shadow-rose-500/5 relative overflow-hidden"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-zinc-400">Rejected / Re-upload</span>
            <div className="p-2 bg-rose-500/10 rounded-xl text-rose-400">
              <XCircle size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{metrics.rejectedCount}</span>
            <span className="text-[11px] font-medium text-rose-400">Issues Flagged</span>
          </div>
          <div className="mt-3 text-[11px] text-zinc-500 group-hover:text-rose-300 flex items-center gap-1 transition">
            <span>Inspect rejections</span>
            <ChevronRight size={12} />
          </div>
        </Link>

        {/* Total Drivers Registered */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-zinc-400">Total Registered</span>
            <div className="p-2 bg-zinc-800 rounded-xl text-zinc-400">
              <Car size={18} />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{metrics.totalDrivers}</span>
            <span className="text-[11px] font-medium text-zinc-400">Drivers in DB</span>
          </div>
          <p className="mt-3 text-[11px] text-zinc-500">
            {metrics.incompleteCount} incomplete onboarding
          </p>
        </div>
      </div>

      {/* Driver Queue Table Section */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-5 sm:p-6 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Driver Registration & Verification Queue</span>
              <span className="text-xs font-mono font-normal bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                {filteredDrivers.length} drivers
              </span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Click on any driver to inspect uploaded documents and issue approvals.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Search name, phone, plate..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
            <Search size={14} className="absolute left-3 top-2.5 text-zinc-500" />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/60 text-zinc-400 border-b border-zinc-800 font-semibold">
              <tr>
                <th className="py-3.5 px-6">Driver Profile</th>
                <th className="py-3.5 px-4">Vehicle Details</th>
                <th className="py-3.5 px-4">Compliance Status</th>
                <th className="py-3.5 px-4">Document Progress</th>
                <th className="py-3.5 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {filteredDrivers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-500">
                    {loading ? "Loading registered drivers..." : "No drivers found matching your search."}
                  </td>
                </tr>
              ) : (
                filteredDrivers.map((driver) => (
                  <tr key={driver.id} className="hover:bg-zinc-800/30 transition">
                    <td className="py-4 px-6">
                      <div className="font-bold text-white text-sm">{driver.fullName}</div>
                      <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                        {driver.phone || driver.email}
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      <div className="font-medium text-zinc-200">
                        {driver.vehicleMake} {driver.vehicleModel}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-400">
                        {driver.licensePlate || "No plate"} • {driver.prdpNumber || "No PrDP"}
                      </div>
                    </td>

                    <td className="py-4 px-4">
                      {driver.complianceStatus === "verified" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 size={12} />
                          <span>Verified</span>
                        </span>
                      ) : driver.complianceStatus === "pending_review" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                          <Clock size={12} />
                          <span>Pending Review ({driver.pendingCount})</span>
                        </span>
                      ) : driver.complianceStatus === "rejected" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <XCircle size={12} />
                          <span>Rejected</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                          <AlertTriangle size={12} />
                          <span>Incomplete</span>
                        </span>
                      )}
                    </td>

                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-zinc-800 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              driver.complianceStatus === "verified"
                                ? "bg-emerald-500"
                                : driver.complianceStatus === "rejected"
                                ? "bg-rose-500"
                                : "bg-amber-500"
                            }`}
                            style={{
                              width: `${
                                driver.totalDocs > 0
                                  ? Math.round((driver.approvedCount / Math.max(driver.totalDocs, 4)) * 100)
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-zinc-400">
                          {driver.approvedCount}/{Math.max(driver.totalDocs, 4)}
                        </span>
                      </div>
                    </td>

                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/compliance?search=${encodeURIComponent(driver.fullName)}`}
                          className="py-1.5 px-3 bg-zinc-800 hover:bg-emerald-600 hover:text-white text-zinc-200 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border border-zinc-700 hover:border-emerald-500 transition"
                        >
                          <span>Inspect & Approve</span>
                          <ChevronRight size={13} />
                        </Link>
                        {!(driver.subscriptionPlan === "owner" || isPlatformOwner(driver.email)) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteDriver(driver)}
                            className="p-1.5 bg-rose-950/40 hover:bg-rose-900 border border-rose-800/60 hover:border-rose-600 text-rose-300 rounded-xl transition"
                            title="Delete Bogus Registration"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
