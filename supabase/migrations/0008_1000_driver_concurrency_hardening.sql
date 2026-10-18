-- ============================================================================
-- SOLO E-HAILING PLATFORM: 1,000-DRIVER CONCURRENCY & SCALABILITY HARDENING
-- Migration: 0008_1000_driver_concurrency_hardening.sql
-- Safe, Idempotent Migration for Supabase SQL Editor
-- ============================================================================
-- Targets SOLO's 3 Critical Launch Bottlenecks:
--   1. Real-time Driver GPS Updates & PostGIS Spatial Matching (`driver_profiles` & `driver_locations`)
--   2. Ride Request Broadcasting & Atomic Trip Acceptance / Bidding (`trips` & `ride_bids` - 0 Double-Bookings)
--   3. Viral Uber/Bolt Driver Onboarding Spikes (`auth.users` -> `profiles` & `driver_profiles`)
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ============================================================================
-- 2. HIGH-FREQUENCY TABLE TUNING (HOT Updates & Geohash Indexing)
-- ============================================================================

ALTER TABLE IF EXISTS public.driver_profiles SET (fillfactor = 70);
ALTER TABLE IF EXISTS public.trips SET (fillfactor = 80);

ALTER TABLE IF EXISTS public.driver_profiles ADD COLUMN IF NOT EXISTS geohash_6 TEXT;
ALTER TABLE IF EXISTS public.driver_profiles ADD COLUMN IF NOT EXISTS heading REAL DEFAULT 0;
ALTER TABLE IF EXISTS public.driver_profiles ADD COLUMN IF NOT EXISTS speed_kmh REAL DEFAULT 0;
ALTER TABLE IF EXISTS public.driver_profiles ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT TRUE;
ALTER TABLE IF EXISTS public.trips ADD COLUMN IF NOT EXISTS pickup_geohash_6 TEXT;

CREATE TABLE IF NOT EXISTS public.driver_locations (
    driver_id UUID PRIMARY KEY,
    location GEOGRAPHY(Point, 4326) NOT NULL,
    heading REAL NOT NULL DEFAULT 0,
    speed_kmh REAL NOT NULL DEFAULT 0,
    geohash_6 TEXT NOT NULL DEFAULT '',
    is_online BOOLEAN NOT NULL DEFAULT false,
    is_available BOOLEAN NOT NULL DEFAULT true,
    vehicle_type TEXT NOT NULL DEFAULT 'standard',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_stress_test BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE public.driver_locations SET (fillfactor = 70);

CREATE TABLE IF NOT EXISTS public.ride_bids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
    proposed_fare NUMERIC(10, 2) NOT NULL CHECK (proposed_fare > 0),
    eta_minutes INTEGER NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (trip_id, driver_id)
);

-- ============================================================================
-- 3. STOP REALTIME WAL SATURATION ON HIGH-FREQUENCY GPS WRITES
-- ============================================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.driver_profiles;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================================
-- 4. PARTIAL SPATIAL & CONCURRENCY INDEXES (Sub-5ms Lookups at 1,000+ Drivers)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_driver_profiles_online_location_gist
ON public.driver_profiles USING GIST (location_geo)
WHERE is_online = true AND location_geo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_driver_profiles_geohash_online
ON public.driver_profiles (geohash_6, updated_at DESC)
WHERE is_online = true;

CREATE INDEX IF NOT EXISTS idx_trips_open_requested_fast
ON public.trips (id, created_at DESC)
WHERE status = 'requested' AND driver_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_trips_open_pickup_gist
ON public.trips USING GIST (pickup_geo)
WHERE status = 'requested' AND driver_id IS NULL;

