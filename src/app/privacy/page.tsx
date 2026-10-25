import Link from "next/link";
import { ShieldCheck, ArrowLeft, Mail, FileText, Lock, UserX } from "lucide-react";

export const metadata = {
  title: "Privacy Policy & POPIA Statement | SOLO",
  description: "Official Privacy Policy and POPIA statutory compliance disclosure for the SOLO Zero-Commission E-Hailing Platform by Boraine Tech (Pty) Ltd.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-emerald-500 selection:text-black">
      <div className="max-w-4xl mx-auto px-6 py-12 md:py-20 space-y-10">
        {/* Navigation & Header */}
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft size={16} /> Back to SOLO Platform
          </Link>
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <ShieldCheck size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">Privacy Policy &amp; POPIA Compliance</h1>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">
                Effective Date: 24 October 2026 | Operator: Boraine Tech (Pty) Ltd (South Africa)
              </p>
            </div>
          </div>
        </div>

        {/* Section 1: Overview */}
        <section className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText size={20} className="text-emerald-400" />
            1. Regulatory Framework &amp; Responsible Party
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            <strong>SOLO</strong> is engineered, operated, and maintained by <strong>Boraine Tech (Pty) Ltd</strong>, registered in the Republic of South Africa. This privacy statement outlines our mandatory compliance with the <strong>Protection of Personal Information Act (POPIA Act No. 4 of 2013)</strong>, the <strong>National Land Transport Act (Act No. 5 of 2009)</strong>, and the requirements of the <strong>Google Play Developer Policy</strong>.
          </p>
          <p className="text-sm text-zinc-300 leading-relaxed">
            SOLO operates on a <strong>Pure Zero-Commission (0% take-rate)</strong> model. We do not monetize, harvest, or sell user personal information to advertisers, data brokers, or third parties.
          </p>
        </section>

        {/* Section 2: Data Collected */}
        <section className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Lock size={20} className="text-emerald-400" />
            2. Personal Information Collected &amp; Purpose
          </h2>
          <ul className="text-sm text-zinc-300 space-y-3 list-disc list-inside leading-relaxed">
            <li>
              <strong>Precise &amp; Foreground Geolocation:</strong> Used solely during active ride dispatch and navigation to calculate optimal pickup routes, estimate fares, and locate nearby verified drivers. Location data is never broadcast publicly and is protected by spatial geohashing.
            </li>
            <li>
              <strong>Rider Contact Details:</strong> Mobile phone number and optional display name, used exclusively for driver arrival notifications, safety dispatch, and trip receipts.
            </li>
            <li>
              <strong>Driver Statutory Credentials (KYC):</strong> South African Identity Document/Card, Professional Driving Permit (PrDP), Driver&apos;s License card, and Vehicle Registration Certificate. Stored in encrypted, private cloud storage buckets accessible solely by authorized compliance officers via temporary 1-hour time-limited signed URLs.
            </li>
            <li>
              <strong>Payment Information:</strong> Driver platform SaaS subscriptions (R499/month) are processed directly by <strong>Paystack</strong> (PCI-DSS Level 1 Certified Gateway). SOLO never stores or handles raw credit or debit card numbers on its servers.
            </li>
          </ul>
        </section>

        {/* Section 3: Account Deletion */}
        <section className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <UserX size={20} className="text-emerald-400" />
            3. Account &amp; Personal Data Deletion (Google Play Compliance)
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Under Section 24 of POPIA and the Google Play User Data policy, you have the absolute statutory right to request full destruction, erasure, or de-identification of your personal information and driver/rider records.
          </p>
          <div className="bg-zinc-950/80 border border-zinc-800 p-4 rounded-xl space-y-2">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              How to Request Immediate Account Deletion:
            </p>
            <p className="text-sm text-zinc-300">
              Submit an erasure request via email to <strong>compliance@soloride.co.za</strong> with the subject line <em>&quot;Account Deletion Request&quot;</em> specifying your registered phone number or email address, or submit a deletion ticket directly via the in-app Support &amp; Lost Item Centre.
            </p>
            <p className="text-xs text-zinc-400">
              Account data, active dispatch sessions, and uploaded driver KYC documents will be permanently purged within 30 statutory business days, subject only to mandatory legal record-keeping requirements under the NLTA and SARS tax directives.
            </p>
          </div>
        </section>

        {/* Section 4: Contact */}
        <section className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Mail size={20} className="text-emerald-400" />
            4. Information Officer Contact
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            For privacy inquiries, POPIA Form 1 data access requests, or information officer communications:
          </p>
          <div className="text-sm text-zinc-300 space-y-1">
            <p><strong>Boraine Tech (Pty) Ltd</strong></p>
            <p>Attention: Allan Boraine (Information Officer &amp; Founder)</p>
            <p>Cape Town / Kimberley, Republic of South Africa</p>
            <p>Email: <a href="mailto:compliance@soloride.co.za" className="text-emerald-400 hover:underline">compliance@soloride.co.za</a></p>
          </div>
        </section>
      </div>
    </div>
  );
}
