"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Car,
  Users,
  ShieldCheck,
  CreditCard,
  Building2,
  FileText,
  AlertTriangle,
  Clock,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  PauseCircle,
  PlayCircle,
  UserPlus,
  DollarSign,
  TrendingUp,
  Download,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Smartphone,
  ShieldAlert,
  ArrowUpRight,
  Filter,
  LogOut,
  ArrowRight,
  Check,
  Lock,
} from "lucide-react";
import {
  FleetProfile,
  FleetVehicle,
  FleetShiftAudit,
  ShiftType,
  SpeedpointDeviceType,
  FleetSettlementBank,
} from "@/types/fleet";
import {
  calculateFleetMonthlyBilling,
  checkComplianceExpiry,
  seedDefaultFleetIfNeeded,
  getAllFleetProfiles,
  getFleetProfile,
  getActiveFleetProfile,
  setActiveFleetSession,
  clearActiveFleetSession,
  registerFleetProfile,
  loginFleetProfile,
  getFleetVehicles,
  saveFleetVehicle,
  deleteFleetVehicle,
  assignDriverToVehicle,
  unassignDriverFromVehicle,
  toggleVehicleDispatchSuspension,
  getFleetShiftAudits,
  recordFleetShiftAudit,
} from "@/utils/fleetStore";

