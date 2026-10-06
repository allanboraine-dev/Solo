"use client"

import React, { useEffect, useState } from 'react';
import { Map, AdvancedMarker, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';

interface MapProps {
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  driverLat?: number;
  driverLng?: number;
}

// A helper component to handle route calculation and map bounds
const Directions = ({ pickupLat, pickupLng, dropoffLat, dropoffLng }: MapProps) => {
  const map = useMap();
  const routesLibrary = useMapsLibrary('routes');
  const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService | null>(null);
  const [directionsRenderer, setDirectionsRenderer] = useState<google.maps.DirectionsRenderer | null>(null);

  useEffect(() => {
    if (!routesLibrary || !map) return;
    setDirectionsService(new routesLibrary.DirectionsService());
    setDirectionsRenderer(new routesLibrary.DirectionsRenderer({ map, suppressMarkers: true }));
  }, [routesLibrary, map]);

  useEffect(() => {
    if (!directionsService || !directionsRenderer) return;

    if (pickupLat && pickupLng && dropoffLat && dropoffLng) {
      directionsService
        .route({
          origin: { lat: pickupLat, lng: pickupLng },
          destination: { lat: dropoffLat, lng: dropoffLng },
          travelMode: google.maps.TravelMode.DRIVING,
        })
        .then(response => {
          directionsRenderer.setDirections(response);
        })
        .catch(e => {
          console.error('Directions request failed due to ' + e);
        });
    } else {
      directionsRenderer.setDirections(null);
    }
  }, [directionsService, directionsRenderer, pickupLat, pickupLng, dropoffLat, dropoffLng]);

  // Center the map on the driver if there's no active route
  useEffect(() => {
    if (map && !dropoffLat && pickupLat && pickupLng) {
       map.panTo({ lat: pickupLat, lng: pickupLng });
       map.setZoom(15);
    }
  }, [map, pickupLat, pickupLng, dropoffLat]);

  return null;
};

const MapComponent = (props: MapProps) => {
  const { pickupLat, pickupLng, dropoffLat, dropoffLng, driverLat, driverLng } = props;
  
  const center = pickupLat && pickupLng 
    ? { lat: pickupLat, lng: pickupLng } 
    : driverLat && driverLng
      ? { lat: driverLat, lng: driverLng }
      : { lat: -28.7282, lng: 24.7623 }; // Default Kimberley, SA

  return (
    <div className="w-full h-full relative">
      <Map
        mapId="DEMO_MAP_ID"
        defaultCenter={center}
        defaultZoom={14}
        disableDefaultUI={true}
        gestureHandling="greedy"
        internalUsageAttributionIds={["gmp_git_agentskills_v1"]}
      >
        <Directions {...props} />

        {pickupLat && pickupLng && (
           <AdvancedMarker position={{ lat: pickupLat, lng: pickupLng }} title="Pickup">
             <div className="bg-black text-white p-2 rounded-full shadow-lg border-2 border-white text-xs font-bold">
               A
             </div>
           </AdvancedMarker>
        )}

        {dropoffLat && dropoffLng && (
           <AdvancedMarker position={{ lat: dropoffLat, lng: dropoffLng }} title="Dropoff">
             <div className="bg-blue-600 text-white p-2 rounded-full shadow-lg border-2 border-white text-xs font-bold">
               B
             </div>
           </AdvancedMarker>
        )}

        {driverLat && driverLng && (
           <AdvancedMarker position={{ lat: driverLat, lng: driverLng }} title="Driver" zIndex={1000}>
             <div className="bg-white text-black p-2 rounded-full shadow-lg border-2 border-black text-xs font-bold flex items-center justify-center">
               🚗
             </div>
           </AdvancedMarker>
        )}
      </Map>
    </div>
  );
};

// Source: Google Maps Platform Code Assist
export default MapComponent;
