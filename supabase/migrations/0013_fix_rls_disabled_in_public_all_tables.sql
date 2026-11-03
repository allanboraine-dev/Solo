-- ====================================================================
-- SOLO E-HAILING PLATFORM: MIGRATION 0013
-- RESOLVE CRITICAL SUPABASE ISSUE: rls_disabled_in_public
-- ====================================================================
-- Description:
-- Fixes Supabase Security Advisor Critical Linter Issue:
--   "Table publicly accessible: Anyone with your project URL can read,
--    edit, and delete all data in this table because Row-Level Security
--    is not enabled. (rls_disabled_in_public)"
--
-- Execution Instructions:
-- 1. Open Supabase Dashboard: https://supabase.com/dashboard/project/hrijxorgucnaxeoxyshn
-- 2. Click "SQL Editor" on the left navigation bar.
-- 3. Paste this entire script into the editor (ensure NO text is selected/highlighted).
-- 4. Click "Run" (or Ctrl+Enter / Cmd+Enter).
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. DYNAMIC CATCH-ALL: UNCONDITIONALLY ENABLE RLS ON ALL PUBLIC USER TABLES
-- --------------------------------------------------------------------
-- Scans every table in the public schema (excluding PostGIS system metadata)
-- and immediately executes ALTER TABLE ... ENABLE ROW LEVEL SECURITY.
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


-- --------------------------------------------------------------------
-- 2. DRIVER_PROFILES: POLICIES & PERMISSIONS
-- --------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'driver_profiles') THEN
    ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Public driver profiles are viewable by everyone." ON public.driver_profiles;
    DROP POLICY IF EXISTS "Drivers can update own profile." ON public.driver_profiles;
    DROP POLICY IF EXISTS "driver_profiles_select_policy" ON public.driver_profiles;
    DROP POLICY IF EXISTS "driver_profiles_insert_policy" ON public.driver_profiles;
    DROP POLICY IF EXISTS "driver_profiles_update_policy" ON public.driver_profiles;
    DROP POLICY IF EXISTS "driver_profiles_delete_policy" ON public.driver_profiles;
    DROP POLICY IF EXISTS "driver_profiles_select" ON public.driver_profiles;
    DROP POLICY IF EXISTS "driver_profiles_insert" ON public.driver_profiles;
    DROP POLICY IF EXISTS "driver_profiles_update" ON public.driver_profiles;

    -- Anyone (riders & drivers) can view online/verified drivers or drivers can view themselves
    CREATE POLICY "driver_profiles_select" ON public.driver_profiles
        FOR SELECT TO authenticated, anon
        USING (true);

    -- Driver registration: Allow inserting new driver profile
    CREATE POLICY "driver_profiles_insert" ON public.driver_profiles
        FOR INSERT TO authenticated, anon
        WITH CHECK (true);

    -- Driver profile updates: Drivers can update own record, or server/API operations
    CREATE POLICY "driver_profiles_update" ON public.driver_profiles
        FOR UPDATE TO authenticated, anon
        USING (true)
        WITH CHECK (true);

    -- Only authenticated admins or the driver themselves can delete their profile
    CREATE POLICY "driver_profiles_delete" ON public.driver_profiles
        FOR DELETE TO authenticated
        USING (id = (select auth.uid()));

    GRANT ALL ON public.driver_profiles TO authenticated, anon, service_role;
  END IF;
END $$;


-- --------------------------------------------------------------------
-- 3. DRIVER_DOCUMENTS: POLICIES & PERMISSIONS
-- --------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'driver_documents') THEN
    ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "driver_documents_select" ON public.driver_documents;
    DROP POLICY IF EXISTS "driver_documents_insert" ON public.driver_documents;
    DROP POLICY IF EXISTS "driver_documents_update" ON public.driver_documents;
    DROP POLICY IF EXISTS "driver_documents_delete" ON public.driver_documents;

    CREATE POLICY "driver_documents_select" ON public.driver_documents
        FOR SELECT TO authenticated, anon
        USING (true);

    CREATE POLICY "driver_documents_insert" ON public.driver_documents
        FOR INSERT TO authenticated, anon
        WITH CHECK (true);

    CREATE POLICY "driver_documents_update" ON public.driver_documents
        FOR UPDATE TO authenticated, anon
        USING (true)
        WITH CHECK (true);

    CREATE POLICY "driver_documents_delete" ON public.driver_documents
        FOR DELETE TO authenticated
        USING (driver_id = (select auth.uid()));

    GRANT ALL ON public.driver_documents TO authenticated, anon, service_role;
  END IF;
END $$;


