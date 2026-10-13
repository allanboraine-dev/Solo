"use client"

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface DriverMarkerData {
  id: string;
  lat: number;
  lng: number;
  name?: string;
  vehicle?: string;
  licensePlate?: string;
}

interface MapProps {
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  driverLat?: number;
  driverLng?: number;
  availableDrivers?: DriverMarkerData[];
  assignedDriver?: {
    lat: number;
    lng: number;
    name?: string;
    vehicle?: string;
  };
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

// Component to handle map bounds and routing
const MapUpdater = ({ pickupLat, pickupLng, dropoffLat, dropoffLng }: any) => {
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
  const { 
    pickupLat, 
    pickupLng, 
    dropoffLat, 
    dropoffLng, 
    driverLat, 
    driverLng, 
    availableDrivers = [],
    assignedDriver 
  } = props;
  
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);

  // Effective assigned driver location
  const effectiveAssignedLat = assignedDriver?.lat || driverLat;
  const effectiveAssignedLng = assignedDriver?.lng || driverLng;

  const centerLat = pickupLat || effectiveAssignedLat || -28.7282;
  const centerLng = pickupLng || effectiveAssignedLng || 24.7623;

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
          pickupLat={pickupLat} 
          pickupLng={pickupLng} 
          dropoffLat={dropoffLat} 
          dropoffLng={dropoffLng} 
        />

        {routeCoordinates.length > 0 && (
          <Polyline positions={routeCoordinates} color="#3b82f6" weight={5} lineCap="round" lineJoin="round" />
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
          if (effectiveAssignedLat && Math.abs(driver.lat - effectiveAssignedLat) < 0.0001 && Math.abs(driver.lng - effectiveAssignedLng) < 0.0001) {
            return null;
          }
          return (
            <Marker 
              key={driver.id} 
              position={[driver.lat, driver.lng]} 
              icon={createAvailableCarIcon(driver.vehicle)}
              zIndexOffset={500}
            >
              <Popup>
                <div className="p-1 font-sans text-xs">
                  <div className="font-bold text-gray-900">{driver.name || 'Registered Driver'}</div>
                  {driver.vehicle && <div className="text-gray-500 mt-0.5">{driver.vehicle}</div>}
                  {driver.licensePlate && <div className="text-gray-400 text-[10px] uppercase font-mono">{driver.licensePlate}</div>}
                  <div className="text-green-600 font-bold mt-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
                    Available Now
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
                <div className="font-bold text-blue-600">{assignedDriver?.name || 'Your Assigned Driver'}</div>
                {assignedDriver?.vehicle && <div className="text-gray-600 mt-0.5">{assignedDriver.vehicle}</div>}
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

