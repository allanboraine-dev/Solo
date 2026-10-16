"use client"

import dynamic from 'next/dynamic'
import Script from 'next/script'
import { useState, useEffect } from 'react'
import BookingForm from '@/components/BookingForm'
import { subscribeToEvents, getTrips, saveTrip, getActiveDrivers, saveTripRating, type MockTrip, type LiveDriver } from '@/lib/mockBackend'
import Chat from '@/components/Chat'
import RatingModal from '@/components/RatingModal'
import RiderAuthModal from '@/components/RiderAuthModal'
import { createClient } from '@/utils/supabase/client'
import { buildWhatsAppTripShareUrl, phoneToDeterministicUuid } from '@/utils/phone'
import { User, LogOut, Phone, ShieldCheck, Lock, CreditCard, AlertCircle, MessageCircle } from 'lucide-react'
import { NotificationPermissionBanner } from '@/components/NotificationPermissionBanner'

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
  const [availableDrivers, setAvailableDrivers] = useState<LiveDriver[]>([])
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  
  // Authentication State
  const [currentUser, setCurrentUser] = useState<{ id: string; fullName?: string; phone?: string } | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)

  // Rating Modal state
  const [ratingTrip, setRatingTrip] = useState<MockTrip | null>(null)
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [declineNotice, setDeclineNotice] = useState<string | null>(null)

  // Fetch active registered drivers in proximity to rider
  useEffect(() => {
    const lat = pickupCoords?.lat;
    const lng = pickupCoords?.lng;
    getActiveDrivers(lat, lng, 25).then(drivers => {
      setAvailableDrivers(drivers);
    });
  }, [pickupCoords]);

  // Monitor authenticated rider session
  useEffect(() => {
    const supabase = createClient();
    const loadLocalWhatsAppRider = () => {
      try {
        const stored = localStorage.getItem('solo_verified_rider');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.id) {
            const validId = String(parsed.id).startsWith('wa-rider-')
              ? phoneToDeterministicUuid(parsed.phone || parsed.id)
              : parsed.id;
            if (validId !== parsed.id) {
              parsed.id = validId;
              localStorage.setItem('solo_verified_rider', JSON.stringify(parsed));
            }
            setCurrentUser({
              id: validId,
              fullName: parsed.fullName || 'Rider',
              phone: parsed.phone,
            });
            return true;
          }
        }
      } catch {
        // Ignore parse errors
      }
      return false;
    };

    const loadSession = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        setCurrentUser({
          id: user.id,
          fullName: profile?.full_name || user.user_metadata?.full_name || 'Rider',
          phone: user.phone || profile?.phone || user.user_metadata?.phone,
        });
      } else if (!loadLocalWhatsAppRider()) {
        setCurrentUser(null);
      }
    };
    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        setCurrentUser({
          id: session.user.id,
          fullName: profile?.full_name || session.user.user_metadata?.full_name || 'Rider',
          phone: session.user.phone || profile?.phone || session.user.user_metadata?.phone,
        });
      } else if (!loadLocalWhatsAppRider()) {
        setCurrentUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Check if there is an active trip on mount and keep it synced with DB
    const loadTrips = async () => {
      const trips = await getTrips();
      if (activeTrip) {
        const matched = trips.find(t => t.id === activeTrip.id);
        if (matched) {
          if (matched.status === 'cancelled') {
            setActiveTrip(null);
            setDriverCoords(null);
            setDeclineNotice('Your ride request was declined by the driver. You can request another ride below.');
            return;
          }
          if (matched.status === 'completed') {
            setRatingTrip(matched);
            setShowRatingModal(true);
            setActiveTrip(null);
            setDriverCoords(null);
            return;
          }
          if (matched.status !== activeTrip.status || matched.driver_id !== activeTrip.driver_id) {
            setActiveTrip(matched);
          }
          return;
        }
      }
      const active = trips.find(t => t.status !== 'completed' && t.status !== 'cancelled');
      if (active) {
        setActiveTrip(active);
      }
    };
    loadTrips();
    const pollInterval = setInterval(loadTrips, 3000);

    const handleDriverLocationUpdate = (data: any) => {
      if (!data?.id && !data?.driverId) return;
      const driverId = data.id || data.driverId;

      // Update assigned driver coords if this driver is assigned to current trip
      if (activeTrip && (data.tripId === activeTrip.id || driverId === activeTrip.driver_id)) {
        setDriverCoords({ lat: data.lat, lng: data.lng });
      }

      setAvailableDrivers(prev => {
        if (data.isOnline === false) {
          return prev.filter(d => d.id !== driverId);
        }
        const existingIdx = prev.findIndex(d => d.id === driverId);
        const updated: LiveDriver = {
          id: driverId,
          fullName: data.fullName || 'Registered Driver',
          vehicleMake: data.vehicleMake,
          vehicleModel: data.vehicleModel,
          licensePlate: data.licensePlate,
          lat: data.lat,
          lng: data.lng,
          isOnline: true,
          tripId: data.tripId,
          updatedAt: data.updatedAt || Date.now(),
        };
        if (existingIdx >= 0) {
          const copy = [...prev];
          copy[existingIdx] = updated;
          return copy;
        }
        return [...prev, updated];
      });
    };

    const unsubscribeEvents = subscribeToEvents((type, payload) => {
      if (type === 'trip_updated') {
        const trip = payload as MockTrip;
        if (trip.status === 'completed') {
          setRatingTrip(trip);
          setShowRatingModal(true);
          setActiveTrip(null);
          setDriverCoords(null);
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification('Trip Completed! 🎉', {
              body: `Your trip has ended. Thank you for riding with SOLO!`,
              icon: '/rider-icon-192.png',
              tag: `rider-trip-${trip.id}`,
            });
          }
        } else if (trip.status === 'cancelled') {
          setActiveTrip(null);
          setDriverCoords(null);
          setDeclineNotice('Your ride request was declined by the driver. You can request another ride below.');
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification('Ride Request Declined', {
              body: 'The driver was unable to accept your trip request. Please request another ride.',
              icon: '/rider-icon-192.png',
              tag: `rider-trip-${trip.id}`,
            });
          }
        } else {
          setDeclineNotice(null);
          if (trip.status === 'accepted' && (!activeTrip || activeTrip.status === 'requested')) {
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
              new Notification('Driver Accepted Your Ride! 🚗', {
                body: `Your driver is on the way! Trip PIN: ${trip.verification_pin || 'Check app'}`,
                icon: '/rider-icon-192.png',
                tag: `rider-trip-${trip.id}`,
              });
            }
          }
          setActiveTrip(trip);
        }
      } else if (type === 'driver_location') {
        handleDriverLocationUpdate(payload);
      }
    });

    const handleLocalEvent = (e: any) => {
      if (e.detail) {
        handleDriverLocationUpdate(e.detail);
      }
    };
    window.addEventListener('solo_driver_location_update', handleLocalEvent);

    return () => {
      clearInterval(pollInterval);
      unsubscribeEvents();
      window.removeEventListener('solo_driver_location_update', handleLocalEvent);
    }
  }, [activeTrip]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    localStorage.removeItem('solo_verified_rider');
    setCurrentUser(null);
    if (activeTrip) {
      const updated = { ...activeTrip, status: 'completed' as const };
      saveTrip(updated);
    }
    localStorage.removeItem('mock_trips');
    setActiveTrip(null);
    setDriverCoords(null);
  };

  // Detect return from Paystack redirect checkout
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const payment = urlParams.get('payment');
    const reference = urlParams.get('reference');
    const tripId = urlParams.get('trip_id');

    if (payment === 'success' && reference) {
      setIsProcessingPayment(true);
      fetch(`/api/verify-trip-payment?reference=${encodeURIComponent(reference)}&tripId=${encodeURIComponent(tripId || '')}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            getTrips().then((trips) => {
              const matched = trips.find((t) => t.id === (tripId || data.tripId)) || {
                id: tripId || data.tripId || 'completed-trip',
                status: 'completed',
                fare_amount: data.amount || 0,
                pickup_location: 'Trip pickup',
                dropoff_location: 'Trip dropoff',
                pickup_lat: 0,
                pickup_lng: 0,
                dropoff_lat: 0,
                dropoff_lng: 0,
                rider_id: currentUser?.id || '00000000-0000-0000-0000-000000000000',
              } as MockTrip;
              const completedTrip: MockTrip = { ...matched, status: 'completed' };
              saveTrip(completedTrip);
              setRatingTrip(completedTrip);
              setShowRatingModal(true);
              setActiveTrip(null);
              setDriverCoords(null);
            });
            window.history.replaceState({}, '', '/rider');
          } else {
            setPaymentError(data.error || 'Payment verification failed');
          }
        })
        .catch((err) => {
          console.error('Payment verification error upon return:', err);
          setPaymentError('Could not verify payment status with Paystack');
        })
        .finally(() => setIsProcessingPayment(false));
    }
  }, [currentUser?.id]);

  const handlePayDriver = async () => {
    if (!activeTrip) return;
    setIsProcessingPayment(true);
    setPaymentError(null);

    try {
      const riderEmail = currentUser?.phone 
        ? `${currentUser.phone.replace(/[^0-9]/g, '')}@solorides.co.za` 
        : `rider-${activeTrip.id.substring(0, 8)}@solorides.co.za`;

      const response = await fetch('/api/initialize-trip-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId: activeTrip.id,
          amount: activeTrip.fare_amount,
          email: riderEmail,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to initialize payment gateway');
      }

      // Check if Paystack Inline Pop script is loaded on window
      const win = window as any;
      if (typeof window !== 'undefined' && win.PaystackPop) {
        const handler = win.PaystackPop.setup({
          key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
          email: riderEmail,
          amount: Math.round(Number(activeTrip.fare_amount) * 100),
          currency: 'ZAR',
          ref: data.reference,
          metadata: {
            trip_id: activeTrip.id,
            payment_type: 'solo_trip_fare',
          },
          callback: async function(res: { reference: string }) {
            setIsProcessingPayment(true);
            try {
              const verifyRes = await fetch('/api/verify-trip-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reference: res.reference, tripId: activeTrip.id }),
              });
              const verifyData = await verifyRes.json();
              if (verifyData.success) {
                const updated = { ...activeTrip, status: 'completed' as const };
                saveTrip(updated);
                setRatingTrip(updated);
                setShowRatingModal(true);
                setActiveTrip(null);
                setDriverCoords(null);
              } else {
                setPaymentError(verifyData.error || 'Could not verify payment');
              }
            } catch (err: any) {
              setPaymentError(err.message || 'Payment verification failed');
            } finally {
              setIsProcessingPayment(false);
            }
          },
          onClose: function() {
            setIsProcessingPayment(false);
          },
        });
        handler.openIframe();
      } else if (data.url) {
        // Fallback to hosted Paystack checkout page
        window.location.href = data.url;
      } else {
        throw new Error('Payment gateway authorization URL unavailable');
      }
    } catch (err: any) {
      console.error('Payment initiation error:', err);
      setPaymentError(err.message || 'Payment initialization failed. Please try again.');
      setIsProcessingPayment(false);
    }
  };

  const handleRatingSubmit = async (data: { stars: number; tags: string[]; comment: string }) => {
    if (ratingTrip) {
      await saveTripRating({
        id: crypto.randomUUID(),
        trip_id: ratingTrip.id,
        driver_id: ratingTrip.driver_id || '00000000-0000-0000-0000-000000000000',
        rider_id: currentUser?.id || ratingTrip.rider_id,
        stars: data.stars,
        tags: data.tags,
        comment: data.comment,
        created_at: new Date().toISOString()
      });
    }
    setShowRatingModal(false);
    setRatingTrip(null);
  }

  const handleRatingSkip = () => {
    setShowRatingModal(false);
    setRatingTrip(null);
  }

  const handleLocationSelect = (type: 'pickup' | 'dropoff', lat: number, lng: number) => {
    if (type === 'pickup') setPickupCoords({ lat, lng })
    else setDropoffCoords({ lat, lng })
  }

  return (
    <div className="h-[calc(100vh-96px)] w-full relative overflow-hidden bg-gray-100 dark:bg-zinc-900">
      {/* Map Background layer */}
      <div className="absolute inset-0 z-0">
        <MapComponent 
          pickupLat={activeTrip ? activeTrip.pickup_lat : pickupCoords?.lat}
          pickupLng={activeTrip ? activeTrip.pickup_lng : pickupCoords?.lng}
          dropoffLat={activeTrip ? activeTrip.dropoff_lat : dropoffCoords?.lat}
          dropoffLng={activeTrip ? activeTrip.dropoff_lng : dropoffCoords?.lng}
          availableDrivers={availableDrivers.map(d => ({
            id: d.id,
            lat: d.lat,
            lng: d.lng,
            name: d.fullName,
            vehicle: [d.vehicleMake, d.vehicleModel].filter(Boolean).join(' '),
            licensePlate: d.licensePlate,
            rating: 5.0
          }))}
          assignedDriver={activeTrip && driverCoords ? {
            lat: driverCoords.lat,
            lng: driverCoords.lng,
            name: 'Your Driver',
            vehicle: 'En route',
            rating: 5.0
          } : undefined}
          driverLat={driverCoords?.lat}
          driverLng={driverCoords?.lng}
        />
      </div>

      {/* Top Header: Rider Profile or Phone Auth Button */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        {currentUser ? (
          <div className="flex items-center gap-2.5 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-xl border border-gray-200/80 dark:border-white/10">
            <div className="flex items-center gap-2.5 pr-2.5 border-r border-gray-200 dark:border-zinc-800">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                {currentUser.fullName ? currentUser.fullName.charAt(0) : <User size={15} />}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-bold leading-tight text-gray-900 dark:text-white">{currentUser.fullName}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">{currentUser.phone || 'Verified Rider'}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition p-1"
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-2xl shadow-lg shadow-blue-600/30 text-xs font-bold transition active:scale-95"
          >
            <Phone size={14} />
            <span>Sign In</span>
          </button>
        )}
      </div>

      {/* Floating UI Panel */}
      <div className="absolute bottom-0 left-0 w-full md:bottom-auto md:top-28 md:left-8 md:w-96 flex flex-col z-10 md:max-h-[calc(100vh-140px)]">
        <div className="bg-white/95 dark:bg-zinc-950/95 backdrop-blur-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] md:shadow-2xl rounded-t-3xl md:rounded-3xl border border-white/40 dark:border-white/10 flex flex-col max-h-[85vh] md:max-h-full">
          <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mt-3 mb-1 md:hidden"></div>
          <div className={`p-6 pt-2 md:pt-6 flex-1 flex flex-col ${!activeTrip ? 'overflow-visible' : 'overflow-y-auto custom-scrollbar'}`}>
            {!activeTrip ? (
              <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                <div className="mb-6 flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-2xl shadow-lg shadow-blue-500/30">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight">Where to?</h1>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                      <p className="text-xs font-semibold text-green-600 dark:text-green-400">
                        {availableDrivers.length} {availableDrivers.length === 1 ? 'driver' : 'drivers'} online nearby
                      </p>
                    </div>
                  </div>
                </div>
                <NotificationPermissionBanner role="rider" userId={currentUser?.id} className="mb-4" />
                {declineNotice && (
                  <div className="mb-4 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5 text-amber-800 dark:text-amber-300 text-xs font-medium">
                    <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <div className="flex-1">
                      <p className="font-bold text-amber-900 dark:text-amber-200 mb-0.5">Ride Request Declined</p>
                      <p>{declineNotice}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeclineNotice(null)}
                      className="text-amber-600 dark:text-amber-400 hover:opacity-75 font-bold px-1"
                    >
                      ✕
                    </button>
                  </div>
                )}
                <BookingForm 
                  onLocationSelect={handleLocationSelect} 
                  currentUser={currentUser}
                  onRequireAuth={() => setShowAuthModal(true)}
                />
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
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a
                      href={buildWhatsAppTripShareUrl(activeTrip)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 rounded-xl transition"
                    >
                      <MessageCircle size={14} />
                      <span>Share Live Trip via WhatsApp</span>
                    </a>
                    {activeTrip.status === 'requested' && (
                      <button
                        type="button"
                        onClick={async () => {
                          const cancelled: MockTrip = { ...activeTrip, status: 'cancelled' };
                          await saveTrip(cancelled);
                          setActiveTrip(null);
                          setDriverCoords(null);
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 px-3 py-1.5 rounded-xl transition"
                      >
                        <span>Cancel Request</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-[300px] overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black shadow-inner">
                  <Chat tripId={activeTrip.id} role="rider" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Paystack Inline Pop Script */}
      <Script src="https://js.paystack.co/v1/inline.js" strategy="lazyOnload" />

      {/* Rider Paystack PCI-Compliant Fare Settlement Modal */}
      {activeTrip?.status === 'payment_pending' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-950 rounded-3xl w-full max-w-md p-6 shadow-2xl border border-gray-200 dark:border-white/10 relative animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">Settle Fare</h2>
              <span className="flex items-center gap-1 text-[11px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/60 border border-green-200 dark:border-green-800 px-2.5 py-1 rounded-full">
                <ShieldCheck size={13} />
                PCI-DSS Level 1
              </span>
            </div>
            <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
              Your driver has completed the trip. 100% of your fare goes directly to them.
            </p>
            
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 dark:from-blue-950/40 dark:to-indigo-950/20 rounded-2xl p-6 mb-5 border border-blue-100 dark:border-blue-900/50 flex flex-col items-center shadow-inner">
              <span className="text-blue-800 dark:text-blue-300 font-bold mb-1 uppercase tracking-wider text-xs">Total Due</span>
              <span className="font-black text-5xl text-blue-600 dark:text-blue-400">R{activeTrip.fare_amount}</span>
              
              <div className="w-full mt-4 pt-3 border-t border-blue-200/60 dark:border-blue-900/60 flex justify-between text-xs text-gray-600 dark:text-gray-400">
                <span>SOLO Platform Commission</span>
                <span className="font-bold text-green-600 dark:text-green-400">R0.00 (0%)</span>
              </div>
            </div>

            {paymentError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{paymentError}</span>
              </div>
            )}

            {/* PCI-DSS Security & Gateway Info */}
            <div className="bg-gray-50 dark:bg-zinc-900/70 rounded-2xl p-4 mb-6 border border-gray-200/80 dark:border-white/5 space-y-2.5 text-xs text-gray-600 dark:text-gray-300">
              <div className="flex items-center gap-2 font-semibold text-gray-800 dark:text-gray-200">
                <Lock size={14} className="text-blue-600 dark:text-blue-400" />
                <span>End-to-End Encrypted Checkout</span>
              </div>
              <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                Processed via <strong>Paystack</strong>. Supports Visa, Mastercard, American Express, Capitec Pay, and Instant EFT. Your sensitive card data is never entered or stored on this platform.
              </p>
              <div className="flex items-center gap-2 pt-1 text-[10px] text-gray-400 font-medium">
                <span className="bg-white dark:bg-zinc-800 px-2 py-0.5 rounded border border-gray-200 dark:border-zinc-700">Visa</span>
                <span className="bg-white dark:bg-zinc-800 px-2 py-0.5 rounded border border-gray-200 dark:border-zinc-700">Mastercard</span>
                <span className="bg-white dark:bg-zinc-800 px-2 py-0.5 rounded border border-gray-200 dark:border-zinc-700">Capitec Pay</span>
                <span className="bg-white dark:bg-zinc-800 px-2 py-0.5 rounded border border-gray-200 dark:border-zinc-700">Instant EFT</span>
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
                  <span>Connecting to Paystack...</span>
                </>
              ) : (
                <>
                  <CreditCard size={18} />
                  <span>Pay R{activeTrip.fare_amount} via Paystack</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Trip Rating & Review Modal */}
      {(() => {
        const ratedDriver = ratingTrip ? availableDrivers.find(d => d.id === ratingTrip.driver_id) : null;
        return (
          <RatingModal
            isOpen={showRatingModal}
            trip={ratingTrip}
            driverName={ratedDriver?.fullName || "Your Driver"}
            driverVehicle={ratedDriver ? [ratedDriver.vehicleMake, ratedDriver.vehicleModel].filter(Boolean).join(' ') : undefined}
            onSubmit={handleRatingSubmit}
            onSkip={handleRatingSkip}
          />
        );
      })()}

      {/* Rider Phone Authentication Modal */}
      <RiderAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={(user) => {
          const name = user.user_metadata?.full_name || 'Rider';
          setCurrentUser({
            id: user.id,
            fullName: name,
            phone: user.phone,
          });
          setShowAuthModal(false);
        }}
      />
    </div>
  )
}
