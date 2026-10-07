"use client"

import { useState, useEffect } from 'react'
import { LocateFixed, Clock } from 'lucide-react'
import { saveTrip, type MockTrip } from '@/lib/mockBackend'
import CustomSearchInput from './CustomSearchInput'

interface BookingFormProps {
  onLocationSelect: (type: 'pickup' | 'dropoff', lat: number, lng: number) => void
}

const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

export default function BookingForm({ onLocationSelect }: BookingFormProps) {
  const [pickup, setPickup] = useState('')
  const [dropoff, setDropoff] = useState('')
  const [pickupTime, setPickupTime] = useState('')
  const [fare, setFare] = useState<number | null>(null)
  const [distanceKm, setDistanceKm] = useState<number | null>(null)
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
          if (mapboxToken) {
            try {
              const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords.lng},${coords.lat}.json?access_token=${mapboxToken}`;
              const res = await fetch(url);
              const data = await res.json();
              if (data.features && data.features.length > 0) {
                address = data.features[0].place_name;
              }
            } catch (e) {
              console.error("Geocoder failed", e);
            }
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

  // Calculate Route & Fare using Mapbox Directions API
  useEffect(() => {
    if (!mapboxToken || !realPickupCoords || !realDropoffCoords) return;

    const getDirections = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${realPickupCoords.lng},${realPickupCoords.lat};${realDropoffCoords.lng},${realDropoffCoords.lat}?overview=false`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.routes && data.routes[0]) {
          const route = data.routes[0];
          const distanceInMeters = route.distance || 0;
          const km = distanceInMeters / 1000;
          setDistanceKm(km);
          
          // Base fare: R20. Per KM: R10
          const calculatedFare = Math.max(30, Math.round(20 + (km * 10)));
          setFare(calculatedFare);
        }
      } catch (err) {
        console.error("Directions error:", err);
        setFare(null);
        setDistanceKm(null);
      }
    };

    getDirections();
  }, [realPickupCoords, realDropoffCoords]);

  const handleBook = async () => {
    if (fare === null || !realPickupCoords || !realDropoffCoords) return
    setIsBooking(true)
    try {
      const mockRiderId = "00000000-0000-0000-0000-000000000000" 
      const tripData: MockTrip = {
        id: crypto.randomUUID(),
        rider_id: mockRiderId,
        pickup_location: pickup,
        pickup_lat: realPickupCoords.lat, 
        pickup_lng: realPickupCoords.lng,
        dropoff_location: dropoff,
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
    <div className="space-y-6 relative animate-in fade-in slide-in-from-bottom-8 duration-700 w-full pb-4">
      <div className="absolute left-6 top-8 bottom-[140px] w-0.5 bg-gray-200 dark:bg-zinc-800 z-0"></div>

      <div className="space-y-4 relative z-10">
        <div className="relative flex items-center bg-white dark:bg-black border border-gray-200 dark:border-white/10 focus-within:border-blue-500/50 focus-within:ring-4 focus-within:ring-blue-500/10 rounded-2xl shadow-sm">
          <div className="w-full">
            <CustomSearchInput 
              placeholder="Search pickup location"
              value={pickup}
              onChange={setPickup}
              onSelect={(feature) => {
                const coords = { lat: parseFloat(feature.lat), lng: parseFloat(feature.lon) };
                setRealPickupCoords(coords);
                setPickup(feature.name || feature.display_name.split(',')[0]);
                onLocationSelect('pickup', coords.lat, coords.lng);
              }}
            />
          </div>
          <button 
            onClick={() => handleGetCurrentLocation()} 
            className="absolute right-4 text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition bg-blue-50 dark:bg-blue-900/30 p-2 rounded-full z-10"
            title="Use Current Location"
          >
            <LocateFixed size={18} />
          </button>
        </div>
        
        <div className="relative flex items-center bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-white/5 focus-within:border-black dark:focus-within:border-white focus-within:bg-white dark:focus-within:bg-black rounded-2xl shadow-sm">
          <div className="w-full">
            <CustomSearchInput 
              placeholder="Search destination"
              value={dropoff}
              onChange={setDropoff}
              onSelect={(feature) => {
                const coords = { lat: parseFloat(feature.lat), lng: parseFloat(feature.lon) };
                setRealDropoffCoords(coords);
                setDropoff(feature.name || feature.display_name.split(',')[0]);
                onLocationSelect('dropoff', coords.lat, coords.lng);
              }}
            />
          </div>
        </div>
      </div>

      <div className="relative flex items-center">
        <input 
          type="datetime-local" 
          value={pickupTime}
          onChange={(e) => setPickupTime(e.target.value)}
          className={`w-full p-4 pl-12 bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-white/5 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 rounded-2xl transition-all outline-none font-medium text-[15px] shadow-sm ${!pickupTime ? 'text-transparent' : 'text-gray-700 dark:text-gray-300'}`} 
        />
        <Clock className="absolute left-4 text-blue-500" size={18} />
        {!pickupTime && <span className="absolute left-12 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 text-[15px] font-medium">Leave Now</span>}
      </div>
      
      {fare !== null && distanceKm !== null && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-4 flex justify-between items-center animate-in fade-in zoom-in-95">
          <div>
            <p className="text-sm font-bold text-blue-900 dark:text-blue-100 mb-0.5">Estimated Fare</p>
            <p className="text-xs text-blue-600 dark:text-blue-300 font-medium">
              {distanceKm.toFixed(1)} km &middot; R20 base + R10/km
            </p>
          </div>
          <div className="text-2xl font-black text-blue-600 dark:text-blue-400">
            R{fare}
          </div>
        </div>
      )}

      <button 
        onClick={handleBook}
        disabled={isBooking || fare === null}
        className="w-full bg-black dark:bg-white text-white dark:text-black font-bold p-4 rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 shadow-xl shadow-black/10 dark:shadow-white/5 flex justify-center items-center gap-2"
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
