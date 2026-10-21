# SOLO PLATFORM OPERATIONAL MANUAL
### Standard Operating Procedures (SOP) & Platform Guidelines
**Jurisdiction:** Republic of South Africa  
**Applicable Statutes:** National Land Transport Act (Act No. 5 of 2009), Protection of Personal Information Act (POPIA Act No. 4 of 2013), Value-Added Tax Act (Act No. 89 of 1991), Consumer Protection Act (Act No. 68 of 2008), South African Reserve Bank (SARB) National Payment System Directives  
**Document Version:** 2.1 (Direct In-Vehicle Fare Settlement & Security-Hardened Master Release)  
**Classification:** Operational Policy & User Manual  

---

## Executive Summary & Core Philosophy

**SOLO** is an enterprise-grade, peer-to-peer digital e-hailing platform engineered and built by **Boraine Tech (Pty) Ltd** specifically for the South African transport ecosystem. Unlike traditional legacy aggregator platforms that deduct between 20% and 30% commission from driver earnings and lock earnings in platform escrow, SOLO operates on a **Pure Zero-Commission Model (0.0% Take-Rate)** with **Direct In-Vehicle Trip Settlement**.

```
+-------------------------------------------------------------+
|                      COMMISSION COMPARISON                  |
+-------------------------------------------------------------+
|  Legacy Platforms:   R100 Fare --> Platform takes R25 - R30 |
|                      Driver receives only R70 - R75         |
|                      Platform holds funds; weekly payouts   |
+-------------------------------------------------------------+
|  SOLO Platform:      R100 Fare --> Driver receives R100.00  |
|                      Platform takes: R0.00 (0.0%)           |
|                      Paid DIRECTLY to Driver (Cash or POS)  |
|                      Driver pays flat: R499.00 / month      |
+-------------------------------------------------------------+
```

### Key Architectural Pillars
1. **100% Direct Fare Retention for Drivers:** Drivers retain 100% of the metered gross fare calculated per trip (R12 base fare + R8/km, subject to an R25 minimum fare threshold). Fares are collected **directly by the driver from the passenger in the vehicle** via **Cash** or **In-Vehicle Mobile Card Machine / Speedpoint** (or optional in-app card settlement).
2. **Predictable Flat-Rate SaaS Subscription:** Drivers pay a flat monthly platform access fee of **R499.00 ZAR** after an initial **7-day unrestricted trial**, eliminating volatile revenue docking. Platform founder Allan Boraine (`allanboraine@gmail.com`) holds lifetime free access.
3. **Hardware Payment Freedom:** Drivers are free to use any portable South African point-of-sale card machine (Yoco, iKhokha, Nedbank PocketPOS, Capitec, ABSA/FNB speedpoint) or accept physical cash (ZAR banknotes and coins). SOLO never withholds driver funds in platform escrow.
4. **Single-Device Active Concurrency Policy:** Drivers must and can only be active online on ONE device at a time, enforcing physical driver authentication, preventing account credential sharing, and protecting passenger safety.
5. **Multi-Driver Ride Availability on Decline:** When a driver declines a ride request, the trip remains in the active dispatch pool for all other nearby registered online drivers, ensuring riders are never stranded.
6. **Native Device Notification Alerts & Dispatch Acoustic Chime:** Integrates with native mobile device notification settings allowing drivers to set their own alert tones directly on their smartphone, accompanied by synthesized acoustic chimes and tactile haptic vibration.
7. **South African Banking Integration:** Direct bank payout recipient creation using standard 6-digit South African universal clearing branch codes (FNB, Standard Bank, Capitec, Nedbank, ABSA, Investec, TymeBank, African Bank, Discovery) for driver speedpoint settlements and subscription management.
8. **Mandatory 4-Digit Anti-Impersonation PIN:** Every trip requires real-time physical confirmation of a cryptographic 4-digit PIN between rider and driver before the trip state transitions to `in_progress`.
9. **SARS Tax & NLTA Regulatory Transparency:** Built-in automated tax invoicing complying with SARS Section 11(2) statutory disclosures (logging cash, card machine, or digital payment methods), and strict document verification matching South African National Land Transport regulations (PrDP and Roadworthy certification).
10. **Zero-Cost WhatsApp Click-to-Verify Authentication:** Seamless rider onboarding via deep-linked WhatsApp verification (`wa.me`) with zero reliance on paid SMS gateways.
11. **POPIA Compliance & Cryptographic Security Architecture:** Cryptographically signed administrative session cookies (`s:<payload>.<sig>`), strict Row Level Security (RLS) over driver KYC documentation, telephone number masking on real-time geohash broadcasts, and authenticated SOS distress logging.
12. **Network Dead-Zone & Mobile Browser Optimization:** Progressive Web Application (PWA) optimized for Android Chrome, Samsung Internet browser, and iOS Safari, with Mapbox tile caching, offline incident protocols, and emergency telephonic speed-dials (`10111`, `10177`, `112`).

---

