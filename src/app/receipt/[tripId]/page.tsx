"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Printer,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Car,
  MapPin,
  Calendar,
  CreditCard,
  Building,
  FileCheck,
  FileQuestion,
  RefreshCw,
  Clock,
  User,
  AlertCircle,
} from "lucide-react";
import { calculateDistanceKm } from "@/utils/geo";
import { calculateFare, getTimeOfDayTariff, calculateMultiStopDistanceKm, type TripStop } from "@/utils/mapService";
import { getTrips, getDriverProfileById, type MockTrip } from "@/lib/mockBackend";

interface ReceiptTrip {
  id: string;
  riderName: string;
  riderPhone: string;
  driverName: string;
  driverVehicle: string;
  licensePlate: string;
  prdpNumber: string;
  pickupLocation: string;
  dropoffLocation: string;
  stops: TripStop[];
  distanceKm: number;
  baseFareZar: number;
  distanceFareZar: number;
  stopsFareAdjustmentZar: number;
  waitingFeeZar: number;
  commissionZar: number;
  totalFareZar: number;
  paymentMethod: string;
  completedAt: string;
  receiptNumber: string;
  status: string;
}

export default function TripReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = (params?.tripId as string) || "";

  const [receipt, setReceipt] = useState<ReceiptTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReceiptData = useCallback(async () => {
    if (!tripId || tripId === "solo-demo-trip") {
      setLoading(false);
      setError("No specific trip identified. To view a receipt, open a completed ride from the Rider or Driver portal.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let matchedTrip: any = null;
      let matchedDriver: any = null;
      let matchedRider: any = null;

      // 1. Try authoritative server receipt endpoint first
      try {
        const res = await fetch(`/api/trips/receipt?tripId=${encodeURIComponent(tripId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.trip) {
            matchedTrip = data.trip;
            matchedDriver = data.driver;
            matchedRider = data.rider;
          }
        }
      } catch (apiErr) {
        console.warn("Could not fetch remote trip receipt API:", apiErr);
      }

      // 2. If not found via receipt API, try /api/trips/tracking
      if (!matchedTrip) {
        try {
          const trackRes = await fetch(`/api/trips/tracking?tripId=${encodeURIComponent(tripId)}`);
          if (trackRes.ok) {
            const trackData = await trackRes.json();
            if (trackData.success && trackData.trip) {
              matchedTrip = trackData.trip;
              matchedDriver = trackData.driver;
            }
          }
        } catch {}
      }

      // 3. Fallback to unified getTrips() from mockBackend (merges Supabase and localStorage)
      if (!matchedTrip) {
        try {
          const allTrips = await getTrips();
          const found = allTrips.find((t) => t.id === tripId);
          if (found) {
            matchedTrip = found;
          }
        } catch (getTripsErr) {
          console.warn("getTrips() error during receipt fetch:", getTripsErr);
        }
      }

      // 4. Fallback to direct client storage checks (mock_trips, solo_last_completed_trip, solo_last_updated_trip)
      if (!matchedTrip && typeof window !== "undefined") {
        try {
          // Check mock_trips
          const rawMock = localStorage.getItem("mock_trips");
          if (rawMock) {
            const parsed = JSON.parse(rawMock);
            if (Array.isArray(parsed)) {
              const f = parsed.find((t: any) => t && t.id === tripId);
              if (f) matchedTrip = f;
            }
          }

          // Check solo_last_completed_trip
          if (!matchedTrip) {
            const rawCompleted = localStorage.getItem("solo_last_completed_trip");
            if (rawCompleted) {
              const comp = JSON.parse(rawCompleted);
              if (comp && comp.tripId === tripId && comp.trip) {
                matchedTrip = comp.trip;
              }
            }
          }

          // Check solo_last_updated_trip
          if (!matchedTrip) {
            const rawUpdated = localStorage.getItem("solo_last_updated_trip");
            if (rawUpdated) {
              const upd = JSON.parse(rawUpdated);
              if (upd && upd.trip && upd.trip.id === tripId) {
                matchedTrip = upd.trip;
              }
            }
          }

          // Check solo_trips (used by support store)
          if (!matchedTrip) {
            const rawSolo = localStorage.getItem("solo_trips");
            if (rawSolo) {
              const parsedSolo = JSON.parse(rawSolo);
              if (Array.isArray(parsedSolo)) {
                const f = parsedSolo.find((t: any) => t && t.id === tripId);
                if (f) matchedTrip = f;
              }
            }
          }
        } catch {}
      }

      // If absolutely no genuine trip was found, refuse to display a false demo receipt
      if (!matchedTrip) {
        setError(`Trip #${tripId} was not found in the verified trip registry. No false or simulated receipts can be generated.`);
        setLoading(false);
        return;
      }

      // 5. Resolve Driver Profile Information
      let driverName = matchedDriver?.fullName || matchedTrip.driver_name || "";
      let driverVehicle = "";
      let licensePlate = matchedDriver?.licensePlate || matchedTrip.vehicle_plate || "";
      let prdpNumber = matchedDriver?.prdpNumber || "";

      if (matchedTrip.driver_id && !driverName) {
        try {
          const prof = await getDriverProfileById(matchedTrip.driver_id);
          if (prof) {
            driverName = prof.fullName || driverName;
            driverVehicle = [prof.vehicleColor, prof.vehicleMake, prof.vehicleModel].filter(Boolean).join(" ");
            licensePlate = prof.licensePlate || licensePlate;
            prdpNumber = prof.prdpNumber || prdpNumber;
          }
        } catch {}
      }

      if (matchedDriver) {
        const vehicleParts = [
          matchedDriver.vehicleColor,
          matchedDriver.vehicleMake,
          matchedDriver.vehicleModel,
        ].filter(Boolean);
        if (vehicleParts.length > 0) {
          driverVehicle = vehicleParts.join(" ");
        }
      }

      if (!driverName && typeof window !== "undefined") {
        try {
          const localProfStr = localStorage.getItem("mock_driver_profile");
          if (localProfStr) {
            const localProf = JSON.parse(localProfStr);
            if (localProf && (localProf.id === matchedTrip.driver_id || !matchedTrip.driver_id)) {
              driverName = localProf.fullName || driverName;
              if (!driverVehicle) {
                driverVehicle = [localProf.vehicleColor, localProf.vehicleMake, localProf.vehicleModel].filter(Boolean).join(" ");
              }
              licensePlate = localProf.licensePlate || licensePlate;
              prdpNumber = localProf.prdpNumber || prdpNumber;
            }
          }
        } catch {}
      }

      driverName = driverName.trim() || "Verified SOLO Driver";
      driverVehicle = driverVehicle.trim() || "Commercial E-Hailing Vehicle";
      licensePlate = licensePlate.trim() || "Registered E-Hailing Plate";
      prdpNumber = prdpNumber.trim() || "Category P (Verified)";

      // 6. Resolve Passenger / Rider Information
      let riderName = matchedRider?.fullName || matchedTrip.rider_name || "";
      let riderPhone = matchedRider?.phone || matchedTrip.rider_phone || "";

      if (typeof window !== "undefined") {
        try {
          const verifiedRiderStr = localStorage.getItem("solo_verified_rider");
          if (verifiedRiderStr) {
            const vRider = JSON.parse(verifiedRiderStr);
            if (vRider) {
              if (!riderName) riderName = vRider.fullName || vRider.name || "";
              if (!riderPhone) riderPhone = vRider.phone || "";
            }
          }
          const mockUserStr = localStorage.getItem("mock_user");
          if (mockUserStr) {
            const mUser = JSON.parse(mockUserStr);
            if (mUser) {
              if (!riderName) riderName = mUser.fullName || mUser.name || "";
              if (!riderPhone) riderPhone = mUser.phone || mUser.email || "";
            }
          }
        } catch {}
      }

      riderName = riderName.trim() || "Valued Passenger";
      riderPhone = riderPhone.trim() || (matchedTrip.rider_id ? `ID #${matchedTrip.rider_id.substring(0, 8)}` : "Verified Passenger");

      // 7. Route & Distance Calculation
      const stops: TripStop[] = Array.isArray(matchedTrip.stops) ? matchedTrip.stops : [];
      let distanceKm = 0;

      if (
        typeof matchedTrip.pickup_lat === "number" &&
        typeof matchedTrip.pickup_lng === "number" &&
        typeof matchedTrip.dropoff_lat === "number" &&
        typeof matchedTrip.dropoff_lng === "number"
      ) {
        distanceKm =
          stops.length > 0
            ? calculateMultiStopDistanceKm(
                { lat: matchedTrip.pickup_lat, lng: matchedTrip.pickup_lng },
                { lat: matchedTrip.dropoff_lat, lng: matchedTrip.dropoff_lng },
                stops
              )
            : calculateDistanceKm(
                matchedTrip.pickup_lat,
                matchedTrip.pickup_lng,
                matchedTrip.dropoff_lat,
                matchedTrip.dropoff_lng
              );
      } else if (matchedTrip.distanceKm) {
        distanceKm = Number(matchedTrip.distanceKm);
      }

      // 8. Fare Breakdown
      const totalFare = Number(matchedTrip.fare_amount || 0);
      const stopsAdjustment = Number(matchedTrip.stops_fare_adjustment || 0);
      const waitingFee = Number(matchedTrip.waiting_fee_amount || 0);
      const baseFare = Math.min(10, totalFare > 0 ? 10 : 0);
      const distanceFare = Math.max(0, totalFare - baseFare - stopsAdjustment - waitingFee);

      // 9. Payment Method
      const pm = (matchedTrip.payment_method || "").toLowerCase();
      let paymentLabel = "Speedpoint POS (Card)";
      if (pm === "cash") {
        paymentLabel = "Cash (Direct In-Vehicle)";
      } else if (pm === "paystack" || pm === "card" || pm === "in_app") {
        paymentLabel = "In-App Card (Paystack Secured)";
      } else if (pm === "speedpoint") {
        paymentLabel = "Speedpoint POS (Card Tap/Chip)";
      }

      // 10. Completed Date & Time
      const rawDate = matchedTrip.completed_at || matchedTrip.updated_at || matchedTrip.created_at;
      const completedFormatted = rawDate
        ? new Date(rawDate).toLocaleDateString("en-ZA", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Recently Completed";

      const receiptNumber = `REC-ZA-${matchedTrip.id.replace(/[^a-zA-Z0-9]/g, "").substring(0, 8).toUpperCase()}`;

      setReceipt({
        id: matchedTrip.id,
        riderName,
        riderPhone,
        driverName,
        driverVehicle,
        licensePlate,
        prdpNumber,
        pickupLocation: matchedTrip.pickup_location || "Pickup Address",
        dropoffLocation: matchedTrip.dropoff_location || "Dropoff Address",
        stops,
        distanceKm: Number(distanceKm.toFixed(1)),
        baseFareZar: baseFare,
        distanceFareZar: distanceFare,
        stopsFareAdjustmentZar: stopsAdjustment,
        waitingFeeZar: waitingFee,
        commissionZar: 0,
        totalFareZar: totalFare,
        paymentMethod: paymentLabel,
        completedAt: completedFormatted,
        receiptNumber,
        status: matchedTrip.status || "completed",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error loading trip receipt";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    loadReceiptData();
  }, [loadReceiptData]);

  const handlePrint = () => {
    window.print();
  };

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-mono text-zinc-400">Verifying Official Trip Registry...</span>
        </div>
      </div>
    );
  }

  // Not Found / Error State — No False Demo Receipts!
  if (error || !receipt) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
            <FileQuestion size={28} />
          </div>
          <h2 className="text-xl font-bold text-white">Trip Receipt Not Found</h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            {error || `No completed ride matching ID #${tripId} was found. To ensure absolute audit accuracy under South African tax law, SOLO only displays receipts for verified trips.`}
          </p>
          <div className="pt-3 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => router.back()}
              className="flex-1 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition"
            >
              Go Back
            </button>
            <Link
              href="/rider"
              className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition text-center"
            >
              Open Rider App
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 sm:p-8 flex flex-col items-center">
      {/* Top Action Bar (Hidden when printing) */}
      <div className="max-w-2xl w-full flex items-center justify-between mb-6 print:hidden">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 py-2 px-3 text-xs font-bold text-zinc-400 hover:text-white rounded-xl bg-zinc-900 border border-zinc-800 transition"
        >
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={loadReceiptData}
            className="p-2.5 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs transition"
            title="Reload verified trip record"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/30 transition active:scale-95"
          >
            <Printer size={15} />
            <span>Print / Save as PDF</span>
          </button>
        </div>
      </div>

      {/* Tax Invoice Document Container */}
      <div className="max-w-2xl w-full bg-white text-zinc-900 rounded-3xl p-8 sm:p-12 shadow-2xl space-y-8 border border-zinc-200 print:shadow-none print:border-none print:p-0 print:m-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-zinc-200 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-black tracking-tight text-black">SOLO</span>
              <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Zero Commission Platform
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-1">Platform Built &amp; Operated by Boraine Tech (Pty) Ltd</p>
            <p className="text-xs text-zinc-500">Cape Town &bull; Johannesburg &bull; Durban &bull; Pretoria</p>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-xs uppercase font-extrabold text-blue-600 tracking-wider block">
              Official Trip Receipt / Tax Invoice
            </span>
            <span className="font-mono text-sm font-bold text-zinc-800">{receipt.receiptNumber}</span>
            <p className="text-xs text-zinc-500 mt-0.5">{receipt.completedAt}</p>
          </div>
        </div>

        {/* Driver & Rider Info Box */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 text-xs">
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-zinc-400">Driver &amp; Vehicle Details</span>
            <p className="font-bold text-zinc-900 text-sm">{receipt.driverName}</p>
            <p className="text-zinc-600">{receipt.driverVehicle}</p>
            <div className="flex items-center gap-2 pt-1 font-mono text-[11px] text-zinc-700">
              <span className="bg-zinc-200 px-2 py-0.5 rounded font-bold">{receipt.licensePlate}</span>
              <span>PrDP: {receipt.prdpNumber}</span>
            </div>
          </div>

          <div className="space-y-1 sm:border-l sm:border-zinc-200 sm:pl-4">
            <span className="text-[10px] uppercase font-bold text-zinc-400">Passenger / Rider</span>
            <p className="font-bold text-zinc-900 text-sm">{receipt.riderName}</p>
            <p className="text-zinc-600 font-mono">{receipt.riderPhone}</p>
            <p className="text-[11px] text-zinc-500 pt-1">Settlement: {receipt.paymentMethod}</p>
          </div>
        </div>

        {/* Route Details */}
        <div className="space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Route Telemetry</span>
          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-3 text-xs">
            <div className="flex items-start gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Pickup Location</span>
                <span className="font-medium text-zinc-900">{receipt.pickupLocation}</span>
              </div>
            </div>
            {receipt.stops.map((stop, idx) => (
              <div key={stop.id || idx} className="flex items-start gap-3 border-t border-zinc-200 pt-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1 shrink-0" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-600 block">
                    Intermediate Stop {idx + 1} ({stop.addedBy === "driver" ? "Driver" : "Rider"})
                  </span>
                  <span className="font-medium text-zinc-900">{stop.address}</span>
                </div>
              </div>
            ))}
            <div className="flex items-start gap-3 border-t border-zinc-200 pt-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1 shrink-0" />
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Dropoff Location</span>
                <span className="font-medium text-zinc-900">{receipt.dropoffLocation}</span>
              </div>
            </div>
            <div className="text-[11px] text-zinc-500 pt-1 border-t border-zinc-200 flex justify-between">
              <span>Total Distance Traveled:</span>
              <span className="font-bold text-zinc-800">{receipt.distanceKm.toFixed(1)} km</span>
            </div>
          </div>
        </div>

        {/* Itemized Fare Table */}
        <div className="space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Itemized Fare Breakdown</span>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th className="text-left py-2 font-semibold">Description</th>
                <th className="text-right py-2 font-semibold">Rate</th>
                <th className="text-right py-2 font-semibold">Amount (ZAR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              <tr>
                <td className="py-2.5 font-medium text-zinc-800">Trip Base Fare (Standard SA Metro)</td>
                <td className="py-2.5 text-right text-zinc-500">Flat</td>
                <td className="py-2.5 text-right font-medium">R{receipt.baseFareZar.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium text-zinc-800">
                  Distance Traveled ({receipt.distanceKm.toFixed(1)} km)
                </td>
                <td className="py-2.5 text-right text-zinc-500">Standard Rate</td>
                <td className="py-2.5 text-right font-medium">R{receipt.distanceFareZar.toFixed(2)}</td>
              </tr>
              {receipt.stops.length > 0 && (
                <tr>
                  <td className="py-2.5 font-medium text-amber-800">
                    Multi-Stop Route Adjustment ({receipt.stops.length} {receipt.stops.length === 1 ? "Stop" : "Stops"})
                  </td>
                  <td className="py-2.5 text-right text-zinc-500">R8.00 / stop + detour</td>
                  <td className="py-2.5 text-right font-medium text-amber-800">
                    {receipt.stopsFareAdjustmentZar >= 0 ? "+" : ""}R{receipt.stopsFareAdjustmentZar.toFixed(2)}
                  </td>
                </tr>
              )}
              {receipt.waitingFeeZar > 0 && (
                <tr>
                  <td className="py-2.5 font-medium text-red-700">
                    Pickup Waiting Overtime Fee (&gt;2 min grace period)
                  </td>
                  <td className="py-2.5 text-right text-zinc-500">R2.00 / min</td>
                  <td className="py-2.5 text-right font-medium text-red-700">
                    +R{receipt.waitingFeeZar.toFixed(2)}
                  </td>
                </tr>
              )}
              <tr>
                <td className="py-2.5 font-medium text-zinc-800">
                  Time-of-Day Tariff
                </td>
                <td className="py-2.5 text-right text-zinc-500">Standard Scheduled</td>
                <td className="py-2.5 text-right font-medium text-zinc-700">
                  {getTimeOfDayTariff(new Date()).badge}
                </td>
              </tr>
              <tr className="bg-emerald-50/60 font-semibold text-emerald-800">
                <td className="py-2.5 px-2">SOLO Platform Commission (0% Model)</td>
                <td className="py-2.5 text-right">0.0%</td>
                <td className="py-2.5 px-2 text-right">R0.00</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-zinc-900 text-sm font-black">
                <td className="pt-4 text-zinc-900">Total Paid (Direct to Driver)</td>
                <td className="pt-4" />
                <td className="pt-4 text-right text-2xl text-zinc-900 font-extrabold">
                  R{receipt.totalFareZar.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* SARS Statutory Compliance Notice */}
        <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-500 space-y-1 leading-normal">
          <div className="flex items-center gap-1.5 font-bold text-zinc-700">
            <FileCheck size={14} className="text-blue-600" />
            <span>South African Revenue Service (SARS) Tax Notice</span>
          </div>
          <p>
            SOLO is an independent subscription matching platform operated by Boraine Tech (Pty) Ltd. 100% of this fare is remitted directly to the independent transport operator ({receipt.driverName}). No platform commission is deducted. Drivers operate as independent transport micro-enterprises registered under South African tax law.
          </p>
        </div>

        {/* Support & Lost Property Bar */}
        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs print:hidden">
          <div>
            <strong className="text-amber-900 block font-bold">Have an issue or left an item in the car?</strong>
            <span className="text-amber-700 text-[11px]">Report lost items or dispute this trip with our support team.</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/lost-phone?tripId=${encodeURIComponent(receipt.id)}`}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition text-[11px]"
            >
              Report Lost Phone
            </Link>
            <Link
              href={`/rider?disputeTripId=${encodeURIComponent(receipt.id)}`}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition text-[11px]"
            >
              Get Trip Support
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-zinc-400 pt-4 border-t border-zinc-200">
          Thank you for riding with SOLO &bull; Zero Commission E-Hailing &bull; Built by Boraine Tech (Pty) Ltd &bull; www.solo-app.co.za
        </div>
      </div>
    </div>
  );
}