-- ============================================================================
-- 5. BOTTLENECK 1 RPCs: THROTTLED GPS UPSERT & FAST POSTGIS MATCHING
-- ============================================================================
CREATE OR REPLACE FUNCTION public.upsert_driver_location(
    p_driver_id UUID,
    p_lat FLOAT8,
    p_lng FLOAT8,
    p_is_online BOOLEAN DEFAULT true,
    p_geohash_6 TEXT DEFAULT NULL,
    p_full_name TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_vehicle_make TEXT DEFAULT NULL,
    p_vehicle_model TEXT DEFAULT NULL,
    p_vehicle_year INT DEFAULT NULL,
    p_vehicle_color TEXT DEFAULT NULL,
    p_license_plate TEXT DEFAULT NULL,
    p_heading REAL DEFAULT 0,
    p_speed_kmh REAL DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := COALESCE(p_driver_id, auth.uid());
    v_new_point GEOGRAPHY(Point, 4326);
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'driver_id required');
    END IF;

    IF p_is_online AND p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
        v_new_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
    ELSE
        v_new_point := NULL;
    END IF;

    INSERT INTO public.driver_profiles (
        id, full_name, phone, vehicle_make, vehicle_model, vehicle_year,
        vehicle_color, license_plate, current_lat, current_lng, location_geo,
        geohash_6, heading, speed_kmh, is_online, updated_at
    )
    VALUES (
        v_uid,
        COALESCE(p_full_name, 'Registered Driver'),
        p_phone,
        p_vehicle_make,
        p_vehicle_model,
        p_vehicle_year,
        p_vehicle_color,
        p_license_plate,
        CASE WHEN p_is_online THEN p_lat ELSE NULL END,
        CASE WHEN p_is_online THEN p_lng ELSE NULL END,
        v_new_point,
        p_geohash_6,
        COALESCE(p_heading, 0),
        COALESCE(p_speed_kmh, 0),
        p_is_online,
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
        full_name = COALESCE(EXCLUDED.full_name, public.driver_profiles.full_name),
        phone = COALESCE(EXCLUDED.phone, public.driver_profiles.phone),
        vehicle_make = COALESCE(EXCLUDED.vehicle_make, public.driver_profiles.vehicle_make),
        vehicle_model = COALESCE(EXCLUDED.vehicle_model, public.driver_profiles.vehicle_model),
        vehicle_year = COALESCE(EXCLUDED.vehicle_year, public.driver_profiles.vehicle_year),
        vehicle_color = COALESCE(EXCLUDED.vehicle_color, public.driver_profiles.vehicle_color),
        license_plate = COALESCE(EXCLUDED.license_plate, public.driver_profiles.license_plate),
        current_lat = EXCLUDED.current_lat,
        current_lng = EXCLUDED.current_lng,
        location_geo = EXCLUDED.location_geo,
        geohash_6 = COALESCE(EXCLUDED.geohash_6, public.driver_profiles.geohash_6),
        heading = EXCLUDED.heading,
        speed_kmh = EXCLUDED.speed_kmh,
        is_online = EXCLUDED.is_online,
        updated_at = NOW()
    WHERE public.driver_profiles.is_online IS DISTINCT FROM EXCLUDED.is_online
       OR public.driver_profiles.location_geo IS NULL
       OR EXCLUDED.location_geo IS NULL
       OR public.driver_profiles.updated_at < NOW() - INTERVAL '25 seconds'
       OR ST_Distance(public.driver_profiles.location_geo, EXCLUDED.location_geo) >= 10;

    RETURN jsonb_build_object('success', true, 'driver_id', v_uid, 'is_online', p_is_online);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_driver_location(UUID, FLOAT8, FLOAT8, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, TEXT, REAL, REAL) TO authenticated, anon;

-- ============================================================================
-- 6. BOTTLENECK 2 RPCs: ATOMIC TRIP ACCEPTANCE WITH `FOR UPDATE SKIP LOCKED`
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accept_trip(
    p_trip_id UUID,
    p_driver_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_driver_id UUID := COALESCE(auth.uid(), p_driver_id);
    v_trip RECORD;
BEGIN
    IF v_driver_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'UNAUTHORIZED',
            'error', 'Driver authentication required'
        );
    END IF;

    SELECT id, rider_id, status, driver_id, fare_amount
    INTO v_trip
    FROM public.trips
    WHERE id = p_trip_id
      AND status = 'requested'
      AND driver_id IS NULL
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
        IF EXISTS (
            SELECT 1 FROM public.trips
            WHERE id = p_trip_id AND driver_id = v_driver_id AND status = 'accepted'
        ) THEN
            RETURN jsonb_build_object(
                'success', true,
                'trip_id', p_trip_id,
                'driver_id', v_driver_id,
                'status', 'accepted'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'RIDE_ALREADY_TAKEN',
            'error', 'Trip is no longer available (claimed by another driver).'
        );
    END IF;

    UPDATE public.trips
    SET 
        driver_id = v_driver_id,
        status = 'accepted',
        updated_at = NOW()
    WHERE id = p_trip_id;

    UPDATE public.driver_profiles
    SET is_available = false,
        updated_at = NOW()
    WHERE id = v_driver_id;

    RETURN jsonb_build_object(
        'success', true,
        'trip_id', p_trip_id,
        'driver_id', v_driver_id,
        'fare_amount', v_trip.fare_amount,
        'status', 'accepted'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_trip(UUID, UUID) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.accept_ride_atomic(
    p_ride_id UUID,
    p_driver_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.accept_trip(p_ride_id, p_driver_id);
$$;

GRANT EXECUTE ON FUNCTION public.accept_ride_atomic(UUID, UUID) TO authenticated, anon;
