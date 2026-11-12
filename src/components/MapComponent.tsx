"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Plus, Minus, Crosshair, Compass } from 'lucide-react';
import { getRouteDirections, getMapLibreStyle, OSM_MAPLIBRE_STYLE } from '@/utils/mapService';
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
  stops?: {
    id?: string;
    lat: number;
    lng: number;
    address?: string;
    completed?: boolean;
  }[];
}

// Marker HTML generator functions
const createCustomMarkerHtml = (text: string, bgColor: string, textColor: string, isPulsing: boolean = false) => {
  return `
    <div style="display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.35)); pointer-events: auto; cursor: pointer; transform: translate3d(0,0,0); transition: transform 0.15s ease;">
      <div style="background-color: ${bgColor}; color: ${textColor}; padding: 4px 11px; border-radius: 9999px; border: 2px solid #ffffff; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap; line-height: 1.2; box-shadow: 0 2px 6px rgba(0,0,0,0.25);">
        ${text}
      </div>
      <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 7px solid ${bgColor}; margin-top: -1px;"></div>
      ${isPulsing ? `<div style="width: 8px; height: 8px; background-color: ${bgColor}; border: 1.5px solid #ffffff; border-radius: 9999px; margin-top: 1px; box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.45); animation: soloPulse 1.8s infinite;"></div>` : ''}
    </div>
  `;
};

const createAvailableCarMarkerHtml = (vehicleName?: string) => {
  const shortVehicle = vehicleName ? vehicleName.split(' ').slice(0, 2).join(' ') : '';
  return `
    <div style="display:flex; flex-direction:column; align-items:center; cursor:pointer; transform: translate3d(0,0,0); transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);">
      <div style="background-color:#0f172a; color:#ffffff; width:36px; height:36px; border-radius:9999px; display:flex; align-items:center; justify-content:center; box-shadow:0 6px 16px rgba(0,0,0,0.35); border:2.5px solid #ffffff; position:relative;">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
          <circle cx="7" cy="17" r="2"/>
          <path d="M9 17h6"/>
          <circle cx="17" cy="17" r="2"/>
        </svg>
        <div style="position:absolute; bottom:-1px; right:-1px; width:10px; height:10px; background-color:#22c55e; border:2px solid #ffffff; border-radius:9999px; box-shadow:0 0 4px rgba(34,197,94,0.6);"></div>
      </div>
      ${shortVehicle ? `<span style="background-color:rgba(15,23,42,0.92); color:#ffffff; font-size:9.5px; font-weight:700; padding:1.5px 6px; border-radius:6px; margin-top:3px; white-space:nowrap; box-shadow:0 2px 4px rgba(0,0,0,0.25); border: 0.5px solid rgba(255,255,255,0.15);">${shortVehicle}</span>` : ''}
    </div>
  `;
};

const createAssignedDriverMarkerHtml = (driverName?: string) => {
  return `
    <div style="display:flex; flex-direction:column; align-items:center; cursor:pointer; transform: translate3d(0,0,0);">
      <span style="background-color:#2563eb; color:#ffffff; font-size:10px; font-weight:800; padding:2.5px 9px; border-radius:9999px; margin-bottom:3px; white-space:nowrap; box-shadow:0 4px 12px rgba(37,99,235,0.45); border:1.5px solid #ffffff; text-transform:uppercase; letter-spacing:0.5px;">
        ${driverName || 'Your Driver'}
      </span>
      <div style="background-color:#2563eb; color:#ffffff; width:40px; height:40px; border-radius:9999px; display:flex; align-items:center; justify-content:center; box-shadow:0 8px 20px rgba(37,99,235,0.5); border:3px solid #ffffff; position:relative;">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
          <circle cx="7" cy="17" r="2"/>
          <path d="M9 17h6"/>
          <circle cx="17" cy="17" r="2"/>
        </svg>
      </div>
    </div>
  `;
};

