"use client"

import React, { useEffect, useState } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

interface MapProps {
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  driverLat?: number;
  driverLng?: number;
}

const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

const MapComponent = (props: MapProps) => {
  const { pickupLat, pickupLng, dropoffLat, dropoffLng, driverLat, driverLng } = props;
  
  const [routeData, setRouteData] = useState<GeoJSON.Feature | null>(null);

  const center = pickupLat && pickupLng 
    ? { lat: pickupLat, lng: pickupLng } 
    : driverLat && driverLng
      ? { lat: driverLat, lng: driverLng }
      : { lat: -28.7282, lng: 24.7623 }; // Default Kimberley, SA

  const [viewState, setViewState] = useState({
    longitude: center.lng,
    latitude: center.lat,
    zoom: 14
  });

  // Fetch route if we have both points
  useEffect(() => {
    if (pickupLat && pickupLng && dropoffLat && dropoffLng) {
      const getRoute = async () => {
        try {
          const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${pickupLng},${pickupLat};${dropoffLng},${dropoffLat}?geometries=geojson&access_token=${mapboxToken}`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.routes && data.routes.length > 0) {
            setRouteData({
              type: 'Feature',
              properties: {},
              geometry: data.routes[0].geometry
            });
            // Also adjust viewState roughly to fit bounds, but for simplicity we pan to middle
            const midLng = (pickupLng + dropoffLng) / 2;
            const midLat = (pickupLat + dropoffLat) / 2;
            setViewState(prev => ({ ...prev, longitude: midLng, latitude: midLat, zoom: 12 }));
          }
        } catch (e) {
          console.error('Directions request failed', e);
        }
      };
      getRoute();
    } else {
      setRouteData(null);
    }
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng]);

  useEffect(() => {
    if (pickupLat && pickupLng && !dropoffLat) {
      setViewState(prev => ({ ...prev, longitude: pickupLng, latitude: pickupLat, zoom: 15 }));
    }
  }, [pickupLat, pickupLng, dropoffLat]);

  if (!mapboxToken) {
    return <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-500">Mapbox Token Missing</div>;
  }

  return (
    <div className="w-full h-full relative">
      <Map
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={mapboxToken}
        attributionControl={false}
      >
        {routeData && (
          <Source id="route" type="geojson" data={routeData}>
            <Layer
              id="route"
              type="line"
              source="route"
              layout={{
                'line-join': 'round',
                'line-cap': 'round'
              }}
              paint={{
                'line-color': '#3b82f6',
                'line-width': 5
              }}
            />
          </Source>
        )}

        {pickupLat && pickupLng && (
          <Marker longitude={pickupLng} latitude={pickupLat}>
             <div className="bg-black text-white p-2 rounded-full shadow-lg border-2 border-white text-xs font-bold">
               A
             </div>
          </Marker>
        )}

        {dropoffLat && dropoffLng && (
          <Marker longitude={dropoffLng} latitude={dropoffLat}>
             <div className="bg-blue-600 text-white p-2 rounded-full shadow-lg border-2 border-white text-xs font-bold">
               B
             </div>
          </Marker>
        )}

        {driverLat && driverLng && (
          <Marker longitude={driverLng} latitude={driverLat} style={{ zIndex: 1000 }}>
             <div className="bg-white text-black p-2 rounded-full shadow-lg border-2 border-black text-xs font-bold flex items-center justify-center">
               🚗
             </div>
          </Marker>
        )}
      </Map>
    </div>
  );
};

export default MapComponent;
