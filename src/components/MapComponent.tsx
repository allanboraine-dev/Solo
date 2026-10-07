"use client"

import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapProps {
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  driverLat?: number;
  driverLng?: number;
}

// Create custom DivIcons for markers
const createCustomIcon = (text: string, bgColor: string, textColor: string) => {
  return L.divIcon({
    html: `<div style="background-color: ${bgColor}; color: ${textColor}; padding: 4px 8px; border-radius: 999px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 2px solid white; font-size: 12px; font-weight: bold; display: flex; align-items: center; justify-content: center; width: max-content;">${text}</div>`,
    className: '',
    iconAnchor: [15, 15] // roughly center
  });
};

const pickupIcon = createCustomIcon('A', '#000000', '#ffffff');
const dropoffIcon = createCustomIcon('B', '#2563eb', '#ffffff');
const driverIcon = createCustomIcon('dYs-', '#ffffff', '#000000');

// Component to handle map bounds and routing
const MapUpdater = ({ pickupLat, pickupLng, dropoffLat, dropoffLng, routeData }: any) => {
  const map = useMap();

  useEffect(() => {
    if (pickupLat && pickupLng && dropoffLat && dropoffLng) {
      const bounds = L.latLngBounds(
        [pickupLat, pickupLng],
        [dropoffLat, dropoffLng]
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (pickupLat && pickupLng) {
      map.setView([pickupLat, pickupLng], 15);
    } else if (dropoffLat && dropoffLng) {
      map.setView([dropoffLat, dropoffLng], 15);
    }
  }, [map, pickupLat, pickupLng, dropoffLat, dropoffLng]);

  return null;
};

const MapComponent = (props: MapProps) => {
  const { pickupLat, pickupLng, dropoffLat, dropoffLng, driverLat, driverLng } = props;
  
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);

  const centerLat = pickupLat || driverLat || -28.7282;
  const centerLng = pickupLng || driverLng || 24.7623;

  // Fetch route if we have both points using OSRM
  useEffect(() => {
    if (pickupLat && pickupLng && dropoffLat && dropoffLng) {
      const getRoute = async () => {
        try {
          const url = `https://router.project-osrm.org/route/v1/driving/${pickupLng},${pickupLat};${dropoffLng},${dropoffLat}?overview=full&geometries=geojson`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.routes && data.routes.length > 0) {
            // GeoJSON returns [lng, lat], Leaflet Polyline expects [lat, lng]
            const coords = data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
            setRouteCoordinates(coords);
          }
        } catch (e) {
          console.error('Directions request failed', e);
        }
      };
      getRoute();
    } else {
      setRouteCoordinates([]);
    }
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng]);

  return (
    <div className="w-full h-full relative z-0">
      <MapContainer 
        center={[centerLat, centerLng]} 
        zoom={14} 
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapUpdater 
          pickupLat={pickupLat} pickupLng={pickupLng} 
          dropoffLat={dropoffLat} dropoffLng={dropoffLng} 
        />

        {routeCoordinates.length > 0 && (
          <Polyline positions={routeCoordinates} color="#3b82f6" weight={5} lineCap="round" lineJoin="round" />
        )}

        {pickupLat && pickupLng && (
          <Marker position={[pickupLat, pickupLng]} icon={pickupIcon} />
        )}

        {dropoffLat && dropoffLng && (
          <Marker position={[dropoffLat, dropoffLng]} icon={dropoffIcon} />
        )}

        {driverLat && driverLng && (
          <Marker position={[driverLat, driverLng]} icon={driverIcon} zIndexOffset={1000} />
        )}
      </MapContainer>
    </div>
  );
};

export default MapComponent;
