"use client";

import React, { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { useTheme } from '@/components/ThemeProvider';
import { getRouteDirections, MAPBOX_TOKEN } from '@/utils/mapService';
import type { DriverMarkerData } from './MapComponent';

interface MapboxGLMapProps {
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
  onError?: (error: Error) => void;
}

export default function MapboxGLMap({
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
  onError,
}: MapboxGLMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const isLoadedRef = useRef(false);

  // Marker references to update positions without full re-render
  const pickupMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const assignedDriverMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const availableMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const effectiveAssignedLat = assignedDriver?.lat || driverLat;
  const effectiveAssignedLng = assignedDriver?.lng || driverLng;

  const centerLat = pickupLat || effectiveAssignedLat || -28.7282;
  const centerLng = pickupLng || effectiveAssignedLng || 24.7623;

  // Initialize Mapbox GL instance
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    if (!MAPBOX_TOKEN) {
      if (onError) onError(new Error('Mapbox access token is missing'));
      return;
    }

    try {
      mapboxgl.accessToken = MAPBOX_TOKEN;

      const styleUrl = isDark
        ? 'mapbox://styles/mapbox/navigation-night-v1'
        : 'mapbox://styles/mapbox/navigation-day-v1';

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: styleUrl,
        center: [centerLng, centerLat],
        zoom: 14,
        pitch: 35, // 3D perspective pitch
        bearing: 0,
        attributionControl: true,
      });

      // Add navigation controls (Zoom + Pitch/Bearing Compass)
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

      map.on('load', () => {
        isLoadedRef.current = true;

        // Add 3D Extruded Buildings Layer
        try {
          const layers = map.getStyle().layers;
          const labelLayerId = layers?.find(
            (l) => l.type === 'symbol' && l.layout && l.layout['text-field']
          )?.id;

          if (!map.getLayer('3d-buildings')) {
            map.addLayer(
              {
                id: '3d-buildings',
                source: 'composite',
                'source-layer': 'building',
                filter: ['==', 'extrude', 'true'],
                type: 'fill-extrusion',
                minzoom: 14,
                paint: {
                  'fill-extrusion-color': isDark ? '#1e293b' : '#cbd5e1',
                  'fill-extrusion-height': ['get', 'height'],
                  'fill-extrusion-base': ['get', 'min_height'],
                  'fill-extrusion-opacity': 0.65,
                },
              },
              labelLayerId
            );
          }
        } catch (e) {
          console.warn('3D building layer not supported on this style:', e);
        }

        // Initialize Route GeoJSON source
        if (!map.getSource('route-source')) {
          map.addSource('route-source', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: [],
              },
            },
          });

          // Outer casing
          map.addLayer({
            id: 'route-casing',
            type: 'line',
            source: 'route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': tripStatus === 'accepted' ? '#064e3b' : '#1e3a8a',
              'line-width': 8,
              'line-opacity': 0.7,
            },
          });

          // Inner vibrant line
          map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route-source',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color': tripStatus === 'accepted' ? '#10b981' : '#3b82f6',
              'line-width': 5,
              'line-opacity': 0.95,
            },
          });
        }
      });

      map.on('error', (e) => {
        console.error('Mapbox GL error:', e);
        if (onError) onError(e.error || new Error('Mapbox GL runtime error'));
      });

      mapRef.current = map;

      // Handle Map Click for Location Picking
      map.on('click', (e) => {
        if (onMapClickLocation) {
          onMapClickLocation(e.lngLat.lat, e.lngLat.lng);
        }
      });
    } catch (err: any) {
      console.error('Failed to initialize Mapbox GL:', err);
      if (onError) onError(err);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        isLoadedRef.current = false;
      }
    };
  }, []);

  // Update theme style if changed
  useEffect(() => {
    if (!mapRef.current || !isLoadedRef.current) return;
    const styleUrl = isDark
      ? 'mapbox://styles/mapbox/navigation-night-v1'
      : 'mapbox://styles/mapbox/navigation-day-v1';
    mapRef.current.setStyle(styleUrl);
  }, [isDark]);

  // Handle Container Resizing
  useEffect(() => {
    if (!mapRef.current) return;
    const resize = () => mapRef.current?.resize();
    resize();
    const t1 = setTimeout(resize, 150);
    const t2 = setTimeout(resize, 500);

    let ro: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(resize);
      ro.observe(containerRef.current);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (ro) ro.disconnect();
    };
  }, []);

  // Pickup Marker Handler
  useEffect(() => {
    if (!mapRef.current) return;

    if (pickupLat && pickupLng) {
      if (!pickupMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'mapbox-pickup-pin cursor-pointer';
        el.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.35));">
            <div style="background-color: #111827; color: #ffffff; padding: 4px 10px; border-radius: 9999px; border: 2px solid #ffffff; font-size: 12px; font-weight: 800; white-space: nowrap;">
              Pickup (A)
            </div>
            <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 7px solid #111827; margin-top: -1px;"></div>
            <div style="width: 8px; height: 8px; background-color: #111827; border: 1.5px solid #ffffff; border-radius: 9999px; margin-top: 1px; box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.4);"></div>
          </div>
        `;
        pickupMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([pickupLng, pickupLat])
          .addTo(mapRef.current);
      } else {
        pickupMarkerRef.current.setLngLat([pickupLng, pickupLat]);
      }
    } else if (pickupMarkerRef.current) {
      pickupMarkerRef.current.remove();
      pickupMarkerRef.current = null;
    }
  }, [pickupLat, pickupLng]);

  // Dropoff Marker Handler
  useEffect(() => {
    if (!mapRef.current) return;

    if (dropoffLat && dropoffLng) {
      if (!dropoffMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'mapbox-dropoff-pin cursor-pointer';
        el.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.35));">
            <div style="background-color: #2563eb; color: #ffffff; padding: 4px 10px; border-radius: 9999px; border: 2px solid #ffffff; font-size: 12px; font-weight: 800; white-space: nowrap;">
              Dropoff (B)
            </div>
            <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 7px solid #2563eb; margin-top: -1px;"></div>
          </div>
        `;
        dropoffMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([dropoffLng, dropoffLat])
          .addTo(mapRef.current);
      } else {
        dropoffMarkerRef.current.setLngLat([dropoffLng, dropoffLat]);
      }
    } else if (dropoffMarkerRef.current) {
      dropoffMarkerRef.current.remove();
      dropoffMarkerRef.current = null;
    }
  }, [dropoffLat, dropoffLng]);

  // Assigned Driver Marker
  useEffect(() => {
    if (!mapRef.current) return;

    if (effectiveAssignedLat && effectiveAssignedLng) {
      if (!assignedDriverMarkerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer; filter: drop-shadow(0 6px 12px rgba(37,99,235,0.45));">
            <span style="background-color: #2563eb; color: #ffffff; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 9999px; margin-bottom: 2px; white-space: nowrap; border: 1.5px solid #ffffff; text-transform: uppercase;">
              ${assignedDriver?.name || 'Your Driver'}
            </span>
            <div style="background-color: #2563eb; color: #ffffff; width: 38px; height: 38px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; border: 3px solid #ffffff;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
                <circle cx="7" cy="17" r="2"/>
                <path d="M9 17h6"/>
                <circle cx="17" cy="17" r="2"/>
              </svg>
            </div>
          </div>
        `;
        assignedDriverMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([effectiveAssignedLng, effectiveAssignedLat])
          .addTo(mapRef.current);
      } else {
        assignedDriverMarkerRef.current.setLngLat([effectiveAssignedLng, effectiveAssignedLat]);
      }
    } else if (assignedDriverMarkerRef.current) {
      assignedDriverMarkerRef.current.remove();
      assignedDriverMarkerRef.current = null;
    }
  }, [effectiveAssignedLat, effectiveAssignedLng, assignedDriver?.name]);

  // Available Roaming Drivers
  useEffect(() => {
    if (!mapRef.current) return;

    const currentMap = availableMarkersRef.current;
    const activeDriverIds = new Set<string>();

    availableDrivers.forEach((driver) => {
      // Skip if assigned
      if (
        effectiveAssignedLat !== undefined &&
        effectiveAssignedLng !== undefined &&
        Math.abs(driver.lat - effectiveAssignedLat) < 0.0001 &&
        Math.abs(driver.lng - effectiveAssignedLng) < 0.0001
      ) {
        return;
      }

      activeDriverIds.add(driver.id);
      const vehicleTitle = [driver.vehicleMake, driver.vehicleModel].filter(Boolean).join(' ') || driver.vehicle || '';
      const shortVehicle = vehicleTitle.split(' ').slice(0, 2).join(' ');

      if (currentMap.has(driver.id)) {
        currentMap.get(driver.id)!.setLngLat([driver.lng, driver.lat]);
      } else {
        const el = document.createElement('div');
        el.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.35));">
            <div style="background-color: #0f172a; color: #ffffff; width: 34px; height: 34px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; border: 2.5px solid #ffffff; position: relative;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
                <circle cx="7" cy="17" r="2"/>
                <path d="M9 17h6"/>
                <circle cx="17" cy="17" r="2"/>
              </svg>
              <div style="position: absolute; bottom: -1px; right: -1px; width: 9px; height: 9px; background-color: #22c55e; border: 1.5px solid #ffffff; border-radius: 9999px;"></div>
            </div>
            ${shortVehicle ? `<span style="background-color: rgba(15,23,42,0.9); color: #ffffff; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 4px; margin-top: 2px; white-space: nowrap;">${shortVehicle}</span>` : ''}
          </div>
        `;
        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([driver.lng, driver.lat])
          .addTo(mapRef.current!);
        currentMap.set(driver.id, marker);
      }
    });

    // Remove old drivers
    currentMap.forEach((marker, id) => {
      if (!activeDriverIds.has(id)) {
        marker.remove();
        currentMap.delete(id);
      }
    });
  }, [availableDrivers, effectiveAssignedLat, effectiveAssignedLng]);

  // Route Directions & Live Polyline
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
      getRouteDirections(originLng, originLat, destLng, destLat)
        .then((details) => {
          if (!mapRef.current || !details || details.coordinates.length === 0) return;

          // Convert [lat, lng] to Mapbox [lng, lat]
          const lngLatCoords = details.coordinates.map(([lat, lng]) => [lng, lat]);

          const source = mapRef.current.getSource('route-source') as mapboxgl.GeoJSONSource | undefined;
          if (source) {
            source.setData({
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: lngLatCoords,
              },
            });
          }

          if (typeof onRouteChange === 'function') {
            onRouteChange({
              distanceKm: details.distanceKm,
              durationMinutes: details.durationMinutes,
            });
          }
        })
        .catch((e) => console.error('Mapbox GL route failed:', e));
    } else if (mapRef.current) {
      const source = mapRef.current.getSource('route-source') as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [],
          },
        });
      }
    }
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng, effectiveAssignedLat, effectiveAssignedLng, tripStatus]);

  // Dynamic Camera & Fit Bounds
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const isValidCoord = (lat?: number | null, lng?: number | null) =>
      typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng) && Math.abs(lat) > 1 && Math.abs(lng) > 1;

    const hasPickup = isValidCoord(pickupLat, pickupLng);
    const hasDropoff = isValidCoord(dropoffLat, dropoffLng);
    const hasDriver = isValidCoord(effectiveAssignedLat, effectiveAssignedLng);

    if (focusedDriverCoords && isValidCoord(focusedDriverCoords.lat, focusedDriverCoords.lng)) {
      map.flyTo({
        center: [focusedDriverCoords.lng, focusedDriverCoords.lat],
        zoom: 16,
        pitch: 45,
        essential: true,
      });
      return;
    }

    if (hasPickup && hasDropoff) {
      const bounds = new mapboxgl.LngLatBounds()
        .extend([pickupLng!, pickupLat!])
        .extend([dropoffLng!, dropoffLat!]);
      if (hasDriver) {
        bounds.extend([effectiveAssignedLng!, effectiveAssignedLat!]);
      }
      map.fitBounds(bounds, { padding: 60, maxZoom: 16, pitch: 40 });
    } else if (hasPickup) {
      map.flyTo({ center: [pickupLng!, pickupLat!], zoom: 15, pitch: 35, essential: true });
    } else if (hasDriver) {
      map.flyTo({ center: [effectiveAssignedLng!, effectiveAssignedLat!], zoom: 15, pitch: 35, essential: true });
    }
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng, effectiveAssignedLat, effectiveAssignedLng, focusedDriverCoords]);

  // Recenter helper
  const handleRecenter = useCallback(() => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [centerLng, centerLat],
      zoom: 15,
      pitch: 35,
      essential: true,
    });
  }, [centerLng, centerLat]);

  return (
    <div className={`w-full h-full relative z-0 select-none ${isPickingOnMap ? 'cursor-crosshair' : ''}`}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Tactile On-Map Recenter Button */}
      <div
        className="absolute top-20 right-3.5 z-10 pointer-events-auto"
        style={{ marginTop: '76px', marginRight: '2px' }}
      >
        <button
          type="button"
          onClick={handleRecenter}
          aria-label="Recenter Map"
          title="Recenter"
          className="w-10 h-10 bg-white/95 dark:bg-zinc-800/95 backdrop-blur-md text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center hover:bg-gray-100 dark:hover:bg-zinc-700 active:scale-95 transition border border-gray-200/80 dark:border-white/10 shadow-lg cursor-pointer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
