"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Download, BookOpen, ShieldCheck, Car, Users, Building2 } from "lucide-react";

export default function OperationalManualPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Navigation & Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-8 border-b border-slate-800 gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800 transition"
              title="Return to Home"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-white">SOLO Operational Manual</h1>
                <span className="text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  SOP v2.2
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Standard Operating Procedures for South African E-Hailing (NLTA, SARS, POPIA &amp; B2B Fleet Compliant)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href="/SOLO_OPERATIONAL_MANUAL.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-950/40 transition"
            >
              <Printer className="w-4 h-4" />
              Print / Save as PDF
            </a>
            <a
              href="/SOLO_OPERATIONAL_MANUAL.md"
              download="SOLO_OPERATIONAL_MANUAL.md"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-sm border border-slate-700 transition"
            >
              <Download className="w-4 h-4" />
              Download .MD
            </a>
          </div>
        </div>

        {/* Quick Jumper Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-8">
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-sky-500/20 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center mb-3">
                <Users className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-white mb-1">Section A: Rider Guide</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                WhatsApp verification, 4-digit PIN boarding, Wrong Car/Driver mismatch SOS, proactive off-route check-in, and SARS tax receipts.
              </p>
            </div>
            <a
              href="/SOLO_OPERATIONAL_MANUAL.html#section-rider"
              target="_blank"
              className="mt-4 text-xs font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
            >
              Read Rider Section &rarr;
            </a>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-emerald-500/20 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3">
                <Car className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-white mb-1">Section B: Driver Guide</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                NLTA compliance, automatic KYC document expiry lock (PrDP, licence, disc &amp; insurance), 1-device concurrency, and 0% commission R499/mo SaaS.
              </p>
            </div>
            <a
              href="/SOLO_OPERATIONAL_MANUAL.html#section-driver"
              target="_blank"
              className="mt-4 text-xs font-semibold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1"
            >
              Read Driver Section &rarr;
            </a>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-amber-500/20 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-white mb-1">Section C: Admin Governance</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                KYC review &amp; expiry enforcement, 1-hour signed URLs (POPIA), 1-hour stale trip expiration, PostGIS spatial queries, and Paystack webhooks.
              </p>
            </div>
            <a
              href="/SOLO_OPERATIONAL_MANUAL.html#section-admin"
              target="_blank"
              className="mt-4 text-xs font-semibold text-amber-400 hover:text-amber-300 inline-flex items-center gap-1"
            >
              Read Admin Section &rarr;
            </a>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/80 border border-purple-500/20 flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center mb-3">
                <Building2 className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-white mb-1">Section D: Fleet Partner Hub</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Live Paystack B2B fleet registration &amp; billing (R770 base + R499/car + VAT), multi-driver shift pairing, remote dispatch holds, and cash/POS audits.
              </p>
            </div>
            <a
              href="/SOLO_OPERATIONAL_MANUAL.html#section-fleet"
              target="_blank"
              className="mt-4 text-xs font-semibold text-purple-400 hover:text-purple-300 inline-flex items-center gap-1"
            >
              Read Fleet Section &rarr;
            </a>
          </div>
        </div>

        {/* Embedded Document Frame */}
        <div className="rounded-2xl border border-slate-800 overflow-hidden shadow-2xl bg-slate-900">
          <div className="bg-slate-900 px-5 py-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-400" />
              <span className="font-medium text-slate-200">SOLO_OPERATIONAL_MANUAL.html (Interactive Preview)</span>
            </div>
            <span className="text-slate-400">Press Print / Save as PDF to generate full printable handbook</span>
          </div>
          <iframe
            src="/SOLO_OPERATIONAL_MANUAL.html"
            className="w-full h-[800px] border-none bg-white"
            title="SOLO Operational Manual Document"
          />
        </div>
      </div>
    </div>
  );
}