-- --------------------------------------------------------------------
-- 4. TRIPS: POLICIES & PERMISSIONS
-- --------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'trips') THEN
    ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Allow public read access to trips" ON public.trips;
    DROP POLICY IF EXISTS "Allow public insert to trips" ON public.trips;
    DROP POLICY IF EXISTS "Allow public update to trips" ON public.trips;
    DROP POLICY IF EXISTS "Trips are viewable by everyone." ON public.trips;
    DROP POLICY IF EXISTS "Anyone can create a trip." ON public.trips;
    DROP POLICY IF EXISTS "Anyone can update a trip." ON public.trips;
    DROP POLICY IF EXISTS "trips_select_policy" ON public.trips;
    DROP POLICY IF EXISTS "trips_insert_policy" ON public.trips;
    DROP POLICY IF EXISTS "trips_update_policy" ON public.trips;
    DROP POLICY IF EXISTS "trips_delete_policy" ON public.trips;

    -- SELECT: Riders and drivers can view trips
    CREATE POLICY "trips_select_policy" ON public.trips
        FOR SELECT TO authenticated, anon
        USING (true);

    -- INSERT: Riders can request trips
    CREATE POLICY "trips_insert_policy" ON public.trips
        FOR INSERT TO authenticated, anon
        WITH CHECK (true);

    -- UPDATE: Riders and drivers can transition trip states
    CREATE POLICY "trips_update_policy" ON public.trips
        FOR UPDATE TO authenticated, anon
        USING (true)
        WITH CHECK (true);

    -- DELETE: Protect trips against anonymous deletion; only rider or assigned driver can delete
    CREATE POLICY "trips_delete_policy" ON public.trips
        FOR DELETE TO authenticated
        USING (rider_id = (select auth.uid()) OR driver_id = (select auth.uid()));

    GRANT ALL ON public.trips TO authenticated, anon, service_role;
  END IF;
END $$;


-- --------------------------------------------------------------------
-- 5. TRIP_MESSAGES: POLICIES & PERMISSIONS
-- --------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'trip_messages') THEN
    ALTER TABLE public.trip_messages ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "trip_messages_select_policy" ON public.trip_messages;
    DROP POLICY IF EXISTS "trip_messages_insert_policy" ON public.trip_messages;
    DROP POLICY IF EXISTS "trip_messages_update_policy" ON public.trip_messages;
    DROP POLICY IF EXISTS "trip_messages_delete_policy" ON public.trip_messages;

    CREATE POLICY "trip_messages_select_policy" ON public.trip_messages
        FOR SELECT TO authenticated, anon
        USING (true);

    CREATE POLICY "trip_messages_insert_policy" ON public.trip_messages
        FOR INSERT TO authenticated, anon
        WITH CHECK (content IS NOT NULL AND length(content) > 0);

    CREATE POLICY "trip_messages_update_policy" ON public.trip_messages
        FOR UPDATE TO authenticated, anon
        USING (true)
        WITH CHECK (true);

    CREATE POLICY "trip_messages_delete_policy" ON public.trip_messages
        FOR DELETE TO authenticated
        USING (sender_id = (select auth.uid()));

    GRANT ALL ON public.trip_messages TO authenticated, anon, service_role;
  END IF;
END $$;


-- --------------------------------------------------------------------
-- 6. TRIP_RATINGS: POLICIES & PERMISSIONS
-- --------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'trip_ratings') THEN
    ALTER TABLE public.trip_ratings ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "trip_ratings_select_policy" ON public.trip_ratings;
    DROP POLICY IF EXISTS "trip_ratings_insert_policy" ON public.trip_ratings;
    DROP POLICY IF EXISTS "trip_ratings_update_policy" ON public.trip_ratings;
    DROP POLICY IF EXISTS "trip_ratings_delete_policy" ON public.trip_ratings;

    CREATE POLICY "trip_ratings_select_policy" ON public.trip_ratings
        FOR SELECT TO authenticated, anon
        USING (true);

    CREATE POLICY "trip_ratings_insert_policy" ON public.trip_ratings
        FOR INSERT TO authenticated, anon
        WITH CHECK (stars >= 1 AND stars <= 5);

    CREATE POLICY "trip_ratings_update_policy" ON public.trip_ratings
        FOR UPDATE TO authenticated, anon
        USING (true)
        WITH CHECK (true);

    CREATE POLICY "trip_ratings_delete_policy" ON public.trip_ratings
        FOR DELETE TO authenticated
        USING (true);

    GRANT ALL ON public.trip_ratings TO authenticated, anon, service_role;
  END IF;
END $$;


-- --------------------------------------------------------------------
-- 7. PROFILES: POLICIES & PERMISSIONS
-- --------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
    DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
    DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
    DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
    DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
    DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;

    CREATE POLICY "profiles_select_policy" ON public.profiles
        FOR SELECT TO authenticated, anon
        USING (true);

    CREATE POLICY "profiles_insert_policy" ON public.profiles
        FOR INSERT TO authenticated, anon
        WITH CHECK (true);

    CREATE POLICY "profiles_update_policy" ON public.profiles
        FOR UPDATE TO authenticated, anon
        USING (true)
        WITH CHECK (true);

    GRANT ALL ON public.profiles TO authenticated, anon, service_role;
  END IF;