## Table of Contents
1. [Section A: Rider Operations & Handbook](#section-a-rider-operations--handbook)
   - 1.1 Account Registration & Zero-Cost WhatsApp Verification
   - 1.2 PWA Mobile Installation (Android, Samsung Internet & iOS)
   - 1.3 Booking a Ride & Commercial Map Routing
   - 1.4 Driver Matching, 15km PostGIS Radius & Multi-Driver Decline Availability
   - 1.5 Boarding Safety & The 4-Digit Security PIN
   - 1.6 In-Trip Experience & Live Chat
   - 1.7 In-Vehicle Direct Payment Settlement (Cash, Card Machine & In-App Card)
   - 1.8 Tax Invoices & Downloadable PDF Receipts
   - 1.9 Emergency Protocol & Cellular Dead-Zone Safety
2. [Section B: Driver Operations & Partner Guide](#section-b-driver-operations--partner-guide)
   - 2.1 Driver Onboarding & Statutory Requirements (NLTA)
   - 2.2 KYC Document Submission Protocol & System Resilience
   - 2.3 SaaS Subscription Model (7-Day Trial & R499/mo)
   - 2.4 South African Banking Setup & Mobile Card Machine Integration
   - 2.5 Single-Device Active Concurrency Enforcement
   - 2.6 Daily Operating Routine & Trip Rejection Handling
   - 2.7 Driver Notification Alerts & Native Mobile Device Sound Customization
   - 2.8 Mobile Ergonomics & Samsung Internet Optimization
   - 2.9 Arrival, Rider Identification, PIN Validation & Direct Payment Collection
   - 2.10 Fare Structure, Zero Commission Economics & Direct Cash/Card Liquidity
   - 2.11 Vehicle Standards & Regulatory Inspections
   - 2.12 Driver Tax Guidance (SARS Independent Contractor)
3. [Section C: Administrator Operations & Governance](#section-c-administrator-operations--governance)
   - 3.1 Administrative Access, Cryptographic Sessions & Security Architecture
   - 3.2 Driver Compliance & Document Review Engine (`/admin/compliance`)
   - 3.3 Verification Decision Matrix & Statutory Rejection Codes
   - 3.4 Interactive Dual-Window Simulator (`/admin/simulator`)
   - 3.5 Paystack SaaS Billing Telemetry & Webhook Security
   - 3.6 PostGIS Geospatial Engine, Concurrency & Proximity Matching
   - 3.7 Web Push Notification Infrastructure
   - 3.8 Dispute Resolution, Fraud Prevention & Incident Escalation
4. [Appendix: South African Banking & Statutory Directory](#appendix-south-african-banking--statutory-directory)

---

# Section A: Rider Operations & Handbook

### 1.1 Account Registration & Zero-Cost WhatsApp Verification
SOLO utilizes instant passwordless authentication anchored to the South African E.164 telecommunications standard.
- **Accepted Mobile Number Formats:**
  - Local format: `082 123 4567` or `071 987 6543`
  - National format: `27821234567`
  - International format: `+27 82 123 4567`
- **Verification Flow (Zero-Cost WhatsApp Click-to-Verify):**
  1. Rider inputs their full name and South African mobile number in the login modal or at `/rider/login`.
  2. The system formats the number into the international E.164 standard (`+27...`).
  3. A 6-digit cryptographic verification passcode and a direct **WhatsApp Deep-Link (`wa.me`)** are generated instantly. This operates with zero reliance on paid SMS gateways (no Twilio costs or carrier delivery delays).
  4. Riders tap **"Open WhatsApp (`wa.me`) & Auto-Fill Code"** to confirm their identity over cellular data or Wi-Fi.
  5. Upon confirming the passcode, an authenticated rider session and profile are securely stored in browser storage.

### 1.2 PWA Mobile Installation (Android, Samsung Internet & iOS)
SOLO is engineered as a high-performance Progressive Web Application, eliminating heavy app store downloads and ensuring instant updates.

#### Android & Samsung Internet Installation:
1. Open the platform domain in **Google Chrome** or **Samsung Internet**.
2. An automatic banner prompts: **"Install SOLO App — Add to Home Screen for 1-tap bookings & offline trip safety"**.
3. Tap **"Install Now"** (or in Samsung Internet, tap the Menu icon $\rightarrow$ **"Add page to"** $\rightarrow$ **"App screen"**).
4. The SOLO application icon is pinned to your home screen, running full-screen with native hardware acceleration and zero browser address bar clutter.

#### iOS Safari Installation (iPhone & iPad):
1. Navigate to the platform domain in **Apple Safari**.
2. Tap the **Share** button (box with an upward arrow) in the Safari toolbar.
3. Scroll down and select **"Add to Home Screen"**.
4. Confirm by tapping **"Add"** in the top-right corner.
5. Launch SOLO directly from your iOS home screen in standalone full-screen mode.

### 1.3 Booking a Ride & Commercial Map Routing
SOLO integrates Mapbox Commercial Geocoding and Matrix Routing, designed specifically for South African street addresses, complexes, and formal erf/stand references.
- **Upfront Transparent Pricing:**
  $$\text{Fare (ZAR)} = \max\left(\text{R25.00}, \text{R12.00} + [\text{Distance in km} \times \text{R8.00}]\right)$$
- **Guaranteed Beat-The-Competition Pricing:** No surge gouging, no hidden booking fees, and no per-minute traffic penalties. A 6.2 km trip between Camps Bay and the V&A Waterfront costs exactly **R62.00** standard (under-cutting Bolt and Uber by 20% to 35%).

### 1.4 Driver Matching, 15km PostGIS Radius & Multi-Driver Decline Availability
1. When you tap **"Request SOLO Ride"**, the PostGIS spatial engine queries for verified, online drivers within a **15-kilometer radius**.
2. **Multi-Driver Ride Availability on Decline:** If a nearby driver is unable to accept your request and taps "Decline", your ride is **not cancelled**. It remains actively available in the dispatch pool for all other online drivers in your area, guaranteeing continuous matching opportunities without rider inconvenience.
3. As soon as a driver accepts, you receive their full name, vehicle make, model, color, licence plate number, and live real-time GPS tracking on the map.

### 1.5 Boarding Safety & The 4-Digit Security PIN
> [!IMPORTANT]
> **CRITICAL PASSENGER SAFETY PROTOCOL:**
> Every requested trip generates an anti-impersonation 4-digit PIN (e.g. `4892`).
> When the vehicle arrives:
> 1. Check the vehicle make, model, and licence plate number against your screen.
> 2. Open the passenger door and ask the driver to confirm your name.
> 3. Provide your 4-digit safety PIN to the driver. The driver terminal physically cannot start the trip meter until this PIN is entered correctly.
> 4. Never enter an unverified vehicle or one where the driver asks you to bypass PIN entry.

### 1.6 In-Trip Experience & Live Chat
- **Live Telematics:** Track your vehicle along the optimal route with turn-by-turn progression.
- **In-App Encrypted Chat:** Coordinate pickup details (e.g. *"Waiting at gate 2 opposite the pharmacy"*) with real-time delivery and message deduplication.

### 1.7 In-Vehicle Direct Payment Settlement (Cash, Card Machine & In-App Card)
In accordance with SOLO's pure 0% commission philosophy, **riders pay the driver directly** upon arrival at the destination. SOLO does not intercept or hold trip funds in platform escrow, eliminating middleman platform markups:

1. **Option 1: Cash (ZAR Banknotes & Coins):**
   - Riders can settle the exact metered fare in South African Rand banknotes and coins.
   - Drivers carry standard float change for round-figure denominations (e.g. tendering change for R100 or R200 banknotes).
   - Once cash is handed to the driver, the driver confirms receipt on their terminal and marks the trip completed.

2. **Option 2: In-Vehicle Mobile Card Machine / Speedpoint (Tap to Pay / Chip & PIN):**
   - Drivers operate portable mobile card machines (speedpoints) such as **Yoco Go / Neo**, **iKhokha Mover / Pro**, **Nedbank PocketPOS**, **Capitec**, **ABSA**, or **FNB speedpoints**.
   - Riders can settle using any South African or international debit or credit card (Visa, Mastercard, American Express).
   - **Contactless & Mobile Wallets Supported:** Drivers' mobile terminals support NFC Tap to Pay, Apple Pay, Google Wallet, Samsung Pay, and Garmin Pay directly from your smartphone or smartwatch.
   - Once the card machine prints or displays "Approved", the driver confirms payment on the SOLO driver app.

3. **Option 3: In-App Digital Card Settlement (Paystack Fallback):**
   - For riders preferring completely in-app digital settlement, payments are processed via Paystack's bank-grade 256-bit SSL encrypted gateway supporting 3D-Secure authentication and Instant EFT.
   - In-app payment amounts are verified server-side against the exact database trip fare before the ride status is finalized.

> [!NOTE]
> Regardless of whether you pay by Cash, Mobile Card Machine, or In-App Card, you receive the exact same non-surge metered trip price with zero platform markup and an immediate SARS Section 11(2) compliant tax invoice at `/receipt/[tripId]`.

### 1.8 Tax Invoices & Downloadable PDF Receipts
Upon trip completion, riders immediately receive access to a SARS Section 11(2) compliant tax invoice at `/receipt/[tripId]`. Features include:
- Unique SARS Tax Invoice reference number (e.g. `SOLO-INV-2026-XXXX`).
- Itemized breakdown of base flag-fall, distance, and 0% platform commission.
- One-click **Print / Download PDF Receipt** button formatted for business expense claims.

### 1.9 Emergency Protocol & Cellular Dead-Zone Safety
If a vehicle enters a cellular dead-zone (mountain passes, basements, or remote routes), the PWA engages offline resilience mode. The trip safety bar displays 1-tap cellular emergency calling:
- **South African Police Service (SAPS Flying Squad):** `10111`
- **National Ambulance & Fire Service:** `10177`
- **Universal Cellular Emergency SOS (Free from any mobile phone):** `112`

---

# Section B: Driver Operations & Partner Guide

### 2.1 Driver Onboarding & Statutory Requirements (NLTA)
In compliance with the **National Land Transport Act (Act No. 5 of 2009)**, every driver partner on the SOLO platform registers as an independent transport provider holding four statutory credentials:
1. **South African Driving Licence (Front & Back):** Valid Code B, EB, or C1 card licence.
2. **Professional Driving Permit (PrDP - Category P):** Valid passenger transport endorsement. Goods-only (Category G) or expired permits are ineligible.
3. **Vehicle Certificate of Roadworthiness (CoR):** Issued by an accredited vehicle test station within the preceding six (6) months.
4. **Vehicle Registration Document (RC1) & Commercial Insurance:** Registration document matching licence plates and proof of commercial passenger liability cover.

### 2.2 KYC Document Submission Protocol & System Resilience
1. Navigate to `/driver/register` on mobile or desktop.
2. Complete your personal details (Full Name, Phone Number, Vehicle Make/Model/Year, Licence Plate).
3. Upload photographs or PDF scans of the four required documents using the **KYC Document Uploader**:
   - Documents are uploaded directly to the encrypted `driver-documents` storage bucket.
   - The platform utilizes resilient database user-provisioning triggers to prevent registration lockouts.
4. Once submitted, your profile enters the verification queue with status `pending`.

### 2.3 SaaS Subscription Model (7-Day Trial & R499/mo)
SOLO replaces predatory percentage commissions with a transparent, predictable flat-rate Software-as-a-Service model.

| Metric | Traditional Aggregators (25% Commission) | SOLO Zero-Commission (R499/mo SaaS) | Driver Financial Advantage |
| :--- | :--- | :--- | :--- |
| **Gross Monthly Fares** | R20,000.00 | R20,000.00 | Equal |
| **Platform Deduction** | **-R5,000.00 (25%)** | **-R499.00 (Flat Fee)** | **+R4,501.00 extra cash in pocket** |
| **Net Driver Earnings** | R15,000.00 | **R19,501.00** | **+30.0% Net Increase** |
| **Trial Period** | None (Immediate commission cut) | **7 Days Free** | Zero initial financial commitment |

- **7-Day Free Trial:** Approved drivers receive 7 days of unlimited dispatch with R0 platform charges.
- **Monthly Subscription:** After 7 days, platform access is maintained for **R499.00 per month** billed automatically via Paystack.
- **Platform Founder & Lifetime Exemption Policy:** Platform founder Allan Boraine (`allanboraine@gmail.com`) holds lifetime free access to SOLO Driver Pro with zero subscription charges and permanent 0% commission.

### 2.4 South African Banking Setup & Mobile Card Machine Integration
SOLO drivers are independent transport entrepreneurs who maintain full sovereignty over their earnings. The platform facilitates direct banking integration and recommends standard portable mobile card machines (speedpoints) for in-vehicle card payments:

1. **South African Universal Clearing Codes:**
   SOLO automatically validates and populates the official 6-digit universal clearing branch codes for all major South African banking institutions:
   - **Standard Bank:** `051001` (9-11 digit account)
   - **First National Bank (FNB):** `250655` (10-11 digit account)
   - **Capitec Bank:** `470010` (10 digit account)
   - **Nedbank:** `198765` (10 digit account)
   - **ABSA Bank:** `632005` (10 digit account)
   - **Investec Bank:** `580105` (11 digit account)
   - **TymeBank:** `678910` (10 digit account)
   - **African Bank:** `430000` (10-11 digit account)
   - **Discovery Bank:** `679000` (10 digit account)

2. **Recommended Mobile Card Machines (In-Vehicle Speedpoints):**
   Drivers can acquire any accredited, portable South African card machine to receive card payments directly from passengers in the vehicle:
   - **Yoco (Yoco Go, Neo, or Khumo):** Instant setup, Bluetooth/standalone SIM, deposits directly into your South African bank account within 1-2 business days.
   - **iKhokha (Mover Pro, Flyer):** Standalone 4G/Wi-Fi speedpoint with built-in thermal receipt printer or digital SMS slips.
   - **Nedbank PocketPOS / Capitec POS / ABSA / FNB Speedpoint:** Bank-issued mobile terminals linking directly to your business account.
   - All terminals support EMV Chip & PIN, Visa, Mastercard, American Express, and contactless Tap to Pay (Apple Pay, Google Pay, Samsung Pay).

> [!NOTE]
> Bank accounts are masked across all views (`••••••4829`) to preserve POPIA privacy. Account holder name must match the driver's registered legal identity. Platform SaaS subscription fees (R499/mo) are managed via Paystack debit against this profile.

### 2.5 Single-Device Active Concurrency Enforcement
To prevent fraudulent account sharing, phantom driver tracking, and multi-phone confusion, SOLO strictly enforces a **Single-Device Active Duty Rule**:
1. **1 Driver = 1 Active Online Device:** A driver account can only be active online on a single phone or browser at any given time.
2. **Device Hardware Fingerprinting:** Every device running the SOLO Driver app generates a persistent, unique device identifier (`solo_driver_device_id`).
3. **Session Preemption Protocol:**
   - If Driver John goes online on **Phone A**, Phone A holds active online duty.
   - If John subsequently opens the app and taps "Go Online" on **Phone B**, the platform central registry transfers active session ownership to Phone B.
   - **Phone A is immediately preempted:** Phone A's screen automatically toggles offline, displays a clear notification (*"Signed out of active duty: your driver account went online from another device"*), and is barred from receiving dispatches or transmitting GPS telemetry until re-authorized.
4. **Voluntary Sign-Off Isolation:** When a driver goes offline on Device B, Device B releases its active session cleanly without ghosting or interfering with any other devices.

### 2.6 Daily Operating Routine & Trip Rejection Handling
1. **Launch App:** Open the SOLO Driver PWA on your smartphone.
2. **Go Online:** Tap the green **"Go Online"** switch (this also primes your device's audio alert engine).
3. **Dispatch Notification:** When a rider within 15 km requests a ride, your device sounds your selected alert tone and triggers haptic vibration.
4. **Review Trip Details:** The dispatch card displays:
   - Pickup location and distance to passenger.
   - Destination address.
   - Estimated travel duration.
   - **Guaranteed Gross Fare (in ZAR)**.
5. **Accept or Decline:**
   - Tap **"Accept Trip"** within 30 seconds to lock in the booking and receive turn-by-turn navigation.
   - **Decline Trip:** If you are unable to take the trip, tap **"Decline"**. The request will be dismissed from your screen immediately, while **remaining available in the dispatch pool for other registered drivers in your area**.

### 2.7 Driver Notification Alerts & Native Mobile Device Sound Customization
To provide drivers with maximum flexibility and reliable alert delivery in vehicle environments, SOLO integrates directly with your mobile device's native notification and audio system:

1. **Native Mobile Device Notification Tones:**
   - Drivers can choose and customize their alert sounds directly within their mobile operating system settings (Android Settings $\rightarrow$ Apps / Notifications $\rightarrow$ Chrome / Samsung Internet / SOLO $\rightarrow$ Notification sound, or iOS Settings $\rightarrow$ Notifications).
   - Any ringtone, alert tone, or custom sound file saved on your phone can be designated as the SOLO dispatch tone by configuring your browser or PWA notification category.

2. **Foreground Acoustic Dispatch Chime:**
   - When the SOLO Driver app is actively open in the foreground, incoming trips trigger a synthesized high-visibility chime (D5 $\rightarrow$ A5 $\rightarrow$ D6) generated via the device's hardware Web Audio API.

3. **Tactile Haptic Vibration Pattern:**
   - Every incoming trip dispatch activates a distinct tactile vibration pattern (`[250ms vibrate, 100ms pause, 250ms vibrate, 100ms pause, 450ms vibrate]`) on supported mobile devices to immediately alert the driver even in noisy road conditions.

4. **Service Worker Push Notifications:**
   - System dispatches are routed through high-priority Service Worker notifications (`requireInteraction: true`, `renotify: true`), ensuring your phone rings and vibrates with your chosen native notification sound even when the driver app is running in the background.

### 2.8 Mobile Ergonomics & Samsung Internet Optimization
The SOLO Driver interface is optimized for in-vehicle mounting on modern smartphones:
- **Centered Navigation Bar:** Bottom navigation buttons are centered with generous touch padding for safe, one-handed thumb interaction while docked in a dashboard phone cradle.
- **Samsung Internet & Dynamic Viewport Units (`dvh`):** Layouts use dynamic viewport calculations so browser address bars and Samsung One UI navigation pills never occlude dispatch cards or action buttons.
- **Collapsible Radar Sheet:** Swipe down to view the full-screen GPS dispatch radar, or swipe up to inspect earnings and trip history.

### 2.9 Arrival, Rider Identification, PIN Validation & Direct Payment Collection
1. **Navigate to Pickup:** Follow live routing to the passenger's pickup pin.
2. **Tap "I Have Arrived":** When within 50 meters, tap **"I Have Arrived"** to trigger an automatic passenger push alert.
3. **Verify Passenger & Request PIN:** Greet the passenger and request: *"Please provide your 4-digit SOLO safety PIN."*
4. **Enter PIN:** Type the 4 digits into your driver terminal:
   - If verified: The meter starts and turn-by-turn navigation to the destination begins.
   - If incorrect: Re-confirm with the passenger. The meter will not start without cryptographic PIN validation.
5. **Destination Arrival & Direct Fare Collection Protocol:**
   - Upon bringing the vehicle to a safe halt at the destination, tap **"Arrived at Destination"**.
   - The driver terminal displays the exact gross metered fare (e.g. **R62.00**) and prompts for payment confirmation.
   - **Step-by-Step Payment Collection by Method:**
     - **If Passenger Pays by Cash:**
       1. Request the metered amount from the passenger.
       2. Receive cash banknotes and tender change from your cash float if required.
       3. Tap **"Cash Payment Received"** on your screen.
     - **If Passenger Pays by In-Vehicle Card Machine / Speedpoint:**
       1. Key the trip fare (e.g. R62.00) into your portable card machine (Yoco, iKhokha, Nedbank PocketPOS, etc.).
       2. Present the speedpoint to the passenger to tap or insert their bank card, or tap their smartphone (Apple Pay / Google Wallet / Samsung Pay).
       3. Once your card machine displays **"Approved"** or prints the merchant slip, tap **"Card Machine Payment Received"** on your screen.
     - **If Passenger Uses In-App Card Settlement:**
       1. For trips pre-selected for digital in-app payment, the transaction is processed via Paystack and verified against the database fare.
   - **Tap "Complete Trip":** The trip state transitions to `completed`, releasing your vehicle back to `available` status for the next dispatch. The passenger immediately receives their digital SARS tax invoice at `/receipt/[tripId]`.

### 2.10 Fare Structure, Zero Commission Economics & Direct Cash/Card Liquidity
SOLO operates on a transparent, time-regulated fare structure designed to maintain strong passenger demand while maximizing driver net take-home earnings during peak and unsociable hours:
- **Base Flag-Fall Fare:** R12.00
- **Rate per Kilometer:** R8.00 / km
- **Minimum Trip Fare:** R25.00
- **Platform Take-Rate:** **R0.00 (0.0% Commission)**

#### Time-of-Day (TOD) Dynamic Tariff Schedule:
To balance passenger demand and incentivize driver road availability during rush hours and late-night safety periods, fares are automatically regulated by scheduled time windows:
1. **Morning Rush (06:30 – 08:30):** **+15% (1.15×)** — Accommodates heavy morning commuter and school drop-off traffic.
2. **Daytime Standard (08:30 – 16:30):** **1.0× (Standard)** — Predictable baseline rate (`R12 base + R8/km`, min R25).
3. **Evening Commute (16:30 – 18:30):** **+15% (1.15×)** — Accommodates peak home-bound commuting traffic.
4. **Evening Standard (18:30 – 22:00):** **1.0× (Standard)** — Baseline rate for dinner, retail, and leisure trips.
5. **Night Owl & Safety (22:00 – 05:00):** **+25% (1.25×)** — Compensates drivers for late-night risk, fuel station scarcity, and safety vigilance, preventing late-night passenger stranding.
6. **Early Dawn (05:00 – 06:30):** **1.0× (Standard)** — Early morning transport and airport/rail connections.

$$\text{Driver Earnings per Trip} = 100\% \times \text{Metered Dynamic Fare Charged to Passenger}$$

#### Competitor Fare & Driver Take-Home Benchmark:

| Trip Type / Distance | SOLO Rider Pays | Bolt Go Rider Pays | UberX Rider Pays | SOLO Driver Net (0% Take) | Bolt Driver Net (~22% Deduct) | Uber Driver Net (25% Deduct) | Rider Saves vs Legacy | Driver Earns vs Legacy |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Short Hop (2.0 km)** | **R28.00** | ~R34.00 | ~R42.00 | **R28.00** | R26.50 | R31.50 | **-18% to -33%** | +6% vs Bolt |
| **City Trip (5.0 km)** | **R52.00** | ~R65.00 | ~R88.00 | **R52.00** | R50.70 | R66.00 | **-20% to -41%** | +3% vs Bolt |
| **Cross-Town (10.0 km)**| **R92.00** | ~R115.00 | ~R150.00 | **R92.00** | R89.70 | R112.50 | **-20% to -39%** | +3% vs Bolt |
| **Airport / Long (25.0 km)**| **R212.00** | ~R255.00 | ~R320.00 | **R212.00** | R198.90 | R240.00 | **-17% to -34%** | +7% vs Bolt |
| **Peak Surge (10 km)** | **R106.00** (+15%) | ~R160.00 (1.4×) | ~R225.00 (1.5×) | **R106.00** | R124.80 | R168.75 | **-34% to -53%** | Massive Rider Influx |

#### Immediate Liquidity Advantage:
- **Zero Commission Deductions:** Unlike legacy e-hailing apps that deduct 25% or more from every trip, you keep every single Rand of the fare.
- **Immediate Cash in Hand:** Cash payments stay 100% in your wallet immediately with zero delays, zero platform processing fees, and zero banking transfer charges.
- **Direct Card Machine Deposits:** Payments collected through your mobile card machine (Yoco, iKhokha, or bank POS) deposit directly into your designated South African bank account under your card provider's schedule (e.g., next business day), completely bypassing platform escrow.
- **No Escrow Withholding or Payout Delays:** SOLO does not hold your trip money in platform escrow, eliminating payout disputes, weekly payout delays, or arbitrary payment freezes.
- **Predictable Fixed Cost:** Your only platform cost is the flat **R499.00 / month** SaaS subscription fee (free for the first 7 days, and permanently free for platform founder Allan Boraine).

### 2.11 Vehicle Standards & Regulatory Inspections
Partner vehicles must comply with South African passenger transport standards:
- Maximum vehicle age: 10 years from date of manufacture.
- 4 operational passenger doors with internal and external handles.
- Fully functional air conditioning, heating, and seatbelts for all seating positions.
- Clean interior upholstery free of damage.
- Spare wheel, jack, and emergency warning triangle in boot.

### 2.12 Driver Tax Guidance (SARS Independent Contractor)
SOLO driver partners operate as independent micro-entrepreneurs under South African law:
- **Gross Revenue Invoicing:** Drivers receive 100% of collected fares. Fares represent gross turnover.
- **SARS Allowable Business Deductions:** Drivers can claim business deductions against their gross income, including:
  - Fuel and oil expenditure
  - Vehicle maintenance, servicing, and tyre replacements
  - Commercial vehicle insurance premiums
  - Smartphone cellular data used for navigation
  - SOLO platform SaaS subscription fee (R499/mo)
  - Vehicle financing interest and capital depreciation allowances
- **Simplified Tax:** Drivers with annual turnover below R1,000,000 can register for **Turnover Tax** with SARS for simplified, low-rate tax obligations.

---

# Section C: Administrator Operations & Governance

### 3.1 Administrative Access, Cryptographic Sessions & Security Architecture
The SOLO Administration suite provides central oversight of fleet compliance, geospatial dispatch parameters, financial reconciliation, and dispute resolution, fortified by enterprise-grade cryptographic security:
- **Primary Routes:**
  - Compliance Engine: `/admin/compliance`
  - Dual-Window Simulator: `/admin/simulator`
- **HMAC-SHA256 Signed Session Cookies:**
  - Admin authentication does not rely on easily forged client state. Administrative cookies are formatted as cryptographically signed tokens `s:<payload>.<sig>` using a secret HMAC-SHA256 signing key (`adminAuth.ts`).
  - Tampered, expired, or unsigned cookies are rejected immediately with HTTP 401 Unauthorized.
- **Administrative Email Allowlist Domain Enforcement:**
  - Administrative session creation is restricted to authorized email identities (`isAuthorizedAdminEmail`), strictly preventing unauthorized privilege elevation even if authentication credentials are leaked. Platform founder Allan Boraine (`allanboraine@gmail.com`) is permanently authorized.
- **POPIA-Compliant Row-Level Security (RLS):**
  - Supabase database tables and the `driver-documents` storage bucket enforce strict Row-Level Security under the Protection of Personal Information Act (POPIA Act No. 4 of 2013). Drivers can only access their own documents, while only authenticated administrators can view applicant records via ephemeral 1-hour signed URLs (`createSignedUrl(path, 3600)`).
- **Public WebSocket Telemetry & Telematics Privacy:**
  - Live driver location broadcasts over WebSocket channels mask driver mobile numbers (`082***4567`), eliminating eavesdropping or telematics surveillance risks.
- **SOS & Safety Distress Access Control:**
  - Emergency SOS monitoring endpoints (`/api/safety/sos`) require valid administrative authentication (`validateAdminRequest`), safeguarding passenger and driver distress telemetry against unauthorized scraping.
- **Trip Completion & Driver Authorization Guards:**
  - Endpoints concluding rides (`/api/trips/complete`) strictly verify driver session authorization (`validateDriverAuthorization`), block replay attempts on already completed trips, and ensure ride states transition predictably.

### 3.2 Driver Compliance & Document Review Engine (`/admin/compliance`)
The compliance dashboard displays real-time applicant telemetry:
- **Total Drivers:** Cumulative fleet registrations.
- **Pending Review:** Applications awaiting document review.
- **Verified & Active:** Approved drivers eligible for dispatch.
- **Action Needed:** Drivers with expired or rejected documentation.

### 3.3 Verification Decision Matrix & Statutory Rejection Codes
To comply with POPIA, documents are viewed via **1-hour ephemeral signed URLs** (`createSignedUrl(path, 3600)`). When rejecting documents, administrators use standardized statutory codes:

| Document Type | Verification Criteria | Rejection Preset Code | Corrective Action Prompt |
| :--- | :--- | :--- | :--- |
| **Driver's Licence** | Valid Code B/EB/C1, clear photo, unexpired, matching name. | `EXPIRED_CARD` / `BLURRY_IMAGE` / `NAME_MISMATCH` | "Please upload a clear photograph of your unexpired South African driving licence card." |
| **PrDP Endorsement** | Must be Category P (Passenger) and unexpired. | `NO_PRDP_ENDORSEMENT` / `PRDP_EXPIRED` | "Your licence lacks an active Category P (Passenger) PrDP endorsement as required by the NLTA." |
| **Roadworthy Certificate (CoR)** | Issued by accredited station, valid VIN, dated within 6 months. | `ROADWORTHY_EXPIRED` / `VIN_MISMATCH` | "Certificate of Roadworthiness must be dated within the last 6 months." |
| **Vehicle Registration (RC1)** | Registration number must match vehicle licence plate on profile. | `PLATE_MISMATCH` / `DOC_ILLEGIBLE` | "Vehicle registration papers must match your vehicle's license plate." |

> **Automated Verification Trigger:** Approving all 4 required documents automatically sets `is_verified = true` and dispatches a Web Push alert welcoming the driver to active duty.

### 3.4 Interactive Dual-Window Simulator (`/admin/simulator`)
The built-in diagnostic simulator enables developers and compliance staff to test complete journeys without field vehicles:
1. **Side-by-Side Dual Frames:** Rider App on the left, Driver Terminal on the right.
2. **South African Metro Presets:**
   - **Cape Town:** Camps Bay Tidal Pool $\rightarrow$ V&A Waterfront (6.2 km, R82.00)
   - **Johannesburg:** Sandton City Mall $\rightarrow$ Rosebank Mall (5.4 km, R74.00)
   - **Durban:** Gateway Theatre of Shopping $\rightarrow$ Florida Road (6.8 km, R88.00)
   - **Pretoria:** Menlyn Park Shopping Centre $\rightarrow$ Hatfield Station (7.1 km, R91.00)
3. **Speed Multipliers:** Run tests at **1x (Real-Time)**, **2x (Accelerated)**, or **5x (Rapid Validation)**.
4. **5-Minute Telematics Expiration (TTL):** Only drivers with fresh telemetry within the last 5 minutes appear on the rider radar, preventing phantom vehicles.

### 3.5 Paystack SaaS Billing Telemetry & Webhook Security
While individual trip fares are paid directly to drivers via cash or mobile card machines in the vehicle, the platform utilizes Paystack exclusively for the driver flat **R499.00/month** SaaS subscription and optional digital in-app card settlements.

Billing operations are verified cryptographically at `/api/paystack-webhook` using HMAC SHA512 signatures:
$$\text{Signature} = \text{HMAC-SHA512}\left(\text{Payload Body}, \text{PAYSTACK\_SECRET\_KEY}\right)$$

Monitored events:
- `subscription.create`: R499/mo SaaS plan initiated following 7-day trial.
- `subscription.disable`: Subscription paused or cancelled; driver set to `inactive`.
- `invoice.payment_failed`: Billing error; 48-hour grace period initiated before suspension.
- `charge.success`: Trip fare captured for optional in-app digital settlements, verified against database fare amounts via `/api/verify-trip-payment`.

### 3.6 PostGIS Geospatial Engine, Concurrency & Proximity Matching
Matching runs on PostgreSQL PostGIS using spatial indexes and geodesic calculations:

```sql
-- Spatial Query: Discover Active, Online Drivers Within 15km
SELECT id, user_id, current_location, 
       ST_Distance(current_location, ST_SetSRID(ST_MakePoint(rider_lng, rider_lat), 4326)::geography) AS distance_meters
FROM public.driver_profiles
WHERE is_online = TRUE 
  AND is_verified = TRUE 
  AND subscription_status IN ('trialing', 'active')
  AND ST_DWithin(current_location, ST_SetSRID(ST_MakePoint(rider_lng, rider_lat), 4326)::geography, 15000)
ORDER BY distance_meters ASC
LIMIT 10;
```

### 3.7 Web Push Notification Infrastructure
Background notifications adhere to the Web Push Protocol (RFC 8291 / RFC 8292) secured with VAPID keys:
- `DRIVER_DISPATCH`: Sent to nearby drivers with trip pickup address and gross fare.
- `RIDER_ACCEPTED`: Sent to rider when driver accepts, containing vehicle details and 4-digit PIN.
- `DRIVER_ARRIVED`: Sent to rider when vehicle reaches pickup coordinates.
- `PAYMENT_COMPLETED`: Sent to both parties with final fare confirmation.
- **Stale Subscription Purging:** Subscriptions returning HTTP 404 or HTTP 410 are automatically deleted from the database.

### 3.8 Dispute Resolution, Fraud Prevention & Incident Escalation
1. **Audit Logs:** Every trip retains full GPS coordinates, chat records, PIN verification timestamps, and Paystack reference numbers.
2. **Chargeback Defense:** Physical 4-digit PIN confirmation upon boarding provides conclusive proof of passenger presence, protecting drivers against fraudulent "trip not taken" chargeback claims.
3. **Emergency Action:** In safety incidents, administrators can freeze accounts (`is_active = false`) and export telemetry for SAPS law enforcement inquiries.

### 3.9 Rider Customer Service, Lost Property & Emergency Lost Phone Recovery
1. **Zero-Login Lost Phone Recovery (`/lost-phone`):**
   - In the event a passenger leaves their smartphone inside a driver's vehicle, they cannot access in-app chat or receive SMS OTP login verification codes.
   - The public `/lost-phone` portal allows riders, hotel concierges, or friends to submit an emergency lost property claim with zero login requirements.
   - Requires passenger identification, alternative contact number, phone make/model/features, and approximate trip landmarks.
2. **Instant Driver Priority Alert & Chime:**
   - Once a lost property ticket is submitted, the system automatically matches the trip in the database and dispatches a high-priority audio chime and visual dispatch banner (`lost_item_alert`) to the driver's active terminal.
   - Drivers can immediately tap "Call Passenger" or "WhatsApp" to communicate directly with the passenger's alternative contact number without platform intermediary delay.
3. **In-App Rider Help & Resolution Hub:**
   - Passengers can open the Rider Help modal directly from the rider interface or from their trip receipt (`/receipt/[tripId]`).
   - Categorized self-service workflows for fare disputes, driver conduct feedback, SARS-compliant tax receipt downloads, and official WhatsApp Business support escalation (`https://wa.me/27...`).

---

## Appendix: South African Banking & Statutory Directory

### Retail Bank Clearing Codes (Universal Branch Codes)
```
Bank Name          Branch Code   Account Length   Settlement Engine
-------------------------------------------------------------------
Standard Bank      051001        9-11 digits      Paystack NUBAN / EFT
First National     250655        10-11 digits     Paystack NUBAN / EFT
Capitec Bank       470010        10 digits        Paystack NUBAN / EFT
Nedbank            198765        10 digits        Paystack NUBAN / EFT
ABSA Bank          632005        10 digits        Paystack NUBAN / EFT
Investec Bank      580105        11 digits        Paystack NUBAN / EFT
TymeBank           678910        10 digits        Paystack NUBAN / EFT
African Bank       430000        10-11 digits     Paystack NUBAN / EFT
Discovery Bank     679000        10 digits        Paystack NUBAN / EFT
```

### Statutory Regulatory Contacts & Emergency Hotlines
- **South African Police Service (SAPS Flying Squad):** `10111`
- **National Emergency Ambulance & Fire:** `10177`
- **Cellular Emergency SOS (Nationwide from any mobile phone):** `112`
- **Department of Transport (National Land Transport Regulator):** `+27 (0)12 309 3000`
- **South African Revenue Service (SARS Contact Centre):** `0800 00 7277`
- **Information Regulator South Africa (POPIA Compliance):** `complaints.IR@justice.gov.za`

---
*SOLO Platform Operating Manual — Copyright © 2026 Boraine Tech (Pty) Ltd. All Rights Reserved. Built and engineered by Boraine Tech (Pty) Ltd.*
