# SOLO — Zero-Commission E-Hailing Platform
### Built and Engineered by Boraine Tech (Pty) Ltd
**Jurisdiction:** Republic of South Africa  
**Founder & Lead Architect:** Allan Boraine  
**Applicable Statutes:** National Land Transport Act (Act No. 5 of 2009), Protection of Personal Information Act (POPIA Act No. 4 of 2013), Value-Added Tax Act (Act No. 89 of 1991), Consumer Protection Act (Act No. 68 of 2008), South African Reserve Bank (SARB) National Payment System Directives  

---

## 🚀 About SOLO

**SOLO** is an enterprise-grade, peer-to-peer digital e-hailing platform proudly engineered, built, and maintained by **Boraine Tech (Pty) Ltd** specifically for the South African transport ecosystem.

Traditional e-hailing aggregators deduct between 20% and 30% from every driver's earnings, lock driver earnings in platform escrow, and enforce weekly payout delays. SOLO replaces this legacy model with a **Pure Zero-Commission Model (0.0% Take-Rate)** and **Direct In-Vehicle Fare Settlement**:
- **100% Direct Driver Fare Retention:** Fares are paid directly to the driver by the passenger in the vehicle via **Cash** (Rand banknotes and coins) or **In-Vehicle Mobile Card Machine / Speedpoint** (e.g. Yoco, iKhokha, Nedbank PocketPOS, Capitec, ABSA/FNB speedpoints) or in-app card fallback.
- **Predictable Flat-Rate SaaS Subscription:** Drivers pay a flat monthly fee of **R499.00 ZAR** (after an initial 14-day free trial; permanently free for platform founder Allan Boraine) purely for platform software access, dispatch matching, map routing, and safety infrastructure.
- **Immediate Liquidity:** Zero platform escrow holding, zero cash-out delays, and zero platform deductions.

---

## 🛠️ Technology Stack & Engineering Architecture

Engineered by **Boraine Tech (Pty) Ltd** with modern, high-concurrency web technologies:
- **Frontend Framework:** Next.js 14 (App Router), React 18, Tailwind CSS, Framer Motion, Lucide Icons
- **PWA & Mobile Ergonomics:** Progressive Web Application (`@ducanh2912/next-pwa`) optimized for Android Chrome, Samsung Internet (`dvh` dynamic viewports), and iOS Safari
- **Backend & Database:** Supabase (PostgreSQL with PostGIS Geospatial extensions, Row-Level Security, real-time channels)
- **Mapping & Navigation:** Leaflet, OpenStreetMap, Mapbox Commercial Geocoding & Routing APIs
- **Payment Processing:** Paystack API (3D-Secure card verification, SaaS subscription billing with HMAC-SHA512 webhook signature verification)
- **Push Notifications:** Web Push Protocol (RFC 8291 / RFC 8292) with VAPID key pairs and Service Workers
- **Authentication & Security:**
  - Passwordless rider onboarding with zero-cost WhatsApp deep-link verification (`wa.me`)
  - Cryptographically signed admin session cookies (`s:<payload>.<sig>` with HMAC-SHA256)
  - Admin email domain allowlist enforcement (`isAuthorizedAdminEmail`)
  - POPIA-hardened Row-Level Security on driver KYC documentation (`driver-documents` storage bucket)
  - Single-device active concurrency enforcement with hardware fingerprinting (`solo_driver_device_id`)
  - Real-time phone number masking on public WebSocket geohash broadcasts
  - Authenticated emergency SOS safety distress endpoints

---

## 📋 Standard Operating Procedures & Documentation

For complete operational, legal, and financial guidelines, refer to:
- **Operational Manual (Markdown):** [`SOLO_OPERATIONAL_MANUAL.md`](SOLO_OPERATIONAL_MANUAL.md)
- **Operational Manual (Public HTML):** [`public/SOLO_OPERATIONAL_MANUAL.html`](public/SOLO_OPERATIONAL_MANUAL.html)

---

## 🧪 Testing & Verification

The SOLO codebase is backed by a comprehensive automated test suite:

```bash
# Run the complete test suite (33 suites, 183 tests)
npm test

# Type-check TypeScript codebase
npx tsc --noEmit
```

---

## 🏢 Corporate & Copyright Notice

**SOLO Platform**  
Copyright © 2026 **Boraine Tech (Pty) Ltd**. All Rights Reserved.  
Engineered, built, and maintained in Cape Town, Republic of South Africa.
