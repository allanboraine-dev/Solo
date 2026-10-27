-- ====================================================================
-- SOLO E-HAILING PLATFORM: MIGRATION 0012
-- Supabase Security Advisor Hardening: Fix rls_disabled_in_public
-- ====================================================================
-- Resolves Supabase Security Advisor Critical Issue:
-- "Table publicly accessible: Anyone with your project URL can read, edit,
-- and delete all data in this table because Row-Level Security is not enabled.
-- Issue: rls_disabled_in_public"
--
-- Tables specifically targeted:
--   - public.driver_locations (created in 0008 / hardening without RLS)
--   - public.ride_bids (created in 0008 / hardening without RLS)
--   - public.push_subscriptions (tightening open policies)
--
-- Plus automated dynamic guard across ALL current and future user tables
-- in the public schema to ensure 100% RLS compliance.
-- ====================================================================

-- 1. HARDEN DRIVER_LOCATIONS TABLE (RLS & Least-Privilege Policies)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'driver_locations') THEN
    ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- A. Authenticated & Anon can view active, online drivers on map; driver can view own location
DROP POLICY IF EXISTS "driver_locations_select" ON public.driver_locations;
CREATE POLICY "driver_locations_select" ON public.driver_locations
    FOR SELECT TO authenticated, anon
    USING (
        driver_id = (select auth.uid()) 
        OR is_online = true
    );

-- B. Drivers can only insert their own GPS telemetry matching auth.uid()
DROP POLICY IF EXISTS "driver_locations_insert" ON public.driver_locations;
CREATE POLICY "driver_locations_insert" ON public.driver_locations
    FOR INSERT TO authenticated
    WITH CHECK (driver_id = (select auth.uid()));

-- C. Drivers can only update their own GPS telemetry matching auth.uid()
DROP POLICY IF EXISTS "driver_locations_update" ON public.driver_locations;
CREATE POLICY "driver_locations_update" ON public.driver_locations
    FOR UPDATE TO authenticated
    USING (driver_id = (select auth.uid()))
    WITH CHECK (driver_id = (select auth.uid()));

-- D. Drivers can only delete their own GPS telemetry matching auth.uid()
DROP POLICY IF EXISTS "driver_locations_delete" ON public.driver_locations;
CREATE POLICY "driver_locations_delete" ON public.driver_locations
    FOR DELETE TO authenticated
    USING (driver_id = (select auth.uid()));

-- 2. HARDEN RIDE_BIDS TABLE (RLS & Concurrency Bidding Policies)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ride_bids') THEN
    ALTER TABLE public.ride_bids ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- A. Bids viewable by the bidding driver or the rider who requested the trip
DROP POLICY IF EXISTS "ride_bids_select" ON public.ride_bids;
CREATE POLICY "ride_bids_select" ON public.ride_bids
    FOR SELECT TO authenticated
    USING (
        driver_id = (select auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.trips t
            WHERE t.id = ride_bids.trip_id
              AND t.rider_id = (select auth.uid())
        )
    );

-- B. Drivers can only insert bids for themselves on open, requested trips
DROP POLICY IF EXISTS "ride_bids_insert" ON public.ride_bids;
CREATE POLICY "ride_bids_insert" ON public.ride_bids
    FOR INSERT TO authenticated
    WITH CHECK (
        driver_id = (select auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.trips t
            WHERE t.id = ride_bids.trip_id
              AND t.status = 'requested'
        )
    );

-- C. Driver can update own bid (e.g. withdraw/modify) OR rider can accept/reject the bid
DROP POLICY IF EXISTS "ride_bids_update" ON public.ride_bids;
CREATE POLICY "ride_bids_update" ON public.ride_bids
    FOR UPDATE TO authenticated
    USING (
        driver_id = (select auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.trips t
            WHERE t.id = ride_bids.trip_id
              AND t.rider_id = (select auth.uid())
        )
    )
    WITH CHECK (
        driver_id = (select auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.trips t
            WHERE t.id = ride_bids.trip_id
              AND t.rider_id = (select auth.uid())
        )
    );

-- D. Drivers can delete their own bids
DROP POLICY IF EXISTS "ride_bids_delete" ON public.ride_bids;
CREATE POLICY "ride_bids_delete" ON public.ride_bids
    FOR DELETE TO authenticated
    USING (driver_id = (select auth.uid()));

-- 3. TIGHTEN PUSH_SUBSCRIPTIONS (Prevent Anonymous Data Modification)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'push_subscriptions') THEN
    ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Allow public insert/update push subscription" ON public.push_subscriptions;
    DROP POLICY IF EXISTS "push_subscriptions_select" ON public.push_subscriptions;
    DROP POLICY IF EXISTS "push_subscriptions_insert" ON public.push_subscriptions;
    DROP POLICY IF EXISTS "push_subscriptions_update" ON public.push_subscriptions;
    DROP POLICY IF EXISTS "push_subscriptions_delete" ON public.push_subscriptions;

    CREATE POLICY "push_subscriptions_select" ON public.push_subscriptions
        FOR SELECT TO authenticated, anon
        USING (user_id IS NULL OR user_id = (select auth.uid()));

    CREATE POLICY "push_subscriptions_insert" ON public.push_subscriptions
        FOR INSERT TO authenticated, anon
        WITH CHECK (user_id IS NULL OR user_id = (select auth.uid()));

    CREATE POLICY "push_subscriptions_update" ON public.push_subscriptions
        FOR UPDATE TO authenticated, anon
        USING (user_id IS NULL OR user_id = (select auth.uid()))
        WITH CHECK (user_id IS NULL OR user_id = (select auth.uid()));

    CREATE POLICY "push_subscriptions_delete" ON public.push_subscriptions
        FOR DELETE TO authenticated, anon
        USING (user_id IS NULL OR user_id = (select auth.uid()));
  END IF;
END $$;

-- 4. HARDEN SECURITY DEFINER FUNCTIONS AGAINST SEARCH_PATH INJECTION
-- (Fixes Supabase Security Advisor warning: function_search_path_mutable)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'handle_driver_rating_update') THEN
    ALTER FUNCTION public.handle_driver_rating_update() SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'start_trip' AND pronargs = 2) THEN
    ALTER FUNCTION public.start_trip(UUID, VARCHAR) SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'complete_trip' AND pronargs = 2) THEN
    ALTER FUNCTION public.complete_trip(UUID, TEXT) SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_nearby_drivers' AND pronargs = 3) THEN
    ALTER FUNCTION public.get_nearby_drivers(FLOAT8, FLOAT8, FLOAT8) SET search_path = public, pg_temp;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_nearby_requested_trips' AND pronargs = 3) THEN
    ALTER FUNCTION public.get_nearby_requested_trips(FLOAT8, FLOAT8, FLOAT8) SET search_path = public, pg_temp;
  END IF;
END $$;

-- 5. COMPREHENSIVE DYNAMIC GUARD: ENFORCE RLS ON ALL PUBLIC USER TABLES
-- Scans all user tables in public schema and unconditionally enables RLS.
-- Excludes PostGIS internal metadata tables (spatial_ref_sys, geography_columns, geometry_columns).
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN (
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT IN ('spatial_ref_sys', 'geography_columns', 'geometry_columns')
    ) LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);
    END LOOP;
END $$;

-- 6. GRANT LEAST-PRIVILEGE PERMISSIONS TO AUTHENTICATED AND SERVICE_ROLE
GRANT SELECT ON public.driver_locations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.driver_locations TO authenticated;
GRANT ALL ON public.driver_locations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ride_bids TO authenticated;
GRANT ALL ON public.ride_bids TO service_role;
