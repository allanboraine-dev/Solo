"use client"

import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getRouteDirections, getTileLayerConfig } from '@/utils/mapService';
import { useTheme } from '@/components/ThemeProvider';

export interface DriverMarkerData {
  id: string;
  lat: number;
  lng: number;
  name?: string;
  phone?: string;
  vehicle?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  vehicleColor?: string;
  licensePlate?: string;
  rating?: number;
  ratingCount?: number;
  distanceKm?: number;
  etaMinutes?: number;
  isOnline?: boolean;
}

interface MapProps {
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  driverLat?: number;
  driverLng?: number;
  tripStatus?: 'requested' | 'accepted' | 'arrived' | 'in_progress' | 'payment_pending' | 'completed' | 'cancelled';
  availableDrivers?: DriverMarkerData[];
  focusedDriverCoords?: { lat: number; lng: number } | null;
  assignedDriver?: {
    lat: number;
    lng: number;
    name?: string;
    vehicle?: string;
    licensePlate?: string;
    rating?: number;
  };
  onRouteChange?: (details: { distanceKm: number; durationMinutes: number }) => void;
  isPickingOnMap?: 'pickup' | 'dropoff' | null;
  onMapClickLocation?: (lat: number, lng: number) => void;
}

// Create custom DivIcons for location markers
const createCustomIcon = (text: string, bgColor: string, textColor: string) => {
  return L.divIcon({
    html: `<div style="background-color: ${bgColor}; color: ${textColor}; padding: 4px 10px; border-radius: 999px; box-shadow: 0 4px 8px -1px rgba(0, 0, 0, 0.25); border: 2px solid white; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center; width: max-content;">${text}</div>`,
    className: '',
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

const pickupIcon = createCustomIcon('Pickup (A)', '#111827', '#ffffff');
const dropoffIcon = createCustomIcon('Dropoff (B)', '#2563eb', '#ffffff');

// Car icon for available roaming drivers
const createAvailableCarIcon = (vehicleName?: string) => {
  const shortVehicle = vehicleName ? vehicleName.split(' ').slice(0, 2).join(' ') : '';
  return L.divIcon({
    html: `
      <div style="display:flex; flex-direction:column; align-items:center; cursor:pointer;">
        <div style="background-color:#0f172a; color:#ffffff; width:34px; height:34px; border-radius:9999px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(0,0,0,0.35); border:2.5px solid #ffffff; position:relative;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
            <circle cx="7" cy="17" r="2"/>
            <path d="M9 17h6"/>
            <circle cx="17" cy="17" r="2"/>
          </svg>
          <div style="position:absolute; bottom:-1px; right:-1px; width:9px; height:9px; background-color:#22c55e; border:1.5px solid #ffffff; border-radius:9999px;"></div>
        </div>
        ${shortVehicle ? `<span style="background-color:rgba(15,23,42,0.9); color:#ffffff; font-size:9.5px; font-weight:700; padding:1px 5px; border-radius:4px; margin-top:2px; white-space:nowrap; box-shadow:0 2px 4px rgba(0,0,0,0.25);">${shortVehicle}</span>` : ''}
      </div>
    `,
    className: '',
    iconAnchor: [17, 17],
    popupAnchor: [0, -20]
  });
};

// Car icon for assigned driver (active trip)
const createAssignedDriverIcon = (driverName?: string) => {
  return L.divIcon({
    html: `
      <div style="display:flex; flex-direction:column; align-items:center; cursor:pointer;">
        <span style="background-color:#2563eb; color:#ffffff; font-size:10px; font-weight:800; padding:2px 8px; border-radius:9999px; margin-bottom:2px; white-space:nowrap; box-shadow:0 4px 8px rgba(37,99,235,0.4); border:1.5px solid #ffffff; text-transform:uppercase; letter-spacing:0.5px;">
          ${driverName || 'Your Driver'}
        </span>
        <div style="background-color:#2563eb; color:#ffffff; width:38px; height:38px; border-radius:9999px; display:flex; align-items:center; justify-content:center; box-shadow:0 6px 16px rgba(37,99,235,0.45); border:3px solid #ffffff; position:relative;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
            <circle cx="7" cy="17" r="2"/>
            <path d="M9 17h6"/>
            <circle cx="17" cy="17" r="2"/>
          </svg>
        </div>
      </div>
    `,
    className: '',
    iconAnchor: [19, 28],
    popupAnchor: [0, -30]
  });
};

// Component to handle map bounds, sizing, and routing
const MapUpdater = ({
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  driverLat,
  driverLng,
  tripStatus,
  focusedDriverCoords,
}: any) => {
  const map = useMap();
  const prevFocusedRef = useRef<{ lat: number; lng: number } | null>(null);

  // Keep map dimensions strictly in sync with the DOM container
  useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 500);

    const container = map.getContainer();
    let ro: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        map.invalidateSize();
      });
      ro.observe(container);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (ro) ro.disconnect();
    };
  }, [map]);

  useEffect(() => {
    // Coordinate sanity check helper (avoid zooming to 0,0 in the Atlantic ocean)
    const isValidCoord = (lat?: number | null, lng?: number | null) =>
      typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng) && Math.abs(lat) > 1 && Math.abs(lng) > 1;

    const hasValidPickup = isValidCoord(pickupLat, pickupLng);
    const hasValidDropoff = isValidCoord(dropoffLat, dropoffLng);
    const hasValidDriver = isValidCoord(driverLat, driverLng);
    const hasValidFocusedDriver = isValidCoord(focusedDriverCoords?.lat, focusedDriverCoords?.lng);

    // If focused driver was tapped, fly to driver only once when selected
    if (hasValidFocusedDriver) {
      const isNewFocus =
        !prevFocusedRef.current ||
        prevFocusedRef.current.lat !== focusedDriverCoords.lat ||
        prevFocusedRef.current.lng !== focusedDriverCoords.lng;

      if (isNewFocus) {
        prevFocusedRef.current = { lat: focusedDriverCoords.lat, lng: focusedDriverCoords.lng };
        map.flyTo([focusedDriverCoords.lat, focusedDriverCoords.lng], 16, { animate: true, duration: 1.2 });
        return;
      }
    } else {
      prevFocusedRef.current = null;
    }

    // 1. If trip is accepted and driver is en route to pickup:
    if (tripStatus === 'accepted' && hasValidDriver && hasValidPickup) {
      const bounds = L.latLngBounds(
        [driverLat, driverLng],
        [pickupLat, pickupLng]
      );
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      return;
    }

    // 2. If trip is in progress and driver is en route to destination:
    if (tripStatus === 'in_progress' && hasValidDriver && hasValidDropoff) {
      const bounds = L.latLngBounds(
        [driverLat, driverLng],
        [dropoffLat, dropoffLng]
      );
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      return;
    }

    // 3. If driver arrived at pickup:
    if (tripStatus === 'arrived' && hasValidPickup) {
      map.setView([pickupLat, pickupLng], 16);
      return;
    }

    // 4. Default pickup to dropoff bounds:
    if (hasValidPickup && hasValidDropoff) {
      const bounds = L.latLngBounds(
        [pickupLat, pickupLng],
        [dropoffLat, dropoffLng]
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } else if (hasValidPickup) {
      map.setView([pickupLat, pickupLng], 15);
    } else if (hasValidDropoff) {
      map.setView([dropoffLat, dropoffLng], 15);
    } else if (hasValidDriver && !tripStatus) {
      map.setView([driverLat, driverLng], 15);
    }
  }, [map, pickupLat, pickupLng, dropoffLat, dropoffLng, driverLat, driverLng, tripStatus, focusedDriverCoords]);

  return null;
};

