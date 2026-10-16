"use client"

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import TripRequestModal from '@/components/TripRequestModal'
import { Car, Navigation, Power, User, MapPin, BookOpen, ShieldCheck, CheckCircle2, Lock, CreditCard, Clock, Building2, Crown, X, Smartphone, AlertTriangle } from 'lucide-react'
import { getTrips, getNearbyRequestedTrips, saveTrip, acceptTripAtomic, completeTripAtomic, declineTrip, getDeclinedTripIds, isTripDeclined, getCompletedTripIds, isTripCompleted, markTripCompleted, isStaleRequestedTrip, STATUS_PRIORITY, recordTripStatusOverride, subscribeToEvents, broadcastEvent, getDriverProfile, saveDriverProfile, updateDriverLocation, getDriverRatingSummary, type MockTrip, type MockDriverProfile, type TripRating } from '@/lib/mockBackend'
import { isWithinRadiusKm } from '@/utils/geo'
import { getDriverDeviceId, isDriverSessionPreempted, setDriverActiveSession } from '@/utils/session'
import { createClient } from '@/utils/supabase/client'
import Chat from '@/components/Chat'
import { useRouter } from 'next/navigation'
import { DriverDocument, KycDocType } from '@/types/kyc'
import { fetchDriverKycDocuments } from '@/utils/kyc'
import KycDocumentUploader from '@/components/KycDocumentUploader'
import { NotificationPermissionBanner } from '@/components/NotificationPermissionBanner'
import { DriverBankSettlementModal } from '@/components/DriverBankSettlementModal'
import { isPlatformOwner } from '@/utils/owner'
import { ThemeToggle } from '@/components/ThemeToggle'
import { audioAlert } from '@/utils/audioAlert'
import { registerForPushNotifications } from '@/utils/pushClient'

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
  const activeTripRef = useRef<MockTrip | null>(null)
  const driverCoordsRef = useRef<{lat: number, lng: number} | null>(null)
  const lastAlertedTripIdRef = useRef<string | null>(null)
  const deviceIdRef = useRef<string>(typeof window !== 'undefined' ? getDriverDeviceId() : 'dev-default')
  const [preemptedNotice, setPreemptedNotice] = useState<string | null>(null)

  const handleGoOnlineOnThisDevice = async () => {
    setPreemptedNotice(null)
    const resolvedDriverId = profile?.id || (typeof window !== 'undefined' ? localStorage.getItem('driver_id') : null)
    if (resolvedDriverId) {
      setDriverActiveSession(resolvedDriverId, deviceIdRef.current)
    }
    setIsOnline(true)
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        await registerForPushNotifications('driver', profile?.id)
      } catch {}
    }
  }

  const updateActiveTripState = (next: MockTrip | null) => {
    activeTripRef.current = next
    setActiveTrip(next)
  }

  useEffect(() => {
    activeTripRef.current = activeTrip
  }, [activeTrip])

  useEffect(() => {
    driverCoordsRef.current = driverCoords
  }, [driverCoords])

  const [profile, setProfile] = useState<MockDriverProfile | null>(null)
  const [completedTrips, setCompletedTrips] = useState<MockTrip[]>([])
  const [showSubModal, setShowSubModal] = useState(false)
  const [isProcessingSub, setIsProcessingSub] = useState(false)
  const [showFareCollection, setShowFareCollection] = useState(false)
  const [isTrialExpired, setIsTrialExpired] = useState(false)
  const [showBankModal, setShowBankModal] = useState(false)
  const [completionNotice, setCompletionNotice] = useState<string | null>(null)

  const [ratingSummary, setRatingSummary] = useState<{ average: number; count: number; reviews: TripRating[] }>({ 
    average: 5.0, 
    count: 0, 
    reviews: [] 
  })

  // Driver KYC Documents State
  const [driverDocs, setDriverDocs] = useState<DriverDocument[]>([])
  const [isDriverVerified, setIsDriverVerified] = useState(false)
  const [isLoadingDocs, setIsLoadingDocs] = useState(false)

  // Fetch KYC documents when profile tab is active
  useEffect(() => {
    if (activeTab === 'profile' && profile?.id) {
      setIsLoadingDocs(true)
      fetchDriverKycDocuments(profile.id).then((res) => {
        setDriverDocs(res.documents)
        setIsDriverVerified(res.isVerified)
        setIsLoadingDocs(false)
      })
    }
  }, [activeTab, profile?.id])

  useEffect(() => {
    const loadRatings = () => {
      if (profile?.id) {
        const summary = getDriverRatingSummary(profile.id);
        setRatingSummary(summary);
      }
    };
    loadRatings();

    const unsubscribe = subscribeToEvents((type, payload) => {
      if (type === 'new_rating') {
        const rating = payload as TripRating;
        if (!profile?.id || rating.driver_id === profile.id) {
          loadRatings();
        }
      }
    });

    const onLocalRating = () => loadRatings();
    window.addEventListener('solo_new_rating', onLocalRating);

    return () => {
      unsubscribe();
      window.removeEventListener('solo_new_rating', onLocalRating);
    };
  }, [profile?.id]);

  useEffect(() => {
    if (activeTab === 'earnings') {
      getTrips().then(trips => {
        setCompletedTrips(trips.filter(t => t.status === 'completed'))
      })
    }
  }, [activeTab, activeTrip])

  const isOwner = isPlatformOwner(profile?.email) || profile?.subscriptionPlan === 'owner';

  useEffect(() => {
    const loadProfile = async () => {
      const prof = await getDriverProfile();
      if (!prof) {
        router.push('/driver/login')
      } else {
        // Check for return from Paystack checkout (?payment=success)
        if (typeof window !== 'undefined') {
          const urlParams = new URLSearchParams(window.location.search);
          const payment = urlParams.get('payment');
          const reference = urlParams.get('reference');

          if (payment === 'success') {
            if (reference) {
              try {
                const vRes = await fetch(`/api/verify-subscription?reference=${encodeURIComponent(reference)}&driverId=${encodeURIComponent(prof.id || '')}`);
                const vData = await vRes.json();
                if (vData.success) {
                  prof.subscriptionPlan = 'paid';
                  prof.subscriptionActive = true;
                  await saveDriverProfile(prof);
                  setProfile({ ...prof });
                  setShowSubModal(false);
                  setIsTrialExpired(false);
                  alert('Subscription activated! Welcome to SOLO Driver Pro (Zero Commission).');
                }
              } catch (err) {
                console.error('Subscription verification failed:', err);
              }
            } else {
              prof.subscriptionPlan = 'paid';
              prof.subscriptionActive = true;
              await saveDriverProfile(prof);
              setProfile({ ...prof });
              setShowSubModal(false);
              setIsTrialExpired(false);
            }
            window.history.replaceState({}, '', '/driver');
          }
        }

        const isOwnerAccount = isPlatformOwner(prof.email) || prof.subscriptionPlan === 'owner';
        if (isOwnerAccount) {
          prof.subscriptionPlan = 'owner';
          prof.subscriptionActive = true;
          prof.isVerified = true;
          setIsDriverVerified(true);
          setIsTrialExpired(false);
          setShowSubModal(false);
        } else if (prof.subscriptionPlan === 'trial' && prof.trialStartedAt) {
          const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
          if (Date.now() - prof.trialStartedAt > SEVEN_DAYS) {
            setIsTrialExpired(true);
            setShowSubModal(true);
          }
        }
        setProfile(prof)
      }
    };
    loadProfile();
  }, [router])

  useEffect(() => {
    if (!isOnline) {
      setRequest(null)
      return;
    }
    
    // Check pending/active trips on mount and via polling
    const loadTrips = async () => {
      const driverId = profile?.id || (typeof window !== 'undefined' ? localStorage.getItem('driver_id') : null);
      if (driverId && isDriverSessionPreempted(driverId, deviceIdRef.current)) {
        setIsOnline(false);
        setRequest(null);
        setPreemptedNotice("Signed out of active duty: your driver account went online from another device. Drivers can only be active on 1 device at a time.");
        return;
      }

      const trips = await getTrips();
      const declinedIds = getDeclinedTripIds(driverId);
      const completedIds = getCompletedTripIds();
      const currentActive = activeTripRef.current;

      if (currentActive) {
        if (completedIds.has(currentActive.id) || declinedIds.has(currentActive.id)) {
          updateActiveTripState(null);
          setShowFareCollection(false);
          return;
        }
        const currentInDb = trips.find(t => t.id === currentActive.id);
        if (currentInDb) {
          if (currentInDb.status === 'completed' || currentInDb.status === 'cancelled') {
            if (currentInDb.status === 'completed') {
              markTripCompleted(currentInDb.id);
            }
            updateActiveTripState(null);
            setShowFareCollection(false);
            return;
          }
          // Only advance status monotonically (never regress 'in_progress' back to 'accepted')
          const dbPrio = STATUS_PRIORITY[currentInDb.status] || 0;
          const activePrio = STATUS_PRIORITY[currentActive.status] || 0;
          if (dbPrio > activePrio) {
            updateActiveTripState(currentInDb);
          }
        }
        return;
      }

      // No active trip currently in state: check if there is an active trip in storage/DB strictly for THIS driver
      const active = trips.find(
        t =>
          (t.status === 'accepted' || t.status === 'arrived' || t.status === 'in_progress' || t.status === 'payment_pending') &&
          (driverId ? t.driver_id === driverId : false) &&
          !declinedIds.has(t.id) &&
          !completedIds.has(t.id)
      );

      if (active) {
        if (!activeTripRef.current) {
          updateActiveTripState(active);
          setRequest(null);
        }
      } else {
        // Find requested trips (excluding any declined, completed, or stale requests)
        let nearbyRequested: MockTrip[] = [];
        const coords = driverCoordsRef.current;
        if (coords) {
          nearbyRequested = await getNearbyRequestedTrips(coords.lat, coords.lng, 15, driverId);
        }
        if (nearbyRequested.length === 0) {
          nearbyRequested = trips.filter(
            t =>
              t.status === 'requested' &&
              !t.driver_id &&
              !declinedIds.has(t.id) &&
              !completedIds.has(t.id) &&
              !isStaleRequestedTrip(t)
          );
        }
        // Re-check activeTripRef after any async work so we never pop up a request while on a trip
        if (activeTripRef.current) {
          setRequest(null);
          lastAlertedTripIdRef.current = null;
          return;
        }
        if (nearbyRequested.length > 0) {
          const incoming = nearbyRequested[0];
          setRequest(prev => prev?.id === incoming.id ? prev : incoming);
          if (incoming.id !== lastAlertedTripIdRef.current) {
            lastAlertedTripIdRef.current = incoming.id;
            audioAlert.alertDriverOfTrip(incoming);
          }
        } else {
          setRequest(null);
          lastAlertedTripIdRef.current = null;
        }
      }
    };

    loadTrips();
    const pollInterval = setInterval(loadTrips, 3000);

    const unsubscribe = subscribeToEvents((type, payload) => {
      if (type === 'driver_session_preempted') {
        const payloadData = payload as { driverId: string; deviceId: string } | null;
        const driverId = profile?.id || (typeof window !== 'undefined' ? localStorage.getItem('driver_id') : null);
        if (
          payloadData &&
          payloadData.driverId === driverId &&
          payloadData.deviceId !== deviceIdRef.current
        ) {
          setIsOnline(false);
          setRequest(null);
          setPreemptedNotice("Signed out of active duty: your driver account went online from another device. Drivers can only be active on 1 device at a time.");
          return;
        }
      }

      if (type === 'INSERT' || type === 'trip_updated') {
        const trip = payload as MockTrip;
        if (!trip) return;
        const driverId = profile?.id || (typeof window !== 'undefined' ? localStorage.getItem('driver_id') : null);
        const currentActive = activeTripRef.current;

        if (trip.status === 'completed') {
          markTripCompleted(trip.id);
        }

        if (
          trip.status === 'requested' &&
          !currentActive &&
          !isTripDeclined(trip.id, driverId) &&
          !isTripCompleted(trip.id) &&
          !isStaleRequestedTrip(trip)
        ) {
          setRequest(prev => (prev?.id === trip.id ? prev : trip));
          if (trip.id !== lastAlertedTripIdRef.current) {
            lastAlertedTripIdRef.current = trip.id;
            audioAlert.alertDriverOfTrip(trip);
          }
        } else if (currentActive && trip.id === currentActive.id && trip.status === 'completed') {
          markTripCompleted(trip.id);
          completeTripAtomic(trip.id, 'cash', trip);
          updateActiveTripState(null);
          setRequest(null);
          setShowFareCollection(false);
          alert("Payment Received! Trip Completed.");
        } else if (currentActive && trip.id === currentActive.id && trip.status === 'cancelled') {
          updateActiveTripState(null);
          setRequest(null);
          setShowFareCollection(false);
        } else if (
          currentActive &&
          trip.id === currentActive.id &&
          !isTripCompleted(trip.id) &&
          !isTripDeclined(trip.id, driverId)
        ) {
          const incomingPrio = STATUS_PRIORITY[trip.status] || 0;
          const activePrio = STATUS_PRIORITY[currentActive.status] || 0;
          if (incomingPrio > activePrio) {
            updateActiveTripState(trip);
          }
        } else if (trip.status !== 'requested' || isTripDeclined(trip.id, driverId) || isTripCompleted(trip.id)) {
          setRequest(prev => (prev && prev.id === trip.id ? null : prev));
        }
      }
    });
    
    return () => {
      clearInterval(pollInterval);
      unsubscribe();
    }
  }, [isOnline, profile?.id])

  // Real-time GPS Tracking
  useEffect(() => {
    if (!isOnline) {
      if (profile?.id) {
        updateDriverLocation(profile.id, 0, 0, false, { deviceId: deviceIdRef.current });
      }
      return;
    }

    if (!('geolocation' in navigator)) {
      console.warn("Geolocation is not supported by your browser");
      return;
    }

    const broadcastCurrentLocation = (latitude: number, longitude: number) => {
      driverCoordsRef.current = { lat: latitude, lng: longitude };
      setDriverCoords({ lat: latitude, lng: longitude });

      if (profile?.id) {
        updateDriverLocation(profile.id, latitude, longitude, true, {
          fullName: profile.fullName,
          vehicleMake: profile.vehicleMake,
          vehicleModel: profile.vehicleModel,
          licensePlate: profile.licensePlate,
          tripId: activeTripRef.current?.id,
          deviceId: deviceIdRef.current,
        });
      }
    };

    // Immediate initial location fetch
    navigator.geolocation.getCurrentPosition(
      (position) => {
        broadcastCurrentLocation(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        console.warn("Could not get initial driver GPS location:", error);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );

    // Continuous watch position on motion
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        broadcastCurrentLocation(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        console.error("Error watching position:", error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000
      }
    );

    // Periodic 30-second heartbeat to ensure stationary/parked drivers remain fresh within 5-min TTL
    const heartbeatInterval = setInterval(() => {
      if (driverCoordsRef.current && profile?.id) {
        broadcastCurrentLocation(driverCoordsRef.current.lat, driverCoordsRef.current.lng);
      }
    }, 30000);

    // Offline cleanup when driver closes tab or navigates away
    const handleBeforeUnload = () => {
      if (profile?.id) {
        updateDriverLocation(profile.id, 0, 0, false, { deviceId: deviceIdRef.current });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      navigator.geolocation.clearWatch(watchId);
      if (profile?.id) {
        updateDriverLocation(profile.id, 0, 0, false, { deviceId: deviceIdRef.current });
      }
    };
  }, [isOnline, profile]);

  const handleSubscribe = async () => {
    if (!profile) return;
    if (isOwner) {
      alert('Platform Owner Account: You have lifetime free access to SOLO Driver Pro with 0% commission. No subscription fee required.');
      setShowSubModal(false);
      return;
    }
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

  const handleAccept = async () => {
    if (request) {
      const tripToAccept = request;
      const driverId =
        profile?.id ||
        (typeof window !== 'undefined' ? localStorage.getItem('driver_id') : null) ||
        crypto.randomUUID();

      const updated: MockTrip = { ...tripToAccept, status: 'accepted', driver_id: driverId };
      recordTripStatusOverride(updated.id, 'accepted', driverId);
      updateActiveTripState(updated);
      setRequest(null);
      lastAlertedTripIdRef.current = null;

      // Execute atomic database reservation to prevent race conditions
      const rpcResult = await acceptTripAtomic(tripToAccept.id, driverId);
      if (!rpcResult.success) {
        alert("Trip is no longer available: " + (rpcResult.error || "Claimed by another driver."));
        updateActiveTripState(null);
        return;
      }
      await saveTrip(updated);
    }
  }

  const handleDecline = async () => {
    if (!request) return;
    const tripToDecline = request;
    const driverId =
      profile?.id ||
      (typeof window !== 'undefined' ? localStorage.getItem('driver_id') : null);
    setRequest(null);
    lastAlertedTripIdRef.current = null;
    await declineTrip(tripToDecline, driverId);
  }

  const handleConfirmPickup = async () => {
    const current = activeTripRef.current || activeTrip;
    if (current) {
      const updated: MockTrip = { ...current, status: 'in_progress' };
      recordTripStatusOverride(updated.id, 'in_progress', updated.driver_id);
      updateActiveTripState(updated);
      await saveTrip(updated);
    }
  }

  const handleComplete = () => {
    setShowFareCollection(true);
  }

  const handleCashPayment = async () => {
    const current = activeTripRef.current || activeTrip;
    if (current) {
      const tripToComplete = current;
      markTripCompleted(tripToComplete.id);
      updateActiveTripState(null);
      setRequest(null);
      setShowFareCollection(false);
      setCompletionNotice(`Trip completed! R${tripToComplete.fare_amount} fare settled.`);
      await completeTripAtomic(tripToComplete.id, 'cash', tripToComplete);
      await saveTrip({ ...tripToComplete, status: 'completed' });
    }
  }

  // Define map pins for pending request or active trip
  const mapProps = activeTrip 
    ? { pickupLat: activeTrip.pickup_lat, pickupLng: activeTrip.pickup_lng, dropoffLat: activeTrip.dropoff_lat, dropoffLng: activeTrip.dropoff_lng, driverLat: driverCoords?.lat, driverLng: driverCoords?.lng }
    : request
      ? { pickupLat: request.pickup_lat, pickupLng: request.pickup_lng, driverLat: driverCoords?.lat, driverLng: driverCoords?.lng }
      : { driverLat: driverCoords?.lat, driverLng: driverCoords?.lng }

  return (
    <div className="h-mobile-portal w-full relative overflow-hidden bg-gray-100 dark:bg-zinc-900">
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
      <div className="absolute top-2.5 md:top-4 pt-safe left-3 right-3 md:left-8 md:right-auto md:w-96 z-10">
        <div className="bg-white/85 dark:bg-zinc-950/85 backdrop-blur-2xl shadow-2xl rounded-3xl border border-white/40 dark:border-white/10 p-3.5 md:p-5 flex justify-between items-center gap-2 transition-all">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-lg md:text-xl font-black tracking-tight">Driver Portal</h1>
              <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/40 px-2 py-0.5 rounded-full text-amber-600 dark:text-amber-400 font-bold text-[11px] shadow-sm">
                <span>★</span>
                <span>{ratingSummary.count > 0 ? ratingSummary.average.toFixed(1) : '5.0'}</span>
                {ratingSummary.count > 0 && <span className="text-[10px] text-gray-400 font-normal">({ratingSummary.count})</span>}
              </div>
              {isOwner ? (
                <span className="bg-amber-100/90 text-amber-900 border border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700/60 uppercase tracking-wider flex items-center gap-1 shadow-sm">
                  <Crown size={11} className="text-amber-600 dark:text-amber-400" />
                  Platform Owner
                </span>
              ) : profile?.subscriptionPlan === 'paid' ? (
                <span className="bg-blue-100/80 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full dark:bg-blue-900/80 dark:text-blue-200 uppercase tracking-wider">Premium SaaS</span>
              ) : (
                <span className="bg-green-100/80 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded-full dark:bg-green-900/80 dark:text-green-200 uppercase tracking-wider">7-Day Free Trial</span>
              )}
            </div>
            <p className="text-xs md:text-sm text-gray-500 font-medium mt-0.5 truncate">Welcome back, {profile ? profile.fullName.split(' ')[0] : 'Driver'}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ThemeToggle className="bg-gray-100 dark:bg-zinc-800/80 border border-gray-200/50 dark:border-white/5" />
            <button 
              onClick={async () => {
                const nextOnline = !isOnline;
                if (nextOnline) {
                  setPreemptedNotice(null);
                  if (profile?.id) {
                    setDriverActiveSession(profile.id, deviceIdRef.current);
                  }
                }
                setIsOnline(nextOnline);
                if (nextOnline && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
                  try {
                    await registerForPushNotifications('driver', profile?.id);
                  } catch {}
                }
              }}
              disabled={!!activeTrip}
              className={`flex items-center gap-1.5 px-3.5 py-2 md:px-4 md:py-2 rounded-2xl text-xs md:text-sm font-bold transition-all shadow-sm ${
                isOnline 
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400 border border-green-200/50 dark:border-green-800/50 shadow-[0_0_20px_rgba(34,197,94,0.2)]' 
                  : 'bg-gray-200/50 text-gray-700 dark:bg-gray-800/50 dark:text-gray-300'
              } ${activeTrip ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
            >
              <Power size={16} />
              {isOnline ? 'Online' : 'Offline'}
            </button>
          </div>
        </div>
      </div>

      {/* Floating Main Content Panel */}
      <div className="absolute top-24 md:top-28 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:bottom-28 left-3 right-3 md:left-8 md:right-auto md:w-96 flex flex-col z-10 pointer-events-none">
        <div className="bg-white/90 dark:bg-zinc-950/90 backdrop-blur-3xl shadow-2xl rounded-3xl border border-white/40 dark:border-white/10 overflow-hidden flex flex-col h-full pointer-events-auto gpu-composited">
          <div className="p-4 md:p-6 overflow-y-auto overscroll-contain momentum-scroll custom-scrollbar flex-1 min-h-0 flex flex-col">
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
                  <div className="mt-6 flex-1 min-h-[250px] flex flex-col border border-gray-200/50 dark:border-white/5 rounded-2xl overflow-hidden bg-white/50 dark:bg-black/50">
                    <div className="p-3 font-bold border-b border-gray-200/50 dark:border-white/5 bg-gray-50/50 dark:bg-zinc-900/50 text-sm flex items-center justify-center text-gray-500">
                      Chat with Rider
                    </div>
                    <div className="flex-1 min-h-0">
                      <Chat tripId={activeTrip.id} role="driver" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center mt-6 animate-in fade-in duration-700">
                  {preemptedNotice && (
                    <div className="mb-4 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 flex flex-col gap-2.5 text-left text-amber-900 dark:text-amber-200 text-xs font-semibold animate-in fade-in shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <Smartphone size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-amber-950 dark:text-amber-100 text-sm">Active On Another Device</p>
                            <p className="mt-0.5 leading-relaxed text-amber-800 dark:text-amber-300">{preemptedNotice}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreemptedNotice(null)}
                          className="text-amber-600 dark:text-amber-400 hover:opacity-75 font-bold px-1 text-sm"
                          aria-label="Dismiss notice"
                        >
                          ✕
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleGoOnlineOnThisDevice}
                        className="mt-1 w-full bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold py-2.5 px-3 rounded-xl transition-all shadow-sm text-center flex items-center justify-center gap-1.5"
                      >
                        <Power size={14} />
                        <span>Switch Active Duty Back to This Device</span>
                      </button>
                    </div>
                  )}

                  {completionNotice && (
                    <div className="mb-4 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between gap-2.5 text-emerald-800 dark:text-emerald-300 text-xs font-bold animate-in fade-in">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>{completionNotice}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCompletionNotice(null)}
                        className="text-emerald-600 dark:text-emerald-400 hover:opacity-75 font-bold px-1"
                      >
                        ✕
                      </button>
                    </div>
                  )}
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

                  <div className="mt-6 text-left">
                    <NotificationPermissionBanner role="driver" userId={profile?.id} />
                  </div>
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
                <h2 className="text-2xl font-bold mb-1 tracking-tight">{profile?.fullName}</h2>
                <p className="text-gray-500 text-sm mb-3">{profile?.email}</p>

                <div className="flex justify-center items-center gap-1.5 mb-6">
                  <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/40 px-3.5 py-1 rounded-full text-amber-600 dark:text-amber-400 font-bold text-sm shadow-sm">
                    <span className="text-amber-500">★</span>
                    <span>{ratingSummary.count > 0 ? ratingSummary.average.toFixed(1) : '5.0'}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                      ({ratingSummary.count} {ratingSummary.count === 1 ? 'review' : 'reviews'})
                    </span>
                  </div>
                </div>

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
                    <span className="font-bold text-sm">
                      {isOwner ? (
                        <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <Crown size={14} /> Lifetime Free (Founder Exemption)
                        </span>
                      ) : profile?.subscriptionPlan === 'paid' ? (
                        <span className="text-blue-600 dark:text-blue-400">Active (Paid R499/mo)</span>
                      ) : (
                        <span className="text-green-600 dark:text-green-400">Active (7-Day Trial)</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Bank Settlement & Direct Payouts Card */}
                <div className="mt-5 text-left bg-gray-50 dark:bg-zinc-900/50 p-5 rounded-2xl border border-gray-100 dark:border-white/5">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <Building2 size={18} className="text-emerald-500" />
                      <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">Bank Settlement & Payouts</h3>
                    </div>
                    <button
                      onClick={() => setShowBankModal(true)}
                      className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                    >
                      Configure
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">
                    Link your South African bank account (FNB, Standard Bank, Capitec, Nedbank, ABSA, etc.) to receive 100% fare payouts directly with zero commission deductions.
                  </p>
                  <button
                    onClick={() => setShowBankModal(true)}
                    className="w-full py-2.5 px-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition"
                  >
                    <Building2 size={14} /> Link / Update Bank Details
                  </button>
                </div>

                {/* KYC Compliance & Document Verification Card */}
                <div className="mt-5 text-left bg-gray-50 dark:bg-zinc-900/50 p-5 rounded-2xl border border-gray-100 dark:border-white/5">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={18} className="text-blue-500" />
                      <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">KYC Verification & Compliance</h3>
                    </div>
                    {isOwner ? (
                      <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800/60 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Crown size={12} className="text-amber-600" /> Verified Platform Owner
                      </span>
                    ) : isDriverVerified ? (
                      <span className="text-[11px] font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-950/60 border border-green-200 dark:border-green-800/60 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 size={12} /> Verified Partner
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Clock size={12} /> Verification Pending
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                    South African commercial road transportation compliance requires valid licensing and vehicle inspection records.
                  </p>

                  <div className="space-y-3">
                    {(['license_front', 'license_back', 'prdp', 'roadworthy', 'vehicle_photo'] as KycDocType[]).map((type) => {
                      const doc = driverDocs.find(d => d.doc_type === type);
                      return (
                        <KycDocumentUploader
                          key={type}
                          docType={type}
                          driverId={profile?.id}
                          existingDoc={doc}
                          autoUpload={true}
                          onUploadSuccess={(updatedDoc) => {
                            setDriverDocs(prev => {
                              const filtered = prev.filter(d => d.doc_type !== updatedDoc.doc_type);
                              return [...filtered, updatedDoc];
                            });
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Rider Reviews & Compliments */}
                <div className="mt-5 text-left bg-gray-50 dark:bg-zinc-900/50 p-5 rounded-2xl border border-gray-100 dark:border-white/5">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">Rider Reviews & Feedback</h3>
                    <span className="text-xs font-bold text-amber-500">
                      ★ {ratingSummary.count > 0 ? ratingSummary.average.toFixed(1) : '5.0'}
                    </span>
                  </div>

                  {ratingSummary.reviews.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                      No rider reviews yet. Complete trips to receive 5-star ratings and compliment badges from your passengers!
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {/* Top Compliments */}
                      {(() => {
                        const allTags = ratingSummary.reviews.flatMap(r => r.tags || []);
                        const tagCounts = allTags.reduce((acc, tag) => { acc[tag] = (acc[tag] || 0) + 1; return acc; }, {} as Record<string, number>);
                        const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);
                        if (topTags.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-1.5 pb-2.5 border-b border-gray-200/50 dark:border-white/5">
                            {topTags.map(([tag, count]) => (
                              <span key={tag} className="text-[11px] font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full">
                                {tag} ×{count}
                              </span>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Recent Comments */}
                      <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar">
                        {ratingSummary.reviews.slice(0, 6).map(rev => (
                          <div key={rev.id} className="p-2.5 bg-white dark:bg-black/40 rounded-xl border border-gray-100 dark:border-white/5 text-xs">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-amber-500 font-bold tracking-widest">
                                {'★'.repeat(rev.stars)}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {new Date(rev.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                            {rev.comment && (
                              <p className="text-gray-700 dark:text-gray-300 italic">"{rev.comment}"</p>
                            )}
                            {rev.tags?.length > 0 && !rev.comment && (
                              <p className="text-gray-500">{rev.tags.join(' • ')}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                {isOwner ? (
                  <div className="mt-6 w-full p-4 bg-gradient-to-r from-amber-500/10 via-amber-500/20 to-yellow-500/10 border border-amber-300/60 dark:border-amber-700/60 rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-amber-500 text-black rounded-xl">
                        <Crown size={20} />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-amber-900 dark:text-amber-100">Platform Owner Privilege</p>
                        <p className="text-xs text-amber-700 dark:text-amber-300">Lifetime Free Access (R0/mo) • 0% Commission</p>
                      </div>
                    </div>
                    <span className="text-xs font-black bg-amber-500 text-black px-2.5 py-1 rounded-full uppercase tracking-wider">
                      VIP
                    </span>
                  </div>
                ) : (
                  <button 
                    onClick={() => setShowSubModal(true)}
                    className="mt-6 w-full py-4 bg-black dark:bg-white text-white dark:text-black font-bold rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-xl"
                  >
                    {profile?.subscriptionPlan === 'paid' ? 'Manage Subscription' : 'Upgrade to R499/mo'}
                  </button>
                )}
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
                {/* DEV ONLY BUTTON TO TEST EXPIRY (hidden for owner) */}
                {!isOwner && profile?.subscriptionPlan === 'trial' && (
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
                    <p className="text-sm text-gray-600 dark:text-gray-400">You keep 100% of all fares. Just pay a flat R499/month fee via the <b>Profile</b> tab after your 7-day trial ends.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Bottom Navigation */}
      <div className="absolute bottom-4 sm:bottom-6 mb-safe left-1/2 -translate-x-1/2 w-[calc(100vw-32px)] max-w-sm bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl border border-gray-200/50 dark:border-white/10 p-2 flex justify-around items-center rounded-3xl shadow-2xl z-[1000] gpu-composited">
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
            <button 
              onClick={() => setShowFareCollection(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-black dark:hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-black mb-1">Collect Fare</h2>
              <p className="text-gray-500 text-sm">Collect payment directly from rider via cash or your own POS.</p>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-6 mb-6 border border-green-100 dark:border-green-900/50 flex flex-col items-center">
              <span className="text-green-800 dark:text-green-300 font-bold mb-1 uppercase tracking-wider text-xs">Total Amount Due</span>
              <span className="font-black text-5xl text-green-600 dark:text-green-400">R{activeTrip.fare_amount}</span>
              <span className="text-[11px] text-green-700 dark:text-green-400/80 font-medium mt-2">100% of this fare belongs to you (0% platform commission)</span>
            </div>

            <div className="space-y-3">
              <button 
                onClick={handleCashPayment}
                className="w-full bg-black dark:bg-white text-white dark:text-black font-bold py-4 rounded-2xl transition-all shadow-lg shadow-black/10 dark:shadow-white/10 flex justify-center items-center gap-2 active:scale-95 text-base"
              >
                Paid via Cash / Own POS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Payment Modal */}
      {showSubModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-950 rounded-3xl w-full max-w-md p-6 shadow-2xl border border-gray-200 dark:border-white/10 relative animate-in zoom-in-95 duration-300">
            {(!isTrialExpired || isOwner) && (
              <button 
                onClick={() => setShowSubModal(false)}
                className="absolute top-4 right-4 p-2 text-gray-400 hover:text-black dark:hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            )}

            {isOwner ? (
              <div className="text-center py-2">
                <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 rounded-3xl flex items-center justify-center text-amber-600 shadow-lg">
                  <Crown size={36} />
                </div>
                <h2 className="text-2xl font-black mb-1">Platform Owner Privilege</h2>
                <p className="text-gray-500 mb-6 text-sm">
                  You are the owner of SOLO. Subscription fees and trial expirations are permanently waived.
                </p>
                <div className="bg-gradient-to-br from-amber-50 to-yellow-50/50 dark:from-amber-950/40 dark:to-yellow-950/20 rounded-2xl p-5 mb-5 border border-amber-200 dark:border-amber-900/50 text-left">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-gray-800 dark:text-gray-200 text-base">SOLO Founder Tier</span>
                    <span className="font-black text-2xl text-amber-600 dark:text-amber-400">R0.00 / Life</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Permanent VIP exemption • 0% commission on all rides.</p>
                </div>

                <div className="space-y-3 mb-6 bg-gray-50 dark:bg-zinc-900/70 p-4 rounded-2xl border border-gray-100 dark:border-white/5 text-left">
                  <div className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300">
                    <CheckCircle2 size={16} className="text-amber-500 shrink-0" />
                    <span><strong>0% Commission:</strong> Keep 100% of all fares permanently.</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300">
                    <CheckCircle2 size={16} className="text-amber-500 shrink-0" />
                    <span><strong>Zero Subscription:</strong> No monthly SaaS deductions ever.</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300">
                    <CheckCircle2 size={16} className="text-amber-500 shrink-0" />
                    <span><strong>Auto-Verified:</strong> Full access to live passenger dispatch.</span>
                  </div>
                </div>

                <button
                  onClick={() => setShowSubModal(false)}
                  className="w-full bg-black dark:bg-white text-white dark:text-black font-bold py-4 rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-xl"
                >
                  Continue Driving (Free Access)
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-black mb-1">
                  {isTrialExpired ? 'Trial Expired' : profile?.subscriptionPlan === 'paid' ? 'Manage Subscription' : 'Upgrade to Premium'}
                </h2>
                <p className="text-gray-500 mb-6 text-sm">
                  {isTrialExpired ? 'Your 7-day free trial has ended. Subscribe to R499/mo to continue driving.' : 'Keep 100% of your earnings for a flat fee.'}
                </p>
                
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 dark:from-blue-950/40 dark:to-indigo-950/20 rounded-2xl p-5 mb-5 border border-blue-100 dark:border-blue-900/50 shadow-inner">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-gray-800 dark:text-gray-200 text-base">SOLO Driver Pro</span>
                    <span className="font-black text-2xl text-blue-600 dark:text-blue-400">R499.00</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Flat monthly SaaS fee. Zero commission on fares.</p>
                </div>

                {/* Value Proposition List */}
                <div className="space-y-3 mb-6 bg-gray-50 dark:bg-zinc-900/70 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
                  <div className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                    <span><strong>0% Commission:</strong> You keep 100% of every ride fare.</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                    <span><strong>Direct Payouts:</strong> In-app rider fares and cash are yours.</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                    <span><strong>Unlimited Rides:</strong> 24/7 priority radar dispatch.</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                    <span><strong>Automated Renewal:</strong> Cancel or pause anytime with one click.</span>
                  </div>
                </div>

                {/* PCI-DSS Paystack Info */}
                <div className="mb-6 p-3 bg-gray-50 dark:bg-zinc-900/40 rounded-xl border border-gray-200/60 dark:border-white/5 flex items-center gap-2.5 text-[11px] text-gray-500 dark:text-gray-400">
                  <Lock size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Bank-grade 256-bit SSL encrypted checkout powered by Paystack. Supports Visa, Mastercard, and Instant EFT.</span>
                </div>

                <button 
                  onClick={handleSubscribe}
                  disabled={isProcessingSub || profile?.subscriptionPlan === 'paid'}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/30 flex justify-center items-center gap-2 active:scale-95"
                >
                  {isProcessingSub ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Connecting to Paystack...</span>
                    </>
                  ) : profile?.subscriptionPlan === 'paid' ? (
                    'Subscription Active'
                  ) : (
                    <>
                      <CreditCard size={18} />
                      <span>Subscribe via Paystack (R499/mo)</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* South African Bank Settlement Modal */}
      <DriverBankSettlementModal
        driverId={profile?.id || ''}
        driverFullName={profile?.fullName || 'Driver'}
        isOpen={showBankModal}
        onClose={() => setShowBankModal(false)}
      />
    </div>
  )
}
