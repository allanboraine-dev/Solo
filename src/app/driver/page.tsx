"use client"

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import TripRequestModal from '@/components/TripRequestModal'
import { Car, Navigation, Power, User, MapPin, BookOpen } from 'lucide-react'
import { getTrips, saveTrip, subscribeToEvents, broadcastEvent, getDriverProfile, saveDriverProfile, type MockTrip, type MockDriverProfile } from '@/lib/mockBackend'
import { createClient } from '@/utils/supabase/client'
import Chat from '@/components/Chat'
import { useRouter } from 'next/navigation'

const MapComponent = dynamic(() => import('@/components/MapComponent'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 dark:bg-zinc-950 flex flex-col items-center justify-center">
      <div className="w-10 h-10 border-4 border-gray-300 dark:border-gray-700 border-t-green-500 rounded-full animate-spin"></div>
    </div>
  )
})

export default function DriverPage() {
  const router = useRouter()
  const [isOnline, setIsOnline] = useState(false)
  const [activeTab, setActiveTab] = useState<'home' | 'earnings' | 'profile' | 'help'>('home')
  
  const [request, setRequest] = useState<MockTrip | null>(null)
  const [activeTrip, setActiveTrip] = useState<MockTrip | null>(null)
  const [driverCoords, setDriverCoords] = useState<{lat: number, lng: number} | null>(null)
  const [profile, setProfile] = useState<MockDriverProfile | null>(null)
  const [completedTrips, setCompletedTrips] = useState<MockTrip[]>([])
  const [showSubModal, setShowSubModal] = useState(false)
  const [isProcessingSub, setIsProcessingSub] = useState(false)
  const [showFareCollection, setShowFareCollection] = useState(false)
  const [isWaitingForPayment, setIsWaitingForPayment] = useState(false)
  const [isTrialExpired, setIsTrialExpired] = useState(false)

  useEffect(() => {
    if (activeTab === 'earnings') {
      getTrips().then(trips => {
        setCompletedTrips(trips.filter(t => t.status === 'completed'))
      })
    }
  }, [activeTab, activeTrip])

  useEffect(() => {
    const loadProfile = async () => {
      const prof = await getDriverProfile();
      if (!prof) {
        router.push('/driver/login')
      } else {
        setProfile(prof)
        if (prof.subscriptionPlan === 'trial' && prof.trialStartedAt) {
          const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
          if (Date.now() - prof.trialStartedAt > SEVEN_DAYS) {
            setIsTrialExpired(true);
            setShowSubModal(true);
          }
        }
      }
    };
    loadProfile();
  }, [router])

  useEffect(() => {
    if (!isOnline) {
      setRequest(null)
      return;
    }
    
    // Check pending/active trips on mount
    const loadTrips = async () => {
      const trips = await getTrips();
      // Only find active trips assigned to THIS driver
      const active = trips.find(t => (t.status === 'accepted' || t.status === 'in_progress' || t.status === 'payment_pending') && t.driver_id === profile?.id);
      
      if (active) {
        setActiveTrip(active);
        if (active.status === 'payment_pending') setIsWaitingForPayment(true);
      } else {
        // Find requested trips that haven't been picked up
        const pending = trips.find(t => t.status === 'requested');
        if (pending) setRequest(pending);
      }
    };
    if (profile?.id) {
      loadTrips();
    }

    const unsubscribe = subscribeToEvents((type, payload) => {
      if (type === 'INSERT') {
        setRequest(payload as MockTrip);
      } else if (type === 'trip_updated') {
        const trip = payload as MockTrip;
        if (trip.status === 'requested' && !activeTrip) {
          setRequest(trip);
        } else if (activeTrip && trip.id === activeTrip.id && trip.status === 'completed') {
          setActiveTrip(null);
          setDriverCoords(null);
          setIsWaitingForPayment(false);
          setShowFareCollection(false);
          alert("Payment Received! Trip Completed.");
        } else if (activeTrip && trip.id === activeTrip.id) {
          setActiveTrip(trip);
        }
      }
    })
    
    return () => {
      unsubscribe();
    }
  }, [isOnline, activeTrip, profile?.id])

  // Real-time GPS Tracking
  useEffect(() => {
    if (!isOnline) return;

    if (!('geolocation' in navigator)) {
      console.warn("Geolocation is not supported by your browser");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setDriverCoords({ lat: latitude, lng: longitude });

        // Broadcast driver location to rider if on an active trip
        if (activeTrip) {
          broadcastEvent('driver_location', { tripId: activeTrip.id, lat: latitude, lng: longitude });
        }
      },
      (error) => {
        console.error("Error watching position:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isOnline, activeTrip]);

  const handleSubscribe = async () => {
    if (!profile) return;
    setIsProcessingSub(true);
    
    try {
      const response = await fetch('/api/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: profile.id,
          email: profile.email,
        }),
      });
      
      const data = await response.json();
      if (data.url) {
        // Redirect to Paystack Hosted Checkout
        window.location.href = data.url;
      } else {
        alert("Payment Error: " + (data.error || "Unknown error"));
        setIsProcessingSub(false);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to connect to payment gateway.");
      setIsProcessingSub(false);
    }
  };

  const handleAccept = () => {
    if (request && profile?.id) {
      const updated = { ...request, status: 'accepted' as const, driver_id: profile.id };
      saveTrip(updated);
      setActiveTrip(updated);
      setRequest(null);
    }
  }

  const handleDecline = () => {
    setRequest(null)
  }

  const handleConfirmPickup = () => {
    if (activeTrip) {
      const updated = { ...activeTrip, status: 'in_progress' as const };
      saveTrip(updated);
      setActiveTrip(updated);
    }
  }

  const handleComplete = () => {
    setShowFareCollection(true);
  }

  const handleCashPayment = () => {
    if (activeTrip) {
      const updated = { ...activeTrip, status: 'completed' as const };
      saveTrip(updated);
      setActiveTrip(null);
      setDriverCoords(null);
      setShowFareCollection(false);
      alert("Trip Completed! Earnings added.");
    }
  }

  const handleInAppPaymentRequest = () => {
    if (activeTrip) {
      const updated = { ...activeTrip, status: 'payment_pending' as const };
      saveTrip(updated);
      setActiveTrip(updated);
      setIsWaitingForPayment(true);
    }
  }

  // Define map pins for pending request or active trip
  const mapProps = activeTrip 
    ? { pickupLat: activeTrip.pickup_lat, pickupLng: activeTrip.pickup_lng, dropoffLat: activeTrip.dropoff_lat, dropoffLng: activeTrip.dropoff_lng, driverLat: driverCoords?.lat, driverLng: driverCoords?.lng }
    : request
      ? { pickupLat: request.pickup_lat, pickupLng: request.pickup_lng, driverLat: driverCoords?.lat, driverLng: driverCoords?.lng }
      : { driverLat: driverCoords?.lat, driverLng: driverCoords?.lng }

  return (
    <div className="h-screen w-full relative overflow-hidden bg-gray-100 dark:bg-zinc-900 -mt-24">
      {/* Real Map Background */}
      <div className="absolute inset-0 z-0">
        <MapComponent {...mapProps} />
        {/* Overlay to dim map slightly when offline */}
        {!isOnline && <div className="absolute inset-0 bg-white/40 dark:bg-black/60 z-[400] backdrop-blur-sm transition-all duration-500"></div>}
        
        {/* Animated Radar overlay when online, only if no active trip */}
        {isOnline && !activeTrip && !request && (
          <div className="absolute inset-0 z-[400] pointer-events-none flex items-center justify-center">
            <div className="w-48 h-48 bg-green-500/20 rounded-full animate-ping"></div>
            <div className="absolute w-96 h-96 bg-green-500/10 rounded-full animate-ping" style={{ animationDelay: '0.5s' }}></div>
          </div>
        )}
      </div>

      {/* Floating Header */}
      <div className="absolute top-28 left-4 right-4 md:left-8 md:right-auto md:w-96 z-10">
        <div className="bg-white/80 dark:bg-zinc-950/80 backdrop-blur-2xl shadow-2xl rounded-3xl border border-white/40 dark:border-white/10 p-5 flex justify-between items-center transition-all">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black tracking-tight">Driver Portal</h1>
              {profile?.subscriptionPlan === 'paid' ? (
                <span className="bg-blue-100/80 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full dark:bg-blue-900/80 dark:text-blue-200 uppercase tracking-wider">Premium SaaS</span>
              ) : (
                <span className="bg-green-100/80 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded-full dark:bg-green-900/80 dark:text-green-200 uppercase tracking-wider">7-Day Free Trial</span>
              )}
            </div>
            <p className="text-sm text-gray-500 font-medium mt-1">Welcome back, {profile ? profile.fullName.split(' ')[0] : 'Driver'}</p>
          </div>
          <button 
            onClick={() => setIsOnline(!isOnline)}
            disabled={!!activeTrip}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-bold transition-all shadow-sm ${
              isOnline 
                ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400 border border-green-200/50 dark:border-green-800/50 shadow-[0_0_20px_rgba(34,197,94,0.2)]' 
                : 'bg-gray-200/50 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300'
            } ${activeTrip ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
          >
            <Power size={18} />
            {isOnline ? 'Online' : 'Offline'}
          </button>
        </div>
      </div>

      {/* Floating Main Content Panel */}
      <div className="absolute top-52 left-4 md:left-8 w-[calc(100vw-32px)] md:w-96 max-h-[calc(100vh-250px)] flex flex-col z-10">
        <div className="bg-white/90 dark:bg-zinc-950/90 backdrop-blur-3xl shadow-2xl rounded-3xl border border-white/40 dark:border-white/10 overflow-hidden flex flex-col max-h-full">
          <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            {activeTab === 'home' && (
              activeTrip ? (
                <div className="animate-in fade-in slide-in-from-left-4 duration-500 flex flex-col h-full">
                  <div className="mb-4 flex justify-center">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30">
                      <MapPin size={32} />
                    </div>
                  </div>
                  <h2 className="text-2xl font-bold mb-2 text-center tracking-tight">
                    {activeTrip.status === 'accepted' ? 'En route to Pickup' : 'Trip in Progress'}
                  </h2>
                  <p className="text-gray-500 mb-4 font-medium text-center text-sm">To: {activeTrip.status === 'accepted' ? activeTrip.pickup_location : activeTrip.dropoff_location}</p>
                  <div className="flex justify-center mb-6">
                     <span className="text-green-600 dark:text-green-400 font-black text-3xl tracking-tight">R{activeTrip.fare_amount}</span>
                  </div>
                  
                  {activeTrip.status === 'accepted' ? (
                    <button 
                      onClick={handleConfirmPickup}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-2xl font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                    >
                      Confirm Pickup
                    </button>
                  ) : (
                    <button 
                      onClick={handleComplete}
                      className="w-full bg-black dark:bg-white text-white dark:text-black p-4 rounded-2xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-xl"
                    >
                      Confirm Dropoff (Complete)
                    </button>
                  )}

                  {/* Chat Section */}
                  <div className="mt-6 flex-1 min-h-[250px] border border-gray-200/50 dark:border-white/5 rounded-2xl overflow-hidden bg-white/50 dark:bg-black/50">
                    <div className="p-3 font-bold border-b border-gray-200/50 dark:border-white/5 bg-gray-50/50 dark:bg-zinc-900/50 text-sm flex items-center justify-center text-gray-500">
                      Chat with Rider
                    </div>
                    <div className="h-[calc(100%-45px)]">
                      <Chat tripId={activeTrip.id} role="driver" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center mt-6 animate-in fade-in duration-700">
                  <div className="mb-6 flex justify-center">
                    <div className={`p-5 rounded-3xl ${isOnline ? 'bg-gradient-to-br from-green-400 to-green-600 text-white shadow-lg shadow-green-500/30' : 'bg-gray-100 text-gray-400 dark:bg-zinc-800'}`}>
                      <Car size={36} />
                    </div>
                  </div>
                  <h2 className="text-3xl font-bold mb-3 tracking-tight">
                    {isOnline ? "You're Online" : "You're Offline"}
                  </h2>
                  <p className="text-gray-500 mb-8 font-medium">
                    {isOnline 
                      ? "Waiting for ride requests in your area..." 
                      : "Go online to start receiving ride requests."}
                  </p>
                  
                  {isOnline && (
                    <div className="bg-blue-50/80 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 p-4 rounded-2xl flex items-center justify-center gap-3 animate-pulse border border-blue-100/50 dark:border-blue-800/30">
                      <Navigation size={20} />
                      <span className="text-sm font-bold tracking-wide">SEARCHING FOR RIDERS</span>
                    </div>
                  )}
                </div>
              )
            )}

            {activeTab === 'earnings' && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <h2 className="text-2xl font-bold mb-6 tracking-tight">Your Earnings</h2>
                <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-3xl p-6 text-white shadow-lg shadow-green-500/30 mb-8">
                  <p className="text-green-100 font-medium mb-1">Total Earned</p>
                  <h3 className="text-5xl font-black">R{completedTrips.reduce((sum, t) => sum + t.fare_amount, 0)}</h3>
                </div>
                <div className="space-y-4">
                  <h4 className="font-bold text-gray-700 dark:text-gray-300">Completed Trips ({completedTrips.length})</h4>
                  {completedTrips.length === 0 ? (
                    <p className="text-gray-500 text-sm">You haven't completed any trips yet.</p>
                  ) : (
                    completedTrips.map(trip => (
                      <div key={trip.id} className="bg-gray-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex justify-between items-center">
                        <div className="overflow-hidden pr-4">
                          <p className="font-bold text-sm truncate">{trip.dropoff_location}</p>
                          <p className="text-xs text-gray-500 mt-1">Completed</p>
                        </div>
                        <span className="font-black text-green-600 dark:text-green-400">R{trip.fare_amount}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500 text-center">
                <div className="mb-6 flex justify-center">
                  <div className="p-6 rounded-full bg-gray-100 dark:bg-zinc-900 text-gray-400">
                    <User size={48} />
                  </div>
                </div>
                <h2 className="text-2xl font-bold mb-2 tracking-tight">{profile?.fullName}</h2>
                <p className="text-gray-500 mb-6">{profile?.email}</p>
                <div className="space-y-3 text-left bg-gray-50 dark:bg-zinc-900/50 p-5 rounded-2xl border border-gray-100 dark:border-white/5">
                  <div className="flex justify-between items-center py-2 border-b border-gray-200/50 dark:border-white/5">
                    <span className="text-gray-500 text-sm font-medium">Vehicle</span>
                    <span className="font-bold text-sm">{profile?.vehicleMake} {profile?.vehicleModel}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-gray-200/50 dark:border-white/5">
                    <span className="text-gray-500 text-sm font-medium">License Plate</span>
                    <span className="font-bold text-sm uppercase bg-black/5 dark:bg-white/10 px-2 py-1 rounded">{profile?.licensePlate}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-500 text-sm font-medium">Subscription</span>
                    <span className="font-bold text-sm text-blue-600 dark:text-blue-400">
                      {profile?.subscriptionPlan === 'paid' ? 'Active (Paid R999/mo)' : 'Active (7-Day Trial)'}
                    </span>
                  </div>
                </div>
                
                <button 
                  onClick={() => setShowSubModal(true)}
                  className="mt-6 w-full py-4 bg-black dark:bg-white text-white dark:text-black font-bold rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-xl"
                >
                  {profile?.subscriptionPlan === 'paid' ? 'Manage Subscription' : 'Upgrade to R999/mo'}
                </button>
                <button 
                  onClick={async () => {
                    const supabase = createClient();
                    await supabase.auth.signOut();
                    localStorage.removeItem('driver_id');
                    localStorage.removeItem('mock_driver_profile');
                    router.push('/driver/login');
                  }}
                  className="mt-8 w-full py-4 text-red-500 font-bold hover:bg-red-50 dark:hover:bg-red-500/10 rounded-2xl transition"
                >
                  Sign Out
                </button>
                {/* DEV ONLY BUTTON TO TEST EXPIRY */}
                {profile?.subscriptionPlan === 'trial' && (
                  <button 
                    onClick={() => {
                      if (profile) {
                        const expiredProfile = { ...profile, trialStartedAt: Date.now() - (8 * 24 * 60 * 60 * 1000) };
                        saveDriverProfile(expiredProfile);
                        setProfile(expiredProfile);
                        setIsTrialExpired(true);
                        setShowSubModal(true);
                      }
                    }}
                    className="mt-2 w-full py-2 text-xs font-mono text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800"
                  >
                    DEV: Simulate Expired Trial
                  </button>
                )}
              </div>
            )}

            {activeTab === 'help' && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="mb-6 flex justify-center">
                  <div className="p-4 rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">
                    <BookOpen size={32} />
                  </div>
                </div>
                <h2 className="text-2xl font-bold mb-4 tracking-tight text-center">Driver Manual</h2>
                
                <div className="space-y-4 text-left">
                  <div className="bg-gray-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">1. Going Online</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Tap the Power button top right to go online and receive requests. You'll see a green radar when active.</p>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">2. Managing Trips</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">When a request pops up, tap <b>Accept</b>. Drive to the location and tap <b>Confirm Pickup</b>. You can chat with the rider if needed.</p>
                  </div>

                  <div className="bg-gray-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">3. Collecting Fare</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Tap <b>Confirm Dropoff</b>. Choose to receive cash or your own card machine, or request the rider to pay via the app.</p>
                  </div>

                  <div className="bg-gray-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">4. Your Subscription</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">You keep 100% of all fares. Just pay a flat R999/month fee via the <b>Profile</b> tab after your 7-day trial ends.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Bottom Navigation */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[calc(100vw-32px)] max-w-sm bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl border border-gray-200/50 dark:border-white/10 p-2 flex justify-around items-center rounded-3xl shadow-2xl z-[1000]">
        <button 
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center p-3 rounded-2xl w-full transition-colors ${activeTab === 'home' ? 'bg-black/5 dark:bg-white/10 text-black dark:text-white font-bold' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
        >
          <Car size={24} />
          <span className="text-[10px] mt-1 uppercase tracking-wider">Home</span>
        </button>
        <button 
          onClick={() => setActiveTab('earnings')}
          className={`flex flex-col items-center p-3 rounded-2xl w-full transition-colors ${activeTab === 'earnings' ? 'bg-black/5 dark:bg-white/10 text-black dark:text-white font-bold' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          <span className="text-[10px] mt-1 uppercase tracking-wider">Earnings</span>
        </button>
        <button 
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center p-3 rounded-2xl w-full transition-colors ${activeTab === 'profile' ? 'bg-black/5 dark:bg-white/10 text-black dark:text-white font-bold' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
        >
          <User size={24} />
          <span className="text-[10px] mt-1 uppercase tracking-wider">Profile</span>
        </button>
        <button 
          onClick={() => setActiveTab('help')}
          className={`flex flex-col items-center p-3 rounded-2xl w-full transition-colors ${activeTab === 'help' ? 'bg-black/5 dark:bg-white/10 text-black dark:text-white font-bold' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
        >
          <BookOpen size={24} />
          <span className="text-[10px] mt-1 uppercase tracking-wider">Help</span>
        </button>
      </div>

      {/* Real-time Request Modal overlay */}
      {isOnline && !activeTrip && <TripRequestModal request={request as any} onAccept={handleAccept} onDecline={handleDecline} />}

      {/* Fare Collection Modal */}
      {showFareCollection && activeTrip && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-950 rounded-3xl w-full max-w-md p-6 shadow-2xl border border-gray-200 dark:border-white/10 relative animate-in zoom-in-95 duration-300">
            {isWaitingForPayment ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 border-4 border-gray-200 dark:border-gray-800 border-t-green-500 rounded-full animate-spin mx-auto mb-4"></div>
                <h2 className="text-2xl font-black mb-2">Waiting for Rider...</h2>
                <p className="text-gray-500">The rider is processing the payment of R{activeTrip.fare_amount} on their device.</p>
              </div>
            ) : (
              <>
                <button 
                  onClick={() => setShowFareCollection(false)}
                  className="absolute top-4 right-4 p-2 text-gray-400 hover:text-black dark:hover:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-black mb-1">Collect Fare</h2>
                  <p className="text-gray-500 text-sm">How would you like to receive payment?</p>
                </div>
                
                <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-6 mb-6 border border-green-100 dark:border-green-900/50 flex flex-col items-center">
                  <span className="text-green-800 dark:text-green-300 font-bold mb-1 uppercase tracking-wider text-xs">Total Amount</span>
                  <span className="font-black text-5xl text-green-600 dark:text-green-400">R{activeTrip.fare_amount}</span>
                </div>

                <div className="space-y-3">
                  <button 
                    onClick={handleInAppPaymentRequest}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/30 flex justify-center items-center gap-2 active:scale-95"
                  >
                    Request In-App Transfer
                  </button>
                  <button 
                    onClick={handleCashPayment}
                    className="w-full bg-black dark:bg-white text-white dark:text-black font-bold py-4 rounded-2xl transition-all shadow-lg shadow-black/10 dark:shadow-white/10 flex justify-center items-center gap-2 active:scale-95"
                  >
                    Paid via Cash / Own POS
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Subscription Payment Modal */}
      {showSubModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-950 rounded-3xl w-full max-w-md p-6 shadow-2xl border border-gray-200 dark:border-white/10 relative animate-in zoom-in-95 duration-300">
            {!isTrialExpired && (
              <button 
                onClick={() => setShowSubModal(false)}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-black dark:hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            )}
            <h2 className="text-2xl font-black mb-1">
              {isTrialExpired ? 'Trial Expired' : profile?.subscriptionPlan === 'paid' ? 'Manage Subscription' : 'Upgrade to Premium'}
            </h2>
            <p className="text-gray-500 mb-6 text-sm">
              {isTrialExpired ? 'Your 7-day free trial has ended. Subscribe to R999/mo to continue driving.' : 'Keep 100% of your earnings for a flat fee.'}
            </p>
            
            <div className="bg-gray-50 dark:bg-zinc-900 rounded-2xl p-4 mb-6 border border-gray-100 dark:border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-gray-700 dark:text-gray-300">SOLO Driver SaaS</span>
                <span className="font-black text-xl">R999.00</span>
              </div>
              <p className="text-xs text-gray-500">Billed monthly. Cancel anytime.</p>
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
              onClick={handleSubscribe}
              disabled={isProcessingSub || profile?.subscriptionPlan === 'paid'}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/30 flex justify-center items-center gap-2 active:scale-95"
            >
              {isProcessingSub ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Processing...
                </>
              ) : profile?.subscriptionPlan === 'paid' ? (
                'Subscription Active'
              ) : (
                'Pay R999.00 & Subscribe'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
