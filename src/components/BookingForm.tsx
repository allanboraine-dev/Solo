"use client"

import { useState, useEffect, useRef } from 'react'
import { LocateFixed, Clock } from 'lucide-react'
import { saveTrip, type MockTrip } from '@/lib/mockBackend'
import { useMapsLibrary } from '@vis.gl/react-google-maps'

interface BookingFormProps {
  onLocationSelect: (type: 'pickup' | 'dropoff', lat: number, lng: number) => void
}

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

  // Google Maps Libraries
  const placesLibrary = useMapsLibrary('places');
  const routesLibrary = useMapsLibrary('routes');

  const pickupInputRef = useRef<HTMLInputElement>(null);
  const dropoffInputRef = useRef<HTMLInputElement>(null);

  const [pickupAutocomplete, setPickupAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [dropoffAutocomplete, setDropoffAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  // Initialize Autocomplete
  useEffect(() => {
    if (!placesLibrary || !pickupInputRef.current || !dropoffInputRef.current) return;

    const options = {
      componentRestrictions: { country: 'za' },
      fields: ['geometry', 'name', 'formatted_address'],
    };

    const pAuto = new placesLibrary.Autocomplete(pickupInputRef.current, options);
    const dAuto = new placesLibrary.Autocomplete(dropoffInputRef.current, options);

    setPickupAutocomplete(pAuto);
    setDropoffAutocomplete(dAuto);
  }, [placesLibrary]);

  // Listen for Place changes
  useEffect(() => {
    if (!pickupAutocomplete) return;
    const listener = pickupAutocomplete.addListener('place_changed', () => {
      const place = pickupAutocomplete.getPlace();
      if (place.geometry?.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        setPickup(place.name || place.formatted_address || '');
        setRealPickupCoords({ lat, lng });
        onLocationSelect('pickup', lat, lng);
      }
    });
    return () => google.maps.event.removeListener(listener);
  }, [pickupAutocomplete, onLocationSelect]);

  useEffect(() => {
    if (!dropoffAutocomplete) return;
    const listener = dropoffAutocomplete.addListener('place_changed', () => {
      const place = dropoffAutocomplete.getPlace();
      if (place.geometry?.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        setDropoff(place.name || place.formatted_address || '');
        setRealDropoffCoords({ lat, lng });
        onLocationSelect('dropoff', lat, lng);
      }
    });
    return () => google.maps.event.removeListener(listener);
  }, [dropoffAutocomplete, onLocationSelect]);

  const handleGetCurrentLocation = () => {
    if ('geolocation' in navigator) {
      setPickup('Locating...');
      if (pickupInputRef.current) pickupInputRef.current.value = 'Locating...';
      
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
          
          let address = 'Current Location';
          if (window.google) {
            const geocoder = new google.maps.Geocoder();
            try {
              const response = await geocoder.geocode({ location: coords });
              if (response.results[0]) {
                address = response.results[0].formatted_address;
              }
            } catch (e) {
              console.error("Geocoder failed", e);
            }
          }
          
          setPickup(address)
          if (pickupInputRef.current) pickupInputRef.current.value = address
          setRealPickupCoords(coords)
          onLocationSelect('pickup', coords.lat, coords.lng)
        },
        (error) => {
          alert('Could not fetch location. Please ensure location services are enabled.')
          console.error(error)
          setPickup('')
          if (pickupInputRef.current) pickupInputRef.current.value = ''
        }
      )
    }
  }

  // Calculate Route & Fare
  useEffect(() => {
    if (!routesLibrary || !realPickupCoords || !realDropoffCoords) return;

    const directionsService = new routesLibrary.DirectionsService();
    directionsService.route({
      origin: realPickupCoords,
      destination: realDropoffCoords,
      travelMode: google.maps.TravelMode.DRIVING,
    }).then((response) => {
      const route = response.routes[0];
      if (route && route.legs[0]) {
        const distanceInMeters = route.legs[0].distance?.value || 0;
        const km = distanceInMeters / 1000;
        setDistanceKm(km);
        
        // Base fare: R20. Per KM: R10
        const calculatedFare = Math.max(30, Math.round(20 + (km * 10)));
        setFare(calculatedFare);
      }
    }).catch(err => {
      console.error("Directions error:", err);
      setFare(null);
      setDistanceKm(null);
    });

  }, [realPickupCoords, realDropoffCoords, routesLibrary]);

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
    <div className="bg-white/80 dark:bg-black/40 backdrop-blur-3xl rounded-[32px] p-6 md:p-8 shadow-2xl border border-white/20 dark:border-white/5 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="space-y-6 relative">
        <div className="absolute left-6 top-8 bottom-[140px] w-0.5 bg-gray-200 dark:bg-zinc-800 z-0"></div>

        <div className="space-y-4 relative z-10">
          <div className="relative flex items-center">
            <input 
              ref={pickupInputRef}
              type="text" 
              defaultValue={pickup}
              onChange={(e) => setPickup(e.target.value)}
              className="w-full p-4 pr-12 bg-white dark:bg-black border border-transparent focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 rounded-2xl transition-all outline-none font-medium text-[15px] shadow-sm" 
              placeholder="Current location" 
            />
            <button 
              onClick={() => handleGetCurrentLocation()} 
              className="absolute right-4 text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition bg-blue-50 dark:bg-blue-900/30 p-2 rounded-full"
              title="Use Current Location"
            >
              <LocateFixed size={18} />
            </button>
          </div>
          
          <div className="relative flex items-center">
            <input 
              ref={dropoffInputRef}
              type="text" 
              defaultValue={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
              className="w-full p-4 bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-white/5 focus:border-black dark:focus:border-white focus:bg-white dark:focus:bg-black rounded-2xl transition-all outline-none font-medium text-[15px] shadow-sm" 
              placeholder="Where to?" 
            />
          </div>
        </div>

        <div className="relative flex items-center">
          <input 
            type="datetime-local" 
            value={pickupTime}
            onChange={(e) => setPickupTime(e.target.value)}
            className="w-full p-4 pl-12 bg-gray-50 dark:bg-zinc-900/50 border border-gray-200 dark:border-white/5 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 rounded-2xl transition-all outline-none font-medium text-[15px] shadow-sm text-gray-700 dark:text-gray-300" 
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
    </div>
  )
}
// Source: Google Maps Platform Code Assist
