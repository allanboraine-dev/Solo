"use client"

import dynamic from 'next/dynamic'
import { useState, useEffect, useRef } from 'react'
import BookingForm from '@/components/BookingForm'
import OnlineDriversModal from '@/components/OnlineDriversModal'
import { subscribeToEvents, subscribeToRegionalDriverMesh, getTrips, saveTrip, completeTripAtomic, getCompletedTripIds, isTripCompleted, markTripCompleted, isTripDismissed, markTripDismissed, isStaleRequestedTrip, STATUS_PRIORITY, getActiveDrivers, getDriverProfileById, saveTripRating, getRiderSessionId, getRiderActiveTripId, setRiderActiveTripId, type MockTrip, type LiveDriver, type MockMessage } from '@/lib/mockBackend'
import Chat from '@/components/Chat'
import RatingModal from '@/components/RatingModal'
import RiderAuthModal from '@/components/RiderAuthModal'
import SafetyShieldModal, { SafetyFloatingButton } from '@/components/SafetyShieldModal'
import RiderSupportModal from '@/components/RiderSupportModal'
import { createClient } from '@/utils/supabase/client'
import { buildWhatsAppTripShareUrl, phoneToDeterministicUuid } from '@/utils/phone'
import { calculateDistanceKm, estimateEtaMinutes } from '@/utils/geo'
import { reverseGeocode } from '@/utils/mapService'
import { User, LogOut, Phone, ShieldCheck, Lock, CreditCard, AlertCircle, MessageCircle, ChevronDown, ChevronUp, Car, MapPin, Navigation, X, HelpCircle } from 'lucide-react'
import { NotificationPermissionBanner } from '@/components/NotificationPermissionBanner'
import { ThemeToggle } from '@/components/ThemeToggle'
import { audioAlert } from '@/utils/audioAlert'

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
  const activeTripRef = useRef<MockTrip | null>(null)

  const updateActiveTripState = (next: MockTrip | null) => {
    activeTripRef.current = next
    setActiveTrip(next)
    if (next?.id) {
      setRiderActiveTripId(next.id)
    } else {
      setRiderActiveTripId(null)
    }
  }

  useEffect(() => {
    activeTripRef.current = activeTrip
    if (!activeTrip) {
      setTripSubTab('details')
    }
  }, [activeTrip])

  const [driverCoords, setDriverCoords] = useState<{lat: number, lng: number} | null>(null)
  const [availableDrivers, setAvailableDrivers] = useState<LiveDriver[]>([])
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [isSheetMinimized, setIsSheetMinimized] = useState(false)
  const [tripSubTab, setTripSubTab] = useState<'details' | 'chat'>('details')
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [incomingMessageToast, setIncomingMessageToast] = useState<{ sender: string; text: string } | null>(null)
  const tripSubTabRef = useRef(tripSubTab)

  useEffect(() => {
    tripSubTabRef.current = tripSubTab
    if (tripSubTab === 'chat') {
      setUnreadChatCount(0)
      setIncomingMessageToast(null)
    }
  }, [tripSubTab])

  useEffect(() => {
    if (incomingMessageToast) {
      const timer = setTimeout(() => {
        setIncomingMessageToast(null)
      }, 6000)
      return () => clearTimeout(timer)
    }
  }, [incomingMessageToast])
  
  // Authentication State
  const [currentUser, setCurrentUser] = useState<{ id: string; fullName?: string; phone?: string } | null>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)

  // Rating Modal state
  const [ratingTrip, setRatingTrip] = useState<MockTrip | null>(null)
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [declineNotice, setDeclineNotice] = useState<string | null>(null)

  // Centralized, bulletproof transition when a trip is completed on rider phone
  const transitionToTripCompleted = (trip: MockTrip) => {
    if (!trip) return;
    markTripCompleted(trip.id);
    audioAlert.alertRiderOfTripStatus('completed', trip);
    setRatingTrip(trip);
    setShowRatingModal(true);
    updateActiveTripState(null);
    setDriverCoords(null);
    setIsProcessingPayment(false);
    setPaymentError(null);
  };
  const [showDriversModal, setShowDriversModal] = useState(false)
  const [showSafetyModal, setShowSafetyModal] = useState(false)
  const [showSupportModal, setShowSupportModal] = useState(false)
  const [pastRiderTrips, setPastRiderTrips] = useState<MockTrip[]>([])
  const [focusedDriverCoords, setFocusedDriverCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [pickingOnMapType, setPickingOnMapType] = useState<'pickup' | 'dropoff' | null>(null)
  const [mapPickedLocation, setMapPickedLocation] = useState<{
    type: 'pickup' | 'dropoff';
    lat: number;
    lng: number;
    address: string;
  } | null>(null)

  const handleMapClickLocation = async (lat: number, lng: number) => {
    if (!pickingOnMapType) return;
    const targetType = pickingOnMapType;
    setPickingOnMapType(null);
    setIsSheetMinimized(false);

    let address = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    try {
      const resolved = await reverseGeocode(lat, lng);
      if (resolved) {
        address = resolved.split(',').map((s: string) => s.trim()).filter(Boolean).slice(0, 3).join(', ') || resolved;
      }
    } catch (e) {
      console.warn('Map reverse geocode notice:', e);
    }

    setMapPickedLocation({
      type: targetType,
      lat,
      lng,
      address,
    });
  };

  const handleOpenSupport = async () => {
    try {
      const allTrips = await getTrips()
      const myRiderId = getRiderSessionId(currentUser?.id)
      const myTrips = allTrips.filter(t => t.rider_id === myRiderId || t.status === 'completed')
      setPastRiderTrips(myTrips)
    } catch {}
    setShowSupportModal(true)
  }

  const handleLocateDriverOnMap = (driver: LiveDriver) => {
    setFocusedDriverCoords({ lat: driver.lat, lng: driver.lng })
    setIsSheetMinimized(true)
  }

  // Assigned Driver & Vehicle Information (Vehicle Make, Model, License Plate)
  const [assignedDriverInfo, setAssignedDriverInfo] = useState<{
    fullName: string;
    vehicleMake?: string;
    vehicleModel?: string;
    licensePlate?: string;
    phone?: string;
    rating?: number;
  } | null>(null)

  useEffect(() => {
    if (!activeTrip?.driver_id || activeTrip.status === 'requested') {
      setAssignedDriverInfo(null);
      return;
    }

    // 1. Try finding in live availableDrivers list
    const matched = availableDrivers.find(d => d.id === activeTrip.driver_id);
    if (matched && (matched.vehicleMake || matched.licensePlate)) {
      setAssignedDriverInfo({
        fullName: matched.fullName,
        vehicleMake: matched.vehicleMake,
        vehicleModel: matched.vehicleModel,
        licensePlate: matched.licensePlate,
        phone: (matched as any).phone,
        rating: 5.0,
      });
      return;
    }

    // 2. Query driver profile from database or local cache
    getDriverProfileById(activeTrip.driver_id).then(prof => {
      if (prof) {
        setAssignedDriverInfo({
          fullName: prof.fullName,
          vehicleMake: prof.vehicleMake,
          vehicleModel: prof.vehicleModel,
          licensePlate: prof.licensePlate,
          phone: prof.phone,
          rating: 5.0,
        });
      }
    });
  }, [activeTrip?.driver_id, activeTrip?.status, availableDrivers]);

  const [liveTrackingInfo, setLiveTrackingInfo] = useState<{
    distanceKm: number;
    durationMinutes: number;
    targetType: 'pickup' | 'dropoff';
    heading?: number;
    speedKmh?: number;
  } | null>(null);

  // Active Trip Real-time GPS Tracking & ETA Polling
  useEffect(() => {
    if (!activeTrip?.id) {
      setLiveTrackingInfo(null);
      return;
    }

    const isTrackingActive =
      activeTrip.status === 'accepted' ||
      activeTrip.status === 'arrived' ||
      activeTrip.status === 'in_progress' ||
      activeTrip.status === 'payment_pending';

    if (!isTrackingActive) {
      return;
    }

    let isMounted = true;

    const pollLiveTracking = async () => {
      try {
        const res = await fetch(`/api/trips/tracking?tripId=${encodeURIComponent(activeTrip.id)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted || !data.success) return;

        // Immediate completion detection from authoritative server tracking
        if (data.trip?.status === 'completed') {
          transitionToTripCompleted({
            ...(activeTripRef.current || {}),
            ...data.trip,
            status: 'completed',
          });
          return;
        }

        if (data.trip?.status === 'cancelled') {
          audioAlert.alertRiderOfTripStatus('cancelled', data.trip);
          updateActiveTripState(null);
          setDriverCoords(null);
          setDeclineNotice('Your ride request was cancelled. You can request another ride below.');
          return;
        }

        if (data.liveCoordinates?.lat && data.liveCoordinates?.lng) {
          setDriverCoords({
            lat: data.liveCoordinates.lat,
            lng: data.liveCoordinates.lng,
          });
        }

        if (data.eta) {
          setLiveTrackingInfo({
            distanceKm: data.eta.distanceKm,
            durationMinutes: data.eta.durationMinutes,
            targetType: data.eta.targetType,
            heading: data.liveCoordinates?.heading,
            speedKmh: data.liveCoordinates?.speedKmh,
          });
        }

        if (data.driverProfile && !assignedDriverInfo) {
          setAssignedDriverInfo({
            fullName: data.driverProfile.fullName,
            vehicleMake: data.driverProfile.vehicleMake,
            vehicleModel: data.driverProfile.vehicleModel,
            licensePlate: data.driverProfile.licensePlate,
            phone: data.driverProfile.phone,
            rating: 5.0,
          });
        }

        // Sync monotonic trip status progression if driver advanced the trip
        if (data.trip?.status && data.trip.status !== activeTripRef.current?.status) {
          const incomingPrio = (STATUS_PRIORITY as Record<string, number>)[data.trip.status] || 0;
          const currentPrio = (STATUS_PRIORITY as Record<string, number>)[activeTripRef.current?.status || ''] || 0;
          if (incomingPrio > currentPrio) {
            updateActiveTripState(data.trip);
          }
        }
      } catch (err) {
        // Non-blocking tracking fetch error
      }
    };

    pollLiveTracking();
    const interval = setInterval(pollLiveTracking, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeTrip?.id, activeTrip?.status]);

  // Resilient wake-up handler for mobile phones: when a phone is unlocked or browser tab un-minimized,
  // immediately check if the active trip completed while the device was asleep.
  useEffect(() => {
    const handlePhoneWakeup = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        const currentActive = activeTripRef.current;
        if (currentActive?.id) {
          fetch(`/api/trips/tracking?tripId=${encodeURIComponent(currentActive.id)}`)
            .then(res => res.json())
            .then(data => {
              if (data?.trip?.status === 'completed') {
                transitionToTripCompleted({
                  ...currentActive,
                  ...data.trip,
                  status: 'completed',
                });
              } else if (data?.trip?.status === 'cancelled') {
                audioAlert.alertRiderOfTripStatus('cancelled', data.trip);
                updateActiveTripState(null);
                setDriverCoords(null);
                setDeclineNotice('Your ride request was cancelled. You can request another ride below.');
              }
            })
            .catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handlePhoneWakeup);
    window.addEventListener('focus', handlePhoneWakeup);
    window.addEventListener('pageshow', handlePhoneWakeup);

    // Cross-tab/window storage sync when another tab or driver completes the trip
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'solo_last_completed_trip' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          const currentActive = activeTripRef.current;
          if (parsed?.tripId && currentActive && parsed.tripId === currentActive.id) {
            transitionToTripCompleted({ ...currentActive, status: 'completed' });
          }
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      document.removeEventListener('visibilitychange', handlePhoneWakeup);
      window.removeEventListener('focus', handlePhoneWakeup);
      window.removeEventListener('pageshow', handlePhoneWakeup);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Fail-safe watchdog: If activeTrip ever receives 'completed' status, immediately transition to Rating Modal
  useEffect(() => {
    if (activeTrip && (activeTrip.status === 'completed' || isTripCompleted(activeTrip.id))) {
      transitionToTripCompleted(activeTrip);
    }
  }, [activeTrip?.status, activeTrip?.id]);

  // Fetch active registered drivers in proximity to rider + subscribe to Geohash-6 WebSocket mesh
  useEffect(() => {
    const lat = pickupCoords?.lat ?? activeTrip?.pickup_lat ?? -26.2041;
    const lng = pickupCoords?.lng ?? activeTrip?.pickup_lng ?? 28.0473;

    const refreshDrivers = () => {
      getActiveDrivers(pickupCoords?.lat, pickupCoords?.lng, 25).then(drivers => {
        setAvailableDrivers(drivers);
      });
    };

    refreshDrivers();
    const interval = setInterval(refreshDrivers, 19000 + Math.floor(Math.random() * 2000));

    // Subscribe directly to regional Geohash-6 WebSocket channel (`solo:geo:<geohash6>`) for 0-latency streaming
    const unsubscribeRegionalMesh = subscribeToRegionalDriverMesh(lat, lng, (data) => {
      window.dispatchEvent(new CustomEvent('solo_driver_location_update', { detail: data }));
    });

    return () => {
      clearInterval(interval);
      unsubscribeRegionalMesh();
    };
  }, [pickupCoords?.lat, pickupCoords?.lng, activeTrip?.pickup_lat, activeTrip?.pickup_lng]);

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
      const completedIds = getCompletedTripIds();
      const currentActive = activeTripRef.current;
      const storedActiveTripId = getRiderActiveTripId();
      const myRiderId = getRiderSessionId(currentUser?.id);

      if (currentActive) {
        // Discard if current active does not belong to this session or has already been dismissed
        if (
          isTripDismissed(currentActive.id) ||
          (currentActive.id !== storedActiveTripId &&
            currentActive.rider_id !== myRiderId &&
            myRiderId !== '00000000-0000-0000-0000-000000000000')
        ) {
          updateActiveTripState(null);
          setDriverCoords(null);
          setIsProcessingPayment(false);
          setPaymentError(null);
          return;
        }

        if (completedIds.has(currentActive.id) || isTripCompleted(currentActive.id)) {
          transitionToTripCompleted(currentActive);
          return;
        }
        const matched = trips.find(t => t.id === currentActive.id);
        if (matched) {
          if (matched.status === 'cancelled') {
            audioAlert.alertRiderOfTripStatus('cancelled', matched);
            updateActiveTripState(null);
            setDriverCoords(null);
            setDeclineNotice('Your ride request was cancelled. You can request another ride below.');
            return;
          }
          if (matched.status === 'completed') {
            transitionToTripCompleted(matched);
            return;
          }
          const matchedPrio = STATUS_PRIORITY[matched.status] || 0;
          const activePrio = STATUS_PRIORITY[currentActive.status] || 0;
          if (
            matchedPrio > activePrio ||
            (matched.driver_id && matched.driver_id !== currentActive.driver_id)
          ) {
            if (matched.status !== currentActive.status) {
              if (matched.status === 'accepted' || matched.status === 'arrived' || matched.status === 'in_progress') {
                audioAlert.alertRiderOfTripStatus(matched.status, matched);
              }
            }
            updateActiveTripState(matched);
          }
          return;
        } else {
          // If active trip is not in latest trips array, query authoritative status directly from server API
          try {
            const res = await fetch(`/api/trips/status?tripId=${encodeURIComponent(currentActive.id)}`);
            const statusData = await res.json();
            if (statusData?.trip?.status === 'completed') {
              const completedTrip: MockTrip = {
                ...currentActive,
                ...statusData.trip,
                status: 'completed',
              };
              transitionToTripCompleted(completedTrip);
              return;
            }
          } catch {
            // Ignore non-blocking status error
          }
        }
        return;
      }

      // If no active trip, ONLY find active trips strictly belonging to THIS rider session
      const active = trips.find(
        t =>
          t.status !== 'completed' &&
          t.status !== 'cancelled' &&
          !completedIds.has(t.id) &&
          !isTripCompleted(t.id) &&
          !isTripDismissed(t.id) &&
          !isStaleRequestedTrip(t) &&
          (t.id === storedActiveTripId || (t.rider_id === myRiderId && myRiderId !== '00000000-0000-0000-0000-000000000000'))
      );
      if (active && !activeTripRef.current) {
        updateActiveTripState(active);
      }
    };
    loadTrips();
    // Realtime Broadcast & postgres_changes handle instant trip events; 15s jittered fallback prevents 1,000-user DB polling storms
    const pollInterval = setInterval(loadTrips, 14000 + Math.floor(Math.random() * 2000));

    const handleDriverLocationUpdate = (data: any) => {
      if (!data?.id && !data?.driverId) return;
      const driverId = data.id || data.driverId;
      const currentActive = activeTripRef.current;

      // Update assigned driver coords if this driver is assigned to current trip
      if (currentActive && (data.tripId === currentActive.id || driverId === currentActive.driver_id)) {
        setDriverCoords({ lat: data.lat, lng: data.lng });
      }

      setAvailableDrivers(prev => {
        if (data.isOnline === false) {
          return prev.filter(d => d.id !== driverId);
        }
        const existingIdx = prev.findIndex(d => d.id === driverId);
        const dist = pickupCoords ? calculateDistanceKm(pickupCoords.lat, pickupCoords.lng, data.lat, data.lng) : data.distanceKm;
        const eta = dist !== undefined ? estimateEtaMinutes(dist) : data.etaMinutes;
        const updated: LiveDriver = {
          id: driverId,
          fullName: data.fullName || 'Registered Driver',
          phone: data.phone,
          vehicleMake: data.vehicleMake || 'Toyota',
          vehicleModel: data.vehicleModel || 'Corolla Quest',
          vehicleYear: data.vehicleYear,
          vehicleColor: data.vehicleColor,
          licensePlate: data.licensePlate || 'NC 482-910',
          rating: data.rating || 5.0,
          ratingCount: data.ratingCount || 0,
          distanceKm: dist,
          etaMinutes: eta,
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
      if (type === 'trip_updated' || type === 'trip_completed') {
        const trip = (type === 'trip_completed' ? (payload as any)?.trip || payload : payload) as MockTrip;
        if (!trip) return;
        const currentActive = activeTripRef.current || activeTrip;
        const storedActiveTripId = getRiderActiveTripId();
        const myRiderId = getRiderSessionId(currentUser?.id);

        // ISOLATION GUARD: Is this trip relevant to this rider session?
        const isMyTrip =
          (currentActive && currentActive.id === trip.id) ||
          (storedActiveTripId && storedActiveTripId === trip.id) ||
          (trip.rider_id === myRiderId && myRiderId !== '00000000-0000-0000-0000-000000000000');

        // If this trip belongs to another rider, ignore it entirely!
        if (!isMyTrip) {
          return;
        }

        if (trip.status === 'completed' || type === 'trip_completed') {
          const completedSnapshot: MockTrip = currentActive
            ? { ...currentActive, ...trip, status: 'completed' }
            : { ...trip, status: 'completed' };
          transitionToTripCompleted(completedSnapshot);
        } else if (trip.status === 'cancelled') {
          audioAlert.alertRiderOfTripStatus('cancelled', trip);
          updateActiveTripState(null);
          setDriverCoords(null);
          setDeclineNotice('Your ride request was cancelled. You can request another ride below.');
        } else if (!isTripCompleted(trip.id) && !isTripDismissed(trip.id) && !isStaleRequestedTrip(trip)) {
          if (!currentActive) {
            setDeclineNotice(null);
            updateActiveTripState(trip);
          } else if (currentActive.id === trip.id) {
            const incomingPrio = STATUS_PRIORITY[trip.status] || 0;
            const activePrio = STATUS_PRIORITY[currentActive.status] || 0;
            if (incomingPrio > activePrio || (trip.driver_id && trip.driver_id !== currentActive.driver_id)) {
              setDeclineNotice(null);
              if (trip.status === 'accepted' && currentActive.status === 'requested') {
                audioAlert.alertRiderOfTripStatus('accepted', trip);
              } else if (trip.status === 'arrived' && currentActive.status !== 'arrived') {
                // Dispatch native arrival alert: Your Driver Has Arrived! 📍
                audioAlert.alertRiderOfTripStatus('arrived', trip);
              } else if (trip.status === 'in_progress' && currentActive.status !== 'in_progress') {
                audioAlert.alertRiderOfTripStatus('in_progress', trip);
              }
              updateActiveTripState(trip);
            }
          }
        }

      } else if (type === 'driver_location') {
        handleDriverLocationUpdate(payload);
      } else if (type === 'new_message') {
        const msg = payload as MockMessage;
        const currentActive = activeTripRef.current || activeTrip;
        if (msg && currentActive && msg.trip_id === currentActive.id) {
          if (msg.sender === 'driver') {
            // Play acoustic sound chime & mobile haptics immediately
            audioAlert.alertOfNewMessage(msg, 'rider');
            if (tripSubTabRef.current !== 'chat') {
              setUnreadChatCount((prev) => prev + 1);
              setIncomingMessageToast({ sender: 'Driver', text: msg.text });
            }
          }
        }
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
  }, [currentUser?.id]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    localStorage.removeItem('solo_verified_rider');
    setCurrentUser(null);
    if (activeTrip) {
      markTripCompleted(activeTrip.id);
      const updated = { ...activeTrip, status: 'completed' as const };
      saveTrip(updated);
    }
    localStorage.removeItem('mock_trips');
    updateActiveTripState(null);
    setDriverCoords(null);
  };

  const handleRatingSubmit = async (data: { stars: number; tags: string[]; comment: string }) => {
    if (ratingTrip) {
      markTripDismissed(ratingTrip.id);
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
    if (ratingTrip) {
      markTripDismissed(ratingTrip.id);
    }
    setShowRatingModal(false);
    setRatingTrip(null);
  }

  const handleSettleWithCash = async () => {
    if (!activeTrip) return;
    const current = activeTrip;
    await completeTripAtomic(current.id, 'cash', current);
    await saveTrip({ ...current, status: 'completed' });
    transitionToTripCompleted(current);
  };

  const handleForceCloseTrip = async () => {
    if (!activeTrip) return;
    const current = activeTrip;
    markTripCompleted(current.id);
    markTripDismissed(current.id);
    await completeTripAtomic(current.id, 'cash', current);
    updateActiveTripState(null);
    setDriverCoords(null);
    setIsProcessingPayment(false);
    setPaymentError(null);
  };

  const handleCancelActiveTrip = async () => {
    if (!activeTrip) return;
    const isRequestedOnly = activeTrip.status === 'requested';
    if (!isRequestedOnly) {
      const confirmEnd = window.confirm("Are you sure you want to cancel / end this active trip?");
      if (!confirmEnd) return;
    }
    const myRiderId = getRiderSessionId(currentUser?.id);
    const storedActiveTripId = getRiderActiveTripId();
    if (
      activeTrip.id !== storedActiveTripId &&
      activeTrip.rider_id !== myRiderId &&
      myRiderId !== '00000000-0000-0000-0000-000000000000'
    ) {
      console.warn('[Rider] Refusing to cancel trip belonging to another rider session');
      return;
    }
    const cancelled: MockTrip = { ...activeTrip, status: 'cancelled' };
    markTripDismissed(activeTrip.id);
    updateActiveTripState(null);
    setDriverCoords(null);
    setIsProcessingPayment(false);
    setPaymentError(null);
    try {
      await saveTrip(cancelled);
    } catch (e) {
      console.error('Error cancelling trip:', e);
    }
  };

  const handleLocationSelect = (type: 'pickup' | 'dropoff', lat: number, lng: number) => {
    setFocusedDriverCoords(null);
    if (type === 'pickup') setPickupCoords({ lat, lng })
    else setDropoffCoords({ lat, lng })
  }

  return (
    <div className="h-mobile-portal w-full relative overflow-hidden bg-gray-100 dark:bg-zinc-900">
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
            phone: d.phone,
            vehicle: [d.vehicleMake, d.vehicleModel].filter(Boolean).join(' '),
            vehicleMake: d.vehicleMake,
            vehicleModel: d.vehicleModel,
            vehicleYear: d.vehicleYear,
            vehicleColor: d.vehicleColor,
            licensePlate: d.licensePlate,
            rating: d.rating ?? 5.0,
            ratingCount: d.ratingCount ?? 0,
            distanceKm: d.distanceKm,
            etaMinutes: d.etaMinutes,
          }))}
          focusedDriverCoords={focusedDriverCoords}
          assignedDriver={activeTrip && (driverCoords || assignedDriverInfo) && ((driverCoords?.lat && Math.abs(driverCoords.lat) > 1) || (activeTrip.pickup_lat && Math.abs(activeTrip.pickup_lat) > 1)) ? {
            lat: (driverCoords?.lat && Math.abs(driverCoords.lat) > 1) ? driverCoords.lat : activeTrip.pickup_lat,
            lng: (driverCoords?.lng && Math.abs(driverCoords.lng) > 1) ? driverCoords.lng : activeTrip.pickup_lng,
            name: assignedDriverInfo?.fullName || 'Your Driver',
            vehicle: [assignedDriverInfo?.vehicleMake, assignedDriverInfo?.vehicleModel].filter(Boolean).join(' ') || 'En route',
            licensePlate: assignedDriverInfo?.licensePlate,
            rating: assignedDriverInfo?.rating || 5.0
          } : undefined}
          driverLat={driverCoords?.lat}
          driverLng={driverCoords?.lng}
          tripStatus={activeTrip?.status}
          isPickingOnMap={pickingOnMapType}
          onMapClickLocation={handleMapClickLocation}
          onRouteChange={(details) => {
            setLiveTrackingInfo(prev => ({
              distanceKm: details.distanceKm,
              durationMinutes: details.durationMinutes,
              targetType: activeTrip?.status === 'in_progress' ? 'dropoff' : 'pickup',
              heading: prev?.heading,
              speedKmh: prev?.speedKmh,
            }));
          }}
        />
      </div>

      {/* Interactive Map Pin Selection Mode Banner */}
      {pickingOnMapType && (
        <div className="absolute top-4 left-1/2 md:left-[calc(50%+12rem)] -translate-x-1/2 z-40 w-[92%] max-w-sm animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="bg-blue-600 text-white p-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 border border-blue-400/80">
            <div className="flex items-center gap-2.5 min-w-0">
              <MapPin size={22} className="text-white shrink-0 animate-bounce" />
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-black leading-snug">
                  Tap map to set {pickingOnMapType === 'pickup' ? 'Pickup' : 'Dropoff'}
                </p>
                <p className="text-xs text-blue-100 leading-snug">Tap any street or gate on the map</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPickingOnMapType(null);
                setIsSheetMinimized(false);
              }}
              className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-2 rounded-xl shrink-0 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Real-time Trip GPS Tracking Floating HUD Pill */}
      {activeTrip && (activeTrip.status === 'accepted' || activeTrip.status === 'arrived' || activeTrip.status === 'in_progress') && (
        <div className="absolute top-3 left-3 md:top-4 md:left-[26rem] lg:left-[28.5rem] pt-safe z-30 pointer-events-none">
          <div className="bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-xl border border-gray-200/80 dark:border-white/10 flex items-center gap-2.5 pointer-events-auto">
            <div className={`w-2.5 h-2.5 rounded-full ${activeTrip.status === 'in_progress' ? 'bg-blue-500' : 'bg-emerald-500'} animate-ping shrink-0`} />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {activeTrip.status === 'accepted' ? 'Driver En Route' : activeTrip.status === 'arrived' ? 'Driver Outside' : 'En Route to Dropoff'}
              </p>
              <p className="text-xs font-black text-gray-900 dark:text-white">
                {liveTrackingInfo?.durationMinutes
                  ? `${liveTrackingInfo.durationMinutes} min away • ${liveTrackingInfo.distanceKm.toFixed(1)} km`
                  : activeTrip.status === 'arrived'
                    ? 'Confirm PIN to board'
                    : 'Live GPS Connected'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top Header: Rider Safety SOS Shield + Profile or Phone Auth Button */}
      <div className="absolute top-3 right-3 md:top-4 md:right-5 pt-safe z-30 flex items-center gap-2">
        <SafetyFloatingButton onClick={() => setShowSafetyModal(true)} />
        {currentUser ? (
          <div className="flex items-center gap-2 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md px-3 py-1.5 md:px-3.5 md:py-2 rounded-2xl shadow-xl border border-gray-200/80 dark:border-white/10">
            <div className="flex items-center gap-2 pr-2 border-r border-gray-200 dark:border-zinc-800">
              <div className="relative shrink-0">
                <img
                  src="/rider-icon-192.png"
                  alt="Rider Avatar"
                  className="w-8 h-8 md:w-9 md:h-9 rounded-xl object-cover border border-blue-500/40 shadow-sm"
                />
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-600 text-white text-[8px] font-black flex items-center justify-center ring-2 ring-white dark:ring-zinc-950">
                  {currentUser.fullName ? currentUser.fullName.charAt(0).toUpperCase() : 'R'}
                </span>
              </div>
              <div className="text-left">
                <p className="text-xs font-bold leading-tight text-gray-900 dark:text-white">{currentUser.fullName}</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight hidden sm:block">{currentUser.phone || 'Verified Rider'}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition p-1"
              title="Sign Out"
            >
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 md:px-4 md:py-2.5 rounded-2xl shadow-lg shadow-blue-600/30 text-xs font-bold transition active:scale-95"
          >
            <img src="/rider-icon-192.png" alt="" className="w-4 h-4 rounded-md object-cover border border-white/30" />
            <span>Sign In</span>
          </button>
        )}
      </div>

      {/* Floating UI Panel / Tablet Dock & Mobile Bottom Sheet */}
      <div className="absolute bottom-0 left-0 right-0 sm:left-4 sm:right-4 sm:max-w-xl sm:mx-auto w-full md:bottom-auto md:right-auto md:top-4 md:left-4 lg:left-6 md:w-[400px] lg:w-[440px] md:max-w-none md:mx-0 flex flex-col z-20 md:max-h-[calc(100vh-2rem)] md:max-h-[calc(100dvh-2rem)] gpu-composited">
        <div
          onFocusCapture={() => {
            if (isSheetMinimized) setIsSheetMinimized(false)
          }}
          className={`bg-white/95 dark:bg-zinc-950/95 backdrop-blur-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.18)] md:shadow-2xl rounded-t-3xl md:rounded-3xl border-t md:border border-white/40 dark:border-white/10 flex flex-col min-h-0 transition-all duration-300 overflow-hidden ${
            isSheetMinimized ? 'max-h-[86px] md:max-h-[94px]' : 'max-h-[78vh] max-h-[78dvh] md:max-h-[calc(100vh-2rem)] md:max-h-[calc(100dvh-2rem)]'
          }`}
        >
          {/* Sheet Handle / Minimize Toggle */}
          <button
            type="button"
            onClick={() => setIsSheetMinimized(prev => !prev)}
            className="w-full pt-3 pb-1.5 flex flex-col items-center justify-center md:hidden focus:outline-none shrink-0"
            aria-label={isSheetMinimized ? 'Expand booking panel' : 'Minimize booking panel to view map'}
          >
            <div className="w-14 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full" />
          </button>

          <div className="p-4 pt-1 pb-6 sm:p-5 md:p-5 lg:p-6 pb-safe flex-1 min-h-0 overflow-y-auto overscroll-contain momentum-scroll custom-scrollbar flex flex-col">
            {!activeTrip ? (
              <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                {/* Row 1: Unobstructed "Where to?" Heading + Utility Controls */}
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className="relative p-0.5 rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-400 to-indigo-600 shadow-lg shadow-blue-500/30 shrink-0">
                      <img
                        src="/rider-icon-192.png"
                        alt="SOLO Rider Portal"
                        className="w-10 h-10 sm:w-11 sm:h-11 rounded-[0.9rem] object-cover border border-white/20"
                      />
                    </div>
                    <h1 className="text-xl sm:text-2xl lg:text-[26px] font-extrabold tracking-tight leading-tight whitespace-nowrap text-gray-900 dark:text-white">
                      Where to?
                    </h1>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleOpenSupport}
                      className="flex items-center gap-1 text-xs sm:text-sm font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/50 px-2.5 py-2 min-h-[40px] rounded-xl border border-amber-200/80 dark:border-amber-800/60 transition active:scale-95 shadow-2xs whitespace-nowrap"
                      title="Help, Lost & Found, and Trip Support"
                    >
                      <HelpCircle size={16} className="shrink-0" />
                      <span>Help</span>
                    </button>
                    <ThemeToggle className="bg-gray-100 dark:bg-zinc-900 border border-gray-200/80 dark:border-zinc-800" />
                    <button
                      type="button"
                      onClick={() => setIsSheetMinimized(prev => !prev)}
                      className="flex items-center gap-1 text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-zinc-900 hover:bg-gray-200 dark:hover:bg-zinc-800 px-2.5 py-2 min-h-[40px] rounded-xl border border-gray-200/80 dark:border-zinc-800 shrink-0 transition whitespace-nowrap"
                      title={isSheetMinimized ? 'Expand booking panel' : 'Minimize panel to inspect map'}
                    >
                      {isSheetMinimized ? (
                        <>
                          <span>Book</span>
                          <ChevronUp size={16} />
                        </>
                      ) : (
                        <>
                          <span>Map</span>
                          <ChevronDown size={16} />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Row 2: Dedicated Full-Width Online Drivers Bar (Never blocks "Where to?") */}
                {!isSheetMinimized && (
                  <button
                    type="button"
                    onClick={() => setShowDriversModal(true)}
                    className="w-full mb-3.5 px-3.5 py-2.5 min-h-[42px] rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/40 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/50 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between gap-2 transition active:scale-[0.99] text-left shadow-2xs"
                    title="View all online drivers with driver and car details"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                      <span className="text-xs sm:text-sm font-bold text-emerald-800 dark:text-emerald-300">
                        {availableDrivers.length} {availableDrivers.length === 1 ? 'Driver' : 'Drivers'} Online
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 shrink-0">
                      <Car size={16} className="shrink-0" />
                      <span>View Drivers &amp; Cars &rarr;</span>
                    </div>
                  </button>
                )}

                {!isSheetMinimized && (
                  <>
                    <NotificationPermissionBanner role="rider" userId={currentUser?.id} className="mb-3" />
                    {declineNotice && (
                      <div className="mb-3 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5 text-amber-800 dark:text-amber-300 text-sm font-medium">
                        <AlertCircle size={18} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                        <div className="flex-1">
                          <p className="font-bold text-amber-900 dark:text-amber-200 mb-0.5">Ride Request Declined</p>
                          <p>{declineNotice}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDeclineNotice(null)}
                          className="text-amber-600 dark:text-amber-400 hover:opacity-75 font-bold px-2 py-1"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    <BookingForm 
                      onLocationSelect={handleLocationSelect} 
                      currentUser={currentUser}
                      onRequireAuth={() => setShowAuthModal(true)}
                      onTripCreated={(trip) => {
                        audioAlert.unlockMobileAudio(true);
                        updateActiveTripState(trip);
                        setDeclineNotice(null);
                      }}
                      availableDrivers={availableDrivers}
                      onViewAllDrivers={() => setShowDriversModal(true)}
                      onLocateDriverOnMap={handleLocateDriverOnMap}
                      onPickOnMapRequest={(type) => {
                        setPickingOnMapType(type);
                        setIsSheetMinimized(true);
                      }}
                      mapPickedLocation={mapPickedLocation}
                    />
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-left-4 duration-500">
                {/* Compact Active Trip Header (Always Visible even when Minimized) */}
                <div className="flex items-center justify-between gap-2 mb-3 shrink-0 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse shrink-0" />
                    <h2 className="text-lg sm:text-xl md:text-2xl font-black tracking-tight capitalize">
                      {activeTrip.status.replace('_', ' ')}
                    </h2>
                    {activeTrip.verification_pin && (
                      <span className="text-xs sm:text-sm font-black px-2.5 py-1 rounded-lg bg-blue-600 text-white shadow-2xs shrink-0">
                        PIN: {activeTrip.verification_pin}
                      </span>
                    )}
                    <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 shrink-0">
                      R{activeTrip.fare_amount}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isSheetMinimized && (
                      <button
                        type="button"
                        onClick={() => {
                          setTripSubTab('chat')
                          setIsSheetMinimized(false)
                        }}
                        className="relative flex items-center gap-1.5 text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-3 py-2 min-h-[40px] rounded-xl border border-blue-200 dark:border-blue-800"
                      >
                        <MessageCircle size={15} />
                        <span>Chat</span>
                        {unreadChatCount > 0 && (
                          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping absolute -top-0.5 -right-0.5" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsSheetMinimized(prev => !prev)}
                      className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-zinc-900 hover:bg-gray-200 dark:hover:bg-zinc-800 px-3 py-2 min-h-[40px] rounded-xl border border-gray-200/80 dark:border-zinc-800 transition"
                    >
                      {isSheetMinimized ? (
                        <>
                          <span>Expand</span>
                          <ChevronUp size={16} />
                        </>
                      ) : (
                        <>
                          <span>Map</span>
                          <ChevronDown size={16} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
                
                {!isSheetMinimized && (
                  <>
                    {/* Segmented Navigation Bar: Eliminates vertical scroll conflict between Trip Details & Chat Input */}
                    <div className="grid grid-cols-2 gap-2 p-1.5 mb-3 rounded-2xl bg-gray-100 dark:bg-zinc-900 border border-gray-200/80 dark:border-white/10 shrink-0">
                      <button
                        type="button"
                        onClick={() => setTripSubTab('details')}
                        className={`flex items-center justify-center gap-2 py-2.5 px-3 min-h-[46px] rounded-xl text-sm sm:text-base font-bold transition-all touch-manipulation ${
                          tripSubTab === 'details'
                            ? 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                      >
                        <MapPin size={16} className={tripSubTab === 'details' ? 'text-blue-600 dark:text-blue-400' : ''} />
                        <span>Trip Info &amp; PIN</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTripSubTab('chat')}
                        className={`relative flex items-center justify-center gap-2 py-2.5 px-3 min-h-[46px] rounded-xl text-sm sm:text-base font-bold transition-all touch-manipulation ${
                          tripSubTab === 'chat'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                      >
                        <MessageCircle size={16} />
                        <span>Chat with Driver</span>
                        {unreadChatCount > 0 && tripSubTab !== 'chat' && (
                          <span className="px-2 py-0.5 text-xs font-black bg-red-500 text-white rounded-full animate-bounce leading-none shadow-sm">
                            {unreadChatCount}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Incoming Message Floating Alert Toast if Rider is on Details Tab */}
                    {incomingMessageToast && tripSubTab === 'details' && (
                      <div
                        onClick={() => setTripSubTab('chat')}
                        className="mb-3 p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl flex items-center justify-between gap-2 text-sm font-semibold shadow-md cursor-pointer animate-in fade-in slide-in-from-top-2 transition active:scale-[0.98]"
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <MessageCircle size={18} className="shrink-0 mt-0.5 animate-pulse text-blue-200" />
                          <span className="break-words">
                            <strong className="text-blue-100">{incomingMessageToast.sender}:</strong> {incomingMessageToast.text}
                          </span>
                        </div>
                        <span className="text-xs underline shrink-0 font-bold text-blue-100">Reply →</span>
                      </div>
                    )}

                    {tripSubTab === 'details' ? (
                      <div className="p-4 md:p-5 bg-gradient-to-r from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-900/10 rounded-2xl border border-blue-200/80 dark:border-blue-800/50">
                        {/* Live ETA & Road Distance Banner */}
                        {activeTrip.status === 'accepted' && (
                          <div className="mb-3.5 p-3.5 bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-500/35 rounded-2xl flex items-center justify-between gap-3 text-emerald-950 dark:text-emerald-100 animate-in fade-in">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                                <Navigation size={18} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Driver En Route</p>
                                <p className="text-base font-bold leading-snug">
                                  {liveTrackingInfo?.durationMinutes 
                                    ? `Arriving in ~${liveTrackingInfo.durationMinutes} min` 
                                    : 'Approaching pickup point...'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-xs sm:text-sm font-mono font-black bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-xl border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 shadow-2xs">
                                {liveTrackingInfo?.distanceKm ? `${liveTrackingInfo.distanceKm.toFixed(1)} km` : 'Live GPS'}
                              </span>
                            </div>
                          </div>
                        )}

                        {activeTrip.status === 'in_progress' && (
                          <div className="mb-3.5 p-3.5 bg-blue-500/15 dark:bg-blue-500/20 border border-blue-500/35 rounded-2xl flex items-center justify-between gap-3 text-blue-950 dark:text-blue-100 animate-in fade-in">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                                <Car size={18} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-black uppercase tracking-wider text-blue-700 dark:text-blue-400">Heading to Destination</p>
                                <p className="text-base font-bold leading-snug">
                                  {liveTrackingInfo?.durationMinutes 
                                    ? `~${liveTrackingInfo.durationMinutes} min to dropoff` 
                                    : 'En route to destination...'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-xs sm:text-sm font-mono font-black bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-xl border border-blue-500/30 text-blue-600 dark:text-blue-400 shadow-2xs">
                                {liveTrackingInfo?.distanceKm ? `${liveTrackingInfo.distanceKm.toFixed(1)} km` : 'Live GPS'}
                              </span>
                            </div>
                          </div>
                        )}

                        <p className="text-sm md:text-base text-gray-800 dark:text-gray-200 font-bold">
                          {activeTrip.scheduled_time && activeTrip.status === 'requested' && (
                            <span className="block mb-1 text-blue-500">
                              Scheduled for: {new Date(activeTrip.scheduled_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          )}
                          {activeTrip.status === 'requested' && (!activeTrip.scheduled_time ? 'Finding your driver...' : 'Waiting for driver to accept scheduled ride...')}
                          {activeTrip.status === 'accepted' && 'Your driver is on the way to pick you up.'}
                          {activeTrip.status === 'arrived' && 'Your driver has arrived! Confirm PIN with driver to board.'}
                          {activeTrip.status === 'in_progress' && 'Trip active: on your way to destination.'}
                        </p>

                        {/* Route Summary */}
                        <div className="mt-3 pt-3 border-t border-blue-200/60 dark:border-blue-800/40 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                          <div className="flex items-start gap-2.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                            <span className="font-bold text-gray-900 dark:text-gray-100 break-words">{activeTrip.pickup_location}</span>
                          </div>
                          <div className="flex items-start gap-2.5">
                            <span className="w-2.5 h-2.5 rounded-none bg-emerald-500 shrink-0 mt-1.5" />
                            <span className="font-bold text-gray-900 dark:text-gray-100 break-words">{activeTrip.dropoff_location}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1.5 text-xs sm:text-sm flex-wrap gap-1">
                            <span className="font-semibold text-gray-600 dark:text-gray-400">Trip Occupants:</span>
                            <span className="font-bold text-blue-600 dark:text-blue-400">
                              {activeTrip.passenger_count === 2 ? '👥 2 Riders (Max)' : '👤 1 Rider (Solo)'}
                            </span>
                          </div>
                        </div>

                        {/* Driver Arrived PIN Alert */}
                        {activeTrip.status === 'arrived' && (
                          <div className="mt-3.5 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 flex items-center justify-between gap-3 text-amber-900 dark:text-amber-200 text-sm font-bold animate-pulse">
                            <div className="flex items-center gap-2 min-w-0">
                              <MapPin size={20} className="text-amber-600 dark:text-amber-400 shrink-0" />
                              <span className="leading-snug">Driver is waiting outside. Share PIN to board:</span>
                            </div>
                            <span className="font-mono font-black text-base sm:text-lg bg-white dark:bg-zinc-900 px-3 py-1 rounded-xl border border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 shadow-sm shrink-0">
                              {activeTrip.verification_pin}
                            </span>
                          </div>
                        )}

                        {/* Dispatched Driver & Vehicle Identification Card */}
                        {(activeTrip.status === 'accepted' || activeTrip.status === 'arrived' || activeTrip.status === 'in_progress') && (
                          <div className="mt-3.5 pt-3.5 border-t border-blue-200/60 dark:border-blue-800/40 bg-white/90 dark:bg-zinc-950/90 -mx-1 px-4 py-3.5 rounded-2xl shadow-sm border border-gray-200/70 dark:border-white/10">
                            <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="relative shrink-0">
                                  <img
                                    src="/driver-icon-192.png"
                                    alt="Assigned Driver Avatar"
                                    className="w-12 h-12 rounded-2xl object-cover border border-emerald-500/40 shadow-md"
                                  />
                                  <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white dark:ring-zinc-950">
                                    {assignedDriverInfo?.fullName ? assignedDriverInfo.fullName.charAt(0).toUpperCase() : '✓'}
                                  </span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-bold text-base text-gray-900 dark:text-white break-words">
                                      {assignedDriverInfo?.fullName || 'Assigned Driver'}
                                    </h4>
                                    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-500 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
                                      ★ {assignedDriverInfo?.rating ? assignedDriverInfo.rating.toFixed(1) : '5.0'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200 font-bold mt-0.5">
                                    <Car size={16} className="text-blue-500 shrink-0" />
                                    <span className="break-words">
                                      {[assignedDriverInfo?.vehicleMake, assignedDriverInfo?.vehicleModel].filter(Boolean).join(' ') || 'Toyota Corolla Quest'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* South African License Plate Number Badge */}
                              <div className="shrink-0 flex flex-col items-end">
                                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">License Plate</span>
                                <div className="px-3 py-1 bg-amber-300 dark:bg-amber-400 text-black font-mono font-black text-sm sm:text-base tracking-wider rounded-lg border-2 border-black/60 shadow-sm uppercase flex items-center gap-1.5">
                                  <span className="text-xs opacity-90">🇿🇦</span>
                                  <span>{assignedDriverInfo?.licensePlate || 'NC 482-910'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Security & Verification Reminder + Quick Message Button */}
                            <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-white/10 flex items-center justify-between gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-300 flex-wrap">
                              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                                <ShieldCheck size={15} className="shrink-0" /> Verify plate before boarding
                              </span>
                              <div className="flex items-center gap-2.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setTripSubTab('chat')}
                                  className="font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-blue-100 transition"
                                >
                                  <MessageCircle size={14} /> Message Driver
                                </button>
                                {assignedDriverInfo?.phone && (
                                  <a
                                    href={`tel:${assignedDriverInfo.phone}`}
                                    className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5 hover:underline px-2 py-1"
                                  >
                                    <Phone size={14} /> Call
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => setTripSubTab('chat')}
                            className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 px-3.5 py-2.5 min-h-[44px] rounded-xl shadow-sm transition active:scale-95"
                          >
                            <MessageCircle size={16} />
                            <span>Open Driver Chat</span>
                          </button>
                          <a
                            href={buildWhatsAppTripShareUrl(activeTrip)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 px-3.5 py-2.5 min-h-[44px] rounded-xl transition"
                          >
                            <MessageCircle size={16} />
                            <span>Share via WhatsApp</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => setShowSafetyModal(true)}
                            className="inline-flex items-center gap-2 text-xs sm:text-sm font-black text-white bg-red-600 hover:bg-red-500 px-3.5 py-2.5 min-h-[44px] rounded-xl shadow-sm transition active:scale-95"
                          >
                            <span>🚨 SOS</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelActiveTrip}
                            className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 px-3.5 py-2.5 min-h-[44px] rounded-xl transition touch-manipulation"
                          >
                            <span>{activeTrip.status === 'requested' ? 'Cancel Request' : 'Cancel / End Trip'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 min-h-[260px] md:min-h-[320px] flex flex-col overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-black shadow-inner">
                        <Chat tripId={activeTrip.id} role="rider" />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="pt-3 mt-2 border-t border-gray-200/50 dark:border-white/5 text-center">
              <p className="text-[11px] font-semibold tracking-widest uppercase text-gray-500 dark:text-gray-400">
                Built and Powered by <span className="font-black text-blue-600 dark:text-blue-400">Boraine Tech (Pty) Ltd</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Rider Direct Fare Settlement Modal */}
      {activeTrip?.status === 'payment_pending' && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-950 rounded-3xl w-full max-w-md p-6 shadow-2xl border-2 border-gray-200 dark:border-white/15 relative animate-in zoom-in-95 duration-300 max-h-[90vh] max-h-[90dvh] overflow-y-auto custom-scrollbar">
            {/* Top Close Button */}
            <button
              type="button"
              onClick={handleForceCloseTrip}
              className="absolute top-4 right-4 p-2.5 text-gray-400 hover:text-black dark:hover:text-white transition-colors touch-manipulation"
              title="Close modal"
            >
              <X size={22} />
            </button>
            <div className="flex items-center justify-between mb-1.5 pr-8">
              <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900 dark:text-white">Settle Fare</h2>
              <span className="flex items-center gap-1.5 text-xs font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/60 border border-green-200 dark:border-green-800 px-3 py-1 rounded-full">
                <ShieldCheck size={15} />
                Direct Payment
              </span>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm sm:text-base">
              Your driver has completed the trip. 100% of your fare goes directly to them.
            </p>
            
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 dark:from-blue-950/40 dark:to-indigo-950/20 rounded-2xl p-6 mb-5 border border-blue-200 dark:border-blue-900/50 flex flex-col items-center shadow-inner">
              <span className="text-blue-800 dark:text-blue-300 font-bold mb-1 uppercase tracking-wider text-xs sm:text-sm">Total Due</span>
              <span className="font-black text-5xl text-blue-600 dark:text-blue-400">R{activeTrip.fare_amount}</span>
              
              <div className="w-full mt-4 pt-3 border-t border-blue-200/60 dark:border-blue-900/60 flex justify-between text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                <span>SOLO Platform Commission</span>
                <span className="font-bold text-green-600 dark:text-green-400">R0.00 (0%)</span>
              </div>
            </div>

            {/* Direct In-Vehicle Payment Guidance */}
            <div className="bg-gray-50 dark:bg-zinc-900/70 rounded-2xl p-4 mb-6 border border-gray-200/80 dark:border-white/10 space-y-2.5 text-xs sm:text-sm text-gray-700 dark:text-gray-300">
              <div className="flex items-center gap-2 font-bold text-gray-900 dark:text-gray-100 text-sm sm:text-base">
                <CreditCard size={18} className="text-emerald-600 dark:text-emerald-400" />
                <span>Pay Driver Directly</span>
              </div>
              <p className="text-xs sm:text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                Please pay the driver directly using their mobile card machine (Speedpoint POS tap or insert) or with cash.
              </p>
              <div className="flex items-center gap-2 pt-1 text-xs text-gray-600 dark:text-gray-300 font-semibold flex-wrap">
                <span className="bg-white dark:bg-zinc-800 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-zinc-700">Speedpoint POS</span>
                <span className="bg-white dark:bg-zinc-800 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-zinc-700">Card Tap / Chip</span>
                <span className="bg-white dark:bg-zinc-800 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-zinc-700">Cash</span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleSettleWithCash}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 min-h-[54px] rounded-2xl transition-all shadow-md shadow-emerald-600/25 flex justify-center items-center gap-2 active:scale-95 text-base touch-manipulation"
              >
                <span>✓ I Have Paid Driver (Speedpoint / Cash)</span>
              </button>
              <button
                type="button"
                onClick={handleForceCloseTrip}
                className="w-full text-xs sm:text-sm font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 py-2 transition text-center underline touch-manipulation"
              >
                Dismiss &amp; Close Trip
              </button>
            </div>
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
            driverName={ratedDriver?.fullName || assignedDriverInfo?.fullName || (ratingTrip as any)?.driver_name || "Your Driver"}
            driverVehicle={ratedDriver ? [ratedDriver.vehicleMake, ratedDriver.vehicleModel].filter(Boolean).join(' ') : (assignedDriverInfo ? [assignedDriverInfo.vehicleMake, assignedDriverInfo.vehicleModel].filter(Boolean).join(' ') : undefined)}
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

      {/* Online Drivers Modal for Riders */}
      <OnlineDriversModal
        isOpen={showDriversModal}
        onClose={() => setShowDriversModal(false)}
        drivers={availableDrivers}
        onLocateOnMap={handleLocateDriverOnMap}
        onSelectDriver={(driver) => {
          setShowDriversModal(false);
          setFocusedDriverCoords({ lat: driver.lat, lng: driver.lng });
        }}
      />

      {/* South African Rapid-Response Safety & Panic Shield Modal */}
      <SafetyShieldModal
        isOpen={showSafetyModal}
        onClose={() => setShowSafetyModal(false)}
        role="rider"
        userId={currentUser?.id}
        userName={currentUser?.fullName || 'SOLO Rider'}
        userPhone={currentUser?.phone}
        lat={driverCoords?.lat || activeTrip?.pickup_lat || pickupCoords?.lat}
        lng={driverCoords?.lng || activeTrip?.pickup_lng || pickupCoords?.lng}
        tripId={activeTrip?.id}
        pickupLocation={activeTrip?.pickup_location}
        dropoffLocation={activeTrip?.dropoff_location}
        driverName={assignedDriverInfo?.fullName}
        driverPhone={assignedDriverInfo?.phone}
        vehicleMake={assignedDriverInfo?.vehicleMake}
        vehicleModel={assignedDriverInfo?.vehicleModel}
        licensePlate={assignedDriverInfo?.licensePlate}
        verificationPin={activeTrip?.verification_pin}
      />

      {/* Rider Help, Disputes & Lost Property Modal */}
      <RiderSupportModal
        isOpen={showSupportModal}
        onClose={() => setShowSupportModal(false)}
        trips={pastRiderTrips}
        currentUser={currentUser}
        onOpenSafetyModal={() => setShowSafetyModal(true)}
      />
    </div>
  )
}
