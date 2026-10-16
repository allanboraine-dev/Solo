"use client"

import { useState, useEffect } from 'react'
import { LocateFixed, Clock, Home, Building2 } from 'lucide-react'
import { saveTrip, type MockTrip } from '@/lib/mockBackend'
import { reverseGeocode, getRouteDirections, calculateFare, type SearchResultPlace } from '@/utils/mapService'
import CustomSearchInput from './CustomSearchInput'

interface BookingFormProps {
  onLocationSelect: (type: 'pickup' | 'dropoff', lat: number, lng: number) => void
  currentUser?: { id: string; fullName?: string; phone?: string } | null
  onRequireAuth?: () => void
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

export default function BookingForm({ onLocationSelect, currentUser, onRequireAuth }: BookingFormProps) {
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [pickupDetail, setPickupDetail] = useState('')
  const [dropoffDetail, setDropoffDetail] = useState('')
  const [pickupTime, setPickupTime] = useState('')
  const [fare, setFare] = useState<number | null>(null)
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null)
  const [isBooking, setIsBooking] = useState(false)
  const [activeTripId, setActiveTripId] = useState<string | null>(null)

  const [realPickupCoords, setRealPickupCoords] = useState<{lat: number, lng: number} | null>(null)
  const [realDropoffCoords, setRealDropoffCoords] = useState<{lat: number, lng: number} | null>(null)

