"use client"

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import TripRequestModal from '@/components/TripRequestModal'
import { Car, Navigation, Power, User, MapPin, BookOpen, ShieldCheck, ShieldAlert, CheckCircle2, Lock, CreditCard, Clock, Building2, Crown, X, Smartphone, AlertTriangle, ChevronDown, ChevronUp, KeyRound, MessageCircle, Compass, ExternalLink, Phone, AlertCircle, XCircle } from 'lucide-react'
import { getTrips, getNearbyRequestedTrips, saveTrip, acceptTripAtomic, completeTripAtomic, declineTrip, getDeclinedTripIds, isTripDeclined, getCompletedTripIds, isTripCompleted, markTripCompleted, isTripDismissed, markTripDismissed, isStaleRequestedTrip, STATUS_PRIORITY, recordTripStatusOverride, subscribeToEvents, broadcastEvent, getDriverProfile, saveDriverProfile, updateDriverLocation, getDriverRatingSummary, startTripWithPin, type MockTrip, type MockDriverProfile, type TripRating, type MockMessage } from '@/lib/mockBackend'
import { isWithinRadiusKm, calculateDistanceKm, estimateEtaMinutes } from '@/utils/geo'
import { getDriverDeviceId, isDriverSessionPreempted, setDriverActiveSession, getSafeLocalStorageItem, removeSafeLocalStorageItem, generateUuid } from '@/utils/session'
import { createClient } from '@/utils/supabase/client'
import Chat from '@/components/Chat'
import { useRouter } from 'next/navigation'
import { DriverDocument, KycDocType } from '@/types/kyc'
import { fetchDriverKycDocuments } from '@/utils/kyc'
import KycDocumentUploader from '@/components/KycDocumentUploader'
import { NotificationPermissionBanner } from '@/components/NotificationPermissionBanner'
import { DriverBankSettlementModal } from '@/components/DriverBankSettlementModal'
import { isPlatformOwner } from '@/utils/owner'
import { checkVehicleFleetCoverage } from '@/utils/fleetStore'
import { ThemeToggle } from '@/components/ThemeToggle'
import { audioAlert } from '@/utils/audioAlert'
import { registerForPushNotifications, dispatchDriverArrivedPush } from '@/utils/pushClient'
import SafetyShieldModal from '@/components/SafetyShieldModal'
import { AdaptiveTelemetryGovernor, TELEMETRY_TIER_CONFIGS, type ComputedGpsSample } from '@/utils/telemetryEngine'
import type { SafetyIncidentRecord } from '@/utils/safetyDispatch'
import { updateSupportTicketStatus, type SupportTicket } from '@/utils/supportStore'

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
  const [isHomeSheetMinimized, setIsHomeSheetMinimized] = useState(false)
  
  const [request, setRequest] = useState<MockTrip | null>(null)
  const [activeTrip, setActiveTrip] = useState<MockTrip | null>(null)
  const [driverCoords, setDriverCoords] = useState<{lat: number, lng: number} | null>(null)
  const activeTripRef = useRef<MockTrip | null>(null)
  const driverCoordsRef = useRef<{lat: number, lng: number} | null>(null)
  const lastAlertedTripIdRef = useRef<string | null>(null)
  const deviceIdRef = useRef<string>(typeof window !== 'undefined' ? getDriverDeviceId() : 'dev-default')
  const [preemptedNotice, setPreemptedNotice] = useState<string | null>(null)

  const handleGoOnlineOnThisDevice = async () => {
    audioAlert.unlockMobileAudio(true)
    setPreemptedNotice(null)
    const resolvedDriverId = profile?.id || getSafeLocalStorageItem('driver_id')
    if (resolvedDriverId) {
      setDriverActiveSession(resolvedDriverId, deviceIdRef.current)
    }
    setIsOnline(true)
    if (typeof window !== 'undefined') {
      try {
        if ('Notification' in window && Notification?.permission === 'default') {
          await registerForPushNotifications('driver', profile?.id)
        }
      } catch {}
    }
  }

  const updateActiveTripState = (next: MockTrip | null) => {
    activeTripRef.current = next
    setActiveTrip(next)
  }

  const [driverTripSubTab, setDriverTripSubTab] = useState<'controls' | 'chat'>('controls')
  const [driverUnreadChatCount, setDriverUnreadChatCount] = useState(0)
  const [driverIncomingMessageToast, setDriverIncomingMessageToast] = useState<{ sender: string; text: string } | null>(null)
  const driverTripSubTabRef = useRef(driverTripSubTab)

  useEffect(() => {
    driverTripSubTabRef.current = driverTripSubTab
    if (driverTripSubTab === 'chat') {
      setDriverUnreadChatCount(0)
      setDriverIncomingMessageToast(null)
    }
  }, [driverTripSubTab])

  useEffect(() => {
    if (driverIncomingMessageToast) {
      const timer = setTimeout(() => {
        setDriverIncomingMessageToast(null)
      }, 6000)
      return () => clearTimeout(timer)
    }
  }, [driverIncomingMessageToast])

  useEffect(() => {
    activeTripRef.current = activeTrip
    if (activeTrip) {
      setIsHomeSheetMinimized(false)
    } else {
      setDriverTripSubTab('controls')
    }
  }, [activeTrip])

  useEffect(() => {
    driverCoordsRef.current = driverCoords
  }, [driverCoords])

  const [profile, setProfile] = useState<MockDriverProfile | null>(null)
  const [completedTrips, setCompletedTrips] = useState<MockTrip[]>([])
  const [showSubModal, setShowSubModal] = useState(false)
  const [isProcessingSub, setIsProcessingSub] = useState(false)
  const [isCancellingSub, setIsCancellingSub] = useState(false)
  const [showFareCollection, setShowFareCollection] = useState(false)
  const [isAwaitingRiderPayment, setIsAwaitingRiderPayment] = useState(false)
  const [isTrialExpired, setIsTrialExpired] = useState(false)
  const [showBankModal, setShowBankModal] = useState(false)
  const [completionNotice, setCompletionNotice] = useState<string | null>(null)
  const [showPinModal, setShowPinModal] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [isVerifyingPin, setIsVerifyingPin] = useState(false)
  const [isNotifyingArrival, setIsNotifyingArrival] = useState(false)
  const [showSafetyModal, setShowSafetyModal] = useState(false)
  const [nearbySosAlert, setNearbySosAlert] = useState<SafetyIncidentRecord | null>(null)
  const [activeLostItemAlert, setActiveLostItemAlert] = useState<SupportTicket | null>(null)
  const [liveNavDetails, setLiveNavDetails] = useState<{ distanceKm: number; durationMinutes: number } | null>(null)
  const [telemetryStatus, setTelemetryStatus] = useState<ComputedGpsSample | null>(null)
  const telemetryGovernorRef = useRef<AdaptiveTelemetryGovernor | null>(null)

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

  const isSubscriptionActive = isOwner || profile?.subscriptionPlan === 'fleet_pro' || (
    !!profile?.subscriptionActive &&
    profile?.subscriptionPlan !== 'cancelled' &&
    profile?.subscriptionPlan !== 'past_due' &&
    !isTrialExpired
  );

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
                  alert('Subscription activated! Welcome to SOLO Driver Pro (Zero Commission). Platform access is now fully active.');
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
        const fleetCoverage = checkVehicleFleetCoverage({
          driverId: prof.id,
          licensePlate: prof.licensePlate,
        });

        if (isOwnerAccount) {
          prof.subscriptionPlan = 'owner';
          prof.subscriptionActive = true;
          prof.isVerified = true;
          if (!prof.vehicleMake || prof.vehicleMake === 'BMW' || prof.licensePlate === 'SOLO-01-GP') {
            prof.vehicleMake = 'Kia';
            prof.vehicleModel = 'Sportage';
            prof.vehicleColor = 'Blue';
            prof.licensePlate = 'CWT 143 NC';
            await saveDriverProfile(prof);
          }
          setIsDriverVerified(true);
          setIsTrialExpired(false);
          setShowSubModal(false);
        } else if (fleetCoverage.isCovered) {
          prof.subscriptionPlan = 'fleet_pro';
          prof.subscriptionActive = true;
          prof.isVerified = true;
          setIsDriverVerified(true);
          setIsTrialExpired(false);
          setShowSubModal(false);
        } else if (fleetCoverage.dispatchSuspended) {
          setPreemptedNotice(fleetCoverage.reason || 'Vehicle dispatch is paused by your fleet manager.');
          setIsDriverVerified(!!prof.isVerified);
        } else if (prof.subscriptionPlan === 'cancelled' || prof.subscriptionActive === false) {
          setIsOnline(false);
          setShowSubModal(true);
          setIsDriverVerified(!!prof.isVerified);
        } else if (prof.subscriptionPlan === 'trial' && prof.trialStartedAt) {
          const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
          if (Date.now() - prof.trialStartedAt > SEVEN_DAYS) {
            setIsTrialExpired(true);
            setIsOnline(false);
            setShowSubModal(true);
          }
          setIsDriverVerified(!!prof.isVerified);
        } else {
          setIsDriverVerified(!!prof.isVerified);
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

    if (!isSubscriptionActive) {
      setIsOnline(false);
      setRequest(null);
      return;
    }
    
    // Check pending/active trips on mount and via polling
    const loadTrips = async () => {
      const driverId = profile?.id || getSafeLocalStorageItem('driver_id');
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
        if (completedIds.has(currentActive.id) || declinedIds.has(currentActive.id) || isTripDismissed(currentActive.id)) {
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
            markTripDismissed(currentInDb.id);
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
          !completedIds.has(t.id) &&
          !isTripDismissed(t.id)
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
          nearbyRequested = await getNearbyRequestedTrips(coords.lat, coords.lng, 15, driverId, trips);
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
    // Realtime Broadcast & postgres_changes handle instant trip events; 15s jittered fallback prevents 1,000-driver DB polling storms
    const pollInterval = setInterval(loadTrips, 14000 + Math.floor(Math.random() * 2000));

    const unsubscribe = subscribeToEvents((type, payload) => {
      if (type === 'sos_emergency_alert') {
        const sos = payload as SafetyIncidentRecord | null;
        if (sos && sos.incidentCode) {
          setNearbySosAlert(sos);
          if (!sos.silentDuress) {
            try {
              audioAlert.playAlertSequence();
            } catch {}
          }
        }
        return;
      }

      if (type === 'lost_item_alert') {
        const ticket = payload as SupportTicket | null;
        const driverId = profile?.id || getSafeLocalStorageItem('driver_id');
        if (ticket && (!ticket.driverId || ticket.driverId === driverId)) {
          setActiveLostItemAlert(ticket);
          try {
            audioAlert.playTripAlertChime();
          } catch {}
        }
        return;
      }

      if (type === 'driver_session_preempted') {
        const payloadData = payload as { driverId: string; deviceId: string } | null;
        const driverId = profile?.id || getSafeLocalStorageItem('driver_id');
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
        return;
      }

      if (type === 'new_message') {
        const msg = payload as MockMessage;
        const currentActive = activeTripRef.current;
        if (msg && currentActive && msg.trip_id === currentActive.id) {
          if (msg.sender === 'rider') {
            audioAlert.alertOfNewMessage(msg, 'driver');
            if (driverTripSubTabRef.current !== 'chat') {
              setDriverUnreadChatCount((prev) => prev + 1);
              setDriverIncomingMessageToast({ sender: 'Rider', text: msg.text });
            }
          }
        }
        return;
      }

      if (type === 'INSERT' || type === 'trip_updated') {
        const trip = payload as MockTrip;
        if (!trip) return;
        const driverId = profile?.id || getSafeLocalStorageItem('driver_id');
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
          markTripDismissed(trip.id);
          completeTripAtomic(trip.id, 'cash', trip);
          updateActiveTripState(null);
          setRequest(null);
          setShowFareCollection(false);
          alert("Payment Received! Trip Completed.");
        } else if (currentActive && trip.id === currentActive.id && trip.status === 'cancelled') {
          markTripDismissed(trip.id);
          updateActiveTripState(null);
          setRequest(null);
          setShowFareCollection(false);
        } else if (
          currentActive &&
          trip.id === currentActive.id &&
          !isTripCompleted(trip.id) &&
          !isTripDismissed(trip.id) &&
          !isTripDeclined(trip.id, driverId)
        ) {
          const incomingPrio = STATUS_PRIORITY[trip.status] || 0;
          const activePrio = STATUS_PRIORITY[currentActive.status] || 0;
          if (incomingPrio > activePrio) {
            updateActiveTripState(trip);
          }
        } else if (trip.status !== 'requested' || isTripDeclined(trip.id, driverId) || isTripCompleted(trip.id) || isTripDismissed(trip.id)) {
          setRequest(prev => (prev && prev.id === trip.id ? null : prev));
        }
      }
    });

    const onLocalLostItem = (e: any) => {
      const ticket = e?.detail?.ticket as SupportTicket | null;
      const driverId = profile?.id || getSafeLocalStorageItem('driver_id');
      if (ticket && (!ticket.driverId || ticket.driverId === driverId)) {
        setActiveLostItemAlert(ticket);
        try {
          audioAlert.playTripAlertChime();
        } catch {}
      }
    };
    window.addEventListener('solo_lost_item_alert', onLocalLostItem);
    
    return () => {
      clearInterval(pollInterval);
      unsubscribe();
      window.removeEventListener('solo_lost_item_alert', onLocalLostItem);
    }
  }, [isOnline, profile?.id])

  // Real-time Adaptive Battery-Aware GPS & WebSocket Telemetry
  useEffect(() => {
    if (!telemetryGovernorRef.current) {
      telemetryGovernorRef.current = new AdaptiveTelemetryGovernor();
    }
    const governor = telemetryGovernorRef.current;

    if (!isOnline) {
      governor.releaseWakeLock();
      setTelemetryStatus(null);
      if (profile?.id) {
        updateDriverLocation(profile.id, 0, 0, false, { deviceId: deviceIdRef.current });
      }
      return;
    }

    governor.syncWakeLock(true);

    if (!('geolocation' in navigator)) {
      console.warn("Geolocation is not supported by your browser");
      return;
    }

    const broadcastCurrentLocation = (
      latitude: number,
      longitude: number,
      coords?: GeolocationCoordinates,
      forceImmediate = false
    ) => {
      driverCoordsRef.current = { lat: latitude, lng: longitude };
      setDriverCoords({ lat: latitude, lng: longitude });

      const sample = governor.evaluateGpsTick({
        lat: latitude,
        lng: longitude,
        rawHeading: coords?.heading,
        rawSpeedMetersPerSec: coords?.speed,
        accuracyMeters: coords?.accuracy,
        hasActiveTrip: Boolean(activeTripRef.current),
        forceImmediate,
      });
      setTelemetryStatus(sample);

      if (profile?.id) {
        updateDriverLocation(profile.id, latitude, longitude, true, {
          fullName: profile.fullName,
          phone: profile.phone,
          vehicleMake: profile.vehicleMake,
          vehicleModel: profile.vehicleModel,
          vehicleYear: profile.vehicleYear,
          vehicleColor: profile.vehicleColor,
          licensePlate: profile.licensePlate,
          rating: ratingSummary?.average || 5.0,
          ratingCount: ratingSummary?.count || 0,
          tripId: activeTripRef.current?.id,
          deviceId: deviceIdRef.current,
          heading: sample.heading,
          speedKmh: sample.speedKmh,
          shouldBroadcastWs: sample.shouldBroadcastWs,
        });

        // Push authoritative real-time GPS coordinate to tracking endpoint for active trips
        if (activeTripRef.current?.id) {
          fetch('/api/trips/tracking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tripId: activeTripRef.current.id,
              driverId: profile.id,
              lat: latitude,
              lng: longitude,
              heading: sample.heading,
              speedKmh: sample.speedKmh,
            }),
          }).catch(() => {});
        }
      }
    };

    // Immediate initial location fetch
    navigator.geolocation.getCurrentPosition(
      (position) => {
        broadcastCurrentLocation(
          position.coords.latitude,
          position.coords.longitude,
          position.coords,
          true
        );
      },
      (error) => {
        console.warn("Could not get initial driver GPS location:", error);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );

    // Continuous watch position governed by AdaptiveTelemetryGovernor
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        broadcastCurrentLocation(
          position.coords.latitude,
          position.coords.longitude,
          position.coords,
          false
        );
      },
      (error) => {
        console.error("Error watching position:", error);
      },
      {
        enableHighAccuracy: !governor.getBatteryState().isLowBattery,
        maximumAge: 3000,
        timeout: 10000
      }
    );

    // Periodic 30-second keep-alive heartbeat so stationary/parked drivers stay fresh within 5-min TTL without draining battery
    const heartbeatInterval = setInterval(() => {
      if (driverCoordsRef.current && profile?.id) {
        broadcastCurrentLocation(
          driverCoordsRef.current.lat,
          driverCoordsRef.current.lng,
          undefined,
          false
        );
      }
    }, 30000);

    // Offline cleanup when driver closes tab or navigates away
    const handleBeforeUnload = () => {
      governor.releaseWakeLock();
      if (profile?.id) {
        updateDriverLocation(profile.id, 0, 0, false, { deviceId: deviceIdRef.current });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      clearInterval(heartbeatInterval);
      governor.releaseWakeLock();
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

  const handleCancelSubscription = async () => {
    if (!profile) return;
    if (isOwner) {
      alert('Platform Owner accounts cannot be cancelled. Lifetime free access is permanent.');
      return;
    }

    const confirmCancel = window.confirm(
      '⚠️ Cancel SOLO Driver Pro Subscription?\n\n' +
      '• Your monthly automatic billing will be stopped immediately.\n' +
      '• Your access to the SOLO platform and dispatch will be suspended immediately.\n' +
      '• You will not be able to go online until your subscription is reactivated.\n\n' +
      'Are you sure you want to cancel your subscription now?'
    );

    if (!confirmCancel) return;

    setIsCancellingSub(true);
    try {
      const res = await fetch('/api/driver/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: profile.id,
          email: profile.email,
        }),
      });

      const data = await res.json();
      if (data.success) {
        const updated: MockDriverProfile = {
          ...profile,
          subscriptionPlan: 'cancelled',
          subscriptionActive: false,
          paystackSubscriptionCode: undefined,
        };
        await saveDriverProfile(updated);
        setProfile(updated);

        // Force driver offline immediately and clear trip requests
        setIsOnline(false);
        audioAlert.stopTripRingtoneLoop();
        setRequest(null);

        // Open subscription paywall modal
        setShowSubModal(true);

        alert('Your subscription has been cancelled. Platform access has been paused until you reactivate by paying R499.00.');
      } else {
        alert(data.error || 'Failed to cancel subscription.');
      }
    } catch (err: unknown) {
      console.error('Cancellation error:', err);
      alert((err as Error).message || 'An error occurred while cancelling your subscription.');
    } finally {
      setIsCancellingSub(false);
    }
  };

  const handleAccept = async () => {
    if (request) {
      const tripToAccept = request;
      const driverId =
        profile?.id ||
        getSafeLocalStorageItem('driver_id') ||
        generateUuid();

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

      if (driverCoordsRef.current) {
        fetch('/api/trips/tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tripId: tripToAccept.id,
            driverId,
            lat: driverCoordsRef.current.lat,
            lng: driverCoordsRef.current.lng,
          }),
        }).catch(() => {});
      }
    }
  }

  const handleDecline = async () => {
    if (!request) return;
    const tripToDecline = request;
    const driverId =
      profile?.id ||
      getSafeLocalStorageItem('driver_id');
    setRequest(null);
    lastAlertedTripIdRef.current = null;
    await declineTrip(tripToDecline, driverId);
  }

  const handleDriverArrived = async () => {
    const current = activeTripRef.current || activeTrip;
    if (!current) return;
    setIsNotifyingArrival(true);
    try {
      const updated: MockTrip = { ...current, status: 'arrived' };
      recordTripStatusOverride(updated.id, 'arrived', updated.driver_id);
      updateActiveTripState(updated);
      await saveTrip(updated);

      const driverName = profile?.fullName || 'Your SOLO Driver';
      await dispatchDriverArrivedPush({
        tripId: current.id,
        driverName,
        otpPin: current.verification_pin || '',
      });
    } catch (err) {
      console.error('Error recording arrival:', err);
    } finally {
      setIsNotifyingArrival(false);
    }
  };

  const handleVerifyPinAndStart = async (inputCode?: string) => {
    const current = activeTripRef.current || activeTrip;
    if (!current) return;
    const pinToValidate = (inputCode !== undefined ? inputCode : pinInput).trim();
    if (!pinToValidate) {
      setPinError('Please enter the 4-digit PIN provided by the rider.');
      return;
    }

    setIsVerifyingPin(true);
    setPinError(null);
    try {
      const res = await startTripWithPin(current.id, pinToValidate);
      if (!res.success) {
        setPinError(res.error || 'Incorrect PIN. Please re-check with the rider.');
        setIsVerifyingPin(false);
        return;
      }

      const updated: MockTrip = { ...current, status: 'in_progress' };
      recordTripStatusOverride(updated.id, 'in_progress', updated.driver_id);
      updateActiveTripState(updated);
      await saveTrip(updated);
      setShowPinModal(false);
      setPinInput('');
      setPinError(null);
    } catch (err: any) {
      console.error('Error verifying PIN:', err);
      setPinError('Failed to verify PIN. Please try again.');
    } finally {
      setIsVerifyingPin(false);
    }
  };

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

  const handleRequestInAppPaystack = async () => {
    const current = activeTripRef.current || activeTrip;
    if (current) {
      const tripSnapshot: MockTrip = { ...current, status: 'payment_pending' };
      setIsAwaitingRiderPayment(true);
      setCompletionNotice(`Requested R${tripSnapshot.fare_amount} Paystack payment from rider...`);
      await completeTripAtomic(tripSnapshot.id, 'in_app', tripSnapshot);
      await saveTrip(tripSnapshot);
      broadcastEvent('trip_updated', tripSnapshot);
    }
  };

  const handleCashPayment = async () => {
    const current = activeTripRef.current || activeTrip;
    if (current) {
      const tripToComplete = current;
      setIsAwaitingRiderPayment(false);
      markTripCompleted(tripToComplete.id);
      markTripDismissed(tripToComplete.id);
      updateActiveTripState(null);
      setRequest(null);
      setShowFareCollection(false);
      setCompletionNotice(`Trip completed! R${tripToComplete.fare_amount} fare settled.`);
      await completeTripAtomic(tripToComplete.id, 'cash', tripToComplete);
      await saveTrip({ ...tripToComplete, status: 'completed' });
    }
  };

  const handleCancelActiveTrip = async () => {
    const current = activeTripRef.current || activeTrip;
    if (!current) return;
    const confirmCancel = window.confirm("Are you sure you want to cancel / end this trip?");
    if (!confirmCancel) return;

    markTripDismissed(current.id);
    const cancelledTrip: MockTrip = { ...current, status: 'cancelled' };
    updateActiveTripState(null);
    setShowFareCollection(false);
    setRequest(null);
    try {
      await saveTrip(cancelledTrip);
      broadcastEvent('trip_updated', cancelledTrip);
    } catch (e) {
      console.error('Error cancelling trip from driver portal:', e);
    }
  };

  const handleForceCloseFareModal = async () => {
    const current = activeTripRef.current || activeTrip;
    if (current) {
      markTripCompleted(current.id);
      markTripDismissed(current.id);
      updateActiveTripState(null);
      setShowFareCollection(false);
      setRequest(null);
      await completeTripAtomic(current.id, 'cash', current);
    } else {
      setShowFareCollection(false);
    }
  };

  // Define map pins and routing for pending request or active trip
  const mapProps = activeTrip 
    ? {
        pickupLat: activeTrip.pickup_lat,
        pickupLng: activeTrip.pickup_lng,
        dropoffLat: activeTrip.dropoff_lat,
        dropoffLng: activeTrip.dropoff_lng,
        driverLat: driverCoords?.lat,
        driverLng: driverCoords?.lng,
        tripStatus: activeTrip.status,
        onRouteChange: (details: { distanceKm: number; durationMinutes: number }) => setLiveNavDetails(details),
      }
    : request
      ? { pickupLat: request.pickup_lat, pickupLng: request.pickup_lng, driverLat: driverCoords?.lat, driverLng: driverCoords?.lng }
      : { driverLat: driverCoords?.lat, driverLng: driverCoords?.lng }

  return (
    <div className="h-mobile-portal w-full relative overflow-hidden bg-gray-100 dark:bg-zinc-900">
      {/* Real Map Background */}
      <div className="absolute inset-0 z-0">
        <MapComponent {...mapProps} />
        {/* Overlay to dim map slightly when offline - pointer-events-none so touches pass through to map/buttons */}
        {!isOnline && <div className="absolute inset-0 bg-white/40 dark:bg-black/60 z-[1] backdrop-blur-sm transition-all duration-500 pointer-events-none"></div>}
        
        {/* Animated Radar overlay when online, only if no active trip */}
        {isOnline && !activeTrip && !request && (
          <div className="absolute inset-0 z-[1] pointer-events-none flex items-center justify-center">
            <div className="w-48 h-48 bg-green-500/20 rounded-full animate-ping"></div>
            <div className="absolute w-96 h-96 bg-green-500/10 rounded-full animate-ping" style={{ animationDelay: '0.5s' }}></div>
          </div>
        )}
      </div>

      {/* Floating Header */}
      <div className="absolute top-2 sm:top-2.5 md:top-3.5 pt-safe left-2.5 right-2.5 sm:left-4 sm:right-4 sm:max-w-xl sm:mx-auto md:left-4 lg:left-6 md:right-auto md:mx-0 md:w-[390px] lg:w-[430px] md:max-w-none z-30 pointer-events-auto">
        <div className="bg-white/95 dark:bg-zinc-950/95 backdrop-blur-2xl shadow-xl rounded-2xl md:rounded-3xl border border-gray-200/80 dark:border-white/15 p-3 sm:p-3.5 md:p-4 flex justify-between items-center gap-2.5 transition-all">
          <div className="relative shrink-0">
            <img
              src="/driver-icon-192.png"
              alt="SOLO Driver Portal Avatar"
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl object-cover shadow-md border-2 transition-all ${
                isOnline ? 'border-emerald-500 shadow-emerald-500/20' : 'border-zinc-700/50'
              }`}
            />
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-white dark:ring-zinc-950 ${
                isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400 dark:bg-zinc-600'
              }`}
            />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h1 className="text-base sm:text-lg md:text-xl font-black tracking-tight shrink-0">SOLO</h1>
              <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/40 px-2 py-0.5 rounded-full text-amber-600 dark:text-amber-400 font-bold text-xs shadow-sm shrink-0">
                <span>★</span>
                <span>{ratingSummary.count > 0 ? ratingSummary.average.toFixed(1) : '5.0'}</span>
                {ratingSummary.count > 0 && <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">({ratingSummary.count})</span>}
              </div>
              {isOwner ? (
                <span className="bg-amber-100/90 text-amber-900 border border-amber-300 text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded-full dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-700/60 uppercase tracking-wider flex items-center gap-1 shadow-sm shrink-0">
                  <Crown size={12} className="text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="hidden sm:inline">Platform </span>Owner
                </span>
              ) : profile?.subscriptionPlan === 'fleet_pro' ? (
                <span className="bg-purple-100/90 text-purple-900 border border-purple-300 text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded-full dark:bg-purple-950/80 dark:text-purple-200 dark:border-purple-700/60 uppercase tracking-wider flex items-center gap-1 shadow-xs shrink-0">
                  <Building2 size={12} className="text-purple-600 dark:text-purple-400 shrink-0" />
                  <span className="hidden sm:inline">Fleet </span>Partner
                </span>
              ) : profile?.subscriptionPlan === 'cancelled' || (!profile?.subscriptionActive && !isTrialExpired) ? (
                <span className="bg-red-100/90 text-red-900 border border-red-300 text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded-full dark:bg-red-950/80 dark:text-red-200 dark:border-red-800 uppercase tracking-wider flex items-center gap-1 shadow-xs shrink-0">
                  <AlertCircle size={12} className="text-red-600 dark:text-red-400" />
                  <span>Cancelled</span>
                </span>
              ) : isTrialExpired ? (
                <span className="bg-amber-100/90 text-amber-900 border border-amber-300 text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded-full dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-800 uppercase tracking-wider flex items-center gap-1 shadow-xs shrink-0">
                  <AlertCircle size={12} className="text-amber-600 dark:text-amber-400" />
                  <span>Expired</span>
                </span>
              ) : profile?.subscriptionPlan === 'paid' ? (
                <span className="bg-blue-100/80 text-blue-800 text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded-full dark:bg-blue-900/80 dark:text-blue-200 uppercase tracking-wider shrink-0">
                  <span className="hidden sm:inline">Premium </span>Pro
                </span>
              ) : (
                <span className="bg-green-100/80 text-green-800 text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded-full dark:bg-green-900/80 dark:text-green-200 uppercase tracking-wider shrink-0">
                  <span className="hidden sm:inline">7-Day </span>Trial
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 font-semibold mt-0.5 break-words">
              Welcome back, {profile ? profile.fullName.split(' ')[0] : 'Driver'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <ThemeToggle className="bg-gray-100 dark:bg-zinc-800/80 border border-gray-200/80 dark:border-white/10 flex items-center justify-center touch-manipulation" />
            <button 
              onClick={async () => {
                const nextOnline = !isOnline;
                if (nextOnline) {
                  if (!isSubscriptionActive) {
                    audioAlert.stopTripRingtoneLoop();
                    setIsOnline(false);
                    setShowSubModal(true);
                    alert('Active subscription required: Your subscription is inactive or cancelled. You must pay R499.00 to go online and receive passenger trips.');
                    return;
                  }
                  audioAlert.unlockMobileAudio(true);
                  setPreemptedNotice(null);
                  if (profile?.id) {
                    setDriverActiveSession(profile.id, deviceIdRef.current);
                  }
                } else {
                  audioAlert.stopTripRingtoneLoop();
                }
                setIsOnline(nextOnline);
                if (nextOnline && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
                  try {
                    await registerForPushNotifications('driver', profile?.id);
                  } catch {}
                }
              }}
              disabled={!!activeTrip}
              className={`flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2.5 min-h-[46px] min-w-[98px] rounded-2xl text-sm sm:text-base font-black transition-all shadow-sm touch-manipulation ${
                isOnline 
                  ? 'bg-emerald-500 text-white hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.35)]' 
                  : 'bg-zinc-900 text-white hover:bg-black dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700'
              } ${activeTrip ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
            >
              <Power size={18} />
              <span>{isOnline ? 'Online' : 'Go Online'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top Floating Driver Navigation Quick Pill (Always accessible on map) */}
      {activeTrip && (activeTrip.status === 'accepted' || activeTrip.status === 'arrived' || activeTrip.status === 'in_progress') && (
        <div className="absolute top-2 sm:top-2.5 md:top-4 right-2.5 md:right-8 z-30 pointer-events-auto">
          {(() => {
            const isNavToDropoff = activeTrip.status === 'in_progress';
            const targetLat = isNavToDropoff ? activeTrip.dropoff_lat : activeTrip.pickup_lat;
            const targetLng = isNavToDropoff ? activeTrip.dropoff_lng : activeTrip.pickup_lng;
            const currentDistKm = liveNavDetails?.distanceKm ?? (driverCoords ? calculateDistanceKm(driverCoords.lat, driverCoords.lng, targetLat, targetLng) : 0);
            const currentEtaMins = liveNavDetails?.durationMinutes ?? estimateEtaMinutes(currentDistKm);
            const gNavUrl = driverCoords
              ? `https://www.google.com/maps/dir/?api=1&origin=${driverCoords.lat},${driverCoords.lng}&destination=${targetLat},${targetLng}&travelmode=driving`
              : `https://www.google.com/maps/dir/?api=1&destination=${targetLat},${targetLng}&travelmode=driving`;

            return (
              <a
                href={gNavUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 min-h-[46px] rounded-2xl shadow-xl border border-white/20 flex items-center gap-2.5 font-bold text-xs sm:text-sm active:scale-95 transition touch-manipulation"
                title="Launch Turn-by-Turn GPS Navigation in Google Maps"
              >
                <Navigation size={18} className="text-white shrink-0" />
                <div className="text-left leading-tight">
                  <p className="text-[11px] uppercase tracking-wider text-emerald-100 font-black">
                    {isNavToDropoff ? 'To Dropoff' : 'To Pickup'}
                  </p>
                  <p className="font-mono font-black text-xs sm:text-sm">
                    {currentEtaMins} min ({currentDistKm.toFixed(1)} km)
                  </p>
                </div>
                <ExternalLink size={14} className="opacity-90 shrink-0" />
              </a>
            );
          })()}
        </div>
      )}

      {/* Floating Main Content Panel */}
      <div 
        className={`absolute left-2.5 right-2.5 sm:left-4 sm:right-4 sm:max-w-xl sm:mx-auto md:left-4 lg:left-6 md:right-auto md:mx-0 md:w-[390px] lg:w-[430px] md:max-w-none flex flex-col z-20 pointer-events-none transition-all duration-300 ${
          activeTab === 'home'
            ? isHomeSheetMinimized
              ? 'bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] md:bottom-auto md:top-[88px] max-h-[56px]'
              : 'bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] md:bottom-[86px] md:top-[88px] max-h-[72vh] max-h-[72dvh] md:max-h-none'
            : 'top-[78px] sm:top-[88px] md:top-[88px] bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] md:bottom-[86px]'
        }`}
      >
        <div
          onFocusCapture={() => {
            if (isHomeSheetMinimized) setIsHomeSheetMinimized(false)
          }}
          className="bg-white/95 dark:bg-zinc-950/95 backdrop-blur-3xl shadow-2xl rounded-3xl border border-white/40 dark:border-white/10 overflow-hidden flex flex-col h-full pointer-events-auto gpu-composited"
        >
          {/* Handle / Collapse Bar for Home tab (Mobile & Tablet) */}
          {activeTab === 'home' && (
            <div 
              onClick={() => setIsHomeSheetMinimized(!isHomeSheetMinimized)}
              className="flex items-center justify-between px-4 py-3 bg-gray-50/90 dark:bg-zinc-900/90 border-b border-gray-200/70 dark:border-white/10 cursor-pointer touch-manipulation select-none shrink-0"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-1.5 bg-gray-300 dark:bg-zinc-600 rounded-full shrink-0" />
                <span className="text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200 break-words">
                  {isHomeSheetMinimized 
                    ? (activeTrip ? `${activeTrip.status.replace('_', ' ').toUpperCase()} • PIN: ${activeTrip.verification_pin || '----'} • R${activeTrip.fare_amount}` : isOnline ? "Online • Searching (Tap to expand)" : "Offline • Tap to expand")
                    : "Driver Controls"}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isHomeSheetMinimized && activeTrip && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDriverTripSubTab('chat')
                      setIsHomeSheetMinimized(false)
                    }}
                    className="relative text-xs font-bold text-white bg-blue-600 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs"
                  >
                    <MessageCircle size={14} />
                    <span>Chat</span>
                    {driverUnreadChatCount > 0 && (
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping absolute -top-0.5 -right-0.5" />
                    )}
                  </button>
                )}
                <button 
                  type="button" 
                  className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 p-1 shrink-0 touch-manipulation"
                >
                  <span>{isHomeSheetMinimized ? 'Expand' : 'Map View'}</span>
                  {isHomeSheetMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>
          )}

          <div className={`p-4 sm:p-5 md:p-5 lg:p-6 overflow-y-auto overscroll-contain momentum-scroll custom-scrollbar flex-1 min-h-0 flex flex-col ${
            activeTab === 'home' && isHomeSheetMinimized
              ? 'hidden'
              : activeTab === 'home' && activeTrip
                ? (driverTripSubTab === 'chat' ? 'pb-10 md:pb-5' : 'pb-4 md:pb-5')
                : 'pb-16 md:pb-6'
          }`}>
            {activeTab === 'home' && (
              activeTrip ? (
                <div className="animate-in fade-in slide-in-from-left-4 duration-500 flex flex-col h-full">
                  {/* Compact Top Status & Fare Header */}
                  <div className="flex items-start justify-between gap-2.5 mb-3 shrink-0">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm shrink-0 mt-0.5">
                        <MapPin size={20} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-lg sm:text-xl font-black tracking-tight leading-snug">
                          {activeTrip.status === 'accepted' ? 'En route to Pickup' : activeTrip.status === 'arrived' ? 'Arrived at Pickup' : 'Trip in Progress'}
                        </h2>
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 font-semibold break-words mt-0.5">
                          {activeTrip.status === 'in_progress' ? `To: ${activeTrip.dropoff_location}` : `Pickup: ${activeTrip.pickup_location}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-emerald-600 dark:text-emerald-400 font-black text-2xl sm:text-3xl tracking-tight">
                        R{activeTrip.fare_amount}
                      </span>
                    </div>
                  </div>

                  {/* Segmented Mobile Tab Toggle: Eliminates scroll conflict between Trip Controls & Rider Chat */}
                  <div className="grid grid-cols-2 gap-2 p-1.5 mb-3.5 rounded-2xl bg-gray-100 dark:bg-zinc-900 border border-gray-200/80 dark:border-white/10 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDriverTripSubTab('controls')}
                      className={`flex items-center justify-center gap-2 py-2.5 px-3 min-h-[46px] rounded-xl text-sm sm:text-base font-bold transition-all touch-manipulation ${
                        driverTripSubTab === 'controls'
                          ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      <Navigation size={16} className={driverTripSubTab === 'controls' ? 'text-blue-600 dark:text-blue-400' : ''} />
                      <span>Trip &amp; PIN</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDriverTripSubTab('chat')}
                      className={`relative flex items-center justify-center gap-2 py-2.5 px-3 min-h-[46px] rounded-xl text-sm sm:text-base font-bold transition-all touch-manipulation ${
                        driverTripSubTab === 'chat'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      <MessageCircle size={16} />
                      <span>Chat with Rider</span>
                      {driverUnreadChatCount > 0 && driverTripSubTab !== 'chat' && (
                        <span className="px-2 py-0.5 text-xs font-black bg-red-500 text-white rounded-full animate-bounce leading-none shadow-sm">
                          {driverUnreadChatCount}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Incoming Message Floating Alert Toast if Driver is on Navigation/Controls Tab */}
                  {driverIncomingMessageToast && driverTripSubTab === 'controls' && (
                    <div
                      onClick={() => setDriverTripSubTab('chat')}
                      className="mb-3 p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl flex items-center justify-between gap-2 text-sm font-semibold shadow-md cursor-pointer animate-in fade-in slide-in-from-top-2 transition active:scale-[0.98]"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <MessageCircle size={18} className="shrink-0 mt-0.5 animate-pulse text-blue-200" />
                        <span className="break-words">
                          <strong className="text-blue-100">{driverIncomingMessageToast.sender}:</strong> {driverIncomingMessageToast.text}
                        </span>
                      </div>
                      <span className="text-xs underline shrink-0 font-bold text-blue-100">Reply →</span>
                    </div>
                  )}

                  {driverTripSubTab === 'controls' ? (
                    <div className="flex flex-col gap-3.5">
                      {/* Driver GPS Turn-by-Turn Navigation & Launcher Card */}
                      {(() => {
                        const isNavigatingToPickup = activeTrip.status === 'accepted';
                        const isAtPickup = activeTrip.status === 'arrived';
                        const isNavigatingToDropoff = activeTrip.status === 'in_progress';

                        const targetLat = isNavigatingToDropoff ? activeTrip.dropoff_lat : activeTrip.pickup_lat;
                        const targetLng = isNavigatingToDropoff ? activeTrip.dropoff_lng : activeTrip.pickup_lng;
                        const targetLocationName = isNavigatingToDropoff ? activeTrip.dropoff_location : activeTrip.pickup_location;
                        const targetStageLabel = isNavigatingToPickup 
                          ? 'Navigate to Pickup' 
                          : isAtPickup 
                            ? 'At Pickup (Boarding)' 
                            : 'Navigate to Dropoff';

                        const currentDistanceKm = liveNavDetails?.distanceKm ?? (driverCoords ? calculateDistanceKm(driverCoords.lat, driverCoords.lng, targetLat, targetLng) : 0);
                        const currentEtaMinutes = liveNavDetails?.durationMinutes ?? estimateEtaMinutes(currentDistanceKm);

                        const googleMapsNavUrl = driverCoords
                          ? `https://www.google.com/maps/dir/?api=1&origin=${driverCoords.lat},${driverCoords.lng}&destination=${targetLat},${targetLng}&travelmode=driving`
                          : `https://www.google.com/maps/dir/?api=1&destination=${targetLat},${targetLng}&travelmode=driving`;

                        const wazeNavUrl = `https://waze.com/ul?ll=${targetLat},${targetLng}&navigate=yes`;

                        return (
                          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-xl shadow-emerald-600/25 flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-300 animate-ping" />
                                <span className="text-xs font-black uppercase tracking-wider text-emerald-100">
                                  {targetStageLabel}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 font-mono text-xs sm:text-sm font-black bg-black/30 backdrop-blur-md px-3 py-1 rounded-xl border border-white/20">
                                <span>{currentEtaMinutes} min</span>
                                <span className="opacity-60">•</span>
                                <span>{currentDistanceKm.toFixed(1)} km</span>
                              </div>
                            </div>

                            <div className="flex items-start gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                                <Compass size={22} className="text-white" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-black text-emerald-200 uppercase tracking-wider">
                                  {isNavigatingToDropoff ? 'Dropoff Destination' : 'Rider Pickup Point'}
                                </p>
                                <p className="text-base font-bold text-white leading-snug break-words">
                                  {targetLocationName}
                                </p>
                              </div>
                            </div>

                            {/* 1-Tap External GPS Navigation Launchers */}
                            <div className="grid grid-cols-2 gap-2.5 pt-1.5 border-t border-white/20">
                              <a
                                href={googleMapsNavUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 py-3 px-3.5 min-h-[48px] rounded-xl bg-white hover:bg-gray-100 text-gray-950 font-black text-sm shadow-md active:scale-95 transition touch-manipulation"
                              >
                                <ExternalLink size={16} className="text-blue-600 shrink-0" />
                                <span>Google Maps</span>
                              </a>
                              <a
                                href={wazeNavUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 py-3 px-3.5 min-h-[48px] rounded-xl bg-cyan-400 hover:bg-cyan-300 text-cyan-950 font-black text-sm shadow-md active:scale-95 transition touch-manipulation"
                              >
                                <Navigation size={16} className="shrink-0" />
                                <span>Waze</span>
                              </a>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Rider Boarding PIN Card - Displayed prominently to driver to confirm with rider */}
                      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50/70 dark:from-blue-950/40 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800/60 shadow-sm flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md">
                            <KeyRound size={20} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs sm:text-sm font-extrabold text-blue-900 dark:text-blue-200 uppercase tracking-wider">Boarding PIN</span>
                              <span className="text-xs bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold px-2.5 py-0.5 rounded-full">
                                Confirm with Rider
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                              Match with rider before departure
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="bg-white dark:bg-zinc-900 px-3.5 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800/80 shadow-inner">
                            <span className="font-mono text-xl sm:text-2xl font-black tracking-widest text-blue-600 dark:text-blue-400">
                              {activeTrip.verification_pin || '----'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Full Route Card */}
                      <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-zinc-900/70 border border-gray-200/80 dark:border-white/10 space-y-2 text-xs sm:text-sm">
                        <div className="flex items-start gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                          <span className="text-gray-500 dark:text-gray-400 font-semibold shrink-0">Pickup:</span>
                          <span className="font-bold text-gray-900 dark:text-gray-100 break-words">{activeTrip.pickup_location}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="w-2.5 h-2.5 rounded-none bg-emerald-500 shrink-0 mt-1.5" />
                          <span className="text-gray-500 dark:text-gray-400 font-semibold shrink-0">Dropoff:</span>
                          <span className="font-bold text-gray-900 dark:text-gray-100 break-words">{activeTrip.dropoff_location}</span>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-gray-200/60 dark:border-white/10">
                          <span className="text-gray-500 dark:text-gray-400 font-semibold">Occupants:</span>
                          <span className="font-bold text-blue-600 dark:text-blue-400">
                            {activeTrip.passenger_count === 2 ? '👥 2 Riders (Max)' : '👤 1 Rider (Solo)'}
                          </span>
                        </div>
                      </div>

                      {activeTrip.status === 'accepted' && (
                        <div className="flex flex-col gap-2.5">
                          <button 
                            onClick={handleDriverArrived}
                            disabled={isNotifyingArrival}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white min-h-[54px] p-4 rounded-2xl font-black transition-all shadow-lg shadow-blue-600/25 active:scale-95 touch-manipulation flex items-center justify-center gap-2.5 text-base sm:text-lg"
                          >
                            <MapPin size={20} />
                            <span>{isNotifyingArrival ? 'Notifying Rider...' : 'I Have Arrived at Pickup'}</span>
                          </button>
                          <button
                            onClick={() => {
                              setPinInput(activeTrip.verification_pin || '');
                              setPinError(null);
                              setShowPinModal(true);
                            }}
                            className="w-full bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-100 min-h-[48px] p-3 rounded-2xl font-bold transition-all active:scale-95 touch-manipulation flex items-center justify-center gap-2 text-sm sm:text-base border border-gray-200 dark:border-white/10"
                          >
                            <KeyRound size={18} className="text-blue-600 dark:text-blue-400" />
                            <span>Confirm PIN &amp; Start Trip</span>
                          </button>
                        </div>
                      )}

                      {activeTrip.status === 'arrived' && (
                        <div className="flex flex-col gap-2.5">
                          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-xl flex items-center gap-2.5 text-amber-900 dark:text-amber-200 text-xs sm:text-sm font-bold">
                            <MapPin size={18} className="text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>Arrived at pickup. Ask rider for PIN <strong>{activeTrip.verification_pin}</strong> to start trip.</span>
                          </div>
                          <button 
                            onClick={() => {
                              setPinInput(activeTrip.verification_pin || '');
                              setPinError(null);
                              setShowPinModal(true);
                            }}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white min-h-[54px] p-4 rounded-2xl font-black transition-all shadow-lg shadow-blue-600/25 active:scale-95 touch-manipulation flex items-center justify-center gap-2.5 text-base sm:text-lg"
                          >
                            <KeyRound size={20} />
                            <span>Verify PIN &amp; Start Trip</span>
                          </button>
                        </div>
                      )}

                      {activeTrip.status !== 'accepted' && activeTrip.status !== 'arrived' && (
                        <button 
                          onClick={handleComplete}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white min-h-[54px] p-4 rounded-2xl font-black hover:scale-[1.01] active:scale-[0.98] transition-all shadow-xl shadow-emerald-600/25 touch-manipulation flex items-center justify-center text-base sm:text-lg"
                        >
                          Confirm Dropoff (Complete)
                        </button>
                      )}

                      {/* Quick Action Footer: Open Rider Chat or Trigger SOS */}
                      <div className="grid grid-cols-2 gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setDriverTripSubTab('chat')}
                          className="flex items-center justify-center gap-2 py-3 px-3.5 min-h-[46px] rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/80 dark:border-blue-800/60 text-xs sm:text-sm font-bold active:scale-95 transition touch-manipulation"
                        >
                          <MessageCircle size={16} />
                          <span>Message Rider</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSafetyModal(true)}
                          className="flex items-center justify-center gap-2 py-3 px-3.5 min-h-[46px] rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs sm:text-sm font-black active:scale-95 transition touch-manipulation shadow-2xs"
                        >
                          <span>🚨 SOS / Security</span>
                        </button>
                      </div>
                      <div className="pt-1 text-center">
                        <button
                          type="button"
                          onClick={handleCancelActiveTrip}
                          className="text-xs sm:text-sm font-bold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 py-2 px-4 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/40 transition touch-manipulation"
                        >
                          Cancel / End Trip
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Dedicated Full-Height Rider Chat View + Sticky Quick Trip Progression Bar */
                    <div className="flex-1 flex flex-col min-h-[320px] md:min-h-[380px] gap-2.5 pb-2">
                      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-blue-50/90 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/50 shrink-0">
                        <span className="text-sm font-bold text-blue-900 dark:text-blue-200">
                          PIN: <strong className="font-mono text-base">{activeTrip.verification_pin || '----'}</strong>
                        </span>
                        {activeTrip.status === 'accepted' ? (
                          <button
                            type="button"
                            onClick={handleDriverArrived}
                            disabled={isNotifyingArrival}
                            className="bg-blue-600 text-white text-xs sm:text-sm font-bold px-3.5 py-2 min-h-[40px] rounded-lg shadow-2xs active:scale-95"
                          >
                            {isNotifyingArrival ? 'Notifying...' : 'Mark Arrived'}
                          </button>
                        ) : activeTrip.status === 'arrived' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPinInput(activeTrip.verification_pin || '');
                              setPinError(null);
                              setShowPinModal(true);
                            }}
                            className="bg-blue-600 text-white text-xs sm:text-sm font-bold px-3.5 py-2 min-h-[40px] rounded-lg shadow-2xs active:scale-95"
                          >
                            Verify PIN &amp; Start
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleComplete}
                            className="bg-emerald-600 text-white text-xs sm:text-sm font-bold px-3.5 py-2 min-h-[40px] rounded-lg shadow-2xs active:scale-95"
                          >
                            Confirm Dropoff
                          </button>
                        )}
                      </div>
                      <div className="flex-1 min-h-[260px] md:min-h-[320px] flex flex-col border border-gray-200/70 dark:border-white/10 rounded-2xl overflow-hidden bg-white dark:bg-black shadow-inner">
                        <Chat tripId={activeTrip.id} role="driver" />
                      </div>
                    </div>
                  )}
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
                  <div className="mb-4 sm:mb-5 flex justify-center">
                    <div className={`relative p-1.5 rounded-[1.75rem] transition-all duration-500 ${
                      isOnline
                        ? 'bg-gradient-to-br from-emerald-400 via-teal-500 to-green-600 shadow-2xl shadow-emerald-500/35 scale-105'
                        : 'bg-zinc-200 dark:bg-zinc-800 opacity-75 grayscale-[35%]'
                    }`}>
                      <img
                        src="/driver-icon-512.png"
                        alt="SOLO Driver Emblem"
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-[1.4rem] object-cover border border-white/20 shadow-inner"
                      />
                      <span
                        className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full ring-4 ring-white dark:ring-zinc-950 ${
                          isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400 dark:bg-zinc-600'
                        }`}
                      />
                    </div>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-2 tracking-tight">
                    {isOnline ? "You're Online" : "You're Offline"}
                  </h2>
                  <p className="text-gray-500 text-sm sm:text-base mb-5 sm:mb-6 font-medium">
                    {isOnline 
                      ? "Waiting for ride requests in your area..." 
                      : "Go online to start receiving ride requests."}
                  </p>
                  
                  {nearbySosAlert && (
                    <div className="mb-4 p-3.5 rounded-2xl bg-red-600 text-white text-left text-xs shadow-xl shadow-red-600/30 animate-pulse space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black uppercase tracking-wider">
                          🚨 SOLO COMMUNITY SOS ({nearbySosAlert.incidentCode})
                        </span>
                        <button
                          type="button"
                          onClick={() => setNearbySosAlert(null)}
                          className="text-white/80 hover:text-white font-bold px-1"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-red-100">
                        Emergency triggered by {nearbySosAlert.role.toUpperCase()} ({nearbySosAlert.userName}) in Sector{' '}
                        <strong className="font-mono">{nearbySosAlert.geohash6?.toUpperCase()}</strong>
                        {nearbySosAlert.licensePlate ? ` • Reg: ${nearbySosAlert.licensePlate}` : ''}.
                      </p>
                      <a
                        href={nearbySosAlert.googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 bg-white text-red-700 font-black px-3 py-1.5 rounded-xl text-[11px]"
                      >
                        <MapPin size={13} />
                        <span>Open Responder GPS Pin</span>
                      </a>
                    </div>
                  )}

                  {activeLostItemAlert && (
                    <div className="mb-4 p-4 rounded-2xl bg-amber-600 text-white text-left text-xs shadow-xl shadow-amber-600/30 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black uppercase tracking-wider flex items-center gap-1.5">
                          <Smartphone size={16} />
                          <span>🚨 Passenger Lost Item Alert ({activeLostItemAlert.ticketCode})</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveLostItemAlert(null)}
                          className="text-white/80 hover:text-white font-bold px-1 text-sm"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-amber-100">
                        A passenger from a recent trip reported an item left behind in your vehicle.
                      </p>
                      <div className="p-3 bg-black/20 rounded-xl text-xs space-y-1 text-amber-50">
                        <div>
                          <strong>Item:</strong> {activeLostItemAlert.itemDetails?.brandModel || activeLostItemAlert.subject}{' '}
                          {activeLostItemAlert.itemDetails?.color ? `(${activeLostItemAlert.itemDetails.color})` : ''}
                        </div>
                        {activeLostItemAlert.itemDetails?.caseOrFeatures && (
                          <div><strong>Features/Case:</strong> {activeLostItemAlert.itemDetails.caseOrFeatures}</div>
                        )}
                        {activeLostItemAlert.itemDetails?.lockScreenInfo && (
                          <div><strong>Lock Screen Hint:</strong> {activeLostItemAlert.itemDetails.lockScreenInfo}</div>
                        )}
                        <div><strong>Passenger:</strong> {activeLostItemAlert.riderName || 'SOLO Passenger'}</div>
                        <div>
                          <strong>Alternative Contact:</strong> {activeLostItemAlert.alternativeContactName || 'Contact'} ({activeLostItemAlert.alternativeContactPhone})
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {activeLostItemAlert.alternativeContactPhone && (
                          <>
                            <a
                              href={`tel:${activeLostItemAlert.alternativeContactPhone}`}
                              className="inline-flex items-center gap-1 bg-white text-amber-800 font-bold px-3 py-1.5 rounded-xl text-[11px] hover:bg-amber-50 transition shadow-xs"
                            >
                              <Phone size={13} />
                              <span>Call Passenger</span>
                            </a>
                            <a
                              href={`https://wa.me/${activeLostItemAlert.alternativeContactPhone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(
                                `Hi, I am your SOLO driver. I received your lost property alert (${activeLostItemAlert.ticketCode}).`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 bg-emerald-600 text-white font-bold px-3 py-1.5 rounded-xl text-[11px] hover:bg-emerald-700 transition shadow-xs"
                            >
                              <MessageCircle size={13} />
                              <span>WhatsApp</span>
                            </a>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            updateSupportTicketStatus(activeLostItemAlert.id, 'driver_confirmed_found', 'Driver confirmed item secured in vehicle.');
                            alert('Thank you! Passenger and SOLO Support have been notified that you secured the item.');
                            setActiveLostItemAlert(null);
                          }}
                          className="inline-flex items-center gap-1 bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-xl text-[11px] hover:bg-emerald-600 transition"
                        >
                          <CheckCircle2 size={13} />
                          <span>I Found It</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            updateSupportTicketStatus(activeLostItemAlert.id, 'driver_checked_not_found', 'Driver checked vehicle but item was not located.');
                            alert('Status updated: Checked vehicle, item was not located.');
                            setActiveLostItemAlert(null);
                          }}
                          className="inline-flex items-center gap-1 bg-black/30 text-white font-medium px-2.5 py-1.5 rounded-xl text-[11px] hover:bg-black/40 transition"
                        >
                          <span>Not Found</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {isOnline && (
                    <div className="space-y-3">
                      <div className="bg-blue-50/90 text-blue-900 dark:bg-blue-900/35 dark:text-blue-200 p-4 rounded-2xl flex items-center justify-between gap-2.5 animate-pulse border border-blue-200/70 dark:border-blue-800/40">
                        <div className="flex items-center gap-2.5">
                          <Navigation size={20} className="shrink-0" />
                          <span className="text-sm sm:text-base font-extrabold tracking-wide">SEARCHING FOR RIDERS</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            audioAlert.unlockMobileAudio(false);
                            audioAlert.playAlertSequence();
                          }}
                          className="shrink-0 px-3 py-1.5 min-h-[38px] rounded-xl bg-white dark:bg-zinc-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700/60 text-xs sm:text-sm font-bold shadow-2xs active:scale-95 transition touch-manipulation"
                        >
                          🔊 Test Sound
                        </button>
                      </div>

                      {/* Adaptive Battery-Aware & WebSocket Telemetry HUD */}
                      <div className="p-3.5 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/35 border border-emerald-200/80 dark:border-emerald-800/50 flex items-center justify-between gap-2 flex-wrap text-xs sm:text-sm font-bold text-emerald-900 dark:text-emerald-200">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                          <span className="break-words">
                            {telemetryStatus
                              ? TELEMETRY_TIER_CONFIGS[telemetryStatus.tier].label
                              : 'WS Geohash-6 Mesh Active'}
                          </span>
                        </div>
                        <span className="font-mono text-xs bg-white/90 dark:bg-zinc-900 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 shrink-0">
                          {telemetryStatus
                            ? `${telemetryStatus.geohash6.toUpperCase()} • ${telemetryStatus.speedKmh}km/h • 🔋${telemetryStatus.batteryLevel}%`
                            : '0 DB Poll Drain'}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 text-left space-y-3">
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
                      <div key={trip.id} className="bg-gray-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex justify-between items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm break-words">{trip.dropoff_location}</p>
                          <p className="text-xs text-gray-500 mt-1">Completed</p>
                        </div>
                        <span className="font-black text-green-600 dark:text-green-400 shrink-0">R{trip.fare_amount}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500 text-center">
                <div className="mb-5 flex justify-center">
                  <div className="relative p-1 rounded-[1.75rem] bg-gradient-to-br from-emerald-500 via-teal-400 to-green-600 shadow-xl shadow-emerald-500/25">
                    <img
                      src="/driver-icon-512.png"
                      alt="Driver Profile Avatar"
                      className="w-20 h-20 rounded-[1.45rem] object-cover border border-white/20"
                    />
                    <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-black flex items-center justify-center ring-2 ring-white dark:ring-zinc-950 shadow-sm">
                      {profile?.fullName ? profile.fullName.charAt(0).toUpperCase() : 'D'}
                    </span>
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
                  <div className="flex justify-between items-center py-2 border-b border-gray-200/50 dark:border-white/5 gap-2">
                    <span className="text-gray-500 text-sm font-medium">Ride Payments</span>
                    <span className="font-bold text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                      <CreditCard size={12} /> Speedpoint (Required) &amp; Cash
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-500 text-sm font-medium">Subscription</span>
                    <span className="font-bold text-sm">
                      {isOwner ? (
                        <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <Crown size={14} /> Lifetime Free (Founder Exemption)
                        </span>
                      ) : profile?.subscriptionPlan === 'fleet_pro' ? (
                        <span className="text-purple-600 dark:text-purple-400 font-bold flex items-center gap-1.5">
                          <Building2 size={14} /> Active (Covered by Fleet Partner)
                        </span>
                      ) : profile?.subscriptionPlan === 'cancelled' || (!profile?.subscriptionActive && !isTrialExpired) ? (
                        <span className="text-red-600 dark:text-red-400 font-bold flex items-center gap-1">
                          <AlertCircle size={14} /> Cancelled (No Platform Access)
                        </span>
                      ) : isTrialExpired ? (
                        <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                          <AlertCircle size={14} /> Expired (No Platform Access)
                        </span>
                      ) : profile?.subscriptionPlan === 'paid' ? (
                        <span className="text-blue-600 dark:text-blue-400">Active (Paid R499/mo)</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Active (7-Day Trial — {Math.max(0, Math.ceil(((profile?.trialEndsAt || (profile?.trialStartedAt ? profile.trialStartedAt + 7 * 86400000 : Date.now())) - Date.now()) / 86400000))}d left)
                        </span>
                      )}
                    </span>
                  </div>
                  {!isOwner && profile?.subscriptionPlan === 'trial' && profile?.cardLast4 && profile?.subscriptionActive && (
                    <div className="py-1.5 px-3 bg-emerald-50/80 dark:bg-emerald-950/40 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 flex items-center justify-between text-[11px] text-emerald-800 dark:text-emerald-300">
                      <span className="flex items-center gap-1.5 font-medium">
                        <CreditCard size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        Card Linked: {profile.cardBrand || 'Card'} •••• {profile.cardLast4}
                      </span>
                      <span className="font-bold">Auto-bills R499 on Day 8</span>
                    </div>
                  )}
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
                    className="w-full py-3 px-4 min-h-[44px] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 font-bold text-xs rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition active:scale-98 touch-manipulation"
                  >
                    <Building2 size={15} /> Link / Update Bank Details
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
                    {(['driver_selfie', 'license_front', 'license_back', 'prdp', 'license_disc', 'vehicle_photo', 'roadworthy'] as KycDocType[]).map((type) => {
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
                  <>
                    <button 
                      onClick={() => setShowSubModal(true)}
                      className={`mt-6 w-full min-h-[48px] py-3.5 font-bold rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-xl touch-manipulation flex items-center justify-center gap-2 text-sm sm:text-base ${
                        !isSubscriptionActive 
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20' 
                          : 'bg-black dark:bg-white text-white dark:text-black'
                      }`}
                    >
                      <CreditCard size={18} />
                      <span>
                        {!isSubscriptionActive 
                          ? 'Pay R499.00 & Reactivate Access' 
                          : profile?.subscriptionPlan === 'paid' 
                            ? 'Manage Subscription' 
                            : 'Upgrade to R499/mo'}
                      </span>
                    </button>

                    {!isOwner && profile?.subscriptionPlan !== 'fleet_pro' && isSubscriptionActive && (
                      <button
                        onClick={handleCancelSubscription}
                        disabled={isCancellingSub}
                        className="mt-2.5 w-full min-h-[44px] py-2.5 text-red-600 dark:text-red-400 font-bold bg-red-50/80 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-2xl transition active:scale-[0.98] touch-manipulation flex items-center justify-center gap-2 border border-red-200/60 dark:border-red-900/40 text-xs sm:text-sm"
                      >
                        {isCancellingSub ? (
                          <>
                            <div className="w-4 h-4 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin"></div>
                            <span>Cancelling Subscription...</span>
                          </>
                        ) : (
                          <>
                            <XCircle size={16} />
                            <span>Cancel Subscription</span>
                          </>
                        )}
                      </button>
                    )}
                  </>
                )}
                <button 
                  onClick={async () => {
                    const supabase = createClient();
                    await supabase.auth.signOut().catch(() => {});
                    removeSafeLocalStorageItem('driver_id');
                    removeSafeLocalStorageItem('mock_driver_profile');
                    router.push('/driver/login');
                  }}
                  className="mt-6 w-full min-h-[48px] py-3.5 text-red-600 dark:text-red-400 font-bold bg-red-50/80 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-2xl transition active:scale-[0.98] touch-manipulation flex items-center justify-center border border-red-200/60 dark:border-red-900/40 text-sm sm:text-base"
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
                  <div className="bg-emerald-50/90 dark:bg-emerald-950/30 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/60">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <h3 className="font-bold text-emerald-950 dark:text-emerald-200 flex items-center gap-2 text-sm">
                        <CreditCard size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>Mandatory Requirement: Speedpoint &amp; Cash</span>
                      </h3>
                      <span className="text-[10px] font-black uppercase bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                        Required
                      </span>
                    </div>
                    <p className="text-xs text-emerald-900/90 dark:text-emerald-300 leading-relaxed">
                      All SOLO drivers are required to carry a working <b>Speedpoint machine</b> (e.g. Yoco, iKhokha, Vodapay, or bank POS) in their vehicle to accept card/tap payments from riders. <b>Cash payment</b> remains intact as a standard payment option. You keep 100% of both Speedpoint and Cash fares immediately.
                    </p>
                  </div>

                  <div className="bg-gray-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">1. Going Online</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Tap the Power button top right to go online and receive requests. You'll see a green radar when active.</p>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">2. Managing Trips</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">When a request pops up, tap <b>Accept</b>. Drive to the location and tap <b>Confirm Pickup</b>. You can chat with the rider if needed.</p>
                  </div>

                  <div className="bg-gray-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">3. Collecting Fare (Speedpoint or Cash)</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Tap <b>Confirm Dropoff</b>. Collect the fare directly from the rider using your required in-car <b>Speedpoint machine</b> (Card/Tap) or <b>Cash</b>.</p>
                  </div>

                  <div className="bg-gray-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-gray-100 dark:border-white/5">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">4. Your Subscription</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">You keep 100% of all fares. Just pay a flat R499/month fee via the <b>Profile</b> tab after your 7-day trial ends.</p>
                  </div>
                </div>
              </div>
            )}
            <div className="pt-3 mt-2 border-t border-gray-200/50 dark:border-white/5 text-center">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">
                Built and Powered by <span className="font-black text-emerald-600 dark:text-emerald-400">Boraine Tech (Pty) Ltd</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Bottom Navigation */}
      <div className="absolute bottom-2.5 sm:bottom-3.5 mb-safe inset-x-2.5 sm:inset-x-4 sm:max-w-xl sm:mx-auto md:inset-x-auto md:left-4 lg:left-6 md:w-[390px] lg:w-[430px] md:max-w-none md:mx-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-2xl border border-gray-200/80 dark:border-white/15 p-1.5 flex justify-between items-center gap-1 rounded-2xl sm:rounded-3xl shadow-2xl z-30 pointer-events-auto">
        <button 
          onClick={() => {
            setActiveTab('home')
            setIsHomeSheetMinimized(false)
          }}
          className={`flex flex-col items-center justify-center flex-1 py-2 px-1 min-h-[52px] rounded-xl sm:rounded-2xl transition-all touch-manipulation active:scale-95 ${activeTab === 'home' ? 'bg-black/5 dark:bg-white/10 text-black dark:text-white font-bold' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
        >
          <Car size={22} className="shrink-0" />
          <span className="text-[11px] sm:text-xs mt-0.5 uppercase tracking-wider font-bold">Home</span>
        </button>
        <button 
          onClick={() => setActiveTab('earnings')}
          className={`flex flex-col items-center justify-center flex-1 py-2 px-1 min-h-[52px] rounded-xl sm:rounded-2xl transition-all touch-manipulation active:scale-95 ${activeTab === 'earnings' ? 'bg-black/5 dark:bg-white/10 text-black dark:text-white font-bold' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          <span className="text-[11px] sm:text-xs mt-0.5 uppercase tracking-wider font-bold">Earnings</span>
        </button>
        <button 
          type="button"
          onClick={() => setShowSafetyModal(true)}
          aria-label="Open SOLO South Africa Rapid-Response Safety & Panic Shield"
          className={`relative flex flex-col items-center justify-center flex-1 py-2 px-1 min-h-[52px] rounded-xl sm:rounded-2xl transition-all touch-manipulation active:scale-95 border ${
            nearbySosAlert || showSafetyModal
              ? 'bg-red-600 text-white border-red-400 shadow-lg shadow-red-600/40 animate-pulse font-black'
              : 'bg-red-500/10 hover:bg-red-500/20 dark:bg-red-500/15 dark:hover:bg-red-500/25 text-red-600 dark:text-red-400 border-red-500/30 font-black'
          }`}
        >
          <div className="relative flex items-center justify-center">
            <ShieldAlert size={22} className="shrink-0" />
            <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-red-500 animate-ping" />
          </div>
          <span className="text-[11px] sm:text-xs mt-0.5 uppercase tracking-wider font-black">SOS</span>
        </button>
        <button 
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center justify-center flex-1 py-2 px-1 min-h-[52px] rounded-xl sm:rounded-2xl transition-all touch-manipulation active:scale-95 ${activeTab === 'profile' ? 'bg-black/5 dark:bg-white/10 text-black dark:text-white font-bold' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
        >
          <User size={22} className="shrink-0" />
          <span className="text-[11px] sm:text-xs mt-0.5 uppercase tracking-wider font-bold">Profile</span>
        </button>
        <button 
          onClick={() => setActiveTab('help')}
          className={`flex flex-col items-center justify-center flex-1 py-2 px-1 min-h-[52px] rounded-xl sm:rounded-2xl transition-all touch-manipulation active:scale-95 ${activeTab === 'help' ? 'bg-black/5 dark:bg-white/10 text-black dark:text-white font-bold' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
        >
          <BookOpen size={22} className="shrink-0" />
          <span className="text-[11px] sm:text-xs mt-0.5 uppercase tracking-wider font-bold">Help</span>
        </button>
      </div>

      {/* Real-time Request Modal overlay */}
      {isOnline && !activeTrip && <TripRequestModal request={request as any} onAccept={handleAccept} onDecline={handleDecline} />}

      {/* Fare Collection Modal */}
      {showFareCollection && activeTrip && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-950 rounded-3xl w-full max-w-md p-5 sm:p-6 shadow-2xl border-2 border-gray-200 dark:border-white/15 relative animate-in zoom-in-95 duration-300 max-h-[92vh] max-h-[92dvh] overflow-y-auto custom-scrollbar">
            <button 
              onClick={() => setShowFareCollection(false)}
              className="absolute top-4 right-4 p-2.5 text-gray-400 hover:text-black dark:hover:text-white transition-colors touch-manipulation"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <div className="text-center mb-5">
              <h2 className="text-2xl sm:text-3xl font-black mb-1">Collect Fare</h2>
              <p className="text-gray-600 dark:text-gray-300 text-sm sm:text-base">Accept payment directly from the rider via your required Speedpoint machine or Cash.</p>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-5 mb-5 border border-green-200 dark:border-green-900/50 flex flex-col items-center">
              <span className="text-green-800 dark:text-green-300 font-bold mb-1 uppercase tracking-wider text-xs sm:text-sm">Total Amount Due</span>
              <span className="font-black text-4xl sm:text-5xl text-green-600 dark:text-green-400">R{activeTrip.fare_amount}</span>
              <span className="text-xs sm:text-sm text-green-700 dark:text-green-400/90 font-semibold mt-2 text-center">100% of this fare belongs to you (0% platform commission)</span>
            </div>

            {(isAwaitingRiderPayment || activeTrip.status === 'payment_pending') && (
              <div className="p-4 mb-4 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-center space-y-2">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm font-bold text-blue-900 dark:text-blue-200">
                  Awaiting Rider Paystack Payment...
                </p>
                <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300">
                  The Paystack checkout prompt is active on the rider&apos;s screen. This trip will automatically complete once confirmed.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <button 
                type="button"
                onClick={handleRequestInAppPaystack}
                disabled={isAwaitingRiderPayment || activeTrip.status === 'payment_pending'}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 min-h-[54px] rounded-2xl transition-all shadow-lg shadow-blue-600/20 flex justify-center items-center gap-2.5 active:scale-95 text-base touch-manipulation"
              >
                <CreditCard size={20} />
                <span>
                  {activeTrip.payment_method === 'paystack'
                    ? 'Request Rider Paystack Payment (Preferred)'
                    : 'Request Rider Paystack Payment (In-App)'}
                </span>
              </button>
              <button 
                onClick={handleCashPayment}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 min-h-[54px] rounded-2xl transition-all shadow-lg shadow-emerald-600/20 flex justify-center items-center gap-2.5 active:scale-95 text-base touch-manipulation"
              >
                <CreditCard size={20} />
                <span>Paid via Speedpoint Machine (Card / Tap)</span>
              </button>
              <button 
                onClick={handleCashPayment}
                className="w-full bg-black dark:bg-white text-white dark:text-black font-bold py-4 min-h-[54px] rounded-2xl transition-all shadow-lg shadow-black/10 dark:shadow-white/10 flex justify-center items-center gap-2.5 active:scale-95 text-base touch-manipulation"
              >
                <span>💵 Paid via Cash</span>
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-white/10 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleForceCloseFareModal}
                className="w-full py-3 px-4 min-h-[46px] rounded-xl bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-200 font-bold text-sm hover:bg-gray-200 dark:hover:bg-zinc-700 transition active:scale-95 touch-manipulation"
              >
                Settle &amp; Close Trip
              </button>
              <button
                type="button"
                onClick={handleCancelActiveTrip}
                className="text-xs sm:text-sm text-red-500 hover:text-red-600 font-bold underline text-center w-full py-1.5 transition touch-manipulation"
              >
                Cancel / Void This Trip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Payment Modal */}
      {showSubModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-950 rounded-3xl w-full max-w-md p-5 sm:p-6 shadow-2xl border border-gray-200 dark:border-white/10 relative animate-in zoom-in-95 duration-300 max-h-[92vh] max-h-[92dvh] overflow-y-auto custom-scrollbar">
            {(isSubscriptionActive || isOwner) && (
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
                  {!isSubscriptionActive
                    ? (profile?.subscriptionPlan === 'cancelled'
                        ? 'Platform Access Suspended'
                        : isTrialExpired
                          ? 'Trial Expired'
                          : 'Subscription Inactive')
                    : profile?.subscriptionPlan === 'paid'
                      ? 'Manage Subscription'
                      : 'Upgrade to Premium'}
                </h2>
                <p className="text-gray-500 mb-6 text-sm">
                  {!isSubscriptionActive
                    ? (profile?.subscriptionPlan === 'cancelled'
                        ? 'Your subscription is cancelled. Pay R499.00 to reactivate and go online.'
                        : isTrialExpired
                          ? 'Your 7-day free trial has ended. Subscribe to R499/mo to continue driving.'
                          : 'Active subscription required to go online and receive trips.')
                    : 'Keep 100% of your earnings for a flat fee.'}
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
                  disabled={isProcessingSub || (isSubscriptionActive && profile?.subscriptionPlan === 'paid')}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-500/30 flex justify-center items-center gap-2 active:scale-95"
                >
                  {isProcessingSub ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Connecting to Paystack...</span>
                    </>
                  ) : profile?.subscriptionPlan === 'fleet_pro' ? (
                    'Covered by Fleet Partner'
                  ) : isSubscriptionActive && profile?.subscriptionPlan === 'paid' ? (
                    'Subscription Active'
                  ) : (
                    <>
                      <CreditCard size={18} />
                      <span>{!isSubscriptionActive ? 'Pay R499.00 & Reactivate Access' : 'Subscribe via Paystack (R499/mo)'}</span>
                    </>
                  )}
                </button>

                {/* Cancel Subscription Option for currently active subscribers */}
                {!isOwner && profile?.subscriptionPlan !== 'fleet_pro' && isSubscriptionActive && (
                  <button 
                    onClick={handleCancelSubscription}
                    disabled={isCancellingSub}
                    className="w-full mt-3 py-3 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 font-bold rounded-2xl border border-red-200/70 dark:border-red-900/50 text-xs sm:text-sm transition flex items-center justify-center gap-2 active:scale-95"
                  >
                    {isCancellingSub ? (
                      <>
                        <div className="w-4 h-4 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin"></div>
                        <span>Cancelling Subscription...</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={16} />
                        <span>Cancel Subscription (Suspend Platform Access)</span>
                      </>
                    )}
                  </button>
                )}
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

      {/* Rider PIN Verification Modal */}
      {showPinModal && activeTrip && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-950 rounded-3xl w-full max-w-sm p-6 shadow-2xl border-2 border-gray-200 dark:border-white/15 relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => {
                setShowPinModal(false);
                setPinError(null);
              }}
              className="absolute top-4 right-4 p-2.5 text-gray-400 hover:text-black dark:hover:text-white transition-colors"
              aria-label="Close"
            >
              <X size={22} />
            </button>

            <div className="text-center mb-5">
              <div className="w-16 h-16 mx-auto mb-3 bg-blue-100 dark:bg-blue-950/60 border border-blue-300 dark:border-blue-700 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-md">
                <KeyRound size={30} />
              </div>
              <h3 className="text-2xl font-black text-gray-900 dark:text-white">Verify Boarding PIN</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                Confirm the rider&apos;s 4-digit PIN before starting the trip.
              </p>
            </div>

            {/* Expected Trip PIN display for driver convenience */}
            <div className="p-4 mb-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 flex items-center justify-between">
              <div className="text-left">
                <span className="text-xs font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">Assigned PIN</span>
                <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 font-semibold">From trip booking</p>
              </div>
              <div className="bg-white dark:bg-zinc-900 px-3.5 py-2 rounded-xl border border-blue-200 dark:border-blue-800 shadow-inner">
                <span className="font-mono text-2xl font-black tracking-widest text-blue-600 dark:text-blue-400">
                  {activeTrip.verification_pin || '----'}
                </span>
              </div>
            </div>

            {/* Input field for rider verbal PIN */}
            <div className="mb-4">
              <label className="block text-sm font-bold text-gray-800 dark:text-gray-200 mb-1.5 text-left">
                Enter 4-Digit PIN from Rider
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={pinInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setPinInput(val);
                    setPinError(null);
                  }}
                  placeholder="e.g. 1234"
                  className="w-full text-center text-3xl font-mono tracking-widest font-black py-3.5 px-4 rounded-xl border-2 border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-gray-900 dark:text-white"
                  autoFocus
                />
              </div>
              {pinError && (
                <div className="mt-2 flex items-center gap-1.5 text-sm text-red-500 font-bold justify-center">
                  <AlertTriangle size={16} />
                  <span>{pinError}</span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => handleVerifyPinAndStart()}
                disabled={isVerifyingPin || pinInput.length < 4}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-4 min-h-[54px] rounded-xl transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 active:scale-95 text-base"
              >
                {isVerifyingPin ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Verifying PIN...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={20} />
                    <span>Confirm &amp; Start Trip</span>
                  </>
                )}
              </button>

              {activeTrip.verification_pin && pinInput !== activeTrip.verification_pin && (
                <button
                  type="button"
                  onClick={() => {
                    setPinInput(activeTrip.verification_pin || '');
                    setPinError(null);
                  }}
                  className="w-full text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline py-2 text-center"
                >
                  Quick Fill Assigned PIN ({activeTrip.verification_pin})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* South African Rapid-Response Safety & Panic Shield Modal */}
      <SafetyShieldModal
        isOpen={showSafetyModal}
        onClose={() => setShowSafetyModal(false)}
        role="driver"
        userId={profile?.id}
        userName={profile?.fullName || 'SOLO Driver'}
        userPhone={profile?.phone}
        lat={driverCoords?.lat || activeTrip?.pickup_lat}
        lng={driverCoords?.lng || activeTrip?.pickup_lng}
        tripId={activeTrip?.id}
        pickupLocation={activeTrip?.pickup_location}
        dropoffLocation={activeTrip?.dropoff_location}
        driverName={profile?.fullName}
        driverPhone={profile?.phone}
        vehicleMake={profile?.vehicleMake}
        vehicleModel={profile?.vehicleModel}
        licensePlate={profile?.licensePlate}
        verificationPin={activeTrip?.verification_pin}
      />
    </div>
  )
}