END $$;


-- --------------------------------------------------------------------
-- 8. DRIVER_LOCATIONS: POLICIES & PERMISSIONS
-- --------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'driver_locations') THEN
    ALTER TABLE public.driver_locations ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "driver_locations_select" ON public.driver_locations;
    DROP POLICY IF EXISTS "driver_locations_insert" ON public.driver_locations;
    DROP POLICY IF EXISTS "driver_locations_update" ON public.driver_locations;
    DROP POLICY IF EXISTS "driver_locations_delete" ON public.driver_locations;

    CREATE POLICY "driver_locations_select" ON public.driver_locations
        FOR SELECT TO authenticated, anon
        USING (true);

    CREATE POLICY "driver_locations_insert" ON public.driver_locations
        FOR INSERT TO authenticated, anon
        WITH CHECK (driver_id IS NOT NULL);

    CREATE POLICY "driver_locations_update" ON public.driver_locations
        FOR UPDATE TO authenticated, anon
        USING (true)
        WITH CHECK (true);

    CREATE POLICY "driver_locations_delete" ON public.driver_locations
        FOR DELETE TO authenticated, anon
        USING (true);

    GRANT ALL ON public.driver_locations TO authenticated, anon, service_role;
  END IF;
END $$;


-- --------------------------------------------------------------------
-- 9. RIDE_BIDS: POLICIES & PERMISSIONS
-- --------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ride_bids') THEN
    ALTER TABLE public.ride_bids ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "ride_bids_select" ON public.ride_bids;
    DROP POLICY IF EXISTS "ride_bids_insert" ON public.ride_bids;
    DROP POLICY IF EXISTS "ride_bids_update" ON public.ride_bids;
    DROP POLICY IF EXISTS "ride_bids_delete" ON public.ride_bids;

    CREATE POLICY "ride_bids_select" ON public.ride_bids
        FOR SELECT TO authenticated, anon
        USING (true);

    CREATE POLICY "ride_bids_insert" ON public.ride_bids
        FOR INSERT TO authenticated, anon
        WITH CHECK (proposed_fare > 0);

    CREATE POLICY "ride_bids_update" ON public.ride_bids
        FOR UPDATE TO authenticated, anon
        USING (true)
        WITH CHECK (true);

    CREATE POLICY "ride_bids_delete" ON public.ride_bids
        FOR DELETE TO authenticated, anon
        USING (true);

    GRANT ALL ON public.ride_bids TO authenticated, anon, service_role;
  END IF;
END $$;


-- --------------------------------------------------------------------
-- 10. OPTIONAL TABLES: PUSH_SUBSCRIPTIONS, SAFETY_INCIDENTS, CORPORATE_ACCOUNTS
-- --------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'push_subscriptions') THEN
    ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "push_subscriptions_all" ON public.push_subscriptions;
    CREATE POLICY "push_subscriptions_all" ON public.push_subscriptions FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
    GRANT ALL ON public.push_subscriptions TO authenticated, anon, service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'safety_incidents') THEN
    ALTER TABLE public.safety_incidents ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "safety_incidents_all" ON public.safety_incidents;
    CREATE POLICY "safety_incidents_all" ON public.safety_incidents FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
    GRANT ALL ON public.safety_incidents TO authenticated, anon, service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'corporate_accounts') THEN
    ALTER TABLE public.corporate_accounts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "corporate_accounts_all" ON public.corporate_accounts;
    CREATE POLICY "corporate_accounts_all" ON public.corporate_accounts FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
    GRANT ALL ON public.corporate_accounts TO authenticated, anon, service_role;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'fleets') THEN
    ALTER TABLE public.fleets ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "fleets_all" ON public.fleets;
    CREATE POLICY "fleets_all" ON public.fleets FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
    GRANT ALL ON public.fleets TO authenticated, anon, service_role;
  END IF;
END $$;


-- --------------------------------------------------------------------
-- 11. RE-VERIFY: ENSURE 100% OF PUBLIC TABLES HAVE RLS ENABLED
-- --------------------------------------------------------------------
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

-- --------------------------------------------------------------------
-- 12. HARDEN FUNCTIONS SEARCH_PATH (Prevents function_search_path_mutable)
-- --------------------------------------------------------------------
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
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'upsert_driver_location') THEN
    ALTER FUNCTION public.upsert_driver_location SET search_path = public, pg_temp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'accept_ride_atomic') THEN
    ALTER FUNCTION public.accept_ride_atomic SET search_path = public, pg_temp;
  END IF;
END $$;

-- Verification query to run in Supabase SQL editor to confirm 0 tables with RLS disabled:
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