  const handleGetCurrentLocation = () => {
    if ('geolocation' in navigator) {
      setPickup('Locating...');
      
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
          
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
          setRealPickupCoords(coords)
          onLocationSelect('pickup', coords.lat, coords.lng)
        },
        (error) => {
          alert('Could not fetch location. Please ensure location services are enabled.')
          console.error(error)
          setPickup('')
        }
      )
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
          setDistanceKm(details.distanceKm);
          setDurationMinutes(details.durationMinutes);
          setFare(calculateFare(details.distanceKm));
        }
      } catch (err) {
        console.error("Commercial directions error:", err);
        setFare(null);
        setDistanceKm(null);
        setDurationMinutes(null);
      }
    };

    getDirections();
  }, [realPickupCoords, realDropoffCoords]);

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
      const riderId = currentUser?.id || "00000000-0000-0000-0000-000000000000" 
      const tripData: MockTrip = {
        id: crypto.randomUUID(),
        rider_id: riderId,
        pickup_location: fullPickupAddress,
        pickup_lat: realPickupCoords.lat, 
        pickup_lng: realPickupCoords.lng,
        dropoff_location: fullDropoffAddress,
        dropoff_lat: realDropoffCoords.lat,
        dropoff_lng: realDropoffCoords.lng,
        fare_amount: fare,
        status: 'requested',
        scheduled_time: pickupTime || undefined,
      };
      
      await saveTrip(tripData);
      setActiveTripId(tripData.id);
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
    <div className="space-y-3 md:space-y-4 relative animate-in fade-in slide-in-from-bottom-8 duration-700 w-full pb-2">
      <div className="space-y-2.5 md:space-y-3 relative z-20">
        {/* Pickup Location Search + House/Building Detail (z-30 so dropdown sits above Dropoff) */}
        <div className="space-y-1.5 relative z-30">
          <div className="relative flex items-center bg-white dark:bg-black border border-gray-200 dark:border-white/10 focus-within:border-blue-500/50 focus-within:ring-4 focus-within:ring-blue-500/10 rounded-2xl shadow-sm">
            <div className="w-full">
              <CustomSearchInput 
                placeholder="Pickup: House no, building, or street"
                value={pickup}
                onChange={setPickup}
                hasRightAction={true}
                proximityCoords={realPickupCoords}
                onSelect={(feature) => {
                  const coords = { lat: Number(feature.lat), lng: Number(feature.lon) };
                  setRealPickupCoords(coords);
                  setPickup(formatSelectedPlaceLabel(feature));
                  onLocationSelect('pickup', coords.lat, coords.lng);
                }}
              />
            </div>
            <button 
              type="button"
              onClick={() => handleGetCurrentLocation()} 
              className="absolute right-2.5 md:right-3 text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition bg-blue-50 dark:bg-blue-900/30 p-2 rounded-full z-10"
              title="Use Current Location"
            >
              <LocateFixed size={18} />
            </button>
          </div>
          {realPickupCoords && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/90 dark:bg-zinc-900/60 border border-gray-200/70 dark:border-white/5 rounded-xl">
              <Home size={14} className="text-blue-500 shrink-0" />
              <input
                type="text"
                value={pickupDetail}
                onChange={(e) => setPickupDetail(e.target.value)}
                placeholder="Add house #, unit, complex, or gate note (optional)"
                className="w-full bg-transparent text-base sm:text-xs font-medium text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none"
              />
            </div>
          )}
        </div>
        
        {/* Destination Location Search + House/Building Detail (z-20 so dropdown sits above Leave Now) */}
        <div className="space-y-1.5 relative z-20">
          <div className="relative flex items-center bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-white/5 focus-within:border-black dark:focus-within:border-white focus-within:bg-white dark:focus-within:bg-black rounded-2xl shadow-sm">
            <div className="w-full">
              <CustomSearchInput 
                placeholder="Dropoff: House no, building, or street"
                value={dropoff}
                onChange={setDropoff}
                proximityCoords={realPickupCoords}
                onSelect={(feature) => {
                  const coords = { lat: Number(feature.lat), lng: Number(feature.lon) };
                  setRealDropoffCoords(coords);
                  setDropoff(formatSelectedPlaceLabel(feature));
                  onLocationSelect('dropoff', coords.lat, coords.lng);
                }}
              />
            </div>
          </div>
          {realDropoffCoords && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50/90 dark:bg-zinc-900/60 border border-gray-200/70 dark:border-white/5 rounded-xl">
              <Building2 size={14} className="text-emerald-500 shrink-0" />
              <input
                type="text"
                value={dropoffDetail}
                onChange={(e) => setDropoffDetail(e.target.value)}
                placeholder="Add destination house #, building, or entrance (optional)"
                className="w-full bg-transparent text-base sm:text-xs font-medium text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none"
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
          className={`w-full p-3.5 md:p-4 pl-11 md:pl-12 bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-white/5 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 rounded-2xl transition-all outline-none font-medium text-base sm:text-[15px] shadow-sm ${!pickupTime ? 'text-transparent' : 'text-gray-700 dark:text-gray-300'}`} 
        />
        <Clock className="absolute left-3.5 md:left-4 text-blue-500" size={18} />
        {!pickupTime && <span className="absolute left-11 md:left-12 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 text-sm md:text-[15px] font-medium">Leave Now</span>}
      </div>
      
      {fare !== null && distanceKm !== null && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50/50 dark:from-blue-950/40 dark:to-indigo-950/20 rounded-2xl p-3.5 md:p-4 border border-blue-100 dark:border-blue-900/40 flex justify-between items-center animate-in fade-in zoom-in-95">
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <p className="text-xs md:text-sm font-bold text-blue-900 dark:text-blue-100">Estimated Fare</p>
              {durationMinutes && (
                <span className="text-[10px] font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/60 px-1.5 py-0.5 rounded">
                  Live Traffic
                </span>
              )}
            </div>
            <p className="text-[11px] md:text-xs text-blue-600 dark:text-blue-300 font-medium">
              {distanceKm.toFixed(1)} km {durationMinutes ? `• ~${durationMinutes} min drive` : ''}
            </p>
          </div>
          <div className="text-xl md:text-2xl font-black text-blue-600 dark:text-blue-400">
            R{fare}
          </div>
        </div>
      )}

      <button 
        onClick={handleBook}
        disabled={isBooking || fare === null}
        className="w-full bg-black dark:bg-white text-white dark:text-black font-bold p-3.5 md:p-4 rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 shadow-xl shadow-black/10 dark:shadow-white/5 flex justify-center items-center gap-2"
      >
        {isBooking ? (
          <div className="w-6 h-6 border-2 border-white/30 dark:border-black/30 border-t-white dark:border-t-black rounded-full animate-spin" />
        ) : (
          'Request Ride'
        )}
      </button>
    </div>
  )
}
