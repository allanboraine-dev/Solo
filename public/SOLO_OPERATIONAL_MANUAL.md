# SOLO PLATFORM OPERATIONAL MANUAL
### Standard Operating Procedures (SOP) & Platform Guidelines
**Jurisdiction:** Republic of South Africa  
**Applicable Statutes:** National Land Transport Act (Act No. 5 of 2009), Protection of Personal Information Act (POPIA Act No. 4 of 2013), Value-Added Tax Act (Act No. 89 of 1991), Consumer Protection Act (Act No. 68 of 2008)  
**Document Version:** 2.0 (High-Concurrency & Operational Master Release)  
**Classification:** Operational Policy & User Manual  

---

## Executive Summary & Core Philosophy

**SOLO** is an enterprise-grade, peer-to-peer digital e-hailing platform engineered specifically for the South African transport ecosystem. Unlike traditional legacy aggregator platforms that deduct between 20% and 30% commission from driver earnings, SOLO operates on a **Pure Zero-Commission Model (0.0% Take-Rate)**.

```
+-------------------------------------------------------------+
|                      COMMISSION COMPARISON                  |
+-------------------------------------------------------------+
|  Legacy Platforms:   R100 Fare --> Platform takes R25 - R30 |
|                      Driver receives only R70 - R75         |
+-------------------------------------------------------------+
|  SOLO Platform:      R100 Fare --> Driver receives R100.00  |
|                      Platform takes: R0.00 (0.0%)           |
|                      Driver pays flat: R499.00 / month      |
+-------------------------------------------------------------+
```

### Key Architectural Pillars
1. **100% Fare Retention for Drivers:** Drivers retain 100% of the metered gross fare calculated per trip (R20 base fare + R10/km, subject to an R30 minimum fare threshold).
2. **Predictable Flat-Rate SaaS Subscription:** Drivers pay a flat monthly access fee of **R499.00 ZAR** after an initial **7-day unrestricted trial**, eliminating volatile revenue docking. Platform founder Allan Boraine (`allanboraine@gmail.com`) holds lifetime free access.
3. **Single-Device Active Concurrency Policy:** Drivers must and can only be active online on ONE device at a time, enforcing physical driver authentication, preventing account credential sharing, and protecting passenger safety.
4. **Multi-Driver Ride Availability on Decline:** When a driver declines a ride request, the trip remains in the active dispatch pool for all other nearby registered online drivers, ensuring riders are never stranded.
5. **Customizable Alert Tones with Silent-Mode Media Channel Bypass:** Dual-Engine audio architecture (persistent HTML5 Media Audio + Web Audio synth) that reliably sounds incoming dispatches through phone speakers or car Bluetooth, even when mobile devices are set to silent or vibrate mode.
6. **South African Banking Integration:** Direct bank payout recipient creation using standard 6-digit South African universal clearing branch codes (FNB, Standard Bank, Capitec, Nedbank, ABSA, Investec, TymeBank, African Bank, Discovery).
7. **Mandatory 4-Digit Anti-Impersonation PIN:** Every trip requires real-time physical confirmation of a cryptographic 4-digit PIN between rider and driver before the trip state transitions to `in_progress`.
8. **SARS Tax & NLTA Regulatory Transparency:** Built-in automated tax invoicing complying with SARS Section 11(2) statutory disclosures, and strict document verification matching South African National Land Transport regulations (PrDP and Roadworthy certification).
9. **Zero-Cost WhatsApp Click-to-Verify Authentication:** Seamless rider onboarding via deep-linked WhatsApp verification (`wa.me`) with zero reliance on paid SMS gateways.
10. **Network Dead-Zone & Mobile Browser Optimization:** Progressive Web Application (PWA) optimized for Android Chrome, Samsung Internet browser, and iOS Safari, with Mapbox tile caching, offline incident protocols, and emergency telephonic speed-dials (`10111`, `10177`, `112`).

---