export default function FleetPage() {
  const [activeTab, setActiveTab] = useState<"vehicles" | "audits" | "compliance" | "billing">("vehicles");
  const [fleetProfile, setFleetProfile] = useState<FleetProfile | null>(null);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [audits, setAudits] = useState<FleetShiftAudit[]>([]);
  const [loading, setLoading] = useState(true);

  // Auth / Registration Mode state (when not logged in)
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  // Registration Form states
  const [regCompanyName, setRegCompanyName] = useState("");
  const [regContactPerson, setRegContactPerson] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regCity, setRegCity] = useState("Johannesburg");
  const [regCipro, setRegCipro] = useState("");
  const [regVat, setRegVat] = useState("");
  const [regBankName, setRegBankName] = useState("First National Bank (FNB)");
  const [regAccountHolder, setRegAccountHolder] = useState("");
  const [regAccountNumber, setRegAccountNumber] = useState("");
  const [regBranchCode, setRegBranchCode] = useState("250655");
  const [regEstimatedVehicles, setRegEstimatedVehicles] = useState(5);
  const [regSubmitting, setRegSubmitting] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  // Search & Filter (Dashboard)
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modals (Dashboard)
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [isAssignDriverOpen, setIsAssignDriverOpen] = useState(false);
  const [isRecordAuditOpen, setIsRecordAuditOpen] = useState(false);
  const [selectedVehicleForDriver, setSelectedVehicleForDriver] = useState<FleetVehicle | null>(null);

  // Form states for Add Vehicle
  const [newVehMake, setNewVehMake] = useState("Toyota");
  const [newVehModel, setNewVehModel] = useState("Corolla Quest 1.8");
  const [newVehYear, setNewVehYear] = useState(2023);
  const [newVehColor, setNewVehColor] = useState("White");
  const [newVehPlate, setNewVehPlate] = useState("");
  const [newVehVin, setNewVehVin] = useState("");
  const [newVehSpeedpoint, setNewVehSpeedpoint] = useState<SpeedpointDeviceType>("yoco");
  const [newVehTerminalId, setNewVehTerminalId] = useState("");
  const [newVehCoFExpiry, setNewVehCoFExpiry] = useState("");
  const [newVehDiscExpiry, setNewVehDiscExpiry] = useState("");

  // Form states for Assign Driver
  const [assignDriverName, setAssignDriverName] = useState("");
  const [assignDriverPhone, setAssignDriverPhone] = useState("");
  const [assignShiftType, setAssignShiftType] = useState<ShiftType>("full_time");
  const [assignWeeklyRent, setAssignWeeklyRent] = useState(2400);

  // Form states for Shift Audit
  const [auditVehId, setAuditVehId] = useState("");
  const [auditDriverName, setAuditDriverName] = useState("");
  const [auditGrossZar, setAuditGrossZar] = useState(1500);
  const [auditCashZar, setAuditCashZar] = useState(500);
  const [auditSpeedpointZar, setAuditSpeedpointZar] = useState(1000);
  const [auditTrips, setAuditTrips] = useState(12);
  const [auditDistance, setAuditDistance] = useState(130);
  const [auditHours, setAuditHours] = useState(9);

  // Load Active Fleet Session
  const loadActiveFleet = () => {
    try {
      const active = getActiveFleetProfile();
      if (active) {
        setFleetProfile(active);
        const vehList = getFleetVehicles(active.id);
        const auditList = getFleetShiftAudits(active.id);
        setVehicles(vehList);
        setAudits(auditList);
      } else {
        setFleetProfile(null);
        setVehicles([]);
        setAudits([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActiveFleet();
  }, []);

  // Registration Handler
  const handleRegisterFleet = (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);

    if (!regCompanyName.trim() || !regContactPerson.trim() || !regEmail.trim() || !regPhone.trim()) {
      setRegError("Please complete company name, contact person, email, and mobile number.");
      return;
    }

    setRegSubmitting(true);
    try {
      const settlementBank: FleetSettlementBank | undefined = regAccountNumber.trim()
        ? {
            bankName: regBankName,
            accountHolder: regAccountHolder.trim() || regCompanyName.trim(),
            accountNumber: regAccountNumber.trim(),
            branchCode: regBranchCode.trim(),
            accountType: "current",
          }
        : undefined;

      const registered = registerFleetProfile({
        companyName: regCompanyName.trim(),
        contactPerson: regContactPerson.trim(),
        ownerEmail: regEmail.trim(),
        ownerPhone: regPhone.trim(),
        operatingCity: regCity,
        registrationNumber: regCipro.trim() || undefined,
        vatNumber: regVat.trim() || undefined,
        settlementBank,
        estimatedVehicles: Number(regEstimatedVehicles) || 1,
      });

      setFleetProfile(registered);
      setVehicles([]);
      setAudits([]);
      setActiveTab("vehicles");
    } catch (err: any) {
      setRegError(err?.message || "Failed to register fleet. Please check details.");
    } finally {
      setRegSubmitting(false);
    }
  };

  // Login Handler
  const handleLoginFleet = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    if (!loginIdentifier.trim()) {
      setLoginError("Please enter your registered company email or phone number.");
      return;
    }

    const matched = loginFleetProfile(loginIdentifier.trim());
    if (matched) {
      setFleetProfile(matched);
      const vehList = getFleetVehicles(matched.id);
      const auditList = getFleetShiftAudits(matched.id);
      setVehicles(vehList);
      setAudits(auditList);
      setActiveTab("vehicles");
    } else {
      setLoginError("No fleet found matching those credentials. Please check or register a new fleet.");
    }
  };

  // Sign out / Switch Fleet
  const handleSignOutFleet = () => {
    clearActiveFleetSession();
    setFleetProfile(null);
    setVehicles([]);
    setAudits([]);
    setLoginIdentifier("");
    setLoginError(null);
  };

  // Launch Demo Fleet
  const handleLaunchDemoFleet = () => {
    const demo = seedDefaultFleetIfNeeded();
    setActiveFleetSession(demo.id);
    loadActiveFleet();
  };

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const matchSearch =
        v.licensePlate.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.make.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.assignedDriverName && v.assignedDriverName.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchSearch) return false;
      if (statusFilter === "all") return true;
      if (statusFilter === "online") return v.currentStatus === "online" || v.currentStatus === "on_trip";
      if (statusFilter === "idle") return v.currentStatus === "idle";
      if (statusFilter === "suspended") return v.dispatchSuspended;
      if (statusFilter === "unassigned") return !v.assignedDriverId;
      return true;
    });
  }, [vehicles, searchQuery, statusFilter]);

  // Billing calculation for current fleet size (Option C: R770 Base + R499/veh)
  const billing = useMemo(() => {
    return calculateFleetMonthlyBilling(vehicles.length || 0);
  }, [vehicles.length]);

  // Prospective billing preview during registration
  const registrationBillingPreview = useMemo(() => {
    return calculateFleetMonthlyBilling(Number(regEstimatedVehicles) || 1);
  }, [regEstimatedVehicles]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalVehicles = vehicles.length;
    const activeOnRoad = vehicles.filter((v) => v.currentStatus === "online" || v.currentStatus === "on_trip").length;
    const todayAudits = audits.slice(0, 10);
    const todayGross = todayAudits.reduce((acc, a) => acc + (a.totalGrossZar || 0), 0);
    const todayCash = todayAudits.reduce((acc, a) => acc + (a.cashCollectedZar || 0), 0);
    const todayCard = todayAudits.reduce((acc, a) => acc + (a.speedpointCollectedZar || 0), 0);

    let warningCount = 0;
    vehicles.forEach((v) => {
      const cof = checkComplianceExpiry(v.roadworthyExpiry);
      const disc = checkComplianceExpiry(v.licenseDiscExpiry);
      if (cof.status === "expired" || cof.status === "expiring_soon") warningCount++;
      if (disc.status === "expired" || disc.status === "expiring_soon") warningCount++;
    });

    return { totalVehicles, activeOnRoad, todayGross, todayCash, todayCard, warningCount };
  }, [vehicles, audits]);

  // Handlers for Add Vehicle / Pair Driver / Audit
  const handleAddVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fleetProfile || !newVehPlate.trim()) return;

    const newVehicle: FleetVehicle = {
      id: `veh-${Date.now()}`,
      fleetId: fleetProfile.id,
      make: newVehMake.trim(),
      model: newVehModel.trim(),
      year: Number(newVehYear) || 2023,
      color: newVehColor.trim(),
      licensePlate: newVehPlate.trim().toUpperCase(),
      vin: newVehVin.trim().toUpperCase() || undefined,
      roadworthyExpiry: newVehCoFExpiry || undefined,
      licenseDiscExpiry: newVehDiscExpiry || undefined,
      speedpointType: newVehSpeedpoint,
      speedpointTerminalId: newVehTerminalId.trim() || undefined,
      currentStatus: "idle",
      dispatchSuspended: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveFleetVehicle(newVehicle);
    setNewVehPlate("");
    setNewVehVin("");
    setNewVehTerminalId("");
    setIsAddVehicleOpen(false);
    loadActiveFleet();
  };

  const handleOpenAssignModal = (vehicle: FleetVehicle) => {
    setSelectedVehicleForDriver(vehicle);
    setAssignDriverName(vehicle.assignedDriverName || "");
    setAssignDriverPhone(vehicle.assignedDriverPhone || "");
    setAssignShiftType(vehicle.shiftType || "full_time");
    setAssignWeeklyRent(vehicle.rentalRateWeeklyZar || 2400);
    setIsAssignDriverOpen(true);
  };

  const handleAssignDriver = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fleetProfile || !selectedVehicleForDriver || !assignDriverName.trim()) return;

    assignDriverToVehicle(fleetProfile.id, selectedVehicleForDriver.id, {
      id: `driver-${Date.now()}`,
      name: assignDriverName.trim(),
      phone: assignDriverPhone.trim(),
      shiftType: assignShiftType,
      rentalRateWeeklyZar: Number(assignWeeklyRent) || 2400,
    });

    setIsAssignDriverOpen(false);
    setSelectedVehicleForDriver(null);
    loadActiveFleet();
  };

  const handleUnassignDriver = (vehicle: FleetVehicle) => {
    if (!fleetProfile) return;
    if (confirm(`Unassign driver ${vehicle.assignedDriverName} from ${vehicle.licensePlate}?`)) {
      unassignDriverFromVehicle(fleetProfile.id, vehicle.id);
      loadActiveFleet();
    }
  };

  const handleToggleSuspension = (vehicle: FleetVehicle) => {
    if (!fleetProfile) return;
    const nextState = !vehicle.dispatchSuspended;
    const reason = nextState
      ? prompt("Reason for dispatch hold (e.g. Weekly rental arrears, maintenance):", "Weekly rental payment pending")
      : undefined;

    if (nextState && reason === null) return;

    toggleVehicleDispatchSuspension(fleetProfile.id, vehicle.id, nextState, reason || undefined);
    loadActiveFleet();
  };

  const handleDeleteVehicle = (vehicle: FleetVehicle) => {
    if (!fleetProfile) return;
    if (confirm(`Remove vehicle ${vehicle.licensePlate} (${vehicle.make} ${vehicle.model}) from fleet?`)) {
      deleteFleetVehicle(fleetProfile.id, vehicle.id);
      loadActiveFleet();
    }
  };

  const handleRecordAudit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fleetProfile) return;

    const matchedVeh = vehicles.find((v) => v.id === auditVehId) || vehicles[0];
    if (!matchedVeh) return;

    const newAudit: FleetShiftAudit = {
      id: `audit-${Date.now()}`,
      fleetId: fleetProfile.id,
      vehicleId: matchedVeh.id,
      licensePlate: matchedVeh.licensePlate,
      driverId: matchedVeh.assignedDriverId || "driver-custom",
      driverName: auditDriverName || matchedVeh.assignedDriverName || "Assigned Driver",
      shiftDate: new Date().toISOString().slice(0, 10),
      tripsCompleted: Number(auditTrips),
      totalGrossZar: Number(auditGrossZar),
      cashCollectedZar: Number(auditCashZar),
      speedpointCollectedZar: Number(auditSpeedpointZar),
      distanceKm: Number(auditDistance),
      shiftHours: Number(auditHours),
      rentalTargetZar: Math.round((matchedVeh.rentalRateWeeklyZar || 2400) / 5),
      settlementStatus: "settled",
      createdAt: new Date().toISOString(),
    };

    recordFleetShiftAudit(newAudit);
    setIsRecordAuditOpen(false);
    loadActiveFleet();
  };

  const exportShiftSheetCsv = () => {
    const headers = [
      "Date",
      "Vehicle Plate",
      "Driver",
      "Trips",
      "Gross Fare (ZAR)",
      "Cash Collected (ZAR)",
      "Speedpoint (ZAR)",
      "Distance (km)",
      "Shift Hours",
      "Settlement Status",
    ];
    const rows = audits.map((a) => [
      a.shiftDate,
      a.licensePlate,
      `"${a.driverName}"`,
      a.tripsCompleted,
      a.totalGrossZar,
      a.cashCollectedZar,
      a.speedpointCollectedZar,
      a.distanceKm,
      a.shiftHours,
      a.settlementStatus,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SOLO_Fleet_Shift_Audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-mono text-gray-500 dark:text-zinc-400">Loading SOLO Fleet Hub...</p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 1: FLEET REGISTRATION & SIGN IN (When no active fleet session)
  // =========================================================================
  if (!fleetProfile) {
    return (
      <div className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero Header */}
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-purple-500/10 text-purple-600 dark:text-purple-400 px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-purple-500/20">
            <Building2 size={13} />
            B2B Enterprise Fleet Partner Hub
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            Register Your Fleet on SOLO
          </h1>
          <p className="text-sm md:text-base text-gray-600 dark:text-zinc-400">
            Eliminate 25% aggregator commission cuts. Keep 100% of rider fares directly in-vehicle with predictable flat SaaS pricing: <strong>R770/mo Base License + R499/vehicle/mo</strong>.
          </p>
        </div>

        {/* Value Proposition Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-5 space-y-2 shadow-2xs">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
              <DollarSign size={18} />
            </div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">100% In-Vehicle Settlement</h3>
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              Install your own Yoco or iKhokha speedpoint in each car. Card fares land directly in your corporate bank account with zero platform escrow holding.
            </p>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-5 space-y-2 shadow-2xs">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center font-bold">
              <Users size={18} />
            </div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Multi-Driver Shift Pairing</h3>
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              Double-shift your vehicles between day and night drivers. Assigned drivers automatically bypass individual Paystack paywalls.
            </p>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-5 space-y-2 shadow-2xs">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
              <FileText size={18} />
            </div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Shift Cash Audit Sheets</h3>
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              Immutable daily run logs tracking gross fares, cash collected vs card swipes, and rental collection with 1-click CSV export.
            </p>
          </div>
        </div>

        {/* Registration / Sign In Card */}
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl max-w-2xl mx-auto space-y-6">
          {/* Mode Switcher */}
          <div className="flex border-b border-gray-100 dark:border-zinc-800 pb-3 gap-3">
            <button
              onClick={() => { setAuthMode("register"); setLoginError(null); }}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs md:text-sm transition flex items-center justify-center gap-2 ${
                authMode === "register"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                  : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-200"
              }`}
            >
              <Building2 size={16} /> Register New Fleet
            </button>
            <button
              onClick={() => { setAuthMode("login"); setRegError(null); }}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs md:text-sm transition flex items-center justify-center gap-2 ${
                authMode === "login"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                  : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-200"
              }`}
            >
              <Lock size={16} /> Fleet Manager Sign In
            </button>
          </div>

          {/* Form: Register New Fleet */}
          {authMode === "register" && (
            <form onSubmit={handleRegisterFleet} className="space-y-4 text-xs">
              {regError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-xs font-semibold">
                  {regError}
                </div>
              )}

              <div className="space-y-3">
                <h4 className="font-extrabold text-sm text-gray-900 dark:text-white">1. Company & Contact Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Company / Entity Name *</label>
                    <input
                      type="text"
                      required
                      value={regCompanyName}
                      onChange={(e) => setRegCompanyName(e.target.value)}
                      placeholder="e.g. Mzansi Fleet Partners (Pty) Ltd"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Contact Person (Manager) *</label>
                    <input
                      type="text"
                      required
                      value={regContactPerson}
                      onChange={(e) => setRegContactPerson(e.target.value)}
                      placeholder="e.g. Kagiso Molefe"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Company Email *</label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="fleet@company.co.za"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Mobile / WhatsApp *</label>
                    <input
                      type="tel"
                      required
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="+27 82 123 4567"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Operating City</label>
                    <select
                      value={regCity}
                      onChange={(e) => setRegCity(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                    >
                      <option value="Johannesburg">Johannesburg / Gauteng</option>
                      <option value="Pretoria">Pretoria / Tshwane</option>
                      <option value="Cape Town">Cape Town / Western Cape</option>
                      <option value="Durban">Durban / eThekwini</option>
                      <option value="Gqeberha">Gqeberha / Port Elizabeth</option>
                      <option value="Bloemfontein">Bloemfontein / Mangaung</option>
                      <option value="Kimberley">Kimberley / Northern Cape</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">CIPRO / CIPC Registration No. (Optional)</label>
                    <input
                      type="text"
                      value={regCipro}
                      onChange={(e) => setRegCipro(e.target.value)}
                      placeholder="2023/123456/07"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">SARS VAT Number (Optional for Tax Invoice)</label>
                    <input
                      type="text"
                      value={regVat}
                      onChange={(e) => setRegVat(e.target.value)}
                      placeholder="4991238910"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Settlement Bank Details */}
              <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
                <h4 className="font-extrabold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                  <CreditCard size={15} className="text-emerald-500" />
                  2. Speedpoint Settlement Banking (For Digital Card Fares)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Settlement Bank</label>
                    <select
                      value={regBankName}
                      onChange={(e) => setRegBankName(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                    >
                      <option value="First National Bank (FNB)">First National Bank (FNB)</option>
                      <option value="Standard Bank">Standard Bank</option>
                      <option value="Capitec Bank">Capitec Bank</option>
                      <option value="Nedbank">Nedbank</option>
                      <option value="ABSA Bank">ABSA Bank</option>
                      <option value="Investec Bank">Investec Bank</option>
                      <option value="TymeBank">TymeBank</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Account Holder Name</label>
                    <input
                      type="text"
                      value={regAccountHolder}
                      onChange={(e) => setRegAccountHolder(e.target.value)}
                      placeholder="Matching company bank account"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Account Number</label>
                    <input
                      type="text"
                      value={regAccountNumber}
                      onChange={(e) => setRegAccountNumber(e.target.value)}
                      placeholder="62849102948"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Universal Branch Code</label>
                    <input
                      type="text"
                      value={regBranchCode}
                      onChange={(e) => setRegBranchCode(e.target.value)}
                      placeholder="250655"
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Estimated Fleet Size & Pricing Calculator */}
              <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-sm text-gray-900 dark:text-white">3. Fleet Size & Monthly SaaS Calculator</h4>
                  <span className="font-bold text-purple-600 dark:text-purple-400">
                    {regEstimatedVehicles} Vehicles
                  </span>
                </div>

                <input
                  type="range"
                  min="1"
                  max="30"
                  value={regEstimatedVehicles}
                  onChange={(e) => setRegEstimatedVehicles(Number(e.target.value))}
                  className="w-full accent-purple-600 cursor-pointer"
                />

                <div className="p-3.5 bg-purple-50 dark:bg-purple-950/40 rounded-2xl border border-purple-200/60 dark:border-purple-800/40 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-zinc-400">Base Operations Hub License:</span>
                    <strong className="text-gray-900 dark:text-white">R770 / month</strong>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-zinc-400">Vehicle Dispatch Slots ({regEstimatedVehicles} × R499):</span>
                    <strong className="text-gray-900 dark:text-white">R{registrationBillingPreview.vehiclesSubtotalZar.toLocaleString()} / month</strong>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-purple-200/60 dark:border-purple-800/40 font-bold">
                    <span className="text-purple-900 dark:text-purple-200">Total Monthly Investment (ex. VAT):</span>
                    <span className="text-sm font-black text-purple-700 dark:text-purple-300">
                      R{registrationBillingPreview.subtotalZar.toLocaleString()} / mo
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1 pt-0.5">
                    <CheckCircle2 size={12} />
                    Saves approx. +R{registrationBillingPreview.savingsVsUberBoltZar.toLocaleString()}/mo vs 25% Uber/Bolt take-rate!
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={regSubmitting}
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-2xl shadow-lg shadow-purple-600/25 active:scale-95 transition-all text-sm flex items-center justify-center gap-2"
              >
                {regSubmitting ? (
                  <span>Registering Fleet Partner...</span>
                ) : (
                  <>
                    <span>Register Fleet &amp; Launch Dashboard</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Form: Sign In to Existing Fleet */}
          {authMode === "login" && (
            <form onSubmit={handleLoginFleet} className="space-y-4 text-xs">
              {loginError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-xs font-semibold">
                  {loginError}
                </div>
              )}

              <div>
                <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">
                  Registered Company Email, Mobile, or Name
                </label>
                <input
                  type="text"
                  required
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="e.g. fleet@apexlogistics.co.za or +27 82 555 0199"
                  className="w-full px-3 py-2.5 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl text-xs md:text-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-2xl shadow-lg shadow-purple-600/25 active:scale-95 transition-all text-sm flex items-center justify-center gap-2"
              >
                <span>Access Fleet Dashboard</span>
                <ArrowRight size={16} />
              </button>
            </form>
          )}

          {/* Developer / Demo Quick Link */}
          <div className="pt-4 border-t border-gray-100 dark:border-zinc-800 text-center">
            <button
              onClick={handleLaunchDemoFleet}
              className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline inline-flex items-center gap-1.5"
            >
              <Sparkles size={13} />
              <span>Explore Demo Fleet (Apex Logistics Cape Town)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: FULL FLEET DASHBOARD (When active fleet session is loaded)
  // =========================================================================
  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Banner / Corporate Identity */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-5 md:p-7 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 bg-purple-500/10 text-purple-600 dark:text-purple-400 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase border border-purple-500/20">
                <Building2 size={13} />
                B2B Fleet Partner Hub
              </span>
              <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-3 py-1 rounded-full text-xs font-semibold border border-blue-500/20">
                {billing.tierLabel}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              {fleetProfile.companyName}
            </h1>
            <p className="text-xs md:text-sm text-gray-500 dark:text-zinc-400 flex flex-wrap items-center gap-2">
              <span>Manager: <strong className="text-gray-700 dark:text-zinc-200">{fleetProfile.contactPerson}</strong></span>
              <span>•</span>
              <span>City: <strong className="text-gray-700 dark:text-zinc-200">{fleetProfile.operatingCity}</strong></span>
              <span>•</span>
              <span>Direct Settlement: <strong className="text-emerald-600 dark:text-emerald-400">100% In-Vehicle Retention</strong></span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsAddVehicleOpen(true)}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs md:text-sm shadow-md transition"
            >
              <Plus size={16} />
              <span>Add Vehicle</span>
            </button>
            {vehicles.length > 0 && (
              <button
                onClick={() => setIsRecordAuditOpen(true)}
                className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-4 py-2.5 rounded-xl text-xs md:text-sm border border-zinc-700 transition"
              >
                <DollarSign size={16} />
                <span>Record Shift Audit</span>
              </button>
            )}
            <button
              onClick={handleSignOutFleet}
              title="Sign out or switch fleet account"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold text-gray-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 border border-gray-200 dark:border-zinc-800 hover:border-red-300 transition"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Switch Fleet</span>
            </button>
          </div>
        </div>

        {/* Aggregate KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mt-6 pt-6 border-t border-gray-100 dark:border-zinc-800/80">
          <div className="bg-gray-50 dark:bg-zinc-950/60 p-4 rounded-2xl border border-gray-100 dark:border-zinc-800/50">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider block">
              Fleet on Road
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-gray-900 dark:text-white">
                {metrics.activeOnRoad}
              </span>
              <span className="text-xs text-gray-500 dark:text-zinc-400">
                / {metrics.totalVehicles} Vehicles
              </span>
            </div>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1 inline-flex items-center gap-1">
              <CheckCircle2 size={11} /> {metrics.totalVehicles > 0 ? Math.round((metrics.activeOnRoad / metrics.totalVehicles) * 100) : 0}% utilization
            </span>
          </div>

          <div className="bg-gray-50 dark:bg-zinc-950/60 p-4 rounded-2xl border border-gray-100 dark:border-zinc-800/50">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider block">
              Today's Gross Bookings
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-gray-900 dark:text-white">
                R{metrics.todayGross.toLocaleString()}
              </span>
            </div>
            <span className="text-[11px] text-gray-500 dark:text-zinc-400 mt-1 block">
              Cash: R{metrics.todayCash} | Card: R{metrics.todayCard}
            </span>
          </div>

          <div className="bg-gray-50 dark:bg-zinc-950/60 p-4 rounded-2xl border border-gray-100 dark:border-zinc-800/50">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider block">
              Estimated Monthly Savings
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                +R{billing.savingsVsUberBoltZar.toLocaleString()}
              </span>
            </div>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400/80 mt-1 block">
              vs Uber/Bolt 25% take-rate
            </span>
          </div>

          <div className="bg-gray-50 dark:bg-zinc-950/60 p-4 rounded-2xl border border-gray-100 dark:border-zinc-800/50">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider block">
              Compliance Alerts
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-2xl font-black ${metrics.warningCount > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                {metrics.warningCount}
              </span>
              <span className="text-xs text-gray-500 dark:text-zinc-400">Items Pending</span>
            </div>
            <span className="text-[11px] text-gray-500 dark:text-zinc-400 mt-1 block">
              CoF, License Discs, PrDPs
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 dark:border-zinc-800 gap-2 overflow-x-auto pb-1">
        {[
          { id: "vehicles", label: "Fleet Vehicles & Shift Roster", icon: Car, count: vehicles.length },
          { id: "audits", label: "Shift & Cash Reconciliation", icon: FileText, count: audits.length },
          { id: "compliance", label: "Compliance & Expiry Watchdog", icon: ShieldCheck, alert: metrics.warningCount > 0 },
          { id: "billing", label: "Fleet Subscription & SARS Tax", icon: CreditCard },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-3 px-4 font-bold text-xs md:text-sm border-b-2 transition whitespace-nowrap ${
                isActive
                  ? "border-purple-500 text-purple-600 dark:text-purple-400"
                  : "border-transparent text-gray-500 hover:text-gray-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-[11px] ${
                  isActive ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400"
                }`}>
                  {tab.count}
                </span>
              )}
              {tab.alert && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              )}
            </button>
          );
        })}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* TAB 1: FLEET VEHICLES & ROSTER */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === "vehicles" && (
        <div className="space-y-4">
          {/* Welcome Banner for newly registered fleets with 0 vehicles */}
          {vehicles.length === 0 && (
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-zinc-900/40 border border-purple-200/80 dark:border-purple-800/40 rounded-3xl p-6 md:p-8 text-center space-y-4">
              <Car className="mx-auto text-purple-600 dark:text-purple-400" size={40} />
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-lg font-extrabold text-gray-900 dark:text-white">
                  Welcome, {fleetProfile.companyName}!
                </h3>
                <p className="text-xs text-gray-600 dark:text-zinc-400">
                  Your fleet account is active under the R770 Base Hub license. Add your vehicles and pair your drivers to unlock unrestricted dispatch clearance.
                </p>
              </div>
              <button
                onClick={() => setIsAddVehicleOpen(true)}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs md:text-sm shadow-md transition"
              >
                <Plus size={16} /> Add Your First Vehicle
              </button>
            </div>
          )}

          {vehicles.length > 0 && (
            <>
              {/* Search & Filter Toolbar */}
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3.5 top-3 text-gray-400 dark:text-zinc-500" size={16} />
                  <input
                    type="text"
                    placeholder="Search plate, model, or driver..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-xs md:text-sm focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div className="flex items-center gap-2 overflow-x-auto">
                  <span className="text-xs font-medium text-gray-500 dark:text-zinc-400 flex items-center gap-1">
                    <Filter size={13} /> Filter:
                  </span>
                  {[
                    { id: "all", label: "All" },
                    { id: "online", label: "On Road" },
                    { id: "idle", label: "Idle" },
                    { id: "unassigned", label: "No Driver" },
                    { id: "suspended", label: "On Hold" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setStatusFilter(f.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                        statusFilter === f.id
                          ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                          : "bg-white dark:bg-zinc-900 text-gray-600 dark:text-zinc-400 border border-gray-200 dark:border-zinc-800 hover:bg-gray-50"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vehicle Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredVehicles.map((vehicle) => {
                  const cofExpiry = checkComplianceExpiry(vehicle.roadworthyExpiry);
                  const discExpiry = checkComplianceExpiry(vehicle.licenseDiscExpiry);

                  return (
                    <div
                      key={vehicle.id}
                      className={`bg-white dark:bg-zinc-900 border rounded-2xl p-5 shadow-2xs space-y-4 transition ${
                        vehicle.dispatchSuspended
                          ? "border-red-300 dark:border-red-900/60 bg-red-50/10"
                          : "border-gray-200 dark:border-zinc-800 hover:border-purple-500/50"
                      }`}
                    >
                      {/* Top Bar: Plate + Status */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-black tracking-tight text-gray-900 dark:text-white font-mono bg-gray-100 dark:bg-zinc-800 px-2.5 py-0.5 rounded-lg border border-gray-200 dark:border-zinc-700">
                              {vehicle.licensePlate}
                            </span>
                            {vehicle.dispatchSuspended && (
                              <span className="bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-red-500/20">
                                DISPATCH HELD
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-gray-700 dark:text-zinc-300 mt-1">
                            {vehicle.year} {vehicle.make} {vehicle.model}
                          </p>
                          <p className="text-[11px] text-gray-400 dark:text-zinc-500">Color: {vehicle.color}</p>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            vehicle.currentStatus === "on_trip"
                              ? "bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30"
                              : vehicle.currentStatus === "online"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              : vehicle.currentStatus === "suspended" || vehicle.dispatchSuspended
                              ? "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30"
                              : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700"
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${
                            vehicle.currentStatus === "on_trip" || vehicle.currentStatus === "online"
                              ? "bg-emerald-500 animate-pulse"
                              : vehicle.dispatchSuspended
                              ? "bg-red-500"
                              : "bg-gray-400"
                          }`} />
                          {vehicle.dispatchSuspended ? "On Hold" : vehicle.currentStatus.toUpperCase()}
                        </span>
                      </div>

                      {/* Driver Pairing Info */}
                      <div className="bg-gray-50 dark:bg-zinc-950/70 p-3.5 rounded-xl border border-gray-100 dark:border-zinc-800/80 space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-zinc-500 block">
                          Assigned Driver &amp; Shift
                        </span>
                        {vehicle.assignedDriverName ? (
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                <Users size={13} className="text-purple-500" />
                                {vehicle.assignedDriverName}
                              </p>
                              <p className="text-[11px] text-gray-500 dark:text-zinc-400">
                                {vehicle.assignedDriverPhone || "No phone"} • {vehicle.shiftType?.replace("_", " ")}
                              </p>
                              <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                Rent: R{vehicle.rentalRateWeeklyZar || 2400}/week
                              </p>
                            </div>
                            <button
                              onClick={() => handleUnassignDriver(vehicle)}
                              title="Unassign driver from vehicle"
                              className="text-[11px] text-red-500 hover:text-red-700 dark:hover:text-red-400 font-semibold underline px-1"
                            >
                              Release
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between py-1">
                            <span className="text-xs text-gray-400 dark:text-zinc-500 italic">No driver assigned</span>
                            <button
                              onClick={() => handleOpenAssignModal(vehicle)}
                              className="text-xs text-purple-600 dark:text-purple-400 font-bold hover:underline inline-flex items-center gap-1"
                            >
                              <UserPlus size={12} /> Assign Driver
                            </button>
                          </div>
                        )}
                      </div>

                      {/* In-Vehicle Speedpoint & Compliance */}
                      <div className="text-[11px] space-y-1 text-gray-500 dark:text-zinc-400">
                        <div className="flex items-center justify-between">
                          <span>Card Machine:</span>
                          <strong className="text-gray-800 dark:text-zinc-200 capitalize">
                            {vehicle.speedpointType} {vehicle.speedpointTerminalId ? `(${vehicle.speedpointTerminalId})` : ""}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Roadworthy (CoF):</span>
                          <span className={`font-semibold ${
                            cofExpiry.status === "expired" ? "text-red-500 font-bold" : cofExpiry.status === "expiring_soon" ? "text-amber-500 font-bold" : "text-gray-700 dark:text-zinc-300"
                          }`}>
                            {cofExpiry.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>License Disc:</span>
                          <span className={`font-semibold ${
                            discExpiry.status === "expired" ? "text-red-500 font-bold" : discExpiry.status === "expiring_soon" ? "text-amber-500 font-bold" : "text-gray-700 dark:text-zinc-300"
                          }`}>
                            {discExpiry.label}
                          </span>
                        </div>
                      </div>

                      {/* Action Controls */}
                      <div className="pt-2 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                        <button
                          onClick={() => handleOpenAssignModal(vehicle)}
                          className="text-xs font-semibold text-gray-700 dark:text-zinc-200 hover:text-purple-600 dark:hover:text-purple-400 py-1"
                        >
                          {vehicle.assignedDriverId ? "Change Driver" : "Pair Driver"}
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleToggleSuspension(vehicle)}
                            title={vehicle.dispatchSuspended ? "Resume Dispatch" : "Hold Dispatch (Rent Default / Maintenance)"}
                            className={`text-xs px-2.5 py-1 rounded-lg font-bold transition inline-flex items-center gap-1 ${
                              vehicle.dispatchSuspended
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                                : "bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20"
                            }`}
                          >
                            {vehicle.dispatchSuspended ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
                            <span>{vehicle.dispatchSuspended ? "Resume" : "Hold"}</span>
                          </button>

                          <button
                            onClick={() => handleDeleteVehicle(vehicle)}
                            title="Remove vehicle"
                            className="text-gray-400 hover:text-red-500 p-1 rounded-md"
                          >
                            <XCircle size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB 2: SHIFT & CASH RECONCILIATION */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === "audits" && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-5 md:p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="text-emerald-500" size={18} />
                Shift Reconciliation &amp; Cash Remittance Audit
              </h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
                Immutable daily shift sheets to audit gross turnover, cash in hand vs Yoco speedpoint card swipes, and rental target collection.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={exportShiftSheetCsv}
                className="inline-flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-zinc-200 font-bold px-3.5 py-2 rounded-xl text-xs transition"
              >
                <Download size={14} />
                <span>Export CSV</span>
              </button>
              {vehicles.length > 0 && (
                <button
                  onClick={() => setIsRecordAuditOpen(true)}
                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs transition"
                >
                  <Plus size={14} />
                  <span>Record Shift</span>
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-zinc-800 text-[11px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-wider">
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Vehicle</th>
                  <th className="py-3 px-3">Driver</th>
                  <th className="py-3 px-3">Trips</th>
                  <th className="py-3 px-3">Gross Fare</th>
                  <th className="py-3 px-3">Cash In Hand</th>
                  <th className="py-3 px-3">Speedpoint Card</th>
                  <th className="py-3 px-3">Daily Rent Target</th>
                  <th className="py-3 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-zinc-800/60 font-medium">
                {audits.map((audit) => (
                  <tr key={audit.id} className="hover:bg-gray-50 dark:hover:bg-zinc-950/40 transition">
                    <td className="py-3 px-3 font-mono text-gray-600 dark:text-zinc-400">{audit.shiftDate}</td>
                    <td className="py-3 px-3 font-bold text-gray-900 dark:text-white font-mono">{audit.licensePlate}</td>
                    <td className="py-3 px-3 text-gray-800 dark:text-zinc-200">{audit.driverName}</td>
                    <td className="py-3 px-3 text-gray-600 dark:text-zinc-400">{audit.tripsCompleted} trips ({audit.distanceKm} km)</td>
                    <td className="py-3 px-3 font-bold text-gray-900 dark:text-white">R{audit.totalGrossZar.toLocaleString()}</td>
                    <td className="py-3 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">R{audit.cashCollectedZar.toLocaleString()}</td>
                    <td className="py-3 px-3 text-blue-600 dark:text-blue-400 font-semibold">R{audit.speedpointCollectedZar.toLocaleString()}</td>
                    <td className="py-3 px-3 text-gray-600 dark:text-zinc-400">R{audit.rentalTargetZar || 480}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                        audit.settlementStatus === "settled"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      }`}>
                        {audit.settlementStatus === "settled" ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                        {audit.settlementStatus.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB 3: COMPLIANCE WATCHDOG */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === "compliance" && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-5 md:p-6 shadow-xs space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="text-emerald-500" size={18} />
              National Land Transport Act (NLTA) &amp; Compliance Watchdog
            </h2>
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              Guarantees full statutory compliance across Certificate of Fitness (CoF), Vehicle Roadworthy, Double License Discs, Passenger Liability, and Driver PrDPs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {vehicles.map((v) => {
              const cof = checkComplianceExpiry(v.roadworthyExpiry);
              const disc = checkComplianceExpiry(v.licenseDiscExpiry);
              const ins = checkComplianceExpiry(v.insuranceExpiry);

              return (
                <div key={v.id} className="bg-gray-50 dark:bg-zinc-950/70 p-4 rounded-2xl border border-gray-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-black text-sm bg-white dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-gray-200 dark:border-zinc-700">
                      {v.licensePlate}
                    </span>
                    <span className="text-xs font-bold text-gray-700 dark:text-zinc-300">
                      {v.make} {v.model}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/80 flex items-center justify-between">
                      <span className="font-semibold text-gray-600 dark:text-zinc-400">CoF (Roadworthy):</span>
                      <span className={`font-bold ${
                        cof.status === "expired" ? "text-red-500" : cof.status === "expiring_soon" ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"
                      }`}>
                        {cof.label}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/80 flex items-center justify-between">
                      <span className="font-semibold text-gray-600 dark:text-zinc-400">License Disc:</span>
                      <span className={`font-bold ${
                        disc.status === "expired" ? "text-red-500" : disc.status === "expiring_soon" ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"
                      }`}>
                        {disc.label}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/80 flex items-center justify-between">
                      <span className="font-semibold text-gray-600 dark:text-zinc-400">Passenger Insurance:</span>
                      <span className={`font-bold ${
                        ins.status === "expired" ? "text-red-500" : ins.status === "expiring_soon" ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"
                      }`}>
                        {ins.label}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* TAB 4: B2B BILLING & SARS TAX INVOICE */}
      {/* --------------------------------------------------------------------- */}
      {activeTab === "billing" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="bg-purple-500/10 text-purple-600 dark:text-purple-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-purple-500/20">
                  Option C SaaS Fleet License
                </span>
                <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mt-1.5">
                  Consolidated Monthly Fleet Billing &amp; SARS VAT Invoice
                </h2>
                <p className="text-xs text-gray-500 dark:text-zinc-400">
                  Fully compliant with Value-Added Tax Act (Act No. 89 of 1991). Platform fees are 100% tax-deductible as business operational expenditure (OpEx).
                </p>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-gray-400 dark:text-zinc-500 uppercase tracking-wider block font-bold">Total Monthly B2B Due</span>
                <span className="text-3xl font-black text-gray-900 dark:text-white">
                  R{billing.totalMonthlyZar.toLocaleString()}
                </span>
                <span className="text-xs text-gray-500 dark:text-zinc-400 block">
                  (Includes R{billing.vatAmountZar.toLocaleString()} 15% VAT)
                </span>
              </div>
            </div>

            {/* Bill Breakdown Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-zinc-950/70 border border-gray-100 dark:border-zinc-800/80 space-y-2">
                <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Fleet Hub Platform</span>
                <p className="text-2xl font-black text-gray-900 dark:text-white">R770 / mo</p>
                <p className="text-xs text-gray-500 dark:text-zinc-400">Fixed B2B Operations License</p>
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-zinc-950/70 border border-gray-100 dark:border-zinc-800/80 space-y-2">
                <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Vehicle Slots ({billing.vehicleCount})</span>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">R{billing.vehiclesSubtotalZar.toLocaleString()} / mo</p>
                <p className="text-xs text-gray-500 dark:text-zinc-400">{billing.vehicleCount} × R499/vehicle dispatch</p>
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-zinc-950/70 border border-gray-100 dark:border-zinc-800/80 space-y-2">
                <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Subtotal (Excl. VAT)</span>
                <p className="text-2xl font-black text-gray-900 dark:text-white">R{billing.subtotalZar.toLocaleString()}</p>
                <p className="text-xs text-gray-500 dark:text-zinc-400">+ R{billing.vatAmountZar.toLocaleString()} (15% VAT)</p>
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-zinc-950/70 border border-gray-100 dark:border-zinc-800/80 space-y-2">
                <span className="text-xs font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-wider">Monthly Profit Boost</span>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  +R{billing.savingsVsUberBoltZar.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-zinc-400">Retained inside your company vs 25% take-rate</p>
              </div>
            </div>

            {/* Bank Payout / Paystack Setup */}
            <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
              <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CreditCard size={16} /> Paystack Master B2B Fleet Subscription
              </h3>
              <p className="text-xs text-gray-600 dark:text-zinc-400">
                Your card is automatically debited monthly for your R770 Base Platform License plus your active vehicle slots. Drivers assigned to your fleet vehicles never need to provide personal credit cards or pay individual platform subscriptions.
              </p>
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => alert("Paystack B2B billing link: R" + billing.totalMonthlyZar + " ZAR / month.")}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-xs"
                >
                  Manage Payment Method via Paystack
                </button>
                <span className="text-xs text-gray-500 dark:text-zinc-400 font-mono">
                  HMAC-SHA512 Webhook Verified
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL: ADD VEHICLE */}
      {/* --------------------------------------------------------------------- */}
      {isAddVehicleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 pb-3">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                <Car className="text-emerald-500" size={18} />
                Add Vehicle to Fleet
              </h3>
              <button onClick={() => setIsAddVehicleOpen(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={20} />
              </button>
            </div>

            <form onSubmit={handleAddVehicle} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Make</label>
                  <input
                    type="text"
                    required
                    value={newVehMake}
                    onChange={(e) => setNewVehMake(e.target.value)}
                    placeholder="Toyota, Suzuki, etc."
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Model</label>
                  <input
                    type="text"
                    required
                    value={newVehModel}
                    onChange={(e) => setNewVehModel(e.target.value)}
                    placeholder="Corolla Quest, Ertiga, etc."
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Year</label>
                  <input
                    type="number"
                    value={newVehYear}
                    onChange={(e) => setNewVehYear(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Color</label>
                  <input
                    type="text"
                    value={newVehColor}
                    onChange={(e) => setNewVehColor(e.target.value)}
                    placeholder="White, Silver"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">License Plate</label>
                  <input
                    type="text"
                    required
                    value={newVehPlate}
                    onChange={(e) => setNewVehPlate(e.target.value)}
                    placeholder="CA 123-456"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">In-Vehicle Speedpoint Device</label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newVehSpeedpoint}
                    onChange={(e) => setNewVehSpeedpoint(e.target.value as any)}
                    className="px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                  >
                    <option value="yoco">Yoco Go / Neo</option>
                    <option value="ikhokha">iKhokha Mover / Flyer</option>
                    <option value="nedbank_pos">Nedbank PocketPOS</option>
                    <option value="absa_pos">ABSA / FNB Speedpoint</option>
                    <option value="cash_only">Cash Only</option>
                  </select>
                  <input
                    type="text"
                    value={newVehTerminalId}
                    onChange={(e) => setNewVehTerminalId(e.target.value)}
                    placeholder="Terminal / Merchant ID"
                    className="px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">CoF (Roadworthy) Expiry</label>
                  <input
                    type="date"
                    value={newVehCoFExpiry}
                    onChange={(e) => setNewVehCoFExpiry(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">License Disc Expiry</label>
                  <input
                    type="date"
                    value={newVehDiscExpiry}
                    onChange={(e) => setNewVehDiscExpiry(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsAddVehicleOpen(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xs"
                >
                  Save Vehicle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL: ASSIGN DRIVER */}
      {/* --------------------------------------------------------------------- */}
      {isAssignDriverOpen && selectedVehicleForDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                  <UserPlus className="text-purple-500" size={18} />
                  Assign Driver to Vehicle
                </h3>
                <p className="text-xs text-gray-500 dark:text-zinc-400 font-mono mt-0.5">
                  Vehicle: {selectedVehicleForDriver.licensePlate} ({selectedVehicleForDriver.make} {selectedVehicleForDriver.model})
                </p>
              </div>
              <button onClick={() => setIsAssignDriverOpen(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={20} />
              </button>
            </div>

            <form onSubmit={handleAssignDriver} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Driver Full Name</label>
                <input
                  type="text"
                  required
                  value={assignDriverName}
                  onChange={(e) => setAssignDriverName(e.target.value)}
                  placeholder="e.g. Sipho Mthembu"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Driver Phone (WhatsApp)</label>
                <input
                  type="tel"
                  required
                  value={assignDriverPhone}
                  onChange={(e) => setAssignDriverPhone(e.target.value)}
                  placeholder="+27 82 123 4567"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Shift Type</label>
                  <select
                    value={assignShiftType}
                    onChange={(e) => setAssignShiftType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                  >
                    <option value="full_time">Full-Time (24/7)</option>
                    <option value="day_shift">Day Shift (06:00 - 18:00)</option>
                    <option value="night_shift">Night Shift (18:00 - 06:00)</option>
                    <option value="weekend">Weekend Only</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Weekly Rental (ZAR)</label>
                  <input
                    type="number"
                    value={assignWeeklyRent}
                    onChange={(e) => setAssignWeeklyRent(Number(e.target.value))}
                    placeholder="2400"
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                  />
                </div>
              </div>

              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-700 dark:text-emerald-300">
                ✅ When paired, this driver automatically receives <strong>unrestricted dispatch clearance</strong> on SOLO with zero individual monthly fees.
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsAssignDriverOpen(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-xs"
                >
                  Confirm Pairing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL: RECORD SHIFT AUDIT */}
      {/* --------------------------------------------------------------------- */}
      {isRecordAuditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 pb-3">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                <DollarSign className="text-emerald-500" size={18} />
                Record End-of-Shift Audit
              </h3>
              <button onClick={() => setIsRecordAuditOpen(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle size={20} />
              </button>
            </div>

            <form onSubmit={handleRecordAudit} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Select Fleet Vehicle</label>
                <select
                  value={auditVehId}
                  onChange={(e) => {
                    setAuditVehId(e.target.value);
                    const v = vehicles.find((x) => x.id === e.target.value);
                    if (v?.assignedDriverName) setAuditDriverName(v.assignedDriverName);
                  }}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl font-mono"
                >
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.licensePlate} — {v.make} {v.model} ({v.assignedDriverName || "No driver"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Driver Name</label>
                <input
                  type="text"
                  value={auditDriverName}
                  onChange={(e) => setAuditDriverName(e.target.value)}
                  placeholder="Driver Full Name"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Total Gross Fares (ZAR)</label>
                  <input
                    type="number"
                    required
                    value={auditGrossZar}
                    onChange={(e) => setAuditGrossZar(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Trips Completed</label>
                  <input
                    type="number"
                    value={auditTrips}
                    onChange={(e) => setAuditTrips(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Cash In Hand (ZAR)</label>
                  <input
                    type="number"
                    value={auditCashZar}
                    onChange={(e) => setAuditCashZar(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl text-emerald-600 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Speedpoint Card Swipes (ZAR)</label>
                  <input
                    type="number"
                    value={auditSpeedpointZar}
                    onChange={(e) => setAuditSpeedpointZar(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl text-blue-600 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Distance Driven (km)</label>
                  <input
                    type="number"
                    value={auditDistance}
                    onChange={(e) => setAuditDistance(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 dark:text-zinc-300 block mb-1">Shift Duration (hours)</label>
                  <input
                    type="number"
                    value={auditHours}
                    onChange={(e) => setAuditHours(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsRecordAuditOpen(false)}
                  className="px-4 py-2 bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-xs"
                >
                  Save Shift Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
