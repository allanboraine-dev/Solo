import Link from "next/link";
import { FileText, ShieldCheck, ArrowLeft, Scale, Car, CreditCard, AlertTriangle, Lock, Users, HelpCircle } from "lucide-react";

export const metadata = {
  title: "Terms of Service & Platform Agreement | SOLO",
  description: "Official Terms of Service, Platform SaaS Agreement, Driver Independent Contractor Charter, and Rider Conditions for the SOLO Zero-Commission E-Hailing Platform by Boraine Tech (Pty) Ltd.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "Terms of Service & Platform Agreement | SOLO",
    description: "Statutory terms, CPA Section 49 disclosures, 0% commission direct-payment framework, and POPIA privacy compliance by Boraine Tech (Pty) Ltd.",
    url: "https://soloride.co.za/terms",
    siteName: "SOLO",
    locale: "en_ZA",
    type: "article",
  },
};

export default function TermsOfServicePage() {
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
              <Scale size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">Terms of Service &amp; Platform Agreement</h1>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">
                Effective Date: 5 November 2026 | Operator: Boraine Tech (Pty) Ltd (South Africa)
              </p>
            </div>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed mt-2">
            Please read these Terms of Service carefully before registering, logging in, or using the SOLO platform as either a Driver or a Rider. By accessing or using the platform, you agree to be bound by these terms.
          </p>
        </div>

        {/* CPA Section 49 Mandatory Prominent Disclosure Notice */}
        <div className="bg-amber-950/40 border border-amber-500/30 rounded-2xl p-6 md:p-8 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm uppercase tracking-wider">
            <AlertTriangle size={20} className="shrink-0" />
            <span>Important Statutory Notice: Consumer Protection Act (CPA Act 68 of 2008, Section 49)</span>
          </div>
          <p className="text-xs text-amber-200/90 leading-relaxed font-medium">
            Section 49 of the CPA requires that limitation of liability, assumption of risk, and indemnity provisions be brought specifically to your attention in plain language. Please note that:
          </p>
          <ul className="text-xs text-amber-200/80 space-y-1.5 list-disc list-inside leading-relaxed">
            <li><strong>SOLO is a technology dispatch platform</strong>, not a transport carrier or employer of drivers.</li>
            <li><strong>Drivers operate as independent business contractors</strong> who retain 100% of rider fares and carry their own statutory commercial passenger liability insurance.</li>
            <li><strong>Fares are paid directly</strong> by the rider to the driver via the driver&apos;s physical Speedpoint card machine or cash at trip conclusion.</li>
          </ul>
        </div>

        {/* Section 1: Parties & Regulatory Framework */}
        <section className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText size={20} className="text-emerald-400" />
            1. Legal Entity &amp; Applicable Statutes
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            The SOLO platform is owned, engineered, and operated by <strong>Boraine Tech (Pty) Ltd</strong>, an incorporated company registered under the laws of the Republic of South Africa.
          </p>
          <p className="text-sm text-zinc-300 leading-relaxed">
            These terms are governed by and construed in accordance with the laws of South Africa, specifically complying with:
          </p>
          <ul className="text-sm text-zinc-300 space-y-2 list-disc list-inside leading-relaxed">
            <li><strong>National Land Transport Act (Act No. 5 of 2009 &amp; NLTA Amendment Act)</strong> governing e-hailing dispatch systems and operating licences.</li>
            <li><strong>Consumer Protection Act (Act No. 68 of 2008)</strong> governing transparent consumer pricing and transaction rights.</li>
            <li><strong>Protection of Personal Information Act (POPIA Act No. 4 of 2013)</strong> governing lawful personal data and real-time telemetry processing.</li>
            <li><strong>South African Reserve Bank (SARB)</strong> National Payment System Directives and PCI-DSS compliance for recurring subscription billing.</li>
          </ul>
        </section>

        {/* Section 2: Pure Zero-Commission Platform Model */}
        <section className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CreditCard size={20} className="text-emerald-400" />
            2. Pure Zero-Commission Model &amp; Direct Fare Settlement
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Unlike legacy rideshare operators that deduct 20% to 30% commission from trip earnings, SOLO operates on a <strong>Pure Zero-Commission (0% take-rate)</strong> infrastructure:
          </p>
          <ul className="text-sm text-zinc-300 space-y-2 list-disc list-inside leading-relaxed">
            <li><strong>100% Direct Driver Payment:</strong> Riders settle trip fares directly with the driver immediately upon arrival at the destination.</li>
            <li><strong>Mandatory Speedpoint POS &amp; Cash:</strong> All registered SOLO drivers are required to carry an active physical card terminal (e.g., Yoco, iKhokha, Vodapay, or commercial bank POS) to accept debit/credit card taps, while cash remains a standard accepted payment method.</li>
            <li><strong>No Intermediary Custody of Fares:</strong> SOLO does not hold, escrow, or skim rider trip funds. The merchant relationship for fare settlement is directly between passenger and driver.</li>
            <li><strong>Algorithmic Fare Guidance:</strong> Distance and duration rates displayed in the app represent binding recommended statutory fare calculations designed to protect riders against arbitrary overcharging.</li>
          </ul>
        </section>

        {/* Section 3: Driver Charter & Independent Contractor Agreement */}
        <section className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Car size={20} className="text-emerald-400" />
            3. Driver Platform Agreement &amp; Independent Contractor Status
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            By registering as a SOLO Driver, you agree to and acknowledge the following terms:
          </p>
          <div className="space-y-3 text-sm text-zinc-300 leading-relaxed">
            <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-2">
              <h3 className="font-bold text-white text-xs uppercase tracking-wide text-emerald-400">Independent Contractor Relationship</h3>
              <p>
                You are an independent commercial transport operator, not an employee, agent, joint venturer, or partner of Boraine Tech (Pty) Ltd. You have complete autonomy over your operating hours, geographical routing, and acceptance of dispatched trip requests. You are solely responsible for all tax declarations (income tax, provisional tax, and VAT where applicable) with the South African Revenue Service (SARS).
              </p>
            </div>
            <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-2">
              <h3 className="font-bold text-white text-xs uppercase tracking-wide text-emerald-400">Mandatory Statutory Credentials &amp; KYC</h3>
              <p>
                Drivers must maintain valid, unexpired statutory documents at all times:
              </p>
              <ul className="text-xs text-zinc-400 space-y-1 list-disc list-inside">
                <li>South African National Driver&apos;s Licence (Code B / EB / C1)</li>
                <li>Valid Professional Driving Permit (PrDP Category P: Passengers)</li>
                <li>Vehicle Registration Certificate (RC1) and active Roadworthy Licence Disc / CoF</li>
                <li>Active commercial passenger liability insurance policy</li>
              </ul>
              <p className="text-xs text-zinc-400">
                Failure to maintain valid credentials will result in automated temporary suspension of dispatch privileges until updated documentation is reviewed.
              </p>
            </div>
            <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-2">
              <h3 className="font-bold text-white text-xs uppercase tracking-wide text-emerald-400">Driver SaaS Subscription &amp; Free Trial</h3>
              <p>
                Access to the driver dispatch platform is provided on a flat monthly Software-as-a-Service (SaaS) subscription of <strong>R499.00 / month</strong>:
              </p>
              <ul className="text-xs text-zinc-400 space-y-1 list-disc list-inside">
                <li>New drivers receive a <strong>14-day free trial</strong> with zero platform fees.</li>
                <li>A nominal R1.00 3D-Secure card verification transaction is processed via Paystack upon registration to securely tokenize the payment method.</li>
                <li>On Day 15, the first monthly R499.00 subscription charge occurs unless cancelled beforehand. Drivers may cancel their subscription at any time without penalty.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 4: Rider Conditions & Code of Conduct */}
        <section className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Users size={20} className="text-emerald-400" />
            4. Rider Conditions &amp; Community Guidelines
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Riders using SOLO agree to maintain respectful, lawful conduct during all dispatched trips:
          </p>
          <ul className="text-sm text-zinc-300 space-y-2.5 list-disc list-inside leading-relaxed">
            <li><strong>Payment Obligation:</strong> Riders agree to pay the complete trip fare to the driver upon drop-off using the driver&apos;s physical card machine or cash. Willful non-payment constitutes theft of services and results in immediate account deactivation and referral to law enforcement.</li>
            <li><strong>Safe &amp; Lawful Passenger Behaviour:</strong> Smoking, illicit substance usage, aggressive behavior, vandalism, or interference with safe vehicle operation is strictly prohibited.</li>
            <li><strong>Accurate Pickup Information:</strong> Riders must provide accurate pickup coordinates and be ready at the designated curb upon driver arrival to avoid unnecessary congestion.</li>
            <li><strong>Lost Property:</strong> While drivers are encouraged to return lost items, passengers are responsible for their personal belongings. Lost item claims can be submitted via the in-app Support &amp; Lost Property portal.</li>
          </ul>
        </section>

        {/* Section 5: Safety, SOS & Emergency Dispatch */}
        <section className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldCheck size={20} className="text-emerald-400" />
            5. Safety Architecture &amp; SOS Distress Protocol
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            SOLO integrates real-time telemetry and safety tools, including an in-app <strong>SOS Distress Button</strong>:
          </p>
          <ul className="text-sm text-zinc-300 space-y-2 list-disc list-inside leading-relaxed">
            <li>Activating the SOS feature immediately logs GPS telemetry and provides one-touch dialling to national emergency services (<strong>SAPS 10111</strong>) and pre-configured trusted safety contacts.</li>
            <li>Misuse or fraudulent activation of emergency SOS features is strictly prohibited and subject to account termination.</li>
          </ul>
        </section>

        {/* Section 6: Limitation of Liability */}
        <section className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Lock size={20} className="text-emerald-400" />
            6. Limitation of Liability &amp; Disclaimers
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            To the maximum extent permitted under Section 49 of the South African Consumer Protection Act:
          </p>
          <ul className="text-sm text-zinc-300 space-y-2.5 list-disc list-inside leading-relaxed">
            <li>Boraine Tech (Pty) Ltd provides the SOLO application on an &quot;as is&quot; and &quot;as available&quot; basis, without warranty of uninterrupted dispatch server availability, telecommunications uptime, or GPS accuracy.</li>
            <li>Boraine Tech (Pty) Ltd shall not be liable for indirect, incidental, punitive, or consequential damages arising out of vehicle accidents, personal injury, property loss, or trip delays during transportation performed by independent drivers. All transport claims are governed by the driver&apos;s commercial passenger liability insurance and the Road Accident Fund (RAF Act No. 56 of 1996).</li>
            <li>Nothing in these terms limits or excludes any statutory liability that cannot legally be limited or excluded under South African law.</li>
          </ul>
        </section>

        {/* Section 7: Account Termination & Suspension */}
        <section className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <AlertTriangle size={20} className="text-emerald-400" />
            7. Termination &amp; Suspension
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            SOLO reserves the right to suspend or permanently terminate driver or rider platform accounts in instances of:
          </p>
          <ul className="text-sm text-zinc-300 space-y-1.5 list-disc list-inside leading-relaxed">
            <li>Submission of forged, fraudulent, or expired KYC credentials.</li>
            <li>Threats, verbal abuse, harassment, or physical violence toward any community member.</li>
            <li>Refusal to accept card/cash payments in accordance with platform policies.</li>
            <li>Repeated non-payment or chargebacks of the monthly driver SaaS subscription fee.</li>
          </ul>
        </section>

        {/* Section 8: Privacy & POPIA Cross-Reference */}
        <section className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Lock size={20} className="text-emerald-400" />
            8. Privacy Policy &amp; Data Rights
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Your use of SOLO is also governed by our statutory{' '}
            <Link href="/privacy" className="text-emerald-400 font-bold underline hover:text-emerald-300">
              Privacy Policy &amp; POPIA Statement
            </Link>
            . We process personal information strictly in accordance with POPIA Act No. 4 of 2013 and never sell your data to third parties.
          </p>
        </section>

        {/* Section 9: Inquiries & Operator Contact */}
        <section className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <HelpCircle size={20} className="text-emerald-400" />
            9. Legal Notices &amp; Operator Contact
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            For contractual questions, dispute escalations, or official legal notices:
          </p>
          <div className="text-sm text-zinc-300 space-y-1">
            <p><strong>Boraine Tech (Pty) Ltd</strong></p>
            <p>Managing Director: Allan Boraine</p>
            <p>Cape Town / Kimberley, Republic of South Africa</p>
            <p>Email: <a href="mailto:allanboraine@gmail.com" className="text-emerald-400 hover:underline">allanboraine@gmail.com</a></p>
          </div>
        </section>

        {/* Footer Navigation */}
        <div className="pt-6 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-400">
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-emerald-400 transition underline underline-offset-2">
              Privacy Policy &amp; POPIA
            </Link>
            <span>•</span>
            <Link href="/manual" className="hover:text-emerald-400 transition underline underline-offset-2">
              Operational SOP
            </Link>
            <span>•</span>
            <Link href="/" className="hover:text-emerald-400 transition underline underline-offset-2">
              SOLO Home
            </Link>
          </div>
          <span>&copy; 2026 Boraine Tech (Pty) Ltd. All rights reserved.</span>
        </div>
      </div>
    </div>
  );
}