const MapClickHandler = ({
  isPickingOnMap,
  onMapClickLocation,
}: {
  isPickingOnMap?: 'pickup' | 'dropoff' | null;
  onMapClickLocation?: (lat: number, lng: number) => void;
}) => {
  useMapEvents({
    click(e) {
      if (isPickingOnMap && onMapClickLocation) {
        onMapClickLocation(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
};

const MapNavigationControls = ({ centerLat, centerLng }: { centerLat: number; centerLng: number }) => {
  const map = useMap();
  return (
    <div className="leaflet-top leaflet-right" style={{ pointerEvents: 'auto', marginTop: '76px', marginRight: '14px', zIndex: 1000 }}>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => map.zoomIn()}
          aria-label="Zoom In"
          className="w-10 h-10 bg-white/95 dark:bg-zinc-800/95 backdrop-blur-md text-gray-800 dark:text-gray-100 rounded-xl flex items-center justify-center font-bold text-lg hover:bg-gray-100 dark:hover:bg-zinc-700 active:scale-95 transition border border-gray-200/80 dark:border-white/10 shadow-lg cursor-pointer"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => map.zoomOut()}
          aria-label="Zoom Out"
          className="w-10 h-10 bg-white/95 dark:bg-zinc-800/95 backdrop-blur-md text-gray-800 dark:text-gray-100 rounded-xl flex items-center justify-center font-bold text-lg hover:bg-gray-100 dark:hover:bg-zinc-700 active:scale-95 transition border border-gray-200/80 dark:border-white/10 shadow-lg cursor-pointer"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => map.setView([centerLat, centerLng], 15, { animate: true })}
          aria-label="Recenter Map"
          title="Recenter"
          className="w-10 h-10 bg-white/95 dark:bg-zinc-800/95 backdrop-blur-md text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-zinc-700 active:scale-95 transition border border-gray-200/80 dark:border-white/10 shadow-lg cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

const MapComponent = (props: MapProps) => {
  const { 
    pickupLat, 
    pickupLng, 
    dropoffLat, 
    dropoffLng, 
    driverLat, 
    driverLng, 
    tripStatus,
    availableDrivers = [],
    focusedDriverCoords,
    assignedDriver,
    onRouteChange,
    isPickingOnMap,
    onMapClickLocation,
  } = props;
  
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);

  // Effective assigned driver location
  const effectiveAssignedLat = assignedDriver?.lat || driverLat;
  const effectiveAssignedLng = assignedDriver?.lng || driverLng;

  const centerLat = pickupLat || effectiveAssignedLat || -28.7282;
  const centerLng = pickupLng || effectiveAssignedLng || 24.7623;

  // Dynamically calculate the active leg of the journey:
  // - If tripStatus === 'accepted' && driver location exists -> route from Driver to Pickup!
  // - If tripStatus === 'in_progress' && driver location exists -> route from Driver to Dropoff!
  // - Otherwise -> route from Pickup to Dropoff!
  useEffect(() => {
    let originLat: number | undefined;
    let originLng: number | undefined;
    let destLat: number | undefined;
    let destLng: number | undefined;

    if (tripStatus === 'accepted' && effectiveAssignedLat && effectiveAssignedLng && pickupLat && pickupLng) {
      originLat = effectiveAssignedLat;
      originLng = effectiveAssignedLng;
      destLat = pickupLat;
      destLng = pickupLng;
    } else if (tripStatus === 'in_progress' && effectiveAssignedLat && effectiveAssignedLng && dropoffLat && dropoffLng) {
      originLat = effectiveAssignedLat;
      originLng = effectiveAssignedLng;
      destLat = dropoffLat;
      destLng = dropoffLng;
    } else if (pickupLat && pickupLng && dropoffLat && dropoffLng) {
      originLat = pickupLat;
      originLng = pickupLng;
      destLat = dropoffLat;
      destLng = dropoffLng;
    }

    if (originLat !== undefined && originLng !== undefined && destLat !== undefined && destLng !== undefined) {
      const getRoute = async () => {
        try {
          const details = await getRouteDirections(originLng!, originLat!, destLng!, destLat!);
          if (details && details.coordinates.length > 0) {
            setRouteCoordinates(details.coordinates);
            if (typeof onRouteChange === 'function') {
              onRouteChange({
                distanceKm: details.distanceKm,
                durationMinutes: details.durationMinutes,
              });
            }
          }
        } catch (e) {
          console.error('Directions request failed', e);
        }
      };
      getRoute();
    } else {
      setRouteCoordinates([]);
    }
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng, effectiveAssignedLat, effectiveAssignedLng, tripStatus]);

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const tileConfig = getTileLayerConfig(isDark);

  const polylineColor = tripStatus === 'accepted' ? '#10b981' : '#3b82f6';

  return (
    <div className={`w-full h-full relative z-0 select-none touch-pan-x touch-pan-y ${isPickingOnMap ? 'cursor-crosshair' : ''}`}>
      <MapContainer 
        center={[centerLat, centerLng]} 
        zoom={14} 
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        // @ts-ignore Leaflet mobile tap emulation override
        tap={false}
        bounceAtZoomLimits={false}
      >
        <TileLayer
          key={tileConfig.url}
          attribution={tileConfig.attribution}
          url={tileConfig.url}
          maxZoom={tileConfig.maxZoom}
          tileSize={tileConfig.tileSize}
          zoomOffset={tileConfig.zoomOffset}
        />
        
        <MapClickHandler 
          isPickingOnMap={isPickingOnMap} 
          onMapClickLocation={onMapClickLocation} 
        />

        <MapUpdater 
          pickupLat={pickupLat} 
          pickupLng={pickupLng} 
          dropoffLat={dropoffLat} 
          dropoffLng={dropoffLng} 
          driverLat={effectiveAssignedLat}
          driverLng={effectiveAssignedLng}
          tripStatus={tripStatus}
          focusedDriverCoords={focusedDriverCoords}
        />

        <MapNavigationControls centerLat={centerLat} centerLng={centerLng} />

        {routeCoordinates.length > 0 && (
          <Polyline positions={routeCoordinates} color={polylineColor} weight={5} lineCap="round" lineJoin="round" />
        )}

        {/* Pickup marker */}
        {pickupLat && pickupLng && (
          <Marker position={[pickupLat, pickupLng]} icon={pickupIcon}>
            <Popup>
              <div className="text-xs font-bold p-1">Pickup Location</div>
            </Popup>
          </Marker>
        )}

        {/* Dropoff marker */}
        {dropoffLat && dropoffLng && (
          <Marker position={[dropoffLat, dropoffLng]} icon={dropoffIcon}>
            <Popup>
              <div className="text-xs font-bold p-1">Destination</div>
            </Popup>
          </Marker>
        )}

        {/* Available nearby roaming drivers */}
        {availableDrivers.map((driver) => {
          // If this driver is the currently assigned driver, skip here (rendered separately with assigned styling)
          if (effectiveAssignedLat !== undefined && effectiveAssignedLng !== undefined && Math.abs(driver.lat - effectiveAssignedLat) < 0.0001 && Math.abs(driver.lng - effectiveAssignedLng) < 0.0001) {
            return null;
          }
          const vehicleTitle = driver.vehicle || [driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' ') || 'Registered Vehicle';
          const vehicleSub = [driver.vehicleColor, driver.vehicleYear].filter(Boolean).join(' • ');

          return (
            <Marker 
              key={driver.id} 
              position={[driver.lat, driver.lng]} 
              icon={createAvailableCarIcon(vehicleTitle)}
              zIndexOffset={500}
            >
              <Popup>
                <div className="p-1 font-sans text-xs min-w-[210px]">
                  {/* Driver Header */}
                  <div className="flex items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-1.5 mb-1.5">
                    <div>
                      <div className="font-bold text-gray-900 dark:text-white text-sm">{driver.name || 'Registered Driver'}</div>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                        <span>✓</span>
                        <span>Verified SOLO Driver</span>
                      </div>
                    </div>
                    <div className="text-amber-500 font-bold flex items-center gap-0.5 text-xs whitespace-nowrap bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-full">
                      <span>★</span>
                      <span>{driver.rating ? driver.rating.toFixed(1) : '5.0'}</span>
                      {driver.ratingCount ? <span className="text-[10px] text-gray-400 font-normal">({driver.ratingCount})</span> : null}
                    </div>
                  </div>

                  {/* Vehicle Information */}
                  <div className="space-y-1 mb-2">
                    <div className="flex items-center gap-1.5 text-gray-800 dark:text-gray-200 font-semibold text-xs">
                      <span className="text-sm">🚗</span>
                      <span>{vehicleTitle}</span>
                    </div>
                    {vehicleSub && (
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 pl-5">
                        {vehicleSub}
                      </div>
                    )}
                    {driver.licensePlate && (
                      <div className="pl-5 pt-0.5">
                        <span className="font-mono font-bold text-[10px] bg-amber-300 text-black px-1.5 py-0.5 rounded border border-black/50 uppercase tracking-wider inline-flex items-center gap-1 shadow-xs">
                          <span>🇿🇦</span>
                          <span>{driver.licensePlate}</span>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Drive Distance & Live Telematics */}
                  <div className="pt-1.5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-[11px]">
                    {driver.distanceKm !== undefined ? (
                      <div className="text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
                        <span>📍</span>
                        <span>{driver.distanceKm.toFixed(1)} km away</span>
                        {driver.etaMinutes !== undefined && (
                          <span className="text-gray-500 dark:text-gray-400 font-normal">• ~{driver.etaMinutes} min</span>
                        )}
                      </div>
                    ) : (
                      <div className="text-emerald-600 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                        Available Now
                      </div>
                    )}
                    {driver.distanceKm !== undefined && (
                      <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-1 rounded">
                        Online
                      </span>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Assigned driver marker (active ride) */}
        {effectiveAssignedLat && effectiveAssignedLng && (
          <Marker 
            position={[effectiveAssignedLat, effectiveAssignedLng]} 
            icon={createAssignedDriverIcon(assignedDriver?.name)} 
            zIndexOffset={1000}
          >
            <Popup>
              <div className="p-1 font-sans text-xs">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-bold text-blue-600">{assignedDriver?.name || 'Your Assigned Driver'}</div>
                  <div className="text-amber-500 font-bold flex items-center gap-0.5 text-[11px] whitespace-nowrap">
                    <span>★</span>
                    <span>{assignedDriver?.rating ? assignedDriver.rating.toFixed(1) : '5.0'}</span>
                  </div>
                </div>
                {assignedDriver?.vehicle && <div className="text-gray-700 dark:text-gray-200 font-semibold mt-0.5">{assignedDriver.vehicle}</div>}
                {assignedDriver?.licensePlate && (
                  <div className="mt-1">
                    <span className="font-mono font-bold text-[10px] bg-amber-300 text-black px-1.5 py-0.5 rounded border border-black/40 uppercase tracking-wider inline-flex items-center gap-1 shadow-xs">
                      <span>🇿🇦</span>
                      <span>{assignedDriver.licensePlate}</span>
                    </span>
                  </div>
                )}
                <div className="text-blue-500 font-semibold mt-1">En route to your location</div>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};

export default MapComponent;

