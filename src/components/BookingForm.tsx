"use client"

import { useState, useEffect } from 'react'
import { LocateFixed, Clock, Home, Building2, Car, ShieldCheck, MapPin, ChevronRight, Star, CreditCard, Banknote, User, Users } from 'lucide-react'
import { saveTrip, getRiderSessionId, setRiderActiveTripId, type MockTrip, type LiveDriver } from '@/lib/mockBackend'
import { generateUuid } from '@/utils/session'
import { reverseGeocode, getRouteDirections, calculateFare, calculateDynamicFare, type SearchResultPlace, type TariffTier, type CompetitorFareComparison } from '@/utils/mapService'
import { dispatchRideRequestPush } from '@/utils/pushClient'
import CustomSearchInput from './CustomSearchInput'

interface BookingFormProps {
  onLocationSelect: (type: 'pickup' | 'dropoff', lat: number, lng: number) => void
  currentUser?: { id: string; fullName?: string; phone?: string } | null
  onRequireAuth?: () => void
  onTripCreated?: (trip: MockTrip) => void
  availableDrivers?: LiveDriver[]
  onViewAllDrivers?: () => void
  onLocateDriverOnMap?: (driver: LiveDriver) => void
  onPickOnMapRequest?: (type: 'pickup' | 'dropoff') => void
  mapPickedLocation?: { type: 'pickup' | 'dropoff'; lat: number; lng: number; address: string } | null
}

