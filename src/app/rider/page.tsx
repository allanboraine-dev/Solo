"use client"

import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import BookingForm from '@/components/BookingForm'
import { subscribeToEvents, getTrips, saveTrip, type MockTrip } from '@/lib/mockBackend'
import Chat from '@/components/Chat'

// Dynamically import Map component to disable SSR
const MapComponent = dynamic(() => import('@/components/MapComponent'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 dark:bg-zinc-900 text-gray-400 gap-4">
      <div className="w-10 h-10 border-4 border-gray-300 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin"></div>
      <p className="text-sm font-medium animate-pulse">Loading map data...</p>
    </div>
  )
})

export default function RiderPage() {
  const [pickupCoords, setPickupCoords] = useState<{lat: number, lng: number} | null>(null)
  const [dropoffCoords, setDropoffCoords] = useState<{lat: number, lng: number} | null>(null)
  const [activeTrip, setActiveTrip] = useState<MockTrip | null>(null)
  const [driverCoords, setDriverCoords] = useState<{lat: number, lng: number} | null>(null)
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)

  useEffect(() => {
    // Check if there is an active trip on mount
    const loadTrips = async () => {
      const trips = await getTrips();
      const active = trips.find(t => t.status !== 'completed');
      if (active) {
        setActiveTrip(active);
      }
    };
    loadTrips();

    const unsubscribeTrip = subscribeToEvents((type, payload) => {
      if (type === 'trip_updated') {
        const trip = payload as MockTrip;
        if (trip.status === 'completed') {
          setActiveTrip(null);
          setDriverCoords(null);
          alert("Your trip has ended. Thank you for riding with SOLO!");
        } else {
          setActiveTrip(trip);
        }
      } else if (type === 'driver_location') {
        if (payload.tripId === activeTrip?.id) {
          setDriverCoords({ lat: payload.lat, lng: payload.lng });
        }
      }
    });

    return () => {
      unsubscribeTrip();
    }
  }, [activeTrip?.id]);

  const handlePayDriver = async () => {
    if (!activeTrip) return;
    setIsProcessingPayment(true);
    // Simulate payment process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const updated = { ...activeTrip, status: 'completed' as const };
    saveTrip(updated);
    // The event listener will catch the 'completed' status and clear the active trip.
    setIsProcessingPayment(false);
  }

  const handleLocationSelect = (type: 'pickup' | 'dropoff', lat: number, lng: number) => {
    if (type === 'pickup') setPickupCoords({ lat, lng })
    else setDropoffCoords({ lat, lng })
  }

  return (
    <div className="h-screen w-full relative overflow-hidden bg-gray-100 dark:bg-zinc-900 -mt-24">
      {/* Map Background layer */}
      <div className="absolute inset-0 z-0">
        <MapComponent 
          pickupLat={activeTrip ? activeTrip.pickup_lat : pickupCoords?.lat}
          pickupLng={activeTrip ? activeTrip.pickup_lng : pickupCoords?.lng}
          dropoffLat={activeTrip ? activeTrip.dropoff_lat : dropoffCoords?.lat}
          dropoffLng={activeTrip ? activeTrip.dropoff_lng : dropoffCoords?.lng}
          driverLat={driverCoords?.lat}
          driverLng={driverCoords?.lng}
        />
      </div>

      {/* Floating UI Panel */}
      <div className="absolute top-28 left-4 md:left-8 w-[calc(100vw-32px)] md:w-96 max-h-[calc(100vh-140px)] flex flex-col z-10">
        <div className="bg-white/80 dark:bg-zinc-950/80 backdrop-blur-2xl shadow-2xl rounded-3xl border border-white/40 dark:border-white/10 overflow-hidden flex flex-col max-h-full">
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            {!activeTrip ? (
              <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                <div className="mb-6 flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-2xl shadow-lg shadow-blue-500/30">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight">Where to?</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Request a ride in South Africa</p>
                  </div>
                </div>
                <BookingForm onLocationSelect={handleLocationSelect} />
              </div>
            ) : (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-left-4 duration-500">
                <h2 className="text-2xl font-bold mb-4 tracking-tight">Trip Status</h2>
                
                <div className="p-5 bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-900/10 rounded-2xl mb-6 border border-blue-100 dark:border-blue-800/50">
                  <div className="font-bold text-lg capitalize mb-1 text-blue-600 dark:text-blue-400 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                    {activeTrip.status.replace('_', ' ')}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                    {activeTrip.scheduled_time && activeTrip.status === 'requested' && (
                      <span className="block mb-1 text-blue-500">
                        Scheduled for: {new Date(activeTrip.scheduled_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    )}
                    {activeTrip.status === 'requested' && (!activeTrip.scheduled_time ? 'Finding your driver...' : 'Waiting for driver to accept scheduled ride...')}
                    {activeTrip.status === 'accepted' && 'Your driver is on the way!'}
                    {activeTrip.status === 'in_progress' && 'Heading to destination...'}
                  </p>
                </div>

                <div className="flex-1 min-h-[300px] overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black shadow-inner">
                  <Chat tripId={activeTrip.id} role="rider" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rider Payment Modal */}
      {activeTrip?.status === 'payment_pending' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-950 rounded-3xl w-full max-w-md p-6 shadow-2xl border border-gray-200 dark:border-white/10 relative animate-in zoom-in-95 duration-300">
            <h2 className="text-2xl font-black mb-1">Settle Fare</h2>
            <p className="text-gray-500 mb-6 text-sm">Your driver has requested payment to complete the trip.</p>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-6 mb-6 border border-blue-100 dark:border-blue-900/50 flex flex-col items-center">
              <span className="text-blue-800 dark:text-blue-300 font-bold mb-1 uppercase tracking-wider text-xs">Total Due</span>
              <span className="font-black text-5xl text-blue-600 dark:text-blue-400">R{activeTrip.fare_amount}</span>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Card Information</label>
                <div className="relative">
                  <input type="text" placeholder="Card number" className="w-full p-4 bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-t-xl outline-none focus:border-blue-500 transition-colors" />
                  <div className="flex border border-t-0 border-gray-200 dark:border-gray-800 rounded-b-xl overflow-hidden">
                    <input type="text" placeholder="MM / YY" className="w-1/2 p-4 bg-white dark:bg-black border-r border-gray-200 dark:border-gray-800 outline-none focus:border-blue-500 transition-colors" />
                    <input type="text" placeholder="CVC" className="w-1/2 p-4 bg-white dark:bg-black outline-none focus:border-blue-500 transition-colors" />
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={handlePayDriver}
              disabled={isProcessingPayment}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/30 flex justify-center items-center gap-2 active:scale-95"
            >
              {isProcessingPayment ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Processing...
                </>
              ) : (
                `Pay R${activeTrip.fare_amount}`
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