## Table of Contents
1. [Section A: Rider Operations & Handbook](#section-a-rider-operations--handbook)
   - 1.1 Account Registration & Zero-Cost WhatsApp Verification
   - 1.2 PWA Mobile Installation (Android, Samsung Internet & iOS)
   - 1.3 Booking a Ride & Commercial Map Routing
   - 1.4 Driver Matching, 15km PostGIS Radius & Multi-Driver Decline Availability
   - 1.5 Boarding Safety & The 4-Digit Security PIN
   - 1.6 In-Trip Experience & Live Chat
   - 1.7 Payment Settlement & Card Security
   - 1.8 Tax Invoices & Downloadable PDF Receipts
   - 1.9 Emergency Protocol & Cellular Dead-Zone Safety
2. [Section B: Driver Operations & Partner Guide](#section-b-driver-operations--partner-guide)
   - 2.1 Driver Onboarding & Statutory Requirements (NLTA)
   - 2.2 KYC Document Submission Protocol & System Resilience
   - 2.3 SaaS Subscription Model (7-Day Trial & R499/mo)
   - 2.4 South African Banking Setup & Universal Clearing Codes
   - 2.5 Single-Device Active Concurrency Enforcement
   - 2.6 Daily Operating Routine & Trip Rejection Handling
   - 2.7 Driver Customizable Notification Alert Tones & Audio Engine
   - 2.8 Mobile Ergonomics & Samsung Internet Optimization
   - 2.9 Arrival, Rider Identification & PIN Validation
   - 2.10 Fare Structure & Zero Commission Economics
   - 2.11 Vehicle Standards & Regulatory Inspections
   - 2.12 Driver Tax Guidance (SARS Independent Contractor)
3. [Section C: Administrator Operations & Governance](#section-c-administrator-operations--governance)
   - 3.1 Administrative Access & Security Architecture
   - 3.2 Driver Compliance & Document Review Engine (`/admin/compliance`)
   - 3.3 Verification Decision Matrix & Statutory Rejection Codes
   - 3.4 Interactive Dual-Window Simulator (`/admin/simulator`)
   - 3.5 Paystack Webhook Telemetry & Financial Audits
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
  $$\text{Fare (ZAR)} = \max\left(\text{R30.00}, \text{R20.00} + [\text{Distance in km} \times \text{R10.00}]\right)$$
- **Guaranteed No-Surge Pricing:** No surge pricing multipliers, peak penalties, or booking surcharges are ever applied. A 6.2 km trip between Camps Bay and the V&A Waterfront costs exactly **R82.00**, day or night.

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

### 1.7 Payment Settlement & Card Security
Payments are processed via Paystack's bank-grade 256-bit SSL encrypted gateway supporting 3D-Secure Visa, Mastercard, and Instant EFT. Fare charges are authorized on booking and settled upon physical trip completion.

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

### 2.4 South African Banking Setup & Universal Clearing Codes
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

> [!NOTE]
> Bank accounts are masked in all views (`••••••4829`) to preserve POPIA privacy. Account holder name must match the driver's registered legal identity.

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

### 2.7 Driver Customizable Notification Alert Tones & Audio Engine
Drivers can customize their incoming trip alert chimes to suit their personal vehicle cabin acoustic preferences:

#### Built-in Acoustic Presets:
1. **SOLO Harmony (Default):** Crisp 3-tone ascending harmony (D5 $\rightarrow$ A5 $\rightarrow$ D6).
2. **Radar Sonar Ping:** High-tech double sonar sweep for fast dispatch detection in traffic.
3. **Cash Register Payday:** Bright metallic chime celebrating 100% direct fare retention.
4. **Priority Dispatch Siren:** 4 rapid pulsating high-priority beeps for noisy vehicle environments.
5. **Hotel Reception Bell:** Clear, resonant metallic desk chime with long natural acoustic decay.
6. **Staccato Sparkle:** 4 rapid playful sparkle arpeggio notes (C5 $\rightarrow$ E5 $\rightarrow$ G5 $\rightarrow$ C6).

#### Custom Device Audio:
- Drivers can choose any personal sound file directly from their phone storage (MP3, WAV, M4A, OGG up to 10MB).
- Audio is persisted securely on the device using IndexedDB with instant zero-latency caching.

#### Dual-Engine Audio & Silent Mode Bypass:
> [!TIP]
> **Mobile Silent/Vibrate Bypass:** Drivers frequently keep their smartphones on silent or vibrate. Unlike standard web audio that gets silenced by phone operating systems, SOLO uses a **Dual-Engine Audio Pipeline**:
> - **Primary Media Channel:** A persistent HTML5 Audio element configured for media stream playback (`AVAudioSessionCategoryPlayback`). This outputs incoming trip alerts at full volume through phone speakers or car Bluetooth, **even if the physical mute/vibrate switch is on**.
> - **Secondary Hardware Synth:** Native Web Audio API synthesis with 30ms lookahead scheduling to prevent audio buffer drops.
> - **Volume & Vibration Control:** Includes an on-screen volume slider (0% to 100%) and device haptic vibration pattern (`[250ms vibrate, 100ms pause, 250ms vibrate, 100ms pause, 450ms vibrate]`).
> - **Testing Tones:** Quick "Test Tone" buttons are accessible in the header bar, Home tab card, and Profile tab settings.

### 2.8 Mobile Ergonomics & Samsung Internet Optimization
The SOLO Driver interface is optimized for in-vehicle mounting on modern smartphones:
- **Centered Navigation Bar:** Bottom navigation buttons are centered with generous touch padding for safe, one-handed thumb interaction while docked in a dashboard phone cradle.
- **Samsung Internet & Dynamic Viewport Units (`dvh`):** Layouts use dynamic viewport calculations so browser address bars and Samsung One UI navigation pills never occlude dispatch cards or action buttons.
- **Collapsible Radar Sheet:** Swipe down to view the full-screen GPS dispatch radar, or swipe up to inspect earnings and trip history.

### 2.9 Arrival, Rider Identification & PIN Validation
1. **Navigate to Pickup:** Follow live routing to the passenger's pickup pin.
2. **Tap "I Have Arrived":** When within 50 meters, tap **"I Have Arrived"** to trigger a passenger push alert.
3. **Verify Passenger & Request PIN:** Greet the passenger and ask: *"Please provide your 4-digit SOLO safety PIN."*
4. **Enter PIN:** Type the 4 digits into your terminal.
   - If verified: The meter starts and navigation to destination begins.
   - If incorrect: Re-confirm with the passenger.
5. **Complete Trip:** Upon reaching the destination, tap **"Complete Trip"**. Paystack automatically charges the passenger, crediting 100% of the fare to you.

### 2.10 Fare Structure & Zero Commission Economics
SOLO uses a standardized, non-surge fare structure designed to maintain steady rider demand while maximizing driver profit:
- **Base Flag-Fall Fare:** R20.00
- **Rate per Kilometer:** R10.00 / km
- **Minimum Trip Fare:** R30.00
- **Platform Take-Rate:** **R0.00 (0.0% Commission)**

$$\text{Driver Payout per Trip} = \text{Total Fare Charged to Rider}$$

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

### 3.1 Administrative Access & Security Architecture
The SOLO Administration suite provides central oversight of fleet compliance, geospatial dispatch parameters, financial reconciliation, and dispute resolution.
- **Primary Routes:**
  - Compliance Engine: `/admin/compliance`
  - Dual-Window Simulator: `/admin/simulator`
- **Access Control:** Restricted via Supabase Row-Level Security (RLS) and JWT claims (`app_metadata.role === 'admin'`).

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

### 3.5 Paystack Webhook Telemetry & Financial Audits
Billing operations are verified cryptographically at `/api/paystack-webhook` using HMAC SHA512 signatures:
$$\text{Signature} = \text{HMAC-SHA512}\left(\text{Payload Body}, \text{PAYSTACK\_SECRET\_KEY}\right)$$
Monitored events:
- `charge.success`: Trip fare captured.
- `subscription.create`: R499/mo SaaS plan initiated following 7-day trial.
- `subscription.disable`: Subscription paused or cancelled; driver set to `inactive`.
- `invoice.payment_failed`: Billing error; 48-hour grace period initiated before suspension.

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
*SOLO Platform Operating Manual — Copyright © 2026 SOLO Mobility Technologies (Pty) Ltd. All Rights Reserved.*