function formatSelectedPlaceLabel(feature: SearchResultPlace): string {
  const parts: string[] = [];
  if (feature.name) parts.push(feature.name.trim());
  if (feature.suburb && !parts.some(p => p.toLowerCase().includes(feature.suburb!.toLowerCase()))) {
    parts.push(feature.suburb.trim());
  }
  if (feature.city && !parts.some(p => p.toLowerCase().includes(feature.city!.toLowerCase()))) {
    parts.push(feature.city.trim());
  }
  if (parts.length >= 2) {
    return parts.join(', ');
  }
  // Fallback to first 3 segments of display_name so house number + street + suburb are preserved
  const displaySegments = (feature.display_name || feature.name || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  return displaySegments.join(', ') || feature.name;
}

export default function BookingForm({
  onLocationSelect,
  currentUser,
  onRequireAuth,
  onTripCreated,
  availableDrivers = [],
  onViewAllDrivers,
  onLocateDriverOnMap,
  onPickOnMapRequest,
  mapPickedLocation,
}: BookingFormProps) {
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [pickupDetail, setPickupDetail] = useState('')
  const [dropoffDetail, setDropoffDetail] = useState('')
  const [pickupTime, setPickupTime] = useState('')
  const [fare, setFare] = useState<number | null>(null)
  const [appliedTariff, setAppliedTariff] = useState<TariffTier | null>(null)
  const [fareComparison, setFareComparison] = useState<CompetitorFareComparison | null>(null)
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null)
  const [isBooking, setIsBooking] = useState(false)
  const [activeTripId, setActiveTripId] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'speedpoint' | 'cash'>('speedpoint')
  const [occupantCount, setOccupantCount] = useState<1 | 2>(1)

  const [realPickupCoords, setRealPickupCoords] = useState<{lat: number, lng: number} | null>(null)
  const [realDropoffCoords, setRealDropoffCoords] = useState<{lat: number, lng: number} | null>(null)

  // Listen to coordinates picked directly on the map
  useEffect(() => {
    if (!mapPickedLocation) return;
    const { type, lat, lng, address } = mapPickedLocation;
    if (type === 'pickup') {
      setRealPickupCoords({ lat, lng });
      setPickup(address);
      onLocationSelect('pickup', lat, lng);
    } else {
      setRealDropoffCoords({ lat, lng });
      setDropoff(address);
      onLocationSelect('dropoff', lat, lng);
    }
  }, [mapPickedLocation]);

  const handleGetCurrentLocation = () => {
    if ('geolocation' in navigator) {
      setPickup('Locating...');
      
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
          
          // Immediately anchor pickup coordinates and center the map on actual GPS position
          setRealPickupCoords(coords)
          onLocationSelect('pickup', coords.lat, coords.lng)

          let address = 'Current Location';
          try {
            const resolved = await reverseGeocode(coords.lat, coords.lng);
            if (resolved) {
              address = resolved
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
                .slice(0, 3)
                .join(', ') || resolved;
            }
          } catch (e) {
            console.error("Geocoder failed", e);
          }
          
          setPickup(address)
        },
        (error) => {
          alert('Could not fetch GPS location. Please ensure location services are enabled on your device.')
          console.error('Geolocation error:', error)
          setPickup('')
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
      )
    } else {
      alert('Geolocation is not supported by your browser.')
    }
  }

  // Calculate Route, Live Traffic Duration & Fare using Mapbox Directions
  useEffect(() => {
    if (!realPickupCoords || !realDropoffCoords) return;

    const getDirections = async () => {
      try {
        const details = await getRouteDirections(
          realPickupCoords.lng,
          realPickupCoords.lat,
          realDropoffCoords.lng,
          realDropoffCoords.lat
        );

        if (details) {
          const targetDate = pickupTime ? new Date(pickupTime) : new Date();
          const dynamicFare = calculateDynamicFare(details.distanceKm, targetDate, {
            durationMinutes: details.durationMinutes,
            occupantCount,
          });
          setDistanceKm(details.distanceKm);
          setDurationMinutes(details.durationMinutes);
          setFare(dynamicFare.totalFare);
          setAppliedTariff(dynamicFare.tariff);
          setFareComparison(dynamicFare.comparison);
        }
      } catch (err) {
        console.error("Commercial directions error:", err);
        setFare(null);
        setAppliedTariff(null);
        setFareComparison(null);
        setDistanceKm(null);
        setDurationMinutes(null);
      }
    };

    getDirections();
  }, [realPickupCoords, realDropoffCoords]);

  // Recalculate fare & competitor savings instantly when occupantCount (1 vs 2 riders) or pickupTime changes
  useEffect(() => {
    if (distanceKm === null) return;
    const targetDate = pickupTime ? new Date(pickupTime) : new Date();
    const dynamicFare = calculateDynamicFare(distanceKm, targetDate, {
      durationMinutes: durationMinutes ?? undefined,
      occupantCount,
    });
    setFare(dynamicFare.totalFare);
    setAppliedTariff(dynamicFare.tariff);
    setFareComparison(dynamicFare.comparison);
  }, [distanceKm, durationMinutes, occupantCount, pickupTime]);

  const handleBook = async () => {
    if (fare === null || !realPickupCoords || !realDropoffCoords) return

    // Require authentication before requesting a ride
    if (!currentUser && onRequireAuth) {
      onRequireAuth();
      return;
    }

    const fullPickupAddress = pickupDetail.trim()
      ? `${pickupDetail.trim()} — ${pickup}`
      : pickup;
    const fullDropoffAddress = dropoffDetail.trim()
      ? `${dropoffDetail.trim()} — ${dropoff}`
      : dropoff;

    setIsBooking(true)
    try {
      const riderId = getRiderSessionId(currentUser?.id);
      const tripData: MockTrip = {
        id: generateUuid(),
        rider_id: riderId,
        pickup_location: fullPickupAddress,
        pickup_lat: realPickupCoords.lat, 
        pickup_lng: realPickupCoords.lng,
        dropoff_location: fullDropoffAddress,
        dropoff_lat: realDropoffCoords.lat,
        dropoff_lng: realDropoffCoords.lng,
        fare_amount: fare,
        passenger_count: occupantCount,
        payment_method: paymentMethod,
        status: 'requested',
        scheduled_time: pickupTime || undefined,
      };
      
      setRiderActiveTripId(tripData.id);
      await saveTrip(tripData);
      setActiveTripId(tripData.id);

      // Trigger Web Push alert to all online/subscribed drivers across mobile and desktop
      dispatchRideRequestPush({
        tripId: tripData.id,
        pickupAddress: tripData.pickup_location,
        dropoffAddress: tripData.dropoff_location,
        fareZar: tripData.fare_amount,
      }).catch(err => console.warn('[BookingForm] Web push dispatch non-blocking error:', err));

      if (onTripCreated) {
        onTripCreated(tripData);
      }
    } finally {
      setIsBooking(false)
    }
  }

  if (activeTripId) {
    return (
      <div className="bg-white/80 dark:bg-black/40 backdrop-blur-3xl rounded-[32px] p-8 shadow-2xl border border-white/20 dark:border-white/5 animate-in fade-in slide-in-from-bottom-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-6">
            <div className="w-8 h-8 border-4 border-current border-t-transparent rounded-full animate-spin" />
          </div>
          <h3 className="text-2xl font-black mb-2 tracking-tight">Looking for drivers</h3>
          <p className="text-gray-500 font-medium">Broadcasting your request to nearby drivers...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3.5 md:space-y-4 relative animate-in fade-in slide-in-from-bottom-8 duration-700 w-full pb-6 md:pb-8">
      <div className="space-y-3 relative z-20">
        {/* Pickup Location Search + House/Building Detail (z-30 so dropdown sits above Dropoff) */}
        <div className="space-y-2 relative z-30">
          <div className="relative flex items-center bg-white dark:bg-black border-2 border-gray-200 dark:border-white/15 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/15 rounded-2xl shadow-sm">
            <div className="w-full">
              <CustomSearchInput 
                label="Pickup Location"
                placeholder="Pickup: House no, building, or street"
                value={pickup}
                onChange={setPickup}
                hasRightAction={true}
                proximityCoords={realPickupCoords}
                onGetCurrentLocation={handleGetCurrentLocation}
                onSelectOnMap={onPickOnMapRequest ? () => onPickOnMapRequest('pickup') : undefined}
                onSelect={(feature) => {
                  const coords = { lat: Number(feature.lat), lng: Number(feature.lon) };
                  setRealPickupCoords(coords);
                  setPickup(formatSelectedPlaceLabel(feature));
                  if (feature.houseNumber && !pickupDetail) {
                    setPickupDetail(`House #${feature.houseNumber}`);
                  }
                  onLocationSelect('pickup', coords.lat, coords.lng);
                }}
              />
            </div>
            <button 
              type="button"
              onClick={() => handleGetCurrentLocation()} 
              className="absolute right-2.5 md:right-3 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition bg-blue-50 dark:bg-blue-900/40 min-w-[44px] min-h-[44px] p-2.5 rounded-xl flex items-center justify-center z-10 active:scale-95"
              title="Use Current Location"
            >
              <LocateFixed size={20} />
            </button>
          </div>
          {realPickupCoords && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-gray-50/95 dark:bg-zinc-900/80 border border-gray-200/80 dark:border-white/10 rounded-xl">
              <Home size={18} className="text-blue-500 shrink-0" />
              <input
                type="text"
                value={pickupDetail}
                onChange={(e) => setPickupDetail(e.target.value)}
                placeholder="Add house #, unit, complex, or gate note (optional)"
                className="w-full bg-transparent text-base font-medium text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 outline-none"
              />
            </div>
          )}
        </div>
        
        {/* Destination Location Search + House/Building Detail (z-20 so dropdown sits above Leave Now) */}
        <div className="space-y-2 relative z-20">
          <div className="relative flex items-center bg-gray-50 dark:bg-zinc-900/60 border-2 border-gray-200 dark:border-white/15 focus-within:border-black dark:focus-within:border-white focus-within:bg-white dark:focus-within:bg-black rounded-2xl shadow-sm">
            <div className="w-full">
              <CustomSearchInput 
                label="Destination / Dropoff"
                placeholder="Dropoff: House no, building, or street"
                value={dropoff}
                onChange={setDropoff}
                proximityCoords={realPickupCoords}
                onSelectOnMap={onPickOnMapRequest ? () => onPickOnMapRequest('dropoff') : undefined}
                onSelect={(feature) => {
                  const coords = { lat: Number(feature.lat), lng: Number(feature.lon) };
                  setRealDropoffCoords(coords);
                  setDropoff(formatSelectedPlaceLabel(feature));
                  if (feature.houseNumber && !dropoffDetail) {
                    setDropoffDetail(`House #${feature.houseNumber}`);
                  }
                  onLocationSelect('dropoff', coords.lat, coords.lng);
                }}
              />
            </div>
          </div>
          {realDropoffCoords && (
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-gray-50/95 dark:bg-zinc-900/80 border border-gray-200/80 dark:border-white/10 rounded-xl">
              <Building2 size={18} className="text-emerald-500 shrink-0" />
              <input
                type="text"
                value={dropoffDetail}
                onChange={(e) => setDropoffDetail(e.target.value)}
                placeholder="Add destination house #, building, or entrance (optional)"
                className="w-full bg-transparent text-base font-medium text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 outline-none"
              />
            </div>
          )}
        </div>
      </div>

      <div className="relative flex items-center z-10">
        <input 
          type="datetime-local" 
          value={pickupTime}
          onChange={(e) => setPickupTime(e.target.value)}
          className={`w-full p-4 pl-12 min-h-[52px] bg-gray-50 dark:bg-zinc-900/60 border border-gray-200 dark:border-white/10 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-2xl transition-all outline-none font-semibold text-base shadow-sm ${!pickupTime ? 'text-transparent' : 'text-gray-800 dark:text-gray-200'}`} 
        />
        <Clock className="absolute left-4 text-blue-500" size={20} />
        {!pickupTime && <span className="absolute left-12 top-1/2 -translate-y-1/2 pointer-events-none text-gray-600 dark:text-gray-300 text-base font-semibold">Leave Now</span>}
      </div>
      
      {fare !== null && distanceKm !== null && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50/50 dark:from-blue-950/40 dark:to-indigo-950/20 rounded-2xl p-4 border border-blue-200 dark:border-blue-800/50 space-y-3 animate-in fade-in zoom-in-95">
          <div className="flex justify-between items-start gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-sm md:text-base font-extrabold text-blue-950 dark:text-blue-100">SOLO Lowest Fare</p>
                <span className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/70 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/60">
                  Price-Beat Guaranteed
                </span>
                {durationMinutes && (
                  <span className="text-xs font-bold text-blue-800 dark:text-blue-200 bg-blue-100 dark:bg-blue-900/60 px-2 py-0.5 rounded-md">
                    Live Traffic
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300 font-semibold">
                {distanceKm.toFixed(1)} km {durationMinutes ? `• ~${durationMinutes} min drive` : ''} • {occupantCount === 1 ? 'Solo Saver Rate' : '2 Riders (+R4)'}
              </p>
              {appliedTariff && (
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full border bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/60 shadow-2xs">
                    {appliedTariff.badge}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-zinc-300 font-medium">
                    {appliedTariff.multiplier > 1.0 ? `+${Math.round((appliedTariff.multiplier - 1) * 100)}% Time-of-Day` : '0% Surge • 0% Commission'}
                  </span>
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-3xl md:text-4xl font-black text-blue-600 dark:text-blue-400 leading-none">
                R{fare}
              </div>
              {fareComparison && (
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  Save up to R{fareComparison.riderSavingsMaxZar}
                </p>
              )}
            </div>
          </div>

          {/* Live Competitor Price Comparison Bar */}
          {fareComparison && (
            <div className="pt-2.5 border-t border-blue-200/60 dark:border-blue-800/40 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <span className="font-bold text-gray-700 dark:text-gray-200">Compare:</span>
                <span>
                  Bolt <span className="line-through text-red-500 dark:text-red-400 font-bold">~R{fareComparison.boltEstimateZar}</span>
                </span>
                <span>•</span>
                <span>
                  Uber <span className="line-through text-red-500 dark:text-red-400 font-bold">~R{fareComparison.uberEstimateZar}</span>
                </span>
              </div>
              <span className="font-extrabold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-300/60 dark:border-emerald-700/50 text-xs">
                {fareComparison.savingsPercentVsLowest}%–{fareComparison.savingsPercentVsHighest}% Cheaper
              </span>
            </div>
          )}
        </div>
      )}

      {/* Number of Occupants Selector: Maximum 2 Riders Per Trip */}
      <div className="p-3 rounded-2xl bg-gray-50/95 dark:bg-zinc-900/70 border border-gray-200/80 dark:border-white/10 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap px-1">
          <span className="text-xs sm:text-sm font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
            Number of Occupants
          </span>
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
            1 Rider = Extra Solo Discount
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setOccupantCount(1)}
            className={`flex items-center justify-center gap-1.5 py-3 px-2.5 min-h-[48px] rounded-xl text-xs sm:text-sm md:text-base font-bold transition-all touch-manipulation border text-center leading-tight ${
              occupantCount === 1
                ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                : 'bg-white dark:bg-zinc-950 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <User size={18} className="shrink-0" />
            <span>1 Rider (Lowest)</span>
          </button>
          <button
            type="button"
            onClick={() => setOccupantCount(2)}
            className={`flex items-center justify-center gap-1.5 py-3 px-2.5 min-h-[48px] rounded-xl text-xs sm:text-sm md:text-base font-bold transition-all touch-manipulation border text-center leading-tight ${
              occupantCount === 2
                ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                : 'bg-white dark:bg-zinc-950 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Users size={18} className="shrink-0" />
            <span>2 Riders (+R4)</span>
          </button>
        </div>
      </div>

      {/* Ride Payment Options: Speedpoint Machine or Cash */}
      <div className="p-3 rounded-2xl bg-gray-50/95 dark:bg-zinc-900/70 border border-gray-200/80 dark:border-white/10 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap px-1">
          <span className="text-xs sm:text-sm font-extrabold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
            Ride Payment Method
          </span>
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
            0% Commission • Pay Driver
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPaymentMethod('speedpoint')}
            className={`flex items-center justify-center gap-1.5 py-3 px-2.5 min-h-[48px] rounded-xl text-xs sm:text-sm md:text-base font-bold transition-all touch-manipulation border text-center leading-tight ${
              paymentMethod === 'speedpoint'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                : 'bg-white dark:bg-zinc-950 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <CreditCard size={18} className="shrink-0" />
            <span>Speedpoint POS</span>
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod('cash')}
            className={`flex items-center justify-center gap-1.5 py-3 px-2.5 min-h-[48px] rounded-xl text-xs sm:text-sm md:text-base font-bold transition-all touch-manipulation border text-center leading-tight ${
              paymentMethod === 'cash'
                ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                : 'bg-white dark:bg-zinc-950 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Banknote size={18} className="shrink-0" />
            <span>Cash</span>
          </button>
        </div>
        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 px-1 leading-snug">
          {paymentMethod === 'speedpoint'
            ? 'Tap or insert your debit/credit card on the driver’s in-car Speedpoint machine at drop-off.'
            : 'Pay the driver directly with physical cash upon arrival.'}
        </p>
      </div>

      {/* Primary Request Ride Button Placed Immediately Below Inputs/Fare */}
      <button 
        onClick={handleBook}
        disabled={isBooking || fare === null}
        className="w-full bg-blue-600 hover:bg-blue-500 dark:bg-white dark:text-black text-white font-black py-4 px-5 min-h-[56px] rounded-2xl hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-45 disabled:hover:scale-100 shadow-xl shadow-blue-600/25 dark:shadow-white/5 flex justify-center items-center gap-2.5 text-base md:text-lg md:relative sticky bottom-0 z-10 text-center leading-snug"
      >
        {isBooking ? (
          <div className="w-6 h-6 border-2 border-white/30 dark:border-black/30 border-t-white dark:border-t-black rounded-full animate-spin" />
        ) : fare !== null ? (
          `Request Ride • R${fare} • ${occupantCount} ${occupantCount === 1 ? 'Rider' : 'Riders'} (${
            paymentMethod === 'speedpoint' ? 'Speedpoint' : 'Cash'
          })`
        ) : (
          'Select Pickup & Dropoff to Book'
        )}
      </button>

      {/* Online Drivers & Vehicle Telematics Section for Riders */}
      <div className="pt-0.5">
        <div className="bg-gray-50/95 dark:bg-zinc-900/70 rounded-2xl p-3 md:p-3.5 border border-gray-200/80 dark:border-white/10 space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                Drivers Online ({availableDrivers.length})
              </span>
            </div>
            {availableDrivers.length > 0 && onViewAllDrivers && (
              <button
                type="button"
                onClick={onViewAllDrivers}
                className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 py-1 px-2"
              >
                <span>View All ({availableDrivers.length})</span>
                <ChevronRight size={16} />
              </button>
            )}
          </div>

          {availableDrivers.length === 0 ? (
            <div className="py-2 px-1 text-center">
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-snug">
                Registered drivers receive instant push alerts when you request a ride.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {availableDrivers.slice(0, 1).map((driver) => {
                const vehicleName = [driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' ') || 'Toyota Corolla Quest'
                const vehicleMeta = [driver.vehicleColor, driver.vehicleYear].filter(Boolean).join(' • ')
                const plate = driver.licensePlate || 'NC 482-910'

                return (
                  <div
                    key={driver.id}
                    className="p-3 bg-white dark:bg-zinc-950 rounded-xl border border-gray-200/80 dark:border-white/10 shadow-xs flex items-center justify-between gap-2.5 hover:border-blue-500/30 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                        {driver.fullName ? driver.fullName.charAt(0).toUpperCase() : 'D'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-bold text-sm text-gray-900 dark:text-white break-words">
                            {driver.fullName || 'Registered Driver'}
                          </p>
                          <span className="text-amber-500 font-bold text-xs flex items-center gap-0.5">
                            ★ {driver.rating ? driver.rating.toFixed(1) : '5.0'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-medium flex-wrap">
                          <Car size={14} className="text-blue-500 shrink-0" />
                          <span className="break-words">{vehicleName}</span>
                          {vehicleMeta && <span className="text-gray-500 text-xs">• {vehicleMeta}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <div className="px-2 py-0.5 bg-amber-300 dark:bg-amber-400 text-black font-mono font-bold text-xs rounded border border-black/60 shadow-2xs uppercase flex items-center gap-1">
                        <span className="text-[11px]">🇿🇦</span>
                        <span>{plate}</span>
                      </div>
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-bold">
                        {driver.distanceKm !== undefined ? `${driver.distanceKm.toFixed(1)} km away` : 'Online'}
                      </span>
                    </div>
                  </div>
                )
              })}

              {availableDrivers.length > 1 && onViewAllDrivers && (
                <button
                  type="button"
                  onClick={onViewAllDrivers}
                  className="w-full py-2.5 min-h-[44px] text-center text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/30 hover:bg-blue-100/70 dark:hover:bg-blue-950/50 rounded-xl transition border border-blue-200/80 dark:border-blue-900/40"
                >
                  + {availableDrivers.length - 1} more online drivers with car info
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
