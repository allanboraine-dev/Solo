"use client";

import React, { useState } from "react";
import {
  UserPlus,
  Car,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  X,
  Mail,
  Phone,
  ShieldCheck,
  FileCheck2,
  CreditCard,
  Hash,
} from "lucide-react";

interface RegisterDriverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function generateSecurePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const numbers = "23456789";
  const specials = "@#$!";

  let pass = "Solo";
  pass += specials.charAt(Math.floor(Math.random() * specials.length));
  for (let i = 0; i < 4; i++) {
    pass += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  pass += specials.charAt(Math.floor(Math.random() * specials.length));
  pass += upper.charAt(Math.floor(Math.random() * upper.length));
  pass += chars.charAt(Math.floor(Math.random() * chars.length));
  return pass;
}

export default function RegisterDriverModal({
  isOpen,
  onClose,
  onSuccess,
}: RegisterDriverModalProps) {
  // Form State
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState(generateSecurePassword());
  const [showPassword, setShowPassword] = useState(false);

  // Vehicle State
  const [vehicleMake, setVehicleMake] = useState("Toyota");
  const [vehicleModel, setVehicleModel] = useState("Corolla Quest");
  const [vehicleYear, setVehicleYear] = useState(new Date().getFullYear().toString());
  const [vehicleColor, setVehicleColor] = useState("White");
  const [licensePlate, setLicensePlate] = useState("");
  const [prdpNumber, setPrdpNumber] = useState("");

  // Clearance & Plan
  const [isVerified, setIsVerified] = useState(true);
  const [subscriptionPlan, setSubscriptionPlan] = useState<"trial" | "paid">("trial");

  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Success Payload
  const [registeredData, setRegisteredData] = useState<{
    driver: any;
    temporaryPassword: string;
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const resetForm = () => {
    setFullName("");
    setEmail("");
    setPhone("");
    setPassword(generateSecurePassword());
    setShowPassword(false);
    setVehicleMake("Toyota");
    setVehicleModel("Corolla Quest");
    setVehicleYear(new Date().getFullYear().toString());
    setVehicleColor("White");
    setLicensePlate("");
    setPrdpNumber("");
    setIsVerified(true);
    setSubscriptionPlan("trial");
    setError(null);
    setFieldError(null);
    setRegisteredData(null);
    setCopied(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleGenerateNewPassword = () => {
    setPassword(generateSecurePassword());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldError(null);

    if (!fullName.trim()) {
      setError("Driver full name is required.");
      setFieldError("fullName");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Valid email address is required.");
      setFieldError("email");
      return;
    }
    if (!phone.trim()) {
      setError("Mobile phone number is required.");
      setFieldError("phone");
      return;
    }
    if (!licensePlate.trim()) {
      setError("Vehicle license plate is required.");
      setFieldError("licensePlate");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password: password.trim(),
        vehicleMake: vehicleMake.trim(),
        vehicleModel: vehicleModel.trim(),
        vehicleYear: parseInt(vehicleYear, 10) || new Date().getFullYear(),
        vehicleColor: vehicleColor.trim(),
        licensePlate: licensePlate.trim().toUpperCase(),
        prdpNumber: prdpNumber.trim().toUpperCase() || undefined,
        isVerified,
        subscriptionPlan,
        hasLicense: true,
        hasPrdp: Boolean(prdpNumber.trim()),
        hasRoadworthy: true,
      };

      const res = await fetch("/api/admin/register-driver", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to register driver profile");
        setFieldError(data.field || null);
        return;
      }

      // Sync with localStorage for offline / mock testing support
      if (typeof window !== "undefined") {
        try {
          const newLocalDriver = {
            id: data.driver.id,
            fullName: data.driver.fullName,
            email: data.driver.email,
            phone: data.driver.phone,
            vehicleMake: data.driver.vehicleMake,
            vehicleModel: data.driver.vehicleModel,
            vehicleYear: data.driver.vehicleYear,
            vehicleColor: data.driver.vehicleColor,
            licensePlate: data.driver.licensePlate,
            prdpNumber: data.driver.prdpNumber,
            isVerified: data.driver.isVerified,
            subscriptionPlan: data.driver.subscriptionPlan,
            trialStartedAt: new Date().toISOString(),
          };

          const allStr = localStorage.getItem("all_registered_drivers");
          const allDrivers = allStr ? JSON.parse(allStr) : [];
          allDrivers.unshift(newLocalDriver);
          localStorage.setItem("all_registered_drivers", JSON.stringify(allDrivers));
          localStorage.setItem("mock_driver_profile", JSON.stringify(newLocalDriver));
        } catch (localSyncErr) {
          console.warn("Local storage registration sync notice:", localSyncErr);
        }
      }

      setRegisteredData({
        driver: data.driver,
        temporaryPassword: data.temporaryPassword || password,
        message: data.message || "Driver registered successfully.",
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      setError((err as Error).message || "Network error registering driver.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!registeredData) return;
    const credText = `🚗 SOLO DRIVER ACCESS DETAILS\n\n` +
      `Driver: ${registeredData.driver.fullName}\n` +
      `Portal: ${typeof window !== "undefined" ? window.location.origin : "https://solo-app.co.za"}/driver/login\n` +
      `Email: ${registeredData.driver.email}\n` +
      `Password: ${registeredData.temporaryPassword}\n` +
      `Vehicle: ${registeredData.driver.vehicleMake} ${registeredData.driver.vehicleModel} (${registeredData.driver.licensePlate})\n\n` +
      `Keep this password secure. You can sign in and start accepting rides immediately.`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(credText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-white">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400">
              <UserPlus size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                <span>Register Commercial Driver</span>
                <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Manager Clearance
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Directly onboard a vetted driver with immediate platform authorization
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition"
            title="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="bg-rose-950/40 border border-rose-800/60 text-rose-300 p-4 rounded-2xl text-xs sm:text-sm flex items-start gap-3">
              <AlertCircle size={18} className="shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1">
                <span className="font-bold block">Registration Error</span>
                <span>{error}</span>
              </div>
            </div>
          )}

          {registeredData ? (
            /* SUCCESS STATE VIEW */
            <div className="space-y-6 py-2">
              <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-3xl p-6 text-center space-y-3">
                <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                  <CheckCircle2 size={32} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">
                    Driver Successfully Registered!
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-md mx-auto">
                    {registeredData.message}
                  </p>
                </div>
              </div>

              {/* Registered Driver Details Card */}
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                  <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                    Driver Profile
                  </span>
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <ShieldCheck size={12} />
                    <span>Verified Driver</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-zinc-500 block">Full Name:</span>
                    <span className="text-sm font-bold text-zinc-100">{registeredData.driver.fullName}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Phone:</span>
                    <span className="text-sm font-mono font-bold text-zinc-100">{registeredData.driver.phone}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Email:</span>
                    <span className="text-sm font-mono font-bold text-zinc-100">{registeredData.driver.email}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Vehicle:</span>
                    <span className="text-sm font-bold text-zinc-100">
                      {registeredData.driver.vehicleMake} {registeredData.driver.vehicleModel} ({registeredData.driver.licensePlate})
                    </span>
                  </div>
                </div>

                {/* Driver Credentials Box */}
                <div className="mt-4 pt-4 border-t border-zinc-800 space-y-2">
                  <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                    <KeyRound size={13} />
                    <span>Driver Login Credentials (Share with Driver)</span>
                  </span>

                  <div className="bg-zinc-900 border border-zinc-700/60 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-400">Email:</span>
                      <span className="text-white font-bold select-all">{registeredData.driver.email}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-400">Password:</span>
                      <span className="text-emerald-400 font-bold tracking-wide select-all">
                        {registeredData.temporaryPassword}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleCopyCredentials}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition active:scale-98 ${
                      copied
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200"
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check size={14} className="text-white" />
                        <span>Credentials Copied to Clipboard!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Copy Complete WhatsApp / SMS Message</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full sm:w-1/2 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-bold text-xs rounded-xl transition"
                >
                  Register Another Driver
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full sm:w-1/2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition"
                >
                  Done / View in Directory
                </button>
              </div>
            </div>
          ) : (
            /* REGISTRATION FORM VIEW */
            <form id="register-driver-form" onSubmit={handleSubmit} className="space-y-6">
              
              {/* Section 1: Driver Contact & Account Information */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                  <ShieldCheck size={14} />
                  <span>1. Driver Identification & Account</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Full Name */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">
                      Full Legal Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Allan Boraine"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className={`w-full bg-zinc-950 border ${
                        fieldError === "fullName" ? "border-rose-500" : "border-zinc-800"
                      } focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 outline-hidden transition`}
                    />
                  </div>

                  {/* Email Address */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">
                      Email Address <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. driver@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full bg-zinc-950 border ${
                        fieldError === "email" ? "border-rose-500" : "border-zinc-800"
                      } focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 outline-hidden transition`}
                    />
                  </div>

                  {/* Mobile Phone */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">
                      Mobile Number <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 082 123 4567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={`w-full bg-zinc-950 border ${
                        fieldError === "phone" ? "border-rose-500" : "border-zinc-800"
                      } focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 outline-hidden transition`}
                    />
                  </div>

                  {/* Initial Password */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-zinc-300">
                        Initial Login Password <span className="text-rose-400">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleGenerateNewPassword}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 transition"
                      >
                        <Sparkles size={11} />
                        <span>Regenerate</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 pr-10 text-xs sm:text-sm font-mono text-white placeholder-zinc-500 outline-hidden transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Vehicle Information */}
              <div className="space-y-3 pt-2 border-t border-zinc-800/80">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                  <Car size={14} />
                  <span>2. Vehicle & Fleet Information</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Vehicle Make */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">
                      Vehicle Make <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Toyota"
                      value={vehicleMake}
                      onChange={(e) => setVehicleMake(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 outline-hidden transition"
                    />
                  </div>

                  {/* Vehicle Model */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">
                      Vehicle Model <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Corolla Quest"
                      value={vehicleModel}
                      onChange={(e) => setVehicleModel(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 outline-hidden transition"
                    />
                  </div>

                  {/* Year */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">
                      Model Year
                    </label>
                    <input
                      type="number"
                      placeholder="2022"
                      value={vehicleYear}
                      onChange={(e) => setVehicleYear(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 outline-hidden transition"
                    />
                  </div>

                  {/* Vehicle Color */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">
                      Color
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. White"
                      value={vehicleColor}
                      onChange={(e) => setVehicleColor(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-zinc-500 outline-hidden transition"
                    />
                  </div>

                  {/* License Plate */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">
                      License Plate <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. CA 123-456"
                      value={licensePlate}
                      onChange={(e) => setLicensePlate(e.target.value)}
                      className={`w-full bg-zinc-950 border ${
                        fieldError === "licensePlate" ? "border-rose-500" : "border-zinc-800"
                      } focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm uppercase font-mono text-white placeholder-zinc-500 outline-hidden transition`}
                    />
                  </div>

                  {/* PrDP Number */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 block mb-1">
                      PrDP Permit Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. PRDP-987654"
                      value={prdpNumber}
                      onChange={(e) => setPrdpNumber(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm uppercase font-mono text-white placeholder-zinc-500 outline-hidden transition"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Clearance & Subscription Settings */}
              <div className="space-y-3 pt-2 border-t border-zinc-800/80">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                  <FileCheck2 size={14} />
                  <span>3. Platform Clearance & Subscription</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Direct Verification Checkbox */}
                  <label className="flex items-start gap-3 p-3.5 bg-zinc-950/60 border border-zinc-800 hover:border-emerald-500/50 rounded-2xl cursor-pointer transition">
                    <input
                      type="checkbox"
                      checked={isVerified}
                      onChange={(e) => setIsVerified(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded-sm bg-zinc-900 border-zinc-700 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="text-xs font-bold text-white block">
                        Instant KYC Clearance (Verified)
                      </span>
                      <span className="text-[11px] text-zinc-400 leading-tight block">
                        Mark driver pre-vetted so they can go online and accept trips immediately.
                      </span>
                    </div>
                  </label>

                  {/* Subscription Plan Picker */}
                  <div className="p-3.5 bg-zinc-950/60 border border-zinc-800 rounded-2xl space-y-1.5">
                    <span className="text-xs font-bold text-white block">
                      Subscription Plan
                    </span>
                    <select
                      value={subscriptionPlan}
                      onChange={(e) => setSubscriptionPlan(e.target.value as "trial" | "paid")}
                      className="w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded-xl px-3 py-1.5 outline-hidden focus:border-emerald-500"
                    >
                      <option value="trial">14-Day Free Trial (R499/mo standard)</option>
                      <option value="paid">Active Subscription (Complimentary / Paid)</option>
                    </select>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer (When not in success view) */}
        {!registeredData && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 bg-zinc-900/60">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="register-driver-form"
              disabled={loading}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition active:scale-98"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Registering Driver...</span>
                </>
              ) : (
                <>
                  <UserPlus size={15} />
                  <span>Register & Authorize Driver</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
