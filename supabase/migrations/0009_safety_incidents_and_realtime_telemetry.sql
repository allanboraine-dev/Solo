-- ============================================================================
-- SOLO Migration 0009: South African Rapid-Response Safety Incidents & PostGIS
-- ============================================================================
-- Provides persistent forensic logging and spatial indexing for Rider & Driver
-- SOS Panic alerts, Silent Hijack/Duress triggers, and Armed Security dispatches.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.safety_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_code TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('rider', 'driver')),
  category TEXT NOT NULL DEFAULT 'armed_response',
  silent_duress BOOLEAN NOT NULL DEFAULT false,
  user_id UUID NULL,
  user_name TEXT NULL,
  user_phone TEXT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  geohash6 TEXT NULL,
  location GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
  ) STORED,
  google_maps_url TEXT NULL,
  trip_id UUID NULL,
  license_plate TEXT NULL,
  vehicle_details TEXT NULL,
  status TEXT NOT NULL DEFAULT 'dispatched' CHECK (status IN ('dispatched', 'acknowledged', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_safety_incidents_location_gist
  ON public.safety_incidents USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_safety_incidents_geohash6_status
  ON public.safety_incidents (geohash6, status, created_at DESC);

ALTER TABLE public.safety_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert on safety_incidents for emergency SOS" ON public.safety_incidents;
CREATE POLICY "Allow public insert on safety_incidents for emergency SOS"
  ON public.safety_incidents
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated read on safety_incidents" ON public.safety_incidents;
CREATE POLICY "Allow authenticated read on safety_incidents"
  ON public.safety_incidents
  FOR SELECT
  USING (true);
