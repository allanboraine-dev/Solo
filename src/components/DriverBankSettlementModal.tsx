"use client";

import { useState, useEffect } from "react";
import {
  Building2,
  CheckCircle2,
  CreditCard,
  Lock,
  X,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import {
  SA_BANKS,
  SaAccountType,
  validateSaBankAccount,
} from "@/utils/bankDetails";

interface DriverBankSettlementModalProps {
  driverId: string;
  driverFullName?: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (details: any) => void;
}

export function DriverBankSettlementModal({
  driverId,
  driverFullName = "Driver",
  isOpen,
  onClose,
  onSaved,
}: DriverBankSettlementModalProps) {
  const [selectedBankId, setSelectedBankId] = useState<string>("standard_bank");
  const [accountNumber, setAccountNumber] = useState<string>("");
  const [accountType, setAccountType] = useState<SaAccountType>("cheque");
  const [accountHolderName, setAccountHolderName] = useState<string>(driverFullName);

  const [loading, setLoading] = useState<boolean>(false);
  const [savedData, setSavedData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load existing bank details
  useEffect(() => {
    if (!isOpen || !driverId) return;

    fetch(`/api/driver/bank-details?driverId=${driverId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.bankDetails) {
          setSavedData(data.bankDetails);
          if (data.bankDetails.bankCode) {
            setSelectedBankId(data.bankDetails.bankCode);
          }
          if (data.bankDetails.accountType) {
            setAccountType(data.bankDetails.accountType);
          }
        }
      })
      .catch((err) => console.warn("Could not load bank details:", err));
  }, [isOpen, driverId]);

  if (!isOpen) return null;

  const currentBank = SA_BANKS[selectedBankId] || SA_BANKS.standard_bank;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const validation = validateSaBankAccount({
      bankId: selectedBankId,
      accountNumber,
      accountType,
    });

    if (!validation.valid) {
      setErrorMsg(validation.error || "Invalid bank details");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/driver/bank-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId,
          bankId: selectedBankId,
          accountNumber,
          accountType,
          accountHolderName: accountHolderName.trim() || driverFullName,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg("✓ South African bank settlement account linked and verified!");
        setSavedData(data.bankDetails);
        setAccountNumber("");
        if (onSaved) onSaved(data.bankDetails);
      } else {
        setErrorMsg(data.error || "Failed to link bank account");
      }
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 text-white space-y-5 shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-800 pb-3">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <Building2 size={14} />
              <span>Direct Fare Remittance</span>
            </div>
            <h3 className="text-xl font-bold mt-1">Bank Settlement Details</h3>
            <p className="text-xs text-zinc-400">
              Link your South African bank account for instant payouts with zero commission deductions.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Existing Verified Account Card */}
        {savedData?.maskedAccountNumber && (
          <div className="p-3.5 bg-emerald-950/20 border border-emerald-800/40 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center shrink-0">
                <CheckCircle2 size={20} />
              </div>
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white truncate">{savedData.bankName}</span>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-bold">
                    VERIFIED
                  </span>
                </div>
                <p className="font-mono text-xs text-zinc-400">{savedData.maskedAccountNumber}</p>
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl text-rose-300 flex items-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-xl text-emerald-300 flex items-center gap-2">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Bank Select */}
          <div className="space-y-1">
            <label className="text-zinc-400 font-semibold block">Select South African Bank</label>
            <select
              value={selectedBankId}
              onChange={(e) => setSelectedBankId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500"
            >
              {Object.values(SA_BANKS).map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name} ({bank.universalBranchCode})
                </option>
              ))}
            </select>
          </div>

          {/* Universal Branch Code (Auto-filled) */}
          <div className="space-y-1">
            <label className="text-zinc-400 font-semibold block">Universal Branch Code</label>
            <input
              type="text"
              disabled
              value={currentBank.universalBranchCode}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-400 font-mono"
            />
          </div>

          {/* Account Number */}
          <div className="space-y-1">
            <label className="text-zinc-400 font-semibold block">Account Number</label>
            <input
              type="text"
              maxLength={11}
              placeholder="e.g. 1018920194"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[10px] text-zinc-500">
              Valid length for {currentBank.name}: {currentBank.accountNumberLengths.join(" or ")} digits.
            </p>
          </div>

          {/* Account Type */}
          <div className="space-y-1">
            <label className="text-zinc-400 font-semibold block">Account Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "cheque", label: "Cheque / Current" },
                  { id: "savings", label: "Savings" },
                  { id: "transmission", label: "Transmission" },
                ] as const
              ).map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setAccountType(type.id)}
                  className={`py-2 px-1 text-center font-bold rounded-xl border transition ${
                    accountType === type.id
                      ? "bg-emerald-600/20 border-emerald-500 text-emerald-300"
                      : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white"
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Account Holder Name */}
          <div className="space-y-1">
            <label className="text-zinc-400 font-semibold block">Account Holder Full Name</label>
            <input
              type="text"
              value={accountHolderName}
              onChange={(e) => setAccountHolderName(e.target.value)}
              required
              placeholder="As printed on bank card"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* POPIA & PCI-DSS Safety Badge */}
          <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center gap-2 text-[10px] text-zinc-500 leading-tight">
            <Lock size={14} className="text-zinc-400 shrink-0" />
            <span>
              Bank account credentials are protected under POPIA and encrypted according to PCI-DSS Level 1 standards.
            </span>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !accountNumber}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-emerald-600/20 active:scale-95 flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 size={16} />
            <span>{loading ? "Linking Bank Account..." : "Save Settlement Account"}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
