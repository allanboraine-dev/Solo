# SOLO PLATFORM OPERATIONAL MANUAL
### Standard Operating Procedures (SOP) & Platform Guidelines
**Jurisdiction:** Republic of South Africa  
**Applicable Statutes:** National Land Transport Act (Act No. 5 of 2009), Protection of Personal Information Act (POPIA Act No. 4 of 2013), Value-Added Tax Act (Act No. 89 of 1991), Consumer Protection Act (Act No. 68 of 2008)  
**Document Version:** 1.0 (Production Master Release)  
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
|                      Driver pays flat: R300.00 / month      |
+-------------------------------------------------------------+
```

### Key Architectural Pillars
1. **100% Fare Retention for Drivers:** Drivers retain 100% of the metered gross fare calculated per trip (R20 base fare + R10/km, subject to an R30 minimum fare threshold).
2. **Predictable Flat-Rate SaaS Subscription:** Drivers pay a flat monthly access fee of **R300.00 ZAR** after an initial **7-day unrestricted trial**, eliminating volatile revenue docking.
3. **South African Banking Integration:** Direct bank payout recipient creation using standard 6-digit South African universal clearing branch codes (FNB, Standard Bank, Capitec, Nedbank, ABSA, Investec, TymeBank, African Bank, Discovery).
4. **Mandatory 4-Digit Anti-Impersonation PIN:** Every trip requires real-time physical confirmation of a cryptographic 4-digit PIN between rider and driver before the trip state transitions to `in_progress`.
5. **SARS Tax & NLTA Regulatory Transparency:** Built-in automated tax invoicing complying with SARS Section 11(2) statutory disclosures, and strict document verification matching South African National Land Transport regulations (PrDP and Roadworthy certification).
6. **Network Dead-Zone Resilience:** Full Progressive Web Application (PWA) architecture with Service Worker caching of Mapbox vector tiles, offline incident protocols, and emergency telephonic speed-dials (`10111`, `10177`, `112`).

---

## Table of Contents
1. [Section A: Rider Operations & Handbook](#section-a-rider-operations--handbook)
   - 1.1 Account Registration & Phone Verification
   - 1.2 PWA Mobile Installation (Android & iOS)
   - 1.3 Booking a Ride & Commercial Map Routing
   - 1.4 Driver Matching & The 15km PostGIS Radius
   - 1.5 Boarding Safety & The 4-Digit Security PIN
   - 1.6 In-Trip Experience & Live Chat
   - 1.7 Payment Settlement & Card Security
   - 1.8 Tax Invoices & Downloadable PDF Receipts
   - 1.9 Emergency Protocol & Cellular Dead-Zone Safety
2. [Section B: Driver Operations & Partner Guide](#section-b-driver-operations--partner-guide)
   - 2.1 Driver Onboarding & Statutory Requirements (NLTA)
   - 2.2 KYC Document Submission Protocol
   - 2.3 SaaS Subscription Model (7-Day Trial & R300/mo)
   - 2.4 South African Banking Setup & Direct Settlement
   - 2.5 Daily Operating Routine: Going Online & Accepting Rides
   - 2.6 Arrival, Rider Identification & PIN Validation
   - 2.7 Fare Structure & Zero Commission Mathematics
   - 2.8 Vehicle Standards & Regulatory Inspections
   - 2.9 Driver Tax Guidance (SARS Independent Contractor)
3. [Section C: Administrator Operations & Governance](#section-c-administrator-operations--governance)
   - 3.1 Administrative Access & Security Architecture
   - 3.2 Driver Compliance & Document Review Engine (`/admin/compliance`)
   - 3.3 Verification Decision Matrix & Statutory Rejection Codes
   - 3.4 Interactive Dual-Window Simulator (`/admin/simulator`)
   - 3.5 Paystack Webhook Telemetry & Financial Audits
   - 3.6 PostGIS Geospatial Engine & Matching Algorithms
   - 3.7 Web Push Notification Infrastructure
   - 3.8 Dispute Resolution, Fraud Prevention & Incident Escalation
4. [Appendix: South African Banking & Statutory Directory](#appendix-south-african-banking--statutory-directory)

---

# Section A: Rider Operations & Handbook

### 1.1 Account Registration & Phone Verification
SOLO utilizes passwordless mobile authentication anchored to the South African E.164 telecommunications standard.
- **Valid Number Formats:**
  - Local format: `082 123 4567` or `071 987 6543`
  - National format: `27821234567`
  - International format: `+27 82 123 4567`
- **Verification Flow:**
  1. Rider inputs mobile number in the login modal.
  2. The system formats the number to international E.164 standard (`+27...`).
  3. A 6-digit One-Time PIN (OTP) is dispatched via cellular SMS or instant verification gateway.
  4. Upon entering the valid PIN, an authenticated session token is stored securely in the browser.

### 1.2 PWA Mobile Installation (Android & iOS)
SOLO is engineered as a high-performance Progressive Web Application, eliminating the need to download heavy binaries from app stores.

#### Android Installation (Chrome / Edge / Samsung Internet):
1. Navigate to the platform domain in Chrome on any Android smartphone.
2. An automatic installation banner appears at the bottom of the screen: **"Install SOLO App — Add to Home Screen for 1-tap bookings & offline trip safety"**.
3. Tap **"Install Now"**.
4. The SOLO application icon is pinned to your app drawer and home screen, running full-screen without URL bars.

#### iOS Safari Installation (iPhone & iPad):
1. Navigate to the platform domain in Apple Safari.
2. Tap the **Share** button (box with an upward arrow) in the Safari toolbar.
3. Scroll down and select **"Add to Home Screen"**.
4. Confirm by tapping **"Add"** in the top right corner.
5. Launch SOLO directly from your iOS home screen.

### 1.3 Booking a Ride & Commercial Map Routing
1. **Select Pickup Location:** The application automatically detects your current GPS location (with user permission). Alternatively, type a street address or notable landmark into the search bar.
2. **Select Destination:** Type your destination. SOLO interfaces with Mapbox Commercial Geocoding and Matrix Routing to calculate the optimal driving route avoiding known congestion points.
3. **Fare Transparency Preview:**
   - The platform calculates and displays the exact fixed upfront estimate.
   - Formula:
     $$\text{Fare} = \max\left(\text{R}30.00, \text{R}20.00 + (\text{Distance in km} \times \text{R}10.00)\right)$$
   - *Example:* A 6.2 km trip from Camps Bay to V&A Waterfront displays: `R82.00`.
   - **Zero Hidden Costs:** No booking fees, surge multiplier spikes, or service surcharges.

### 1.4 Driver Matching & The 15km PostGIS Radius
When the rider taps **"Request SOLO Ride"**:
1. A trip request record is written to the database with status `requested`.
2. The PostGIS geospatial engine queries all online, verified drivers within a **15 km geodesic radius**.
3. Drivers receive instant Web Push notifications and visual dispatch alerts on their consoles.
4. As soon as a driver accepts, the trip status updates to `accepted`. The driver's name, vehicle make, color, registration plate, and live GPS location are displayed on the rider's map.

### 1.5 Boarding Safety & The 4-Digit Security PIN
To prevent passenger abduction, carjacking, and driver impersonation, SOLO enforces a mandatory **4-Digit Safety PIN**.

> **IMPORTANT Anti-Impersonation Protocol:**
> 1. When a driver is dispatched, the rider's screen displays a unique 4-digit code (e.g. `4892`).
> 2. When the driver arrives, **verify the vehicle registration plate** before entering the vehicle.
> 3. Verbally communicate the 4-digit PIN to the driver.
> 4. The driver must type this PIN into their device. If the PIN does not match, the driver cannot start the meter or initiate the trip.
> 5. Never enter a vehicle if the driver cannot verify or requests to bypass this PIN.

### 1.6 In-Trip Experience & Live Chat
- **Real-Time Tracking:** The rider map updates in real time, displaying the vehicle progress along the blue vector path.
- **In-Trip Chat:** Riders and drivers can exchange text messages without revealing private telephone numbers. Messages are encrypted and transmitted through Supabase Realtime channels.
- **Trip Sharing:** Riders can copy their live trip tracking URL to share with family or colleagues via WhatsApp or SMS.

### 1.7 Payment Settlement & Card Security
SOLO integrates with **Paystack (a Stripe company)**, certified to **PCI-DSS Level 1** compliance.
- Credit and debit cards (Visa, Mastercard, American Express) issued by South African banks are authorized securely via 3D Secure (OTP / banking app prompt).
- At the end of the trip, the fare is automatically settled.
- Because SOLO charges 0% commission, the entire fare is credited directly to the driver's verified bank account without intermediaries taking a percentage.

### 1.8 Tax Invoices & Downloadable PDF Receipts
Immediately upon trip completion, riders receive a link to their official tax invoice at `/receipt/[tripId]`.
- Features an official SARS Section 11(2) compliant layout.
- Itemized breakdown showing Base Fare, Distance Charge, and explicit **R0.00 (0%) Platform Commission**.
- 1-Click **"Print / Save to PDF"** button formatted cleanly for expense claims and company VAT submissions.

### 1.9 Emergency Protocol & Cellular Dead-Zone Safety
If cellular signal drops during a trip (e.g. mountain passes, underground parking, rural corridors):
- The SOLO Progressive Web Application switches seamlessly to the cached offline mode.
- An alert pill indicates **"Offline Mode — Local Safety Protocols Active"**.
- Tap the **SOS Emergency** button to immediately speed-dial South African national emergency hotlines:
  - **South African Police Service (SAPS):** `10111`
  - **National Ambulance & Fire:** `10177`
  - **Universal Mobile Emergency (Cellular SOS):** `112`

---

# Section B: Driver Operations & Partner Guide

### 2.1 Driver Onboarding & Statutory Requirements (NLTA)
SOLO strictly adheres to the **National Land Transport Act (Act No. 5 of 2009)**. To operate on the SOLO network, every driver partner must register as an independent transport provider and hold valid regulatory documentation.

#### Mandatory Statutory Documents:
1. **South African Driving Licence (Front & Back):** Valid Code B, C1, or EB card licence issued by a South African licensing department.
2. **Professional Driving Permit (PrDP - Category P):** Valid passenger transport endorsement. Expired permits or goods-only (Category G) permits are strictly ineligible.
3. **Vehicle Certificate of Roadworthiness (CoR):** Roadworthy certificate issued by an accredited test station, not older than six (6) months.
4. **Vehicle Registration Document (RC1) & Proof of Insurance:** Proof of comprehensive or passenger liability insurance covering commercial e-hailing.

### 2.2 KYC Document Submission Protocol
1. Navigate to `/driver/register` or the driver portal.
2. Upload high-resolution photographs or PDF scans of the four statutory documents via the **KYC Document Uploader**:
   - Minimum resolution: 1000x1000px.
   - Maximum file size: 10 MB per document.
   - Permitted formats: JPEG, PNG, WebP, PDF.
3. Ensure all four corners of the cards are visible, free of glare, with text clearly legible.
4. Documents are encrypted and transferred directly into the private, isolated `driver-documents` storage bucket.

### 2.3 SaaS Subscription Model (7-Day Trial & R300/mo)
SOLO replaces predatory percentage commissions with a transparent, predictable Software-as-a-Service (SaaS) subscription model.

| Metric | Traditional Legacy Platform (25% Commission) | SOLO Zero-Commission (R300/mo SaaS) | Driver Advantage |
| :--- | :--- | :--- | :--- |
| **Gross Monthly Fares** | R20,000.00 | R20,000.00 | Equal |
| **Platform Deduction** | **-R5,000.00 (25%)** | **-R300.00 (Flat Fee)** | **+R4,700.00 extra cash** |
| **Net Driver Earnings** | R15,000.00 | **R19,700.00** | **+31.3% Net Increase** |
| **Trial Period** | None (Immediate commission cut) | **7 Days Free** | Zero financial risk |

- **7-Day Free Trial:** Newly approved drivers receive 7 days of unlimited ride dispatch with R0 platform charges.
- **Monthly Subscription:** After 7 days, drivers maintain platform access for **R300.00 per month** billed automatically through Paystack recurring debit order or card authorization.

### 2.4 South African Banking Setup & Direct Settlement
Drivers must link a valid South African bank account to receive rider payments directly into their accounts without delay.

#### Universal Branch Code Directory:
SOLO automatically validates and populates the official universal clearing branch codes for all major South African banks:
- **Standard Bank:** `051001`
- **First National Bank (FNB):** `250655`
- **Capitec Bank:** `470010`
- **Nedbank:** `198765`
- **ABSA Bank:** `632005`
- **Investec Bank:** `580105`
- **TymeBank:** `678910`
- **African Bank:** `430000`
- **Discovery Bank:** `679000`

#### Bank Account Validation Rules:
- Account numbers must contain between **7 and 11 numeric digits**.
- Driver name on file must match the registered account holder name to prevent fraud and ensure POPIA compliance.
- Account numbers are masked across all user interfaces (`••••••4829`) for financial security.

### 2.5 Daily Operating Routine: Going Online & Accepting Rides
1. **Launch App:** Open the SOLO Driver PWA on your mobile device.
2. **Toggle Availability:** Tap the green **"Go Online"** switch.
3. **Dispatch Alert:** When a rider within 15 km requests a trip, an audio chime and high-priority Web Push alert will ring.
4. **Inspect Route:** The dispatch card displays:
   - Pickup location and distance
   - Destination address
   - Estimated trip duration
   - **Guaranteed Gross Fare (in ZAR)**
5. **Accept Request:** Tap **"Accept Trip"** within 30 seconds.

### 2.6 Arrival, Rider Identification & PIN Validation
1. **Navigate to Pickup:** Follow turn-by-turn routing to the rider's pin.
2. **Tap "Arrived":** Once within 50 meters of the pickup location, tap **"I Have Arrived"**. An automatic push alert informs the rider you are waiting outside.
3. **Verify Rider & Request PIN:**
   - Confirm rider's name.
   - Politely ask: *"Please provide your 4-digit SOLO safety PIN."*
4. **Enter PIN:** Input the 4 digits into your driver terminal.
   - If correct: The trip status transitions to `in_progress` and navigation to the destination begins.
   - If incorrect: The app alerts you to re-verify with the rider.
5. **End Trip:** Upon reaching the destination safely, tap **"Complete Trip"**. The Paystack payment gateway settles the fare, and an invoice is dispatched to the rider.

### 2.7 Fare Structure & Zero Commission Mathematics
SOLO operates on a standardized, non-surge fare structure designed to maintain consistent demand while protecting driver margins:
- **Base Flag-Fall Fare:** R20.00
- **Rate per Kilometer:** R10.00 / km
- **Minimum Trip Fare:** R30.00
- **Platform Fee:** **R0.00 (0.0%)**

$$\text{Driver Net Payout per Trip} = \text{Total Fare Charged to Rider}$$

### 2.8 Vehicle Standards & Regulatory Inspections
To maintain high service quality and rider safety, all partner vehicles must satisfy:
- Maximum vehicle age: 10 years from year of manufacture.
- Minimum 4 doors with functioning exterior and interior door handles.
- Fully operational air conditioning and heating systems.
- Functional seatbelts for all passenger seating positions.
- Clean interior upholstery free of tears and odors.
- Spare wheel, jack, and emergency warning triangle present in boot.

### 2.9 Driver Tax Guidance (SARS Independent Contractor)
Under South African tax legislation, SOLO driver partners operate as independent micro-entrepreneurs:
- **Gross Earnings Invoicing:** Drivers receive 100% of the fares collected. Fares constitute gross business revenue for the driver.
- **SARS Deductible Expenses:** Drivers are entitled to claim allowable business expenditure against their gross revenue, including:
  - Fuel and oil costs
  - Vehicle maintenance, servicing, and tyre replacements
  - Commercial vehicle insurance premiums
  - Smartphone cellular data used for navigation
  - SOLO platform SaaS subscription fees (R300/mo)
  - Vehicle financing interest and depreciation allowances
- **Tax Clearance:** Drivers earning above the mandatory statutory thresholds should register for Provisional Tax with the South African Revenue Service (SARS) and consider the simplified **Turnover Tax** regime if annual turnover is under R1,000,000.

---

# Section C: Administrator Operations & Governance

### 3.1 Administrative Access & Security Architecture
The SOLO Administration suite provides central oversight of fleet compliance, geospatial dispatch parameters, financial reconciliation, and dispute resolution.

- **Primary Route:** `/admin/compliance` (Driver KYC Management)
- **Simulator Route:** `/admin/simulator` (End-to-End Diagnostic Environment)
- **Access Control:** Restricted via Supabase Row-Level Security (RLS) and JWT authentication verifying administrative claims (`app_metadata.role === 'admin'`).

### 3.2 Driver Compliance & Document Review Engine (`/admin/compliance`)
The Compliance Portal provides real-time oversight of all driver applicants across South Africa.

#### Real-Time Telemetry Dashboard:
- **Total Registered Drivers:** Cumulative count of all driver accounts.
- **Pending Compliance Review:** Total drivers with documents awaiting verification.
- **Fully Verified & Active:** Drivers cleared for commercial dispatch.
- **Action Required / Rejected:** Drivers flagged for expired or invalid documents.

#### Ephemeral Document Inspection:
Because identity documents and PrDP permits contain sensitive personal data governed by POPIA, documents are never served over public URLs. The compliance engine generates temporary, 1-hour signed URLs through the Supabase Storage API (`supabase.storage.from('driver-documents').createSignedUrl(path, 3600)`), rendering high-resolution previews and inline multi-page PDF viewers.

### 3.3 Verification Decision Matrix & Statutory Rejection Codes
When rejecting a non-compliant document, administrators must select a preset South African regulatory code to ensure unambiguous feedback to the driver:

| Document Type | Verification Criteria | Rejection Preset Code | Corrective Action Prompt |
| :--- | :--- | :--- | :--- |
| **Driver's Licence** | Must be valid Code B/EB, clear photo, unexpired, name matching profile. | `EXPIRED_CARD` / `BLURRY_IMAGE` / `NAME_MISMATCH` | "Please upload a clear photograph of your unexpired South African driving licence card." |
| **PrDP Endorsement** | Must be Category P (Passenger) and unexpired. | `NO_PRDP_ENDORSEMENT` / `PRDP_EXPIRED` | "Your licence lacks an active Category P (Passenger) PrDP endorsement as required by the NLTA." |
| **Roadworthy Certificate (CoR)** | Must be issued by an accredited station, valid vehicle VIN, test date within 6 months. | `ROADWORTHY_EXPIRED` / `VIN_MISMATCH` | "Certificate of Roadworthiness must be dated within the last 6 months." |
| **Vehicle Registration (RC1)** | Registration number must match vehicle plate registered on platform. | `PLATE_MISMATCH` / `DOC_ILLEGIBLE` | "Vehicle registration papers must match your vehicle's license plate." |

> **Automated Verification Trigger:**
> When an administrator approves the fourth required document for any driver, the platform database automatically triggers an update setting `driver_profiles.is_verified = true`. A Web Push notification is immediately dispatched to the driver: *"🎉 Your SOLO Driver Account is Approved! You can now go online."*

### 3.4 Interactive Dual-Window Simulator (`/admin/simulator`)
The platform includes an advanced, side-by-side diagnostic simulator for real-time validation of trip lifecycles without requiring field test vehicles.

#### Simulator Capabilities:
1. **Synchronized Dual Devices:** Left frame renders the Rider Mobile App; right frame renders the Driver Mobile Terminal.
2. **South African Metro Route Presets:**
   - **Cape Town:** Camps Bay Tidal Pool -> V&A Waterfront (6.2 km, R82.00)
   - **Johannesburg:** Sandton City Mall -> Rosebank Mall (5.4 km, R74.00)
   - **Durban:** Gateway Theatre of Shopping -> Florida Road (6.8 km, R88.00)
   - **Pretoria:** Menlyn Park Shopping Centre -> Hatfield Station (7.1 km, R91.00)
3. **Speed Multipliers:** Toggle simulation playback between **1x (Real-Time)**, **2x (Accelerated)**, and **5x (Rapid Validation)**.
4. **Auto-Play Full Journey:** Automates the complete trip lifecycle from booking -> dispatch -> acceptance -> arrival -> PIN verification -> routing -> Paystack settlement.
5. **Live Telemetry Audit Drawer:** Collapsible real-time inspector logging:
   - PostGIS 15 km spatial radius queries
   - Supabase Realtime WebSocket events
   - Web Push dispatch payloads (VAPID RFC 8291/8292)
   - Paystack HMAC SHA512 transaction tokens

### 3.5 Paystack Webhook Telemetry & Financial Audits
Financial transactions are processed via Paystack's secure webhook endpoint at `/api/paystack-webhook`.

#### Webhook Security & HMAC Verification:
Every inbound event from Paystack must be validated using cryptographic SHA512 HMAC signatures to prevent unauthorized credit manipulation:
$$\text{Signature} = \text{HMAC-SHA512}\left(\text{Payload Body}, \text{PAYSTACK\_SECRET\_KEY}\right)$$
- If the signature header `x-paystack-signature` matches the computed HMAC, the event is processed.
- If the signature does not match, the request is immediately aborted with an `HTTP 401 Unauthorized` response.

#### Monitored Event Types:
- `charge.success`: Trip fare authorized and captured successfully.
- `subscription.create`: Driver initiates the R300/mo SaaS subscription following the 7-day free trial.
- `subscription.disable`: Driver cancels subscription or card expires; driver status set to `inactive`.
- `invoice.payment_failed`: Recurring billing failure; system triggers a 48-hour grace period notice before suspension.

### 3.6 PostGIS Geospatial Engine & Matching Algorithms
The platform relies on PostgreSQL's PostGIS extension to execute sub-millisecond proximity matching.

```sql
-- Spatial Query: Discover Active Drivers Within 15km
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
Background communications are dispatched using the standardized Web Push Protocol (RFC 8291 / RFC 8292) secured with VAPID key pairs.
- **Payload Types:**
  - `DRIVER_DISPATCH`: Sent to nearby drivers with trip pickup address and guaranteed ZAR fare.
  - `RIDER_ACCEPTED`: Sent to rider when driver accepts, containing driver name, vehicle details, and 4-digit PIN.
  - `DRIVER_ARRIVED`: Sent to rider when driver reaches pickup coordinates.
  - `PAYMENT_COMPLETED`: Sent to both parties with final fare receipt and R0 commission confirmation.
- **Automatic Stale Subscription Pruning:** If a push endpoint returns `HTTP 404 Not Found` or `HTTP 410 Gone`, the system automatically purges the expired subscription record from `public.push_subscriptions`.

### 3.8 Dispute Resolution, Fraud Prevention & Incident Escalation
In the event of passenger disputes, payment chargebacks, or safety incidents:
1. **Access Audit Trail:** Retrieve the trip record via `/receipt/[tripId]` or Supabase admin logs.
2. **Review Telemetry:** Cross-examine GPS coordinates, timestamp of PIN validation, and in-trip chat transcripts.
3. **Chargeback Adjudication:** Because the rider must authenticate via 3D Secure and provide the physical 4-digit PIN upon boarding, fraudulent "trip not taken" chargeback claims are strongly defensible before issuing banks.
4. **Emergency Escalation:** For critical safety reports, administrators can immediately lock driver or rider accounts (`is_active = false`), export full trip telemetry, and liaise with the South African Police Service (SAPS) via the emergency hotline records.

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
