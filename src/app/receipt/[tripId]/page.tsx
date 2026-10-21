"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
} from "lucide-react";
import { calculateDistanceKm } from "@/utils/geo";
import { calculateFare, getTimeOfDayTariff } from "@/utils/mapService";

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
  distanceKm: number;
  baseFareZar: number;
  distanceFareZar: number;
  commissionZar: number;
  totalFareZar: number;
  paymentMethod: string;
  completedAt: string;
  receiptNumber: string;
}

export default function TripReceiptPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = (params?.tripId as string) || "solo-demo-trip";

  const [receipt, setReceipt] = useState<ReceiptTrip>({
    id: tripId,
    riderName: "Valued Rider",
    riderPhone: "+27 82 555 1234",
    driverName: "Sipho Ndlovu",
    driverVehicle: "Toyota Corolla Quest (White)",
    licensePlate: "CA 492-810",
    prdpNumber: "PRDP-ZA-89102",
    pickupLocation: "Camps Bay Beach, Victoria Rd, Cape Town",
    dropoffLocation: "V&A Waterfront, Dock Rd, Cape Town",
    distanceKm: 6.2,
    baseFareZar: 20,
    distanceFareZar: 62,
    commissionZar: 0,
    totalFareZar: 82,
    paymentMethod: "Paystack Card (3D-Secure)",
    completedAt: new Date().toLocaleDateString("en-ZA", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    receiptNumber: `REC-ZA-${tripId.substring(0, 8).toUpperCase()}`,
  });

  useEffect(() => {
    // Attempt to read trip from localStorage or API if available
    try {
      const raw = localStorage.getItem("mock_trips");
      if (raw) {
        const trips = JSON.parse(raw);
        const found = trips.find((t: any) => t.id === tripId);
        if (found) {
          const dist = calculateDistanceKm(
            found.pickup_lat,
            found.pickup_lng,
            found.dropoff_lat,
            found.dropoff_lng
          );
          const total = found.fare_amount || calculateFare(dist);
          const distanceCharge = Math.max(0, total - 20);

          setReceipt((prev) => ({
            ...prev,
            id: found.id,
            pickupLocation: found.pickup_location,
            dropoffLocation: found.dropoff_location,
            distanceKm: dist,
            distanceFareZar: distanceCharge,
            totalFareZar: total,
            receiptNumber: `REC-ZA-${found.id.substring(0, 8).toUpperCase()}`,
          }));
        }
      }
    } catch {
      // Default to receipt preview
    }
  }, [tripId]);

  const handlePrint = () => {
    window.print();
  };

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

        <button
          onClick={handlePrint}
          className="flex items-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/30 transition active:scale-95"
        >
          <Printer size={15} />
          <span>Print / Save as PDF</span>
        </button>
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
            <p className="text-xs text-zinc-500 mt-1">Platform Built & Operated by Boraine Tech (Pty) Ltd</p>
            <p className="text-xs text-zinc-500">Cape Town, South Africa</p>
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
            <span className="text-[10px] uppercase font-bold text-zinc-400">Driver & Vehicle Details</span>
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
            <p className="text-zinc-600">{receipt.riderPhone}</p>
            <p className="text-[11px] text-zinc-500 pt-1">Payment: {receipt.paymentMethod}</p>
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
                <td className="py-2.5 text-right text-zinc-500">R10.00 / km</td>
                <td className="py-2.5 text-right font-medium">R{receipt.distanceFareZar.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium text-zinc-800">
                  Time-of-Day Tariff
                </td>
                <td className="py-2.5 text-right text-zinc-500">Scheduled Adjustment</td>
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
            SOLO is an independent subscription matching platform. 100% of this fare is remitted directly to the independent transport operator ({receipt.driverName}). No platform commission is deducted. Drivers operate as independent micro-enterprises registered under South African tax law.
          </p>
        </div>

        {/* Support & Lost Property Bar */}
        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs print:hidden">
          <div>
            <strong className="text-amber-900 block font-bold">Have an issue or left an item in the car?</strong>
            <span className="text-amber-700 text-[11px]">Report lost items or dispute this trip with our support team.</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/lost-phone"
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition text-[11px]"
            >
              Report Lost Phone
            </a>
            <a
              href="/rider"
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition text-[11px]"
            >
              Get Trip Support
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-zinc-400 pt-4 border-t border-zinc-200">
          Thank you for riding with SOLO • Zero Commission E-Hailing • Built by Boraine Tech (Pty) Ltd • www.solo-app.co.za
        </div>
      </div>
    </div>
  );
}
