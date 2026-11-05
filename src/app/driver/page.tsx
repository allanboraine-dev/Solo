"use client"

import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import TripRequestModal from '@/components/TripRequestModal'
import TripStopsManager from '@/components/TripStopsManager'
import PickupWaitingTimerBanner from '@/components/PickupWaitingTimerBanner'
import { Car, Navigation, Power, User, MapPin, BookOpen, ShieldCheck, ShieldAlert, CheckCircle2, Lock, CreditCard, Clock, Building2, Crown, X, Smartphone, AlertTriangle, ChevronDown, ChevronUp, KeyRound, MessageCircle, Compass, ExternalLink, Phone, AlertCircle, XCircle, Download, Banknote, Globe, Search, Filter } from 'lucide-react'
import { getTrips, getNearbyRequestedTrips, saveTrip, acceptTripAtomic, completeTripAtomic, declineTrip, undeclineTrip, getDeclinedTripIds, isTripDeclined, getDeclinedAvailableTrips, getCompletedTripIds, isTripCompleted, markTripCompleted, isTripDismissed, markTripDismissed, isPurgedTrip, isStaleRequestedTrip, isStaleCancelledTrip, isTripExpired, STATUS_PRIORITY, recordTripStatusOverride, subscribeToEvents, broadcastEvent, getDriverProfile, saveDriverProfile, updateDriverLocation, getDriverRatingSummary, startTripWithPin, calculatePickupWaitingFare, type MockTrip, type MockDriverProfile, type TripRating, type MockMessage } from '@/lib/mockBackend'
import { resolveCityFromLocation, resolveCityFromCoords, isTripInDriverCity, areCitiesMatching, SOUTH_AFRICAN_CITIES } from '@/utils/cityMatching'
import { isWithinRadiusKm, calculateDistanceKm, estimateEtaMinutes } from '@/utils/geo'
import { getDriverDeviceId, isDriverSessionPreempted, setDriverActiveSession, getSafeLocalStorageItem, removeSafeLocalStorageItem, generateUuid } from '@/utils/session'
import { createClient } from '@/utils/supabase/client'
import Chat from '@/components/Chat'
import { useRouter } from 'next/navigation'
import { DriverDocument, KycDocType } from '@/types/kyc'
import { fetchDriverKycDocuments, evaluateDriverKycCompliance } from '@/utils/kyc'
import KycDocumentUploader from '@/components/KycDocumentUploader'
import { NotificationPermissionBanner } from '@/components/NotificationPermissionBanner'
import { isPlatformOwner, FOUNDER_DRIVER_UUID, LEGACY_FOUNDER_DRIVER_UUID, resolveDriverUuid } from '@/utils/owner'
import { checkVehicleFleetCoverage } from '@/utils/fleetStore'
import { audioAlert } from '@/utils/audioAlert'
import { registerForPushNotifications, dispatchDriverArrivedPush } from '@/utils/pushClient'
import SafetyShieldModal from '@/components/SafetyShieldModal'
import { AdaptiveTelemetryGovernor, TELEMETRY_TIER_CONFIGS, type ComputedGpsSample } from '@/utils/telemetryEngine'
import type { SafetyIncidentRecord } from '@/utils/safetyDispatch'
import { updateSupportTicketStatus, type SupportTicket } from '@/utils/supportStore'
import { usePWA } from '@/lib/PWAContext'
import { RandIcon } from '@/components/icons/RandIcon'

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
  const { installApp, isStandalone } = usePWA()
  const [isOnline, setIsOnline] = useState(false)
  const [activeTab, setActiveTab] = useState<'home' | 'trips' | 'earnings' | 'profile' | 'help'>('home')
  const [isHomeSheetMinimized, setIsHomeSheetMinimized] = useState(false)
  
  const [request, setRequest] = useState<MockTrip | null>(null)
  const [activeTrip, setActiveTrip] = useState<MockTrip | null>(null)
  const [declinedAvailableTrips, setDeclinedAvailableTrips] = useState<MockTrip[]>([])
  const [allNationalTrips, setAllNationalTrips] = useState<MockTrip[]>([])
  const [nationalCityFilter, setNationalCityFilter] = useState<string>('all')
  const [nationalStatusFilter, setNationalStatusFilter] = useState<'all' | 'requested' | 'in_progress' | 'completed'>('all')
  const [nationalSearchQuery, setNationalSearchQuery] = useState<string>('')
  const [driverCity, setDriverCity] = useState<string>('Kimberley')
  const [acceptingTripId, setAcceptingTripId] = useState<string | null>(null)
  const [selectedDeclinedTripId, setSelectedDeclinedTripId] = useState<string | null>(null)
  const [previewNationalTripId, setPreviewNationalTripId] = useState<string | null>(null)
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
    driverCoordsRef.current = driverCoords;
    if (driverCoords) {
      const resolved = resolveCityFromLocation(driverCoords.lat, driverCoords.lng);
      if (resolved && resolved !== 'Other') {
        setDriverCity(resolved);
      }
    }
  }, [driverCoords]);

  // One-time passive GPS lookup on mount so driver map on mobile centers on current location before going online
  useEffect(() => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator && !driverCoords) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setDriverCoords({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {},
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
      );
    }
  }, []);

  const [profile, setProfile] = useState<MockDriverProfile | null>(null)
  const [completedTrips, setCompletedTrips] = useState<MockTrip[]>([])
  const [showSubModal, setShowSubModal] = useState(false)
  const [isProcessingSub, setIsProcessingSub] = useState(false)
  const [isCancellingSub, setIsCancellingSub] = useState(false)
  const [showFareCollection, setShowFareCollection] = useState(false)
  const [isAwaitingRiderPayment, setIsAwaitingRiderPayment] = useState(false)
  const [isTrialExpired, setIsTrialExpired] = useState(false)
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
    if (profile?.id) {
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
  const kycCompliance = evaluateDriverKycCompliance(driverDocs, isOwner);

  useEffect(() => {
    if (kycCompliance.isBlocked && isOnline && !activeTrip) {
      audioAlert.stopTripRingtoneLoop();
      setIsOnline(false);
    }
  }, [kycCompliance.isBlocked, isOnline, activeTrip]);

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
        const search = typeof window !== 'undefined' ? window.location.search : '';
        router.replace('/driver/login' + search)
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
        } else if (prof.subscriptionPlan === 'trial' && (prof.trialStartedAt || prof.trialEndsAt)) {
          const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
          const trialStart = typeof prof.trialStartedAt === 'number'
            ? prof.trialStartedAt
            : prof.trialStartedAt ? new Date(prof.trialStartedAt).getTime() : 0;
          const trialEnd = prof.trialEndsAt
            ? (typeof prof.trialEndsAt === 'number' ? prof.trialEndsAt : new Date(prof.trialEndsAt).getTime())
            : (trialStart ? trialStart + FOURTEEN_DAYS : 0);

          if (trialEnd && Date.now() > trialEnd) {
            setIsTrialExpired(true);
            setIsOnline(false);
            setShowSubModal(true);
          } else if (trialStart && Date.now() - trialStart > FOURTEEN_DAYS) {
            setIsTrialExpired(true);
            setIsOnline(false);
            setShowSubModal(true);
          } else {
            setIsTrialExpired(false);
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
      const rawDriverId = profile?.id || getSafeLocalStorageItem('driver_id');
      const driverId = rawDriverId ? resolveDriverUuid(rawDriverId) : null;
      if (driverId && isDriverSessionPreempted(driverId, deviceIdRef.current)) {
        setIsOnline(false);
        setRequest(null);
        setPreemptedNotice("Signed out of active duty: your driver account went online from another device. Drivers can only be active on 1 device at a time.");
        return;
      }

      const trips = await getTrips();
      // Filter out stale unclaimed requests and stale cancelled trips (> 1hr) from driver dashboard
      setAllNationalTrips(trips.filter(t => !isTripExpired(t) && !isPurgedTrip(t)));
      const declinedIds = getDeclinedTripIds(driverId);
      const completedIds = getCompletedTripIds();
      const currentActive = activeTripRef.current;
      const coords = driverCoordsRef.current;
      const detectedCity = coords ? resolveCityFromLocation(coords.lat, coords.lng) : null;
      const currentDriverCity =
        detectedCity && detectedCity !== 'Other'
          ? detectedCity
          : (profile?.city || 'Kimberley');
      setDriverCity(currentDriverCity);

      // Update declined but still available trips strictly in this driver's city pool
      const declinedAvailable = trips.filter(
        t =>
          t.status === 'requested' &&
          !t.driver_id &&
          declinedIds.has(t.id) &&
          !completedIds.has(t.id) &&
          !isTripDismissed(t.id) && !isPurgedTrip(t) &&
          !isPurgedTrip(t) && !isStaleRequestedTrip(t) &&
          isTripInDriverCity(t, coords?.lat, coords?.lng, currentDriverCity)
      );
      setDeclinedAvailableTrips(declinedAvailable);

      if (currentActive) {
        if (completedIds.has(currentActive.id) || (declinedIds.has(currentActive.id) && currentActive.driver_id !== driverId) || isTripDismissed(currentActive.id)) {
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
          // Also sync same-status updates when stops, fare, or pickup waiting fee changes
          const dbPrio = STATUS_PRIORITY[currentInDb.status] || 0;
          const activePrio = STATUS_PRIORITY[currentActive.status] || 0;
          const hasTripDataChanged =
            currentInDb.fare_amount !== currentActive.fare_amount ||
            currentInDb.waiting_fee_amount !== currentActive.waiting_fee_amount ||
            currentInDb.arrived_at !== currentActive.arrived_at ||
            JSON.stringify(currentInDb.stops || []) !== JSON.stringify(currentActive.stops || []);
          if (dbPrio > activePrio || (dbPrio === activePrio && hasTripDataChanged)) {
            updateActiveTripState(currentInDb);
          }
        }
        return;
      }

      // No active trip currently in state: check if there is an active trip in storage/DB strictly for THIS driver
      const active = trips.find(
        t =>
          (t.status === 'accepted' || t.status === 'arrived' || t.status === 'in_progress' || t.status === 'payment_pending') &&
          (driverId
            ? t.driver_id === driverId ||
              (driverId === FOUNDER_DRIVER_UUID && (t.driver_id === 'owner-allan-boraine' || t.driver_id === LEGACY_FOUNDER_DRIVER_UUID))
            : false) &&
          !completedIds.has(t.id) &&
          !isTripDismissed(t.id)
      );

      if (active) {
        if (!activeTripRef.current) {
          undeclineTrip(active.id, driverId);
          updateActiveTripState(active);
          setRequest(null);
        }
      } else {
        // Find requested trips strictly for THIS driver's city pool (e.g. Kimberley requests only for Kimberley drivers)
        let nearbyRequested: MockTrip[] = [];
        if (coords) {
          nearbyRequested = await getNearbyRequestedTrips(coords.lat, coords.lng, 25, driverId, trips);
          nearbyRequested = nearbyRequested.filter(t =>
            isTripInDriverCity(t, coords.lat, coords.lng, currentDriverCity)
          );
        }
        if (nearbyRequested.length === 0) {
          nearbyRequested = trips.filter(
            t =>
              t.status === 'requested' &&
              !t.driver_id &&
              !declinedIds.has(t.id) &&
              !completedIds.has(t.id) &&
              !isPurgedTrip(t) && !isStaleRequestedTrip(t) &&
              isTripInDriverCity(t, coords?.lat, coords?.lng, currentDriverCity)
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
        if (!trip || isPurgedTrip(trip) || isTripExpired(trip)) return;
        const driverId = profile?.id || getSafeLocalStorageItem('driver_id');
        const currentActive = activeTripRef.current;

        if (trip.status === 'completed') {
          markTripCompleted(trip.id);
        }

        // Live update for the SOLO National Trip Board
        setAllNationalTrips(prev => {
          const idx = prev.findIndex(t => t.id === trip.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = trip;
            return copy;
          }
          return [trip, ...prev];
        });

        // Realtime update for declined trips still available to accept (restricted to driver city pool)
        if (trip.status !== 'requested' || (trip.driver_id && trip.driver_id !== driverId) || isTripCompleted(trip.id) || isTripDismissed(trip.id)) {
          setDeclinedAvailableTrips(prev => prev.filter(t => t.id !== trip.id));
        } else if (
          trip.status === 'requested' &&
          !trip.driver_id &&
          isTripDeclined(trip.id, driverId) &&
          !isStaleRequestedTrip(trip) &&
          isTripInDriverCity(trip, driverCoordsRef.current?.lat, driverCoordsRef.current?.lng, driverCity)
        ) {
          setDeclinedAvailableTrips(prev => {
            const exists = prev.some(t => t.id === trip.id);
            if (exists) {
              return prev.map(t => (t.id === trip.id ? trip : t));
            }
            return [trip, ...prev];
          });
        }

        // Live alert & popup modal: pushed strictly to drivers within the matching city pool!
        if (
          trip.status === 'requested' &&
          !currentActive &&
          !isTripDeclined(trip.id, driverId) &&
          !isTripCompleted(trip.id) &&
          !isStaleRequestedTrip(trip) &&
          isTripInDriverCity(trip, driverCoordsRef.current?.lat, driverCoordsRef.current?.lng, driverCity)
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
          const hasTripDataChanged =
            trip.fare_amount !== currentActive.fare_amount ||
            trip.waiting_fee_amount !== currentActive.waiting_fee_amount ||
            trip.arrived_at !== currentActive.arrived_at ||
            JSON.stringify(trip.stops || []) !== JSON.stringify(currentActive.stops || []);
          if (incomingPrio > activePrio || (incomingPrio === activePrio && hasTripDataChanged)) {
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

  const handleAcceptTrip = async (tripToAccept: MockTrip) => {
    if (!tripToAccept) return;
    if (isStaleRequestedTrip(tripToAccept)) {
      alert("This trip request has expired (unclaimed after 1 hour). The rider must book again.");
      setDeclinedAvailableTrips(prev => prev.filter(t => t.id !== tripToAccept.id));
      return;
    }
    setAcceptingTripId(tripToAccept.id);
    try {
      const rawDriverId =
        profile?.id ||
        getSafeLocalStorageItem('driver_id') ||
        generateUuid();
      const driverId = resolveDriverUuid(rawDriverId);

      // Execute atomic database reservation to prevent race conditions
      const rpcResult = await acceptTripAtomic(tripToAccept.id, driverId);
      if (!rpcResult.success) {
        alert("Trip is no longer available: " + (rpcResult.error || "Claimed by another driver."));
        setDeclinedAvailableTrips(prev => prev.filter(t => t.id !== tripToAccept.id));
        return;
      }

      // Successfully accepted! Remove from driver's declined list so it transitions cleanly to active trip
      undeclineTrip(tripToAccept.id, driverId);

      const updated: MockTrip = {
        ...tripToAccept,
        status: 'accepted',
        driver_id: driverId,
        driver_name: profile?.fullName || tripToAccept.driver_name,
        vehicle_plate: profile?.licensePlate || tripToAccept.vehicle_plate,
      };
      recordTripStatusOverride(updated.id, 'accepted', driverId);
      updateActiveTripState(updated);
      setRequest(null);
      lastAlertedTripIdRef.current = null;
      setDeclinedAvailableTrips(prev => prev.filter(t => t.id !== tripToAccept.id));
      setPreviewNationalTripId(null);
      setActiveTab('home');
      setIsHomeSheetMinimized(false);

      await saveTrip(updated);
      try {
        audioAlert.playStatusChime();
      } catch {}

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
    } finally {
      setAcceptingTripId(null);
    }
  };

  const handleAccept = async () => {
    if (request) {
      await handleAcceptTrip(request);
    }
  };

  const handleDecline = async () => {
    if (!request) return;
    const tripToDecline = request;
    const rawDriverId =
      profile?.id ||
      getSafeLocalStorageItem('driver_id');
    const driverId = rawDriverId ? resolveDriverUuid(rawDriverId) : null;
    setRequest(null);
    lastAlertedTripIdRef.current = null;
    await declineTrip(tripToDecline, driverId);
    // Add to declinedAvailableTrips so driver can still accept it on a later stage if not taken by other drivers!
    setDeclinedAvailableTrips(prev => {
      if (prev.some(t => t.id === tripToDecline.id)) return prev;
      return [tripToDecline, ...prev];
    });
  };

  const handleDismissDeclinedTrip = (tripId: string) => {
    markTripDismissed(tripId);
    setDeclinedAvailableTrips(prev => prev.filter(t => t.id !== tripId));
  };

  const handleDriverArrived = async () => {
    const current = activeTripRef.current || activeTrip;
    if (!current) return;
    setIsNotifyingArrival(true);
    try {
      const arrivedAtIso = current.arrived_at || new Date().toISOString();
      const updated: MockTrip = {
        ...current,
        status: 'arrived',
        arrived_at: arrivedAtIso,
        base_agreed_fare: current.base_agreed_fare ?? current.fare_amount,
      };
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

  const lockInWaitingFeeOnStart = (trip: MockTrip): MockTrip => {
    if (!trip.arrived_at) return { ...trip, status: 'in_progress' };
    const fareExcludingWaiting =
      typeof trip.waiting_fee_amount === 'number' && trip.waiting_fee_amount > 0
        ? Math.max(22, trip.fare_amount - trip.waiting_fee_amount)
        : trip.fare_amount;
    const waitingState = calculatePickupWaitingFare(fareExcludingWaiting, trip.arrived_at, Date.now());
    return {
      ...trip,
      status: 'in_progress',
      waiting_fee_amount: waitingState.waitingFeeZar,
      waiting_seconds_charged: waitingState.overtimeSeconds,
      fare_amount: waitingState.adjustedTotalFareZar,
    };
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

      const updated: MockTrip = lockInWaitingFeeOnStart(current);
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
      const updated: MockTrip = lockInWaitingFeeOnStart(current);
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

  const selectedDeclinedTrip = declinedAvailableTrips.find(t => t.id === selectedDeclinedTripId);
  const previewNationalTrip = previewNationalTripId ? allNationalTrips.find(t => t.id === previewNationalTripId) : null;

  const filteredNationalTrips = allNationalTrips.filter((trip) => {
    // Exclude expired trips: unclaimed requests > 1hr and cancelled trips > 1hr
    if (isTripExpired(trip)) return false;

    // City filter
    if (nationalCityFilter !== 'all') {
      const tripCity = resolveCityFromLocation(trip.pickup_lat, trip.pickup_lng, trip.pickup_location);
      if (!areCitiesMatching(tripCity, nationalCityFilter)) {
        return false;
      }
    }

    // Status filter
    if (nationalStatusFilter === 'requested' && trip.status !== 'requested') return false;
    if (nationalStatusFilter === 'in_progress' && !['accepted', 'arrived', 'in_progress'].includes(trip.status)) return false;
    if (nationalStatusFilter === 'completed' && trip.status !== 'completed') return false;

    // Search query
    if (nationalSearchQuery.trim()) {
      const q = nationalSearchQuery.toLowerCase();
      const inPickup = trip.pickup_location?.toLowerCase().includes(q);
      const inDropoff = trip.dropoff_location?.toLowerCase().includes(q);
      const inRider = trip.rider_name?.toLowerCase().includes(q);
      const inCity = resolveCityFromLocation(trip.pickup_lat, trip.pickup_lng, trip.pickup_location).toLowerCase().includes(q);
      const inId = trip.id?.toLowerCase().includes(q);
      if (!inPickup && !inDropoff && !inRider && !inCity && !inId) {
        return false;
      }
    }

    return true;
  });

  // Define map pins and routing for pending request, active trip, or map preview
  const mapProps = activeTrip 
    ? {
        pickupLat: activeTrip.pickup_lat,
        pickupLng: activeTrip.pickup_lng,
        dropoffLat: activeTrip.dropoff_lat,
        dropoffLng: activeTrip.dropoff_lng,
        stops: activeTrip.stops,
        driverLat: driverCoords?.lat,
        driverLng: driverCoords?.lng,
        tripStatus: activeTrip.status,
        onRouteChange: (details: { distanceKm: number; durationMinutes: number }) => setLiveNavDetails(details),
      }
    : request
      ? { pickupLat: request.pickup_lat, pickupLng: request.pickup_lng, stops: request.stops, driverLat: driverCoords?.lat, driverLng: driverCoords?.lng }
      : selectedDeclinedTrip
      ? { pickupLat: selectedDeclinedTrip.pickup_lat, pickupLng: selectedDeclinedTrip.pickup_lng, stops: selectedDeclinedTrip.stops, driverLat: driverCoords?.lat, driverLng: driverCoords?.lng }
      : previewNationalTrip
      ? { pickupLat: previewNationalTrip.pickup_lat, pickupLng: previewNationalTrip.pickup_lng, dropoffLat: previewNationalTrip.dropoff_lat, dropoffLng: previewNationalTrip.dropoff_lng, stops: previewNationalTrip.stops, driverLat: driverCoords?.lat, driverLng: driverCoords?.lng }
      : { driverLat: driverCoords?.lat, driverLng: driverCoords?.lng }

  return (
    <div className="h-mobile-portal w-full relative overflow-hidden bg-gray-100 dark:bg-zinc-900">
      {/* Real Map Background */}
      <div className="absolute inset-0 z-0">
        <MapComponent {...mapProps} />
        {/* Overlay to dim map slightly when offline - pointer-events-none so touches pass through to map/buttons */}
        {!isOnline && <div className="absolute inset-0 bg-black/10 dark:bg-black/30 z-[1] transition-all duration-500 pointer-events-none"></div>}
        
        {/* Animated Radar overlay when online, only if no active trip */}
        {isOnline && !activeTrip && !request && (
          <div className="absolute inset-0 z-[1] pointer-events-none flex items-center justify-center">
            <div className="w-48 h-48 bg-green-500/20 rounded-full animate-ping"></div>
            <div className="absolute w-96 h-96 bg-green-500/10 rounded-full animate-ping" style={{ animationDelay: '0.5s' }}></div>
          </div>
        )}
      </div>

      {/* Floating Header - Compact Mobile-First Design */}
      <div className="absolute top-2 sm:top-2.5 md:top-3 pt-safe left-2 right-2 sm:left-4 sm:right-4 sm:max-w-xl sm:mx-auto md:left-4 lg:left-6 md:right-auto md:mx-0 md:w-[390px] lg:w-[430px] md:max-w-none z-30 pointer-events-auto">
        <div className="bg-white/95 dark:bg-zinc-950/95 backdrop-blur-2xl shadow-xl rounded-2xl md:rounded-3xl border border-gray-200/80 dark:border-white/15 p-2 sm:p-2.5 md:p-3 flex justify-between items-center gap-2 transition-all">
          <div className="relative shrink-0">
            <img
              src="/driver-icon-192.png"
              alt="SOLO Driver Portal Avatar"
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-cover shadow-sm border-2 transition-all ${
                isOnline ? 'border-emerald-500 shadow-emerald-500/20' : 'border-zinc-700/50'
              }`}
            />
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white dark:ring-zinc-950 ${
                isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400 dark:bg-zinc-600'
              }`}
            />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-nowrap min-w-0">
              <span className="text-sm sm:text-base font-black tracking-tight shrink-0">SOLO</span>
              <div className="flex items-center gap-0.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/40 px-1.5 py-0.2 rounded-full text-amber-600 dark:text-amber-400 font-bold text-[11px] shadow-xs shrink-0">
                <span>★</span>
                <span>{ratingSummary.count > 0 ? ratingSummary.average.toFixed(1) : '5.0'}</span>
              </div>
              <span className="text-xs text-gray-700 dark:text-gray-300 font-bold truncate">
                {profile?.fullName ? profile.fullName.split(' ')[0] : 'Driver'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 font-bold truncate">
              <span>📍 {driverCity} Pool</span>
              {isOwner ? (
                <span className="text-amber-600 dark:text-amber-400">• Owner</span>
              ) : profile?.subscriptionPlan === 'fleet_pro' ? (
                <span className="text-purple-600 dark:text-purple-400">• Fleet</span>
              ) : isTrialExpired ? (
                <span className="text-red-600 dark:text-red-400">• Locked</span>
              ) : profile?.subscriptionPlan === 'paid' ? (
                <span className="text-blue-600 dark:text-blue-400">• Pro</span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400">• Trial</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isStandalone && (
              <button
                type="button"
                onClick={() => installApp('driver')}
                className="hidden xs:flex items-center justify-center p-2 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/35 text-xs font-black transition active:scale-95"
                title="Install SOLO Driver App"
              >
                <Download size={14} />
              </button>
            )}
            <button 
              onClick={async () => {
                const nextOnline = !isOnline;
                if (nextOnline) {
                  if (kycCompliance.isBlocked) {
                    audioAlert.stopTripRingtoneLoop();
                    setIsOnline(false);
                    setActiveTab('profile');
                    const reasons = [
                      ...kycCompliance.expiredDocs.map(d => `${d.title} (Expired)`),
                      ...kycCompliance.rejectedDocs.map(d => `${d.title} (Rejected)`),
                    ].join(', ');
                    alert(`Compliance Hold — Cannot Go Online:\n\nYour ${reasons} must be updated and verified before you can receive passenger trips. Please upload your renewed document(s) in your Profile tab.`);
                    return;
                  }
                  if (!isSubscriptionActive) {
                    audioAlert.stopTripRingtoneLoop();
                    setIsOnline(false);
                    setShowSubModal(true);
                    alert(
                      isTrialExpired
                        ? 'Driver Profile Locked: Your 14-day free trial has expired. You must pay your monthly subscription of R499.00 to unlock your profile, go online, and continue earning.'
                        : 'Active subscription required: Your subscription is inactive or cancelled. You must pay R499.00 to go online and receive passenger trips.'
                    );
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
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-xl text-xs sm:text-sm font-black transition-all shadow-sm touch-manipulation ${
                isOnline 
                  ? 'bg-emerald-500 text-white hover:bg-emerald-600 dark:bg-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.35)]' 
                  : 'bg-zinc-900 text-white hover:bg-black dark:bg-zinc-800 dark:text-zinc-100'
              } ${activeTrip ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
            >
              <Power size={15} />
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

      {/* Floating Main Content Panel - Compact Height on Mobile */}
      <div 
        className={`absolute left-2.5 right-2.5 sm:left-4 sm:right-4 sm:max-w-xl sm:mx-auto md:left-4 lg:left-6 md:right-auto md:mx-0 md:w-[390px] lg:w-[430px] md:max-w-none flex flex-col z-20 pointer-events-none transition-all duration-300 ${
          activeTab === 'home'
            ? isHomeSheetMinimized
              ? 'bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-auto md:top-[68px] max-h-[46px]'
              : activeTrip
                ? 'bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-[86px] md:top-[68px] max-h-[72vh] max-h-[72dvh] md:max-h-none'
                : 'bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-[86px] md:top-[68px] max-h-[36vh] sm:max-h-[42vh] md:max-h-none'
            : 'top-[62px] sm:top-[68px] md:top-[68px] bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-[86px]'
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
              className="flex items-center justify-between px-3.5 py-2.5 bg-gray-50/90 dark:bg-zinc-900/90 border-b border-gray-200/70 dark:border-white/10 cursor-pointer touch-manipulation select-none shrink-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-1 bg-gray-300 dark:bg-zinc-600 rounded-full shrink-0" />
                <span className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">
                  {isHomeSheetMinimized 
                    ? (activeTrip ? `${activeTrip.status.replace('_', ' ').toUpperCase()} • PIN: ${activeTrip.verification_pin || '----'} • R${activeTrip.fare_amount}` : isOnline ? (declinedAvailableTrips.length > 0 ? `Online • ${declinedAvailableTrips.length} Available Ride${declinedAvailableTrips.length > 1 ? 's' : ''}` : `Online • ${driverCity} Pool (Tap to expand)`) : "Offline (Tap to expand)")
                    : (activeTrip ? "Active Trip Controls" : isOnline ? `Online • ${driverCity} Pool` : "Driver Status")}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isHomeSheetMinimized && activeTrip && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDriverTripSubTab('chat')
                      setIsHomeSheetMinimized(false)
                    }}
                    className="relative text-xs font-bold text-white bg-blue-600 px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-2xs"
                  >
                    <MessageCircle size={13} />
                    <span>Chat</span>
                    {driverUnreadChatCount > 0 && (
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute -top-0.5 -right-0.5" />
                    )}
                  </button>
                )}
                <button 
                  type="button" 
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-0.5 p-0.5 shrink-0 touch-manipulation"
                >
                  <span>{isHomeSheetMinimized ? 'Expand' : 'Map View'}</span>
                  {isHomeSheetMinimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            </div>
          )}

          <div className={`p-3 sm:p-4 md:p-5 lg:p-6 overflow-y-auto overscroll-contain momentum-scroll custom-scrollbar flex-1 min-h-0 flex flex-col ${
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
                        {Array.isArray(activeTrip.stops) && activeTrip.stops.length > 0 && (
                          <div className="pl-3 space-y-1">
                            {activeTrip.stops.map((stop, idx) => (
                              <div key={stop.id || idx} className="flex items-start gap-2">
                                <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white text-[10px] font-black shrink-0 mt-0.5">
                                  Stop {idx + 1}
                                </span>
                                <span className={`font-bold break-words ${stop.completed ? 'line-through text-gray-400' : 'text-amber-900 dark:text-amber-200'}`}>
                                  {stop.address}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
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
                        {(Boolean(activeTrip.stops_fare_adjustment) || Boolean(activeTrip.waiting_fee_amount)) && (
                          <div className="pt-2 border-t border-gray-200/60 dark:border-white/10 space-y-1 text-xs">
                            {Boolean(activeTrip.stops_fare_adjustment) && (
                              <div className="flex items-center justify-between text-amber-700 dark:text-amber-300 font-bold">
                                <span>Stops Fare Adjustment ({activeTrip.stops?.length || 0} stops):</span>
                                <span>{activeTrip.stops_fare_adjustment! >= 0 ? `+R${activeTrip.stops_fare_adjustment}` : `R${activeTrip.stops_fare_adjustment}`}</span>
                              </div>
                            )}
                            {Boolean(activeTrip.waiting_fee_amount) && (
                              <div className="flex items-center justify-between text-red-600 dark:text-red-400 font-bold">
                                <span>Pickup Waiting Fee (&gt;2 min grace):</span>
                                <span>+R{activeTrip.waiting_fee_amount}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 2-Minute Pickup Grace Period Countdown & Automatic Fare Adjustment (Driver Portal) */}
                      {activeTrip.status === 'arrived' && (
                        <PickupWaitingTimerBanner
                          trip={activeTrip}
                          role="driver"
                          onWaitingFareIncreased={(updated) => updateActiveTripState(updated)}
                        />
                      )}

                      {/* Add / Manage Stops with Automatic Fare Adjustment (Driver Portal) */}
                      {(activeTrip.status === 'accepted' ||
                        activeTrip.status === 'arrived' ||
                        activeTrip.status === 'in_progress') && (
                        <TripStopsManager
                          trip={activeTrip}
                          role="driver"
                          onTripUpdated={(updated) => updateActiveTripState(updated)}
                        />
                      )}

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
                  {kycCompliance.isBlocked && (
                    <div className="mb-5 p-5 rounded-3xl bg-red-500/10 border-2 border-red-500/40 text-left shadow-xl animate-in fade-in">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                          <ShieldAlert size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-black text-sm sm:text-base text-red-900 dark:text-red-200">
                            Compliance Hold: Document Renewal Required
                          </h4>
                          <p className="text-xs text-red-800 dark:text-red-300 mt-1 leading-relaxed">
                            Your driver access is paused until the following registration document(s) are updated:
                          </p>
                          <ul className="mt-2 space-y-1 text-xs font-bold text-red-900 dark:text-red-200">
                            {kycCompliance.expiredDocs.map(d => (
                              <li key={d.docType}>• {d.title} — Expired ({new Date(d.expiresAt).toLocaleDateString()})</li>
                            ))}
                            {kycCompliance.rejectedDocs.map(d => (
                              <li key={d.docType}>• {d.title} — Rejected {d.reason ? `(${d.reason})` : ''}</li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            onClick={() => setActiveTab('profile')}
                            className="mt-3 w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black transition active:scale-95"
                          >
                            Upload Renewed Documents Now →
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {!kycCompliance.isBlocked && kycCompliance.expiringSoonDocs.length > 0 && (
                    <div className="mb-5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-left flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-amber-900 dark:text-amber-200">
                          ⚠️ Document Expiring Soon: {kycCompliance.expiringSoonDocs.map(d => `${d.title} (${d.daysRemaining}d left)`).join(', ')}
                        </p>
                        <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                          Upload your renewed document before expiry to avoid automatic account pause.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('profile')}
                        className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-black"
                      >
                        Renew
                      </button>
                    </div>
                  )}
                  {isTrialExpired && (
                    <div className="mb-5 p-5 rounded-3xl bg-gradient-to-br from-amber-500/10 via-red-500/10 to-amber-500/10 border-2 border-amber-500/40 text-center shadow-xl animate-in fade-in">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center mx-auto mb-2.5">
                        <Lock size={22} />
                      </div>
                      <h3 className="text-base font-black text-gray-900 dark:text-white">
                        Driver Profile Locked — 14-Day Free Trial Ended
                      </h3>
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 max-w-sm mx-auto leading-relaxed">
                        Your 14-day free trial has expired. To unlock your account, go online, and continue earning 100% of your rider fares, please pay your monthly subscription of R499.00.
                      </p>
                      <button
                        onClick={() => setShowSubModal(true)}
                        className="mt-3.5 px-5 py-3 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold rounded-2xl text-xs sm:text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 mx-auto active:scale-95 transition"
                      >
                        <CreditCard size={16} />
                        <span>Pay R499.00 to Unlock &amp; Continue Earning</span>
                      </button>
                    </div>
                  )}

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
                  {/* Modern Compact Driver Status Hub - Sleek, Low-Profile Mobile Layout */}
                  <div className="mb-3 p-3 rounded-2xl bg-gray-50/90 dark:bg-zinc-900/90 border border-gray-200/70 dark:border-white/10 shadow-xs flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-white dark:bg-zinc-800 shadow-2xs border border-gray-100 dark:border-white/5">
                        {isOnline ? (
                          <>
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping absolute" />
                            <span className="w-2 h-2 rounded-full bg-emerald-500 relative" />
                          </>
                        ) : (
                          <Power size={14} className="text-gray-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs sm:text-sm font-black text-gray-900 dark:text-gray-100">
                            {isOnline ? "Online & Searching" : "Driver Offline"}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300">
                            {driverCity}
                          </span>
                        </div>
                        <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 truncate">
                          {isOnline 
                            ? (telemetryStatus ? `${telemetryStatus.speedKmh} km/h • 🔋${telemetryStatus.batteryLevel}% • Radar mesh active` : `Matching riders in ${driverCity} pool`) 
                            : "Tap 'Go Online' in the top bar to start receiving rides"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isOnline && (
                        <button
                          type="button"
                          onClick={() => {
                            audioAlert.unlockMobileAudio(false);
                            audioAlert.playAlertSequence();
                          }}
                          title="Test alert sound"
                          className="p-1.5 rounded-xl bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 text-xs font-bold transition active:scale-95 shadow-2xs"
                        >
                          🔊
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('trips');
                          setIsHomeSheetMinimized(false);
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-blue-100 hover:bg-blue-200 dark:bg-blue-950/70 dark:hover:bg-blue-900/60 text-blue-800 dark:text-blue-300 text-xs font-bold border border-blue-300/80 dark:border-blue-700/60 flex items-center gap-1 active:scale-95 transition"
                      >
                        <Globe size={11} />
                        <span>Board ({allNationalTrips.length})</span>
                      </button>
                    </div>
                  </div>
                  
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

                  {/* Declined Requests Still Open & Available to Accept */}
                  {declinedAvailableTrips.length > 0 && !activeTrip && (
                        <div className="mt-4 pt-1 text-left space-y-3">
                          <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                              <h3 className="text-sm sm:text-base font-black tracking-tight text-gray-900 dark:text-gray-100">
                                Declined Requests ({declinedAvailableTrips.length})
                              </h3>
                            </div>
                            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 px-2.5 py-0.5 rounded-full border border-amber-300/80 dark:border-amber-700/60">
                              Still Open to Accept
                            </span>
                          </div>

                          <div className="space-y-3">
                            {declinedAvailableTrips.map((declinedTrip) => {
                              const isAccepting = acceptingTripId === declinedTrip.id;
                              const isSelected = selectedDeclinedTripId === declinedTrip.id;
                              return (
                                <div
                                  key={declinedTrip.id}
                                  className={`p-4 rounded-2xl bg-amber-50/70 dark:bg-zinc-900/90 border-2 transition-all space-y-3 shadow-md ${
                                    isSelected
                                      ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                                      : 'border-amber-300/80 dark:border-amber-600/50'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1.5 min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-200/90 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">
                                          Declined Earlier
                                        </span>
                                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-300/60 dark:border-emerald-800/60">
                                          Unclaimed by other drivers
                                        </span>
                                      </div>
                                      <div>
                                        <div className="text-[11px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">Pickup</div>
                                        <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100 leading-snug break-words">
                                          {declinedTrip.pickup_location}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-[11px] text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">Dropoff</div>
                                        <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100 leading-snug break-words">
                                          {declinedTrip.dropoff_location}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="text-right shrink-0">
                                      <span className="font-black text-2xl sm:text-3xl text-emerald-600 dark:text-emerald-400 block leading-tight">
                                        R{declinedTrip.fare_amount}
                                      </span>
                                      <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
                                        Estimated Fare
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-amber-200/70 dark:border-white/10 text-xs font-semibold text-gray-600 dark:text-gray-300">
                                    <span className="inline-flex items-center gap-1">
                                      {declinedTrip.payment_method === 'paystack'
                                        ? '💳 Paystack Card'
                                        : declinedTrip.payment_method === 'speedpoint'
                                        ? '💳 Speedpoint'
                                        : '💵 Cash'}
                                    </span>
                                    <span>
                                      {declinedTrip.passenger_count === 2 ? '👥 2 Riders (Max)' : '👤 1 Rider (Solo)'}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSelectedDeclinedTripId(prev => (prev === declinedTrip.id ? null : declinedTrip.id))
                                      }
                                      className="px-3 py-2.5 rounded-xl bg-white dark:bg-zinc-800 text-gray-700 dark:text-gray-300 text-xs font-bold border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700 transition active:scale-95 touch-manipulation"
                                    >
                                      {isSelected ? 'Hide Pin' : 'Preview Pin'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDismissDeclinedTrip(declinedTrip.id)}
                                      disabled={isAccepting}
                                      className="px-3 py-2.5 rounded-xl bg-gray-200/80 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 text-xs font-bold hover:bg-gray-300 dark:hover:bg-zinc-700 transition active:scale-95 touch-manipulation disabled:opacity-50"
                                    >
                                      Dismiss
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleAcceptTrip(declinedTrip)}
                                      disabled={isAccepting}
                                      className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm shadow-md shadow-emerald-600/30 transition active:scale-95 touch-manipulation flex items-center justify-center gap-1.5 disabled:opacity-50"
                                    >
                                      {isAccepting ? (
                                        <>
                                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                          <span>Accepting...</span>
                                        </>
                                      ) : (
                                        <>
                                          <CheckCircle2 size={16} />
                                          <span>Accept Ride (R{declinedTrip.fare_amount})</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                  <div className="mt-4 text-left space-y-3">
                    {!isStandalone && (
                      <button
                        type="button"
                        onClick={() => installApp('driver')}
                        className="w-full px-3.5 py-2.5 min-h-[46px] rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white flex items-center justify-between gap-2.5 transition active:scale-[0.99] text-left shadow-md shadow-emerald-500/20"
                        title="Install SOLO Driver App to your Home Screen"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 rounded-xl bg-white/20 shrink-0">
                            <Download size={16} className="text-white" />
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs sm:text-sm font-black tracking-tight block leading-tight">
                              Install Driver App
                            </span>
                            <span className="text-[11px] text-emerald-100 font-medium block leading-tight">
                              Add SOLO Driver Portal to your Home Screen
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-black uppercase tracking-wider bg-white text-emerald-700 px-3 py-1.5 rounded-xl shrink-0 shadow-2xs">
                          Install
                        </span>
                      </button>
                    )}
                    <NotificationPermissionBanner role="driver" userId={profile?.id} />
                  </div>
                </div>
              )
            )}

            {activeTab === 'trips' && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500 text-left space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2.5 rounded-2xl bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 shrink-0">
                      <Globe size={22} />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-xl sm:text-2xl font-black tracking-tight text-gray-900 dark:text-gray-100 leading-snug">
                        National Trip Board
                      </h2>
                      <p className="text-[11px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400">
                        Live view of all trips booked on SOLO South Africa
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-700/60 shrink-0">
                    <MapPin size={12} />
                    <span>{driverCity} Pool</span>
                  </span>
                </div>

                {/* Key Metrics Strip */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-2.5 rounded-2xl bg-gray-50 dark:bg-zinc-900/60 border border-gray-100 dark:border-white/5">
                    <span className="block text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</span>
                    <span className="text-base sm:text-xl font-black text-gray-900 dark:text-gray-100">
                      {allNationalTrips.length}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/40">
                    <span className="block text-[10px] sm:text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Open</span>
                    <span className="text-base sm:text-xl font-black text-amber-700 dark:text-amber-300">
                      {allNationalTrips.filter(t => t.status === 'requested' && !isStaleRequestedTrip(t)).length}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/40">
                    <span className="block text-[10px] sm:text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Active</span>
                    <span className="text-base sm:text-xl font-black text-blue-700 dark:text-blue-300">
                      {allNationalTrips.filter(t => ['accepted', 'arrived', 'in_progress'].includes(t.status)).length}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/40">
                    <span className="block text-[10px] sm:text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Done</span>
                    <span className="text-base sm:text-xl font-black text-emerald-700 dark:text-emerald-300">
                      {allNationalTrips.filter(t => t.status === 'completed').length}
                    </span>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={nationalSearchQuery}
                    onChange={(e) => setNationalSearchQuery(e.target.value)}
                    placeholder="Search trips, addresses, rider name..."
                    className="w-full pl-10 pr-9 py-2.5 bg-gray-50 dark:bg-zinc-900 text-xs sm:text-sm font-medium rounded-2xl border border-gray-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900 dark:text-gray-100 placeholder-gray-400"
                  />
                  {nationalSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setNationalSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* City Filter Chips */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Filter size={12} />
                      <span>Filter by City Pool</span>
                    </span>
                    {nationalCityFilter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setNationalCityFilter('all')}
                        className="text-emerald-600 dark:text-emerald-400 font-bold lowercase text-[11px] hover:underline"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    <button
                      type="button"
                      onClick={() => setNationalCityFilter('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 ${
                        nationalCityFilter === 'all'
                          ? 'bg-black dark:bg-white text-white dark:text-black shadow-xs'
                          : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      All Cities ({allNationalTrips.length})
                    </button>
                    {SOUTH_AFRICAN_CITIES.map((c) => {
                      const countInCity = allNationalTrips.filter(t => {
                        const tripCity = resolveCityFromLocation(t.pickup_lat, t.pickup_lng, t.pickup_location);
                        return areCitiesMatching(tripCity, c.name);
                      }).length;
                      if (countInCity === 0 && !areCitiesMatching(c.name, driverCity)) return null;
                      const isFilterActive = areCitiesMatching(c.name, nationalCityFilter);
                      const displayLabel = c.name === 'Johannesburg' ? 'Gauteng (Joburg)' : c.name;
                      return (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => setNationalCityFilter(isFilterActive ? 'all' : c.name.toLowerCase())}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 flex items-center gap-1.5 ${
                            isFilterActive
                              ? 'bg-black dark:bg-white text-white dark:text-black shadow-xs'
                              : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
                          }`}
                        >
                          <span>{displayLabel}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                            isFilterActive
                              ? 'bg-white/20 dark:bg-black/20 text-white dark:text-black'
                              : 'bg-black/5 dark:bg-white/10 text-gray-500 dark:text-gray-400'
                          }`}>
                            {countInCity}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Status Filter Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {[
                    { id: 'all', label: 'All Statuses' },
                    { id: 'requested', label: 'Open Requests' },
                    { id: 'in_progress', label: 'In Transit' },
                    { id: 'completed', label: 'Completed' },
                  ].map((filterTab) => (
                    <button
                      key={filterTab.id}
                      type="button"
                      onClick={() => setNationalStatusFilter(filterTab.id as any)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95 ${
                        nationalStatusFilter === filterTab.id
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-gray-100 dark:bg-zinc-800/80 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
                      }`}
                    >
                      {filterTab.label}
                    </button>
                  ))}
                </div>

                {/* Trips List */}
                <div className="space-y-3 pt-1">
                  {filteredNationalTrips.length === 0 ? (
                    <div className="p-8 text-center bg-gray-50 dark:bg-zinc-900/40 rounded-2xl border border-gray-100 dark:border-white/5 space-y-2">
                      <Globe size={32} className="mx-auto text-gray-400 opacity-60" />
                      <p className="font-bold text-sm text-gray-700 dark:text-gray-300">
                        No trips match the current filter
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Try resetting your city filter or search query.
                      </p>
                      {(nationalCityFilter !== 'all' || nationalStatusFilter !== 'all' || nationalSearchQuery) && (
                        <button
                          type="button"
                          onClick={() => {
                            setNationalCityFilter('all');
                            setNationalStatusFilter('all');
                            setNationalSearchQuery('');
                          }}
                          className="mt-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 underline"
                        >
                          Clear all filters
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredNationalTrips.map((trip) => {
                      const tripCity = resolveCityFromLocation(trip.pickup_lat, trip.pickup_lng, trip.pickup_location);
                      const isMyCity = areCitiesMatching(tripCity, driverCity);
                      const isAccepting = acceptingTripId === trip.id;
                      const isPreviewing = previewNationalTripId === trip.id;

                      return (
                        <div
                          key={trip.id}
                          className={`p-4 rounded-2xl bg-white dark:bg-zinc-900 border transition-all space-y-3 shadow-sm ${
                            isPreviewing
                              ? 'border-blue-500 ring-2 ring-blue-500/30'
                              : isMyCity && trip.status === 'requested'
                              ? 'border-emerald-300 dark:border-emerald-700/60'
                              : 'border-gray-200 dark:border-white/10'
                          }`}
                        >
                          {/* Card Top Row: City Badge, Status Badge */}
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[11px] font-black px-2.5 py-0.5 rounded-lg bg-blue-100 dark:bg-blue-950/70 text-blue-900 dark:text-blue-200 flex items-center gap-1">
                                <MapPin size={11} />
                                <span>{tripCity === 'Johannesburg' ? 'Gauteng (Joburg)' : tripCity}</span>
                              </span>
                              {isMyCity && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-800/60">
                                  Your Pool
                                </span>
                              )}
                            </div>
                            <div>
                              {trip.status === 'requested' ? (
                                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300/70 dark:border-amber-700/60">
                                  🟡 Open Request
                                </span>
                              ) : trip.status === 'accepted' || trip.status === 'arrived' ? (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border border-blue-300/70 dark:border-blue-700/60">
                                  🔵 Assigned
                                </span>
                              ) : trip.status === 'in_progress' ? (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-teal-100 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 border border-teal-300/70 dark:border-teal-700/60">
                                  🟢 In Transit
                                </span>
                              ) : trip.status === 'completed' ? (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300">
                                  ✅ Completed
                                </span>
                              ) : trip.status === 'cancelled' ? (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-300/70 dark:border-rose-700/60">
                                  ❌ Cancelled
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400">
                                  {trip.status}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Pickup & Dropoff */}
                          <div className="space-y-1.5">
                            <div>
                              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Pickup</div>
                              <div className="font-bold text-xs sm:text-sm text-gray-900 dark:text-gray-100 leading-snug break-words">
                                {trip.pickup_location}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Dropoff</div>
                              <div className="font-bold text-xs sm:text-sm text-gray-900 dark:text-gray-100 leading-snug break-words">
                                {trip.dropoff_location}
                              </div>
                            </div>
                          </div>

                          {/* Trip Meta: Fare, Payment, Passengers */}
                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-white/5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                            <span className="font-black text-lg sm:text-xl text-emerald-600 dark:text-emerald-400">
                              R{trip.fare_amount}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px]">
                              {trip.payment_method === 'paystack'
                                ? '💳 Card'
                                : trip.payment_method === 'speedpoint'
                                ? '💳 Speedpoint'
                                : '💵 Cash'}
                            </span>
                            <span className="text-[11px] text-gray-500 dark:text-gray-400">
                              {trip.passenger_count === 2 ? '👥 2 Riders' : '👤 1 Rider'}
                            </span>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (isPreviewing) {
                                  setPreviewNationalTripId(null);
                                } else {
                                  setPreviewNationalTripId(trip.id);
                                  setIsHomeSheetMinimized(true);
                                  setActiveTab('home');
                                }
                              }}
                              className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 text-xs font-bold hover:bg-gray-200 dark:hover:bg-zinc-700 transition active:scale-95 touch-manipulation flex items-center gap-1"
                            >
                              <Compass size={13} />
                              <span>{isPreviewing ? 'Hide Map' : 'View on Map'}</span>
                            </button>

                            {trip.status === 'requested' && !activeTrip && (
                              <button
                                type="button"
                                onClick={() => handleAcceptTrip(trip)}
                                disabled={isAccepting}
                                className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm shadow-md shadow-emerald-600/25 transition active:scale-95 touch-manipulation flex items-center justify-center gap-1.5 disabled:opacity-50"
                              >
                                {isAccepting ? (
                                  <>
                                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span>Accepting...</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 size={15} />
                                    <span>Accept Ride (R{trip.fare_amount})</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {activeTab === 'earnings' && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="flex items-center gap-2.5 mb-6">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                    <RandIcon size={20} />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight">Your Earnings</h2>
                </div>
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
                          <Lock size={14} /> Locked (14-Day Trial Expired)
                        </span>
                      ) : profile?.subscriptionPlan === 'paid' ? (
                        <span className="text-blue-600 dark:text-blue-400">Active (Paid R499/mo)</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Active (14-Day Trial — {Math.max(0, Math.ceil(((profile?.trialEndsAt ? new Date(profile.trialEndsAt).getTime() : (profile?.trialStartedAt ? (typeof profile.trialStartedAt === 'number' ? profile.trialStartedAt : new Date(profile.trialStartedAt).getTime()) + 14 * 86400000 : Date.now())) - Date.now()) / 86400000))}d left)
                        </span>
                      )}
                    </span>
                  </div>
                  {kycCompliance.isBlocked && (
                    <div className="mb-5 p-5 rounded-3xl bg-red-500/10 border-2 border-red-500/40 text-left shadow-xl animate-in fade-in">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                          <ShieldAlert size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-black text-sm sm:text-base text-red-900 dark:text-red-200">
                            Compliance Hold: Document Renewal Required
                          </h4>
                          <p className="text-xs text-red-800 dark:text-red-300 mt-1 leading-relaxed">
                            Your driver access is paused until the following registration document(s) are updated:
                          </p>
                          <ul className="mt-2 space-y-1 text-xs font-bold text-red-900 dark:text-red-200">
                            {kycCompliance.expiredDocs.map(d => (
                              <li key={d.docType}>• {d.title} — Expired ({new Date(d.expiresAt).toLocaleDateString()})</li>
                            ))}
                            {kycCompliance.rejectedDocs.map(d => (
                              <li key={d.docType}>• {d.title} — Rejected {d.reason ? `(${d.reason})` : ''}</li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            onClick={() => setActiveTab('profile')}
                            className="mt-3 w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black transition active:scale-95"
                          >
                            Upload Renewed Documents Now →
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {!kycCompliance.isBlocked && kycCompliance.expiringSoonDocs.length > 0 && (
                    <div className="mb-5 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-left flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-amber-900 dark:text-amber-200">
                          ⚠️ Document Expiring Soon: {kycCompliance.expiringSoonDocs.map(d => `${d.title} (${d.daysRemaining}d left)`).join(', ')}
                        </p>
                        <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                          Upload your renewed document before expiry to avoid automatic account pause.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('profile')}
                        className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-black"
                      >
                        Renew
                      </button>
                    </div>
                  )}
                  {isTrialExpired && (
                    <div className="my-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                      <Lock size={15} className="text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Profile Locked</span>
                        <span>Your 14-day free trial has expired. Subscribe to R499/mo below to unlock your profile and continue earning.</span>
                      </div>
                    </div>
                  )}
                  {!isOwner && profile?.subscriptionPlan === 'trial' && profile?.cardLast4 && profile?.subscriptionActive && (
                    <div className="py-1.5 px-3 bg-emerald-50/80 dark:bg-emerald-950/40 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40 flex items-center justify-between text-[11px] text-emerald-800 dark:text-emerald-300">
                      <span className="flex items-center gap-1.5 font-medium">
                        <CreditCard size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        Card Linked: {profile.cardBrand || 'Card'} •••• {profile.cardLast4}
                      </span>
                      <span className="font-bold">Auto-bills R499 on Day 15</span>
                    </div>
                  )}
                </div>

                {/* Direct Fares: Cash & Speedpoint (0% Commission) */}
                <div className="mt-5 text-left bg-gray-50 dark:bg-zinc-900/50 p-5 rounded-2xl border border-gray-100 dark:border-white/5">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <Banknote size={18} className="text-emerald-500" />
                      <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">Direct Rider Fares</h3>
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 px-2.5 py-0.5 rounded-full">
                      0% Commission
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">
                    You receive 100% of all trip earnings directly from riders via <strong>Cash</strong> or your in-car <strong>Speedpoint machine</strong> (Yoco, iKhokha, Vodapay, or bank POS). No bank settlement delays or payout deductions.
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-center text-xs font-bold">
                    <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 text-gray-800 dark:text-gray-200 flex items-center justify-center gap-1.5 shadow-2xs">
                      <Banknote size={14} className="text-emerald-600" /> Cash Accepted
                    </div>
                    <div className="p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800 text-gray-800 dark:text-gray-200 flex items-center justify-center gap-1.5 shadow-2xs">
                      <CreditCard size={14} className="text-blue-600" /> Speedpoint / Tap
                    </div>
                  </div>
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
                          ? (isTrialExpired ? 'Pay R499.00 & Unlock Profile' : 'Pay R499.00 & Reactivate Access')
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
                        const expiredProfile = { ...profile, trialStartedAt: Date.now() - (15 * 24 * 60 * 60 * 1000) };
                        saveDriverProfile(expiredProfile);
                        setProfile(expiredProfile);
                        setIsTrialExpired(true);
                        setShowSubModal(true);
                      }
                    }}
                    className="mt-2 w-full py-2 text-xs font-mono text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800"
                  >
                    DEV: Simulate Expired 14-Day Trial
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
                    <p className="text-sm text-gray-600 dark:text-gray-400">You keep 100% of all fares. Just pay a flat R499/month fee via the <b>Profile</b> tab after your 14-day trial ends.</p>
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
          onClick={() => {
            setActiveTab('trips')
            setIsHomeSheetMinimized(false)
          }}
          className={`flex flex-col items-center justify-center flex-1 py-2 px-1 min-h-[52px] rounded-xl sm:rounded-2xl transition-all touch-manipulation active:scale-95 ${activeTab === 'trips' ? 'bg-black/5 dark:bg-white/10 text-black dark:text-white font-bold' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
        >
          <Globe size={22} className="shrink-0" />
          <span className="text-[11px] sm:text-xs mt-0.5 uppercase tracking-wider font-bold">Trips</span>
        </button>
        <button 
          onClick={() => setActiveTab('earnings')}
          className={`flex flex-col items-center justify-center flex-1 py-2 px-1 min-h-[52px] rounded-xl sm:rounded-2xl transition-all touch-manipulation active:scale-95 ${activeTab === 'earnings' ? 'bg-black/5 dark:bg-white/10 text-black dark:text-white font-bold' : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}`}
        >
          <RandIcon size={22} className="shrink-0" />
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
              {(Boolean(activeTrip.stops_fare_adjustment) || Boolean(activeTrip.waiting_fee_amount)) && (
                <div className="w-full mt-3 pt-2.5 border-t border-green-200/70 dark:border-green-800/60 space-y-1 text-xs">
                  {Boolean(activeTrip.base_agreed_fare) && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-300">
                      <span>Initial Agreed Fare</span>
                      <span className="font-bold">R{activeTrip.base_agreed_fare}</span>
                    </div>
                  )}
                  {Boolean(activeTrip.stops_fare_adjustment) && (
                    <div className="flex justify-between text-amber-700 dark:text-amber-300">
                      <span>Stops Fare Adjustment ({activeTrip.stops?.length || 0} stops)</span>
                      <span className="font-bold">{activeTrip.stops_fare_adjustment! >= 0 ? `+R${activeTrip.stops_fare_adjustment}` : `R${activeTrip.stops_fare_adjustment}`}</span>
                    </div>
                  )}
                  {Boolean(activeTrip.waiting_fee_amount) && (
                    <div className="flex justify-between text-red-600 dark:text-red-400">
                      <span>Pickup Waiting Fee (&gt;2 min grace)</span>
                      <span className="font-bold">+R{activeTrip.waiting_fee_amount}</span>
                    </div>
                  )}
                </div>
              )}
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
                          ? 'Driver Profile Locked'
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
                          ? 'Your 14-day free trial has ended. Subscribe to R499/mo to unlock your profile and continue earning.'
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
                      <span>
                        {!isSubscriptionActive 
                          ? (isTrialExpired ? 'Pay R499.00 & Unlock Profile' : 'Pay R499.00 & Reactivate Access')
                          : 'Subscribe via Paystack (R499/mo)'}
                      </span>
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

      {/* Rider PIN Verification Modal */}
      {showPinModal && activeTrip && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-950 rounded-3xl w-full max-w-sm p-6 shadow-2xl border-2 border-gray-200 dark:border-white/15 relative animate-in zoom-in-95 duration-200 max-h-[90vh] max-h-[90dvh] overflow-y-auto custom-scrollbar">
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