const createDriverPopupHtml = (driver: DriverMarkerData) => {
  const vehicleTitle = driver.vehicle || [driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' ') || 'Registered Vehicle';
  const vehicleSub = [driver.vehicleColor, driver.vehicleYear].filter(Boolean).join(' • ');

  return `
    <div style="padding: 4px; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; min-width: 215px; color: #111827;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #f3f4f6; padding-bottom: 6px; margin-bottom: 6px;">
        <div>
          <div style="font-weight: 800; font-size: 13px; color: #111827;">${driver.name || 'Registered Driver'}</div>
          <div style="font-size: 10px; color: #059669; font-weight: 700; display: flex; align-items: center; gap: 4px;">
            <span>✓</span><span>Verified SOLO Driver</span>
          </div>
        </div>
        <div style="color: #d97706; font-weight: 800; font-size: 12px; display: flex; align-items: center; gap: 2px; background-color: #fef3c7; padding: 2px 7px; border-radius: 9999px;">
          <span>★</span><span>${driver.rating ? driver.rating.toFixed(1) : '5.0'}</span>
          ${driver.ratingCount ? `<span style="font-size: 9.5px; color: #6b7280; font-weight: 500;">(${driver.ratingCount})</span>` : ''}
        </div>
      </div>
      <div style="margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 12px; color: #1f2937;">
          <span>🚗</span><span>${vehicleTitle}</span>
        </div>
        ${vehicleSub ? `<div style="font-size: 10px; color: #6b7280; padding-left: 20px;">${vehicleSub}</div>` : ''}
        ${driver.licensePlate ? `
          <div style="padding-left: 20px; padding-top: 3px;">
            <span style="font-family: monospace; font-weight: 800; font-size: 10px; background-color: #fde047; color: #000000; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 4px;">
              <span>🇿🇦</span><span>${driver.licensePlate}</span>
            </span>
          </div>
        ` : ''}
      </div>
      <div style="padding-top: 6px; border-top: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
        ${driver.distanceKm !== undefined ? `
          <div style="color: #2563eb; font-weight: 700; display: flex; align-items: center; gap: 4px;">
            <span>📍</span><span>${driver.distanceKm.toFixed(1)} km away</span>
            ${driver.etaMinutes !== undefined ? `<span style="color: #6b7280; font-weight: 500;">• ~${driver.etaMinutes} min</span>` : ''}
          </div>
          <span style="font-size: 10px; color: #059669; font-weight: 800; background-color: #d1fae5; padding: 1px 6px; border-radius: 4px;">Online</span>
        ` : `
          <div style="color: #059669; font-weight: 800; display: flex; align-items: center; gap: 5px;">
            <span style="width: 6px; height: 6px; border-radius: 9999px; background-color: #10b981; display: inline-block;"></span>
            Available Now
          </div>
        `}
      </div>
    </div>
  `;
};

const createAssignedDriverPopupHtml = (name?: string, vehicle?: string, plate?: string, rating?: number) => {
  return `
    <div style="padding: 4px; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; min-width: 190px; color: #111827;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
        <div style="font-weight: 800; color: #2563eb; font-size: 13px;">${name || 'Your Assigned Driver'}</div>
        <div style="color: #d97706; font-weight: 800; font-size: 11px; display: flex; align-items: center; gap: 2px;">
          <span>★</span><span>${rating ? rating.toFixed(1) : '5.0'}</span>
        </div>
      </div>
      ${vehicle ? `<div style="color: #374151; font-weight: 700; margin-top: 3px; font-size: 11.5px;">${vehicle}</div>` : ''}
      ${plate ? `
        <div style="margin-top: 4px;">
          <span style="font-family: monospace; font-weight: 800; font-size: 10px; background-color: #fde047; color: #000000; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.4); text-transform: uppercase; letter-spacing: 0.5px; display: inline-flex; align-items: center; gap: 4px;">
            <span>🇿🇦</span><span>${plate}</span>
          </span>
        </div>
      ` : ''}
      <div style="color: #2563eb; font-weight: 700; font-size: 11px; margin-top: 6px;">En route to your location</div>
    </div>
  `;
};

// Coordinate sanity helper
const isValidCoord = (lat?: number | null, lng?: number | null) =>
  typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng) && Math.abs(lat) > 1 && Math.abs(lng) > 1;

export const MapComponent: React.FC<MapProps> = ({
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
  stops = [],
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const isMapLoadedRef = useRef<boolean>(false);

  // Fallback to openstreetmap.org raster tiles on tileerror
  const [useOsmFallback, setUseOsmFallback] = useState<boolean>(false);
  const [mapInitError, setMapInitError] = useState<boolean>(false);

  // Markers references
  const pickupMarkerRef = useRef<maplibregl.Marker | null>(null);
  const dropoffMarkerRef = useRef<maplibregl.Marker | null>(null);
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);
  const driverMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const assignedDriverMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Interaction & camera tracking refs
  const prevFocusedRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevStatusRef = useRef<string | undefined>(undefined);
  const prevRouteKeyRef = useRef<string>('');
  const initialCenteredRef = useRef<boolean>(false);
  const userInteractedRef = useRef<boolean>(false);

  // 3D Pitch state for manual toggle
  const [is3DMode, setIs3DMode] = useState<boolean>(false);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);

  // Theme resolution
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Effective driver coords
  const effectiveAssignedLat = assignedDriver?.lat || driverLat;
  const effectiveAssignedLng = assignedDriver?.lng || driverLng;

  const centerLat = pickupLat || effectiveAssignedLat || -28.7282;
  const centerLng = pickupLng || effectiveAssignedLng || 24.7623;

  // Polyline colors
  const polylineColor = tripStatus === 'accepted' ? '#10b981' : '#3b82f6';
  const casingColor = tripStatus === 'accepted' ? '#064e3b' : '#1e3a8a';

  // -------------------------------------------------------------
  // Route Layer Helper
  // -------------------------------------------------------------
  const updateRouteOnMap = useCallback((map: maplibregl.Map, coords: [number, number][], mainColor: string, casing: string) => {
    if (!map || !map.isStyleLoaded()) return;

    // Route coordinates come as [lat, lng] from mapService, convert to GeoJSON [lng, lat]
    const geojsonCoords = coords.map(([lat, lng]) => [lng, lat]);

    const routeGeoJSON: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: geojsonCoords,
      },
    };

    const source = map.getSource('solo-route-source') as maplibregl.GeoJSONSource | undefined;

    if (source) {
      source.setData(routeGeoJSON);
      if (map.getLayer('solo-route-line')) {
        map.setPaintProperty('solo-route-line', 'line-color', mainColor);
      }
      if (map.getLayer('solo-route-casing')) {
        map.setPaintProperty('solo-route-casing', 'line-color', casing);
      }
    } else {
      try {
        map.addSource('solo-route-source', {
          type: 'geojson',
          data: routeGeoJSON,
        });

        // Outer Casing for elevation and contrast
        map.addLayer({
          id: 'solo-route-casing',
          type: 'line',
          source: 'solo-route-source',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': casing,
            'line-width': 8,
            'line-opacity': 0.7,
          },
        });

        // Main Route Polyline
        map.addLayer({
          id: 'solo-route-line',
          type: 'line',
          source: 'solo-route-source',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': mainColor,
            'line-width': 5,
            'line-opacity': 0.95,
          },
        });
      } catch (err) {
        console.warn('Notice adding route layers to map:', err);
      }
    }
  }, []);

  // -------------------------------------------------------------
  // Initialize Map
  // -------------------------------------------------------------
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialPitch = tripStatus === 'accepted' || tripStatus === 'in_progress' ? 45 : 0;
    setIs3DMode(initialPitch > 0);

    const styleConfig = useOsmFallback ? { style: OSM_MAPLIBRE_STYLE, isMapbox: false } : getMapLibreStyle(isDark);

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: styleConfig.style,
        center: [centerLng, centerLat],
        zoom: 14,
        minZoom: 3,
        maxZoom: 19,
        pitch: initialPitch,
        bearing: 0,
        attributionControl: false,
      });
    } catch (primaryErr) {
      console.warn('MapLibre primary initialization notice, attempting OSM fallback:', primaryErr);
      try {
        map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: OSM_MAPLIBRE_STYLE,
          center: [centerLng, centerLat],
          zoom: 14,
          minZoom: 3,
          maxZoom: 19,
          pitch: 0,
          bearing: 0,
          attributionControl: false,
        });
      } catch (fallbackErr) {
        console.error('Fatal: Failed to initialize WebGL map:', fallbackErr);
        setMapInitError(true);
        return;
      }
    }

    // Add compact attribution at bottom-left
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    // Invalidate map size on viewport or visibility changes (map.invalidateSize() equivalent)
    const invalidateSize = () => {
      // map.invalidateSize() compatibility call for modern WebGL map canvas
      if (map) {
        map.resize();
      }
    };

    map.on('load', () => {
      isMapLoadedRef.current = true;
      invalidateSize();
    });

    // Handle tileerror or style load failure by falling back to openstreetmap.org
    map.on('error', (e) => {
      const isTileOrStyleError =
        e?.error?.message?.includes('style') ||
        e?.error?.message?.includes('tile') ||
        (e as any)?.status === 401 ||
        (e as any)?.status === 403;

      if (isTileOrStyleError && !useOsmFallback) {
        console.warn('Mapbox tileerror detected; switching seamlessly to openstreetmap.org fallback tiles.', e);
        setUseOsmFallback(true);
        try {
          if (map.isStyleLoaded()) {
            map.setStyle(OSM_MAPLIBRE_STYLE);
          }
        } catch (styleErr) {
          console.error('openstreetmap.org fallback style application error', styleErr);
        }
      }
    });

    // Track user manual interaction (drag, pinch, tilt)
    map.on('movestart', (e) => {
      if (e.originalEvent) {
        userInteractedRef.current = true;
      }
    });

    // Map Click for location picking
    map.on('click', (e) => {
      if (onMapClickLocation) {
        onMapClickLocation(e.lngLat.lat, e.lngLat.lng);
      }
    });

    mapRef.current = map;

    // Handle container resize & orientation
    const container = mapContainerRef.current;
    let ro: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        invalidateSize();
      });
      ro.observe(container);
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        invalidateSize();
      }
    };
    const handleOrientationChange = () => {
      invalidateSize();
    };
    const handleWindowResize = () => {
      invalidateSize();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      if (ro) ro.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('orientationchange', handleOrientationChange);

      // Clean up all markers
      if (pickupMarkerRef.current) pickupMarkerRef.current.remove();
      if (dropoffMarkerRef.current) dropoffMarkerRef.current.remove();
      stopMarkersRef.current.forEach((m) => m.remove());
      stopMarkersRef.current = [];
      driverMarkersRef.current.forEach((m) => m.remove());
      driverMarkersRef.current.clear();
      if (assignedDriverMarkerRef.current) assignedDriverMarkerRef.current.remove();

      map.remove();
      mapRef.current = null;
      isMapLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------
  // Theme updates (Dark/Light mode tile swapping)
  // -------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoadedRef.current) return;

    const styleConfig = useOsmFallback ? { style: OSM_MAPLIBRE_STYLE, isMapbox: false } : getMapLibreStyle(isDark);
    try {
      map.setStyle(styleConfig.style);

      // When the new style finishes loading, re-add the route layers
      map.once('style.load', () => {
        if (routeCoordinates.length > 0) {
          updateRouteOnMap(map, routeCoordinates, polylineColor, casingColor);
        }
      });
    } catch (e) {
      console.warn('Notice updating map style:', e);
    }
  }, [isDark, useOsmFallback, polylineColor, casingColor, routeCoordinates, updateRouteOnMap]);

  // -------------------------------------------------------------
  // Routing calculation
  // -------------------------------------------------------------
  useEffect(() => {
    let originLat: number | undefined;
    let originLng: number | undefined;
    let destLat: number | undefined;
    let destLng: number | undefined;
    let waypoints: { lat: number; lng: number }[] = [];

    if (tripStatus === 'accepted' && effectiveAssignedLat && effectiveAssignedLng && pickupLat && pickupLng) {
      originLat = effectiveAssignedLat;
      originLng = effectiveAssignedLng;
      destLat = pickupLat;
      destLng = pickupLng;
      waypoints = [];
    } else if (tripStatus === 'in_progress' && effectiveAssignedLat && effectiveAssignedLng && dropoffLat && dropoffLng) {
      originLat = effectiveAssignedLat;
      originLng = effectiveAssignedLng;
      destLat = dropoffLat;
      destLng = dropoffLng;
      waypoints = stops
        .filter((s) => !s.completed && typeof s.lat === 'number' && typeof s.lng === 'number')
        .map((s) => ({ lat: s.lat, lng: s.lng }));
    } else if (pickupLat && pickupLng && dropoffLat && dropoffLng) {
      originLat = pickupLat;
      originLng = pickupLng;
      destLat = dropoffLat;
      destLng = dropoffLng;
      waypoints = stops
        .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number')
        .map((s) => ({ lat: s.lat, lng: s.lng }));
    }

    if (originLat !== undefined && originLng !== undefined && destLat !== undefined && destLng !== undefined) {
      const getRoute = async () => {
        try {
          const details = await getRouteDirections(originLng!, originLat!, destLng!, destLat!, waypoints);
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
      const map = mapRef.current;
      if (map && map.isStyleLoaded()) {
        const source = map.getSource('solo-route-source') as maplibregl.GeoJSONSource | undefined;
        if (source) {
          source.setData({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: [] },
          });
        }
      }
    }
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng, effectiveAssignedLat, effectiveAssignedLng, tripStatus, JSON.stringify(stops)]);

  // -------------------------------------------------------------
  // Render Route on Map whenever routeCoordinates update
  // -------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.isStyleLoaded()) {
      updateRouteOnMap(map, routeCoordinates, polylineColor, casingColor);
    } else {
      map.once('load', () => {
        updateRouteOnMap(map, routeCoordinates, polylineColor, casingColor);
      });
    }
  }, [routeCoordinates, polylineColor, casingColor, updateRouteOnMap]);

  // -------------------------------------------------------------
  // Pickup Marker
  // -------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (isValidCoord(pickupLat, pickupLng)) {
      if (!pickupMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'solo-pickup-marker';
        el.innerHTML = createCustomMarkerHtml('Pickup (A)', '#111827', '#ffffff', true);

        const popup = new maplibregl.Popup({ offset: [0, -36], closeButton: false }).setHTML(
          '<div style="font-size:12px; font-weight:800; padding:3px 6px; font-family:sans-serif;">Pickup Location</div>'
        );

        pickupMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([pickupLng!, pickupLat!])
          .setPopup(popup)
          .addTo(map);
      } else {
        pickupMarkerRef.current.setLngLat([pickupLng!, pickupLat!]);
      }
    } else if (pickupMarkerRef.current) {
      pickupMarkerRef.current.remove();
      pickupMarkerRef.current = null;
    }
  }, [pickupLat, pickupLng]);

  // -------------------------------------------------------------
  // Dropoff Marker
  // -------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (isValidCoord(dropoffLat, dropoffLng)) {
      if (!dropoffMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'solo-dropoff-marker';
        el.innerHTML = createCustomMarkerHtml('Dropoff (B)', '#2563eb', '#ffffff', false);

        const popup = new maplibregl.Popup({ offset: [0, -36], closeButton: false }).setHTML(
          '<div style="font-size:12px; font-weight:800; padding:3px 6px; font-family:sans-serif;">Destination</div>'
        );

        dropoffMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([dropoffLng!, dropoffLat!])
          .setPopup(popup)
          .addTo(map);
      } else {
        dropoffMarkerRef.current.setLngLat([dropoffLng!, dropoffLat!]);
      }
    } else if (dropoffMarkerRef.current) {
      dropoffMarkerRef.current.remove();
      dropoffMarkerRef.current = null;
    }
  }, [dropoffLat, dropoffLng]);

  // -------------------------------------------------------------
  // Intermediate Stops Markers
  // -------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing stop markers
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];

    stops.forEach((stop, idx) => {
      if (!isValidCoord(stop.lat, stop.lng)) return;

      const el = document.createElement('div');
      el.className = 'solo-stop-marker';
      el.innerHTML = createCustomMarkerHtml(
        stop.completed ? `✓ Stop ${idx + 1}` : `Stop ${idx + 1}`,
        stop.completed ? '#10b981' : '#d97706',
        '#ffffff',
        false
      );

      const popupHtml = `
        <div style="font-size:12px; font-family:sans-serif; padding:4px;">
          <div style="font-weight:800;">Stop ${idx + 1}</div>
          ${stop.address ? `<div style="font-size:11px; color:#4b5563; margin-top:2px;">${stop.address}</div>` : ''}
        </div>
      `;
      const popup = new maplibregl.Popup({ offset: [0, -36], closeButton: false }).setHTML(popupHtml);

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([stop.lng, stop.lat])
        .setPopup(popup)
        .addTo(map);

      stopMarkersRef.current.push(marker);
    });
  }, [stops]);

  // -------------------------------------------------------------
  // Available Roaming Drivers Markers
  // -------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentDriverMap = driverMarkersRef.current;
    const activeDriverIds = new Set<string>();

    availableDrivers.forEach((driver) => {
      // If this driver is the currently assigned driver, skip here (rendered separately with assigned styling)
      if (
        effectiveAssignedLat !== undefined &&
        effectiveAssignedLng !== undefined &&
        Math.abs(driver.lat - effectiveAssignedLat) < 0.0001 &&
        Math.abs(driver.lng - effectiveAssignedLng) < 0.0001
      ) {
        return;
      }

      if (!isValidCoord(driver.lat, driver.lng)) return;

      activeDriverIds.add(driver.id);
      const vehicleTitle = driver.vehicle || [driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' ') || 'Registered Vehicle';

      let marker = currentDriverMap.get(driver.id);

      if (!marker) {
        const el = document.createElement('div');
        el.className = 'solo-roaming-driver-marker';
        el.innerHTML = createAvailableCarMarkerHtml(vehicleTitle);

        const popup = new maplibregl.Popup({
          offset: [0, -22],
          closeButton: true,
          closeOnClick: false,
          maxWidth: '300px',
        }).setHTML(createDriverPopupHtml(driver));

        marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([driver.lng, driver.lat])
          .setPopup(popup)
          .addTo(map);

        currentDriverMap.set(driver.id, marker);
      } else {
        // Smoothly update location
        marker.setLngLat([driver.lng, driver.lat]);
        const popup = marker.getPopup();
        if (popup) {
          popup.setHTML(createDriverPopupHtml(driver));
        }
      }
    });

    // Remove stale drivers
    currentDriverMap.forEach((marker, id) => {
      if (!activeDriverIds.has(id)) {
        marker.remove();
        currentDriverMap.delete(id);
      }
    });
  }, [availableDrivers, effectiveAssignedLat, effectiveAssignedLng]);

  // -------------------------------------------------------------
  // Assigned Driver Marker (Active Trip)
  // -------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (isValidCoord(effectiveAssignedLat, effectiveAssignedLng)) {
      if (!assignedDriverMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'solo-assigned-driver-marker';
        el.innerHTML = createAssignedDriverMarkerHtml(assignedDriver?.name);

        const popup = new maplibregl.Popup({
          offset: [0, -28],
          closeButton: true,
          closeOnClick: false,
          maxWidth: '280px',
        }).setHTML(
          createAssignedDriverPopupHtml(
            assignedDriver?.name,
            assignedDriver?.vehicle,
            assignedDriver?.licensePlate,
            assignedDriver?.rating
          )
        );

        assignedDriverMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([effectiveAssignedLng!, effectiveAssignedLat!])
          .setPopup(popup)
          .addTo(map);
      } else {
        assignedDriverMarkerRef.current.setLngLat([effectiveAssignedLng!, effectiveAssignedLat!]);
        const popup = assignedDriverMarkerRef.current.getPopup();
        if (popup) {
          popup.setHTML(
            createAssignedDriverPopupHtml(
              assignedDriver?.name,
              assignedDriver?.vehicle,
              assignedDriver?.licensePlate,
              assignedDriver?.rating
            )
          );
        }
      }
    } else if (assignedDriverMarkerRef.current) {
      assignedDriverMarkerRef.current.remove();
      assignedDriverMarkerRef.current = null;
    }
  }, [effectiveAssignedLat, effectiveAssignedLng, assignedDriver]);

  // -------------------------------------------------------------
  // Camera & Bounds Synchronization
  // -------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const hasValidPickup = isValidCoord(pickupLat, pickupLng);
    const hasValidDropoff = isValidCoord(dropoffLat, dropoffLng);
    const hasValidDriver = isValidCoord(effectiveAssignedLat, effectiveAssignedLng);
    const hasValidFocusedDriver = isValidCoord(focusedDriverCoords?.lat, focusedDriverCoords?.lng);
    const validStops = Array.isArray(stops) ? stops.filter((s) => isValidCoord(s.lat, s.lng)) : [];

    // 1. Focused driver tapped
    if (hasValidFocusedDriver) {
      const isNewFocus =
        !prevFocusedRef.current ||
        prevFocusedRef.current.lat !== focusedDriverCoords!.lat ||
        prevFocusedRef.current.lng !== focusedDriverCoords!.lng;

      if (isNewFocus) {
        prevFocusedRef.current = { lat: focusedDriverCoords!.lat, lng: focusedDriverCoords!.lng };
        userInteractedRef.current = false;
        map.flyTo({
          center: [focusedDriverCoords!.lng, focusedDriverCoords!.lat],
          zoom: 16,
          speed: 1.2,
          curve: 1.4,
          essential: true,
        });
        return;
      }
    } else {
      prevFocusedRef.current = null;
    }

    const stopsKey = validStops.map((s) => `${s.lat},${s.lng}`).join('|');
    const routeKey = `${pickupLat},${pickupLng}->${stopsKey}->${dropoffLat},${dropoffLng}`;
    const isNewRoute = routeKey !== prevRouteKeyRef.current;
    const isNewStatus = tripStatus !== prevStatusRef.current;

    // 2. Trip status changed (e.g. accepted, arrived, in_progress)
    if (isNewStatus && tripStatus) {
      prevStatusRef.current = tripStatus;
      userInteractedRef.current = false;

      if (tripStatus === 'accepted' && hasValidDriver && hasValidPickup) {
        const bounds = new maplibregl.LngLatBounds();
        bounds.extend([effectiveAssignedLng!, effectiveAssignedLat!]);
        bounds.extend([pickupLng!, pickupLat!]);
        map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 1200, pitch: 45 });
        setIs3DMode(true);
        return;
      }

      if (tripStatus === 'in_progress' && hasValidDriver && hasValidDropoff) {
        const bounds = new maplibregl.LngLatBounds();
        bounds.extend([effectiveAssignedLng!, effectiveAssignedLat!]);
        bounds.extend([dropoffLng!, dropoffLat!]);
        validStops.forEach((s) => bounds.extend([s.lng, s.lat]));
        map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 1200, pitch: 50 });
        setIs3DMode(true);
        return;
      }

      if (tripStatus === 'arrived' && hasValidPickup) {
        map.flyTo({ center: [pickupLng!, pickupLat!], zoom: 16, duration: 1000, pitch: 30 });
        return;
      }
    }

    // 3. Route changed
    if (isNewRoute && (hasValidPickup || hasValidDropoff)) {
      prevRouteKeyRef.current = routeKey;
      userInteractedRef.current = false;

      if (hasValidPickup && hasValidDropoff) {
        const bounds = new maplibregl.LngLatBounds();
        bounds.extend([pickupLng!, pickupLat!]);
        bounds.extend([dropoffLng!, dropoffLat!]);
        validStops.forEach((s) => bounds.extend([s.lng, s.lat]));
        map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 1000 });
        return;
      } else if (hasValidPickup) {
        map.flyTo({ center: [pickupLng!, pickupLat!], zoom: 15, duration: 800 });
        return;
      } else if (hasValidDropoff) {
        map.flyTo({ center: [dropoffLng!, dropoffLat!], zoom: 15, duration: 800 });
        return;
      }
    }

    // 4. Initial center on first load
    if (!initialCenteredRef.current) {
      if (hasValidPickup && hasValidDropoff) {
        const bounds = new maplibregl.LngLatBounds();
        bounds.extend([pickupLng!, pickupLat!]);
        bounds.extend([dropoffLng!, dropoffLat!]);
        validStops.forEach((s) => bounds.extend([s.lng, s.lat]));
        map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 800 });
        initialCenteredRef.current = true;
      } else if (hasValidPickup) {
        map.jumpTo({ center: [pickupLng!, pickupLat!], zoom: 15 });
        initialCenteredRef.current = true;
      } else if (hasValidDriver) {
        map.jumpTo({ center: [effectiveAssignedLng!, effectiveAssignedLat!], zoom: 15 });
        initialCenteredRef.current = true;
      } else {
        map.jumpTo({ center: [centerLng, centerLat], zoom: 14 });
        initialCenteredRef.current = true;
      }
      return;
    }

    // 5. Background GPS updates (follow driver without breaking zoom)
    if (hasValidDriver && !userInteractedRef.current && !tripStatus) {
      map.panTo([effectiveAssignedLng!, effectiveAssignedLat!], { duration: 800 });
    }
  }, [
    pickupLat,
    pickupLng,
    dropoffLat,
    dropoffLng,
    effectiveAssignedLat,
    effectiveAssignedLng,
    tripStatus,
    focusedDriverCoords,
    centerLat,
    centerLng,
    JSON.stringify(stops),
  ]);

  // -------------------------------------------------------------
  // Map Navigation Actions
  // -------------------------------------------------------------
  const handleZoomIn = () => {
    mapRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapRef.current?.zoomOut();
  };

  const handleRecenter = () => {
    userInteractedRef.current = false;
    mapRef.current?.flyTo({
      center: [centerLng, centerLat],
      zoom: 15,
      pitch: is3DMode ? 45 : 0,
      bearing: 0,
      duration: 1000,
    });
  };

  const handleToggle3D = () => {
    const map = mapRef.current;
    if (!map) return;
    const next3D = !is3DMode;
    setIs3DMode(next3D);
    map.easeTo({
      pitch: next3D ? 50 : 0,
      duration: 800,
    });
  };

  const handleResetNorth = () => {
    mapRef.current?.easeTo({
      bearing: 0,
      duration: 600,
    });
  };

  return (
    <div
      className={`w-full h-full relative z-0 select-none touch-pan-x touch-pan-y ${isPickingOnMap ? 'cursor-crosshair' : ''}`}
      // tap={false} ensures legacy 300ms tap emulation is disabled for smooth native touch interaction
      data-tap="false"
      style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
    >
      {/* Pulse keyframe injection and popup styling */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes soloPulse {
              0% {
                box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.6);
              }
              70% {
                box-shadow: 0 0 0 10px rgba(37, 99, 235, 0);
              }
              100% {
                box-shadow: 0 0 0 0 rgba(37, 99, 235, 0);
              }
            }
            .maplibregl-popup-content {
              border-radius: 16px !important;
              padding: 10px 12px !important;
              box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
              border: 1px solid rgba(255, 255, 255, 0.8) !important;
            }
            .dark .maplibregl-popup-content {
              background-color: #18181b !important;
              color: #f4f4f5 !important;
              border: 1px solid rgba(255, 255, 255, 0.1) !important;
            }
            .dark .maplibregl-popup-tip {
              border-top-color: #18181b !important;
            }
          `,
        }}
      />

      {/* Map Container */}
      <div
        ref={mapContainerRef}
        className="w-full h-full"
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      />

      {/* Fallback recovery overlay if WebGL fails on unsupported hardware */}
      {mapInitError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-gray-100 dark:bg-zinc-900 text-gray-700 dark:text-gray-200 p-6 text-center">
          <p className="font-bold text-sm mb-3">Map display encountered a hardware acceleration error.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md"
          >
            Reload Map
          </button>
        </div>
      )}

      {/* Floating Glassmorphic Map Navigation Controls */}
      <div
        className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 md:top-24 md:translate-y-0 md:right-5 z-20 pointer-events-auto flex flex-col gap-2 select-none"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleZoomIn}
          aria-label="Zoom In"
          title="Zoom In"
          className="w-11 h-11 sm:w-10 sm:h-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md text-gray-800 dark:text-gray-100 rounded-2xl sm:rounded-xl flex items-center justify-center font-bold hover:bg-gray-100 dark:hover:bg-zinc-800 active:scale-95 transition-all border border-gray-200/80 dark:border-white/10 shadow-lg cursor-pointer touch-manipulation"
        >
          <Plus size={20} className="stroke-[2.5]" />
        </button>

        <button
          type="button"
          onClick={handleZoomOut}
          aria-label="Zoom Out"
          title="Zoom Out"
          className="w-11 h-11 sm:w-10 sm:h-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md text-gray-800 dark:text-gray-100 rounded-2xl sm:rounded-xl flex items-center justify-center font-bold hover:bg-gray-100 dark:hover:bg-zinc-800 active:scale-95 transition-all border border-gray-200/80 dark:border-white/10 shadow-lg cursor-pointer touch-manipulation"
        >
          <Minus size={20} className="stroke-[2.5]" />
        </button>

        {/* 3D / 2D Perspective Toggle Button */}
        <button
          type="button"
          onClick={handleToggle3D}
          aria-label={is3DMode ? 'Switch to 2D' : 'Switch to 3D'}
          title={is3DMode ? 'Flat 2D View' : '3D Perspective View'}
          className={`w-11 h-11 sm:w-10 sm:h-10 backdrop-blur-md rounded-2xl sm:rounded-xl flex items-center justify-center font-black text-xs hover:bg-gray-100 dark:hover:bg-zinc-800 active:scale-95 transition-all border shadow-lg cursor-pointer touch-manipulation ${
            is3DMode
              ? 'bg-blue-600 text-white border-blue-500 shadow-blue-500/25'
              : 'bg-white/95 dark:bg-zinc-900/95 text-gray-800 dark:text-gray-100 border-gray-200/80 dark:border-white/10'
          }`}
        >
          <span className="leading-none">{is3DMode ? '3D' : '2D'}</span>
        </button>

        {/* Compass / Reset North Button */}
        <button
          type="button"
          onClick={handleResetNorth}
          aria-label="Reset North"
          title="Reset to North"
          className="w-11 h-11 sm:w-10 sm:h-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md text-gray-700 dark:text-gray-200 rounded-2xl sm:rounded-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-zinc-800 active:scale-95 transition-all border border-gray-200/80 dark:border-white/10 shadow-lg cursor-pointer touch-manipulation"
        >
          <Compass size={19} className="stroke-[2.2]" />
        </button>

        {/* Recenter Map Button */}
        <button
          type="button"
          onClick={handleRecenter}
          aria-label="Recenter Map"
          title="Recenter Map"
          className="w-11 h-11 sm:w-10 sm:h-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md text-blue-600 dark:text-blue-400 rounded-2xl sm:rounded-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-zinc-800 active:scale-95 transition-all border border-gray-200/80 dark:border-white/10 shadow-lg cursor-pointer touch-manipulation"
        >
          <Crosshair size={18} className="stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
};

export default MapComponent;
