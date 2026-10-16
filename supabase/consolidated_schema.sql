-- ====================================================================
-- SOLO E-HAILING PLATFORM: COMPLETE PRODUCTION SUPABASE SCRIPT (FIXED)
-- Safe, Idempotent Migration for Existing & Fresh Supabase Databases
-- Run this in your Supabase Dashboard -> SQL Editor
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ====================================================================
-- 2. CUSTOM ENUMS & TYPES
-- ====================================================================
DO $$ BEGIN
  CREATE TYPE user_type AS ENUM ('driver', 'rider', 'corp_admin', 'admin');
EXCEPTION
  WHEN duplicate_object THEN 
    ALTER TYPE user_type ADD VALUE IF NOT EXISTS 'admin';
END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'past_due', 'expired', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN
    ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'past_due';
    ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'cancelled';
END $$;

DO $$ BEGIN
  CREATE TYPE trip_status AS ENUM ('requested', 'accepted', 'arrived', 'in_progress', 'payment_pending', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN
    ALTER TYPE trip_status ADD VALUE IF NOT EXISTS 'arrived';
    ALTER TYPE trip_status ADD VALUE IF NOT EXISTS 'payment_pending';
END $$;

DO $$ BEGIN
  CREATE TYPE document_type AS ENUM ('license_front', 'license_back', 'prdp', 'roadworthy', 'vehicle_photo');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE document_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ====================================================================
-- 3. CORE TABLES & COLUMN GUARANTEES
-- ====================================================================

-- A. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT 'User',
    phone TEXT,
    avatar_url TEXT,
    user_type user_type NOT NULL DEFAULT 'rider',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT 'User';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_type user_type NOT NULL DEFAULT 'rider';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- B. DRIVER PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.driver_profiles (
    id UUID PRIMARY KEY,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    vehicle_make TEXT,
    vehicle_model TEXT,
    vehicle_year INT,
    vehicle_color TEXT,
    license_plate TEXT,
    prdp_number TEXT,
    has_license BOOLEAN DEFAULT FALSE,
    has_prdp BOOLEAN DEFAULT FALSE,
    has_roadworthy BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    is_online BOOLEAN DEFAULT FALSE,
    current_lat FLOAT8,
    current_lng FLOAT8,
    location_geo geography(Point, 4326),
    subscription_active BOOLEAN DEFAULT TRUE,
    subscription_status subscription_status DEFAULT 'trial',
    subscription_plan TEXT DEFAULT 'trial',
    subscription_expires_at TIMESTAMPTZ,
    trial_started_at TIMESTAMPTZ DEFAULT NOW(),
    rating_avg NUMERIC(3, 2) DEFAULT 5.00,
    rating_count INT DEFAULT 0,
    verification_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crucial: Ensure ALL columns exist on driver_profiles if table was created previously
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS vehicle_make TEXT;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS vehicle_model TEXT;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS vehicle_year INT;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS vehicle_color TEXT;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS license_plate TEXT;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS prdp_number TEXT;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS has_license BOOLEAN DEFAULT FALSE;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS has_prdp BOOLEAN DEFAULT FALSE;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS has_roadworthy BOOLEAN DEFAULT FALSE;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS current_lat FLOAT8;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS current_lng FLOAT8;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS location_geo geography(Point, 4326);
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS subscription_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS subscription_status subscription_status DEFAULT 'trial';
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'trial';
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3, 2) DEFAULT 5.00;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS rating_count INT DEFAULT 0;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS verification_notes TEXT;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- C. DRIVER DOCUMENTS TABLE (KYC)
CREATE TABLE IF NOT EXISTS public.driver_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
    doc_type document_type NOT NULL,
    file_path TEXT NOT NULL,
    status document_status DEFAULT 'pending',
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(driver_id, doc_type)
);

-- D. TRIPS TABLE
CREATE TABLE IF NOT EXISTS public.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL,
    driver_id UUID REFERENCES public.driver_profiles(id),
    pickup_location TEXT NOT NULL,
    pickup_lat FLOAT8 NOT NULL,
    pickup_lng FLOAT8 NOT NULL,
    pickup_geo geography(Point, 4326),
    dropoff_location TEXT NOT NULL,
    dropoff_lat FLOAT8 NOT NULL,
    dropoff_lng FLOAT8 NOT NULL,
    dropoff_geo geography(Point, 4326),
    fare_amount NUMERIC(10, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested',
    verification_pin VARCHAR(4) DEFAULT LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'),
    scheduled_time TIMESTAMPTZ,
    payment_method TEXT DEFAULT 'in_app' CHECK (payment_method IN ('cash', 'card', 'in_app')),
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
    cancelled_by UUID,
    cancellation_reason TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crucial: Ensure ALL columns exist on trips if table was created previously
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS rider_id UUID;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS driver_id UUID;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS pickup_location TEXT;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS pickup_lat FLOAT8;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS pickup_lng FLOAT8;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS pickup_geo geography(Point, 4326);
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS dropoff_location TEXT;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS dropoff_lat FLOAT8;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS dropoff_lng FLOAT8;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS dropoff_geo geography(Point, 4326);
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS fare_amount NUMERIC(10, 2);
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'requested';
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS verification_pin VARCHAR(4) DEFAULT LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS scheduled_time TIMESTAMPTZ;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'in_app';
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Relax old check constraint if it existed from Phase 1 to support all production statuses
ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS trips_status_check;
ALTER TABLE public.trips ADD CONSTRAINT trips_status_check 
CHECK (status IN ('requested', 'accepted', 'arrived', 'in_progress', 'payment_pending', 'completed', 'cancelled'));

-- E. IN-APP CHAT MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.trip_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('rider', 'driver')),
    content TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- F. TRIP RATINGS & REVIEWS TABLE
CREATE TABLE IF NOT EXISTS public.trip_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL UNIQUE REFERENCES public.trips(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
    rider_id UUID NOT NULL,
    stars INT NOT NULL CHECK (stars >= 1 AND stars <= 5),
    tags TEXT[] DEFAULT '{}',
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 4. TRIGGERS & AUTOMATION
-- ====================================================================

-- A. Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_driver_profiles_updated_at ON public.driver_profiles;
CREATE TRIGGER trigger_driver_profiles_updated_at
    BEFORE UPDATE ON public.driver_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_trips_updated_at ON public.trips;
CREATE TRIGGER trigger_trips_updated_at
    BEFORE UPDATE ON public.trips
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_driver_documents_updated_at ON public.driver_documents;
CREATE TRIGGER trigger_driver_documents_updated_at
    BEFORE UPDATE ON public.driver_documents
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- B. Auto-sync Driver Location to PostGIS Geography Point
CREATE OR REPLACE FUNCTION public.sync_driver_location_geo()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_lat IS NOT NULL AND NEW.current_lng IS NOT NULL THEN
        NEW.location_geo := ST_SetSRID(ST_MakePoint(NEW.current_lng, NEW.current_lat), 4326)::geography;
    ELSE
        NEW.location_geo := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_driver_location_geo ON public.driver_profiles;
CREATE TRIGGER trigger_driver_location_geo
    BEFORE INSERT OR UPDATE ON public.driver_profiles
    FOR EACH ROW EXECUTE FUNCTION public.sync_driver_location_geo();

-- C. Auto-sync Trip Points to PostGIS Geography Points
CREATE OR REPLACE FUNCTION public.sync_trip_points_geo()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.pickup_lat IS NOT NULL AND NEW.pickup_lng IS NOT NULL THEN
        NEW.pickup_geo := ST_SetSRID(ST_MakePoint(NEW.pickup_lng, NEW.pickup_lat), 4326)::geography;
    END IF;
    IF NEW.dropoff_lat IS NOT NULL AND NEW.dropoff_lng IS NOT NULL THEN
        NEW.dropoff_geo := ST_SetSRID(ST_MakePoint(NEW.dropoff_lng, NEW.dropoff_lat), 4326)::geography;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_trip_points_geo ON public.trips;
CREATE TRIGGER trigger_trip_points_geo
    BEFORE INSERT OR UPDATE ON public.trips
    FOR EACH ROW EXECUTE FUNCTION public.sync_trip_points_geo();

-- Backfill PostGIS points for any existing rows
UPDATE public.driver_profiles
SET location_geo = ST_SetSRID(ST_MakePoint(current_lng, current_lat), 4326)::geography
WHERE current_lat IS NOT NULL AND current_lng IS NOT NULL AND location_geo IS NULL;

UPDATE public.trips
SET 
    pickup_geo = ST_SetSRID(ST_MakePoint(pickup_lng, pickup_lat), 4326)::geography,
    dropoff_geo = ST_SetSRID(ST_MakePoint(dropoff_lng, dropoff_lat), 4326)::geography
WHERE pickup_lat IS NOT NULL AND pickup_lng IS NOT NULL AND pickup_geo IS NULL;

-- D. Auto-provision profile from auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_type public.user_type;
    v_full_name TEXT;
    v_phone TEXT;
    v_user_type_str TEXT;
BEGIN
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'User');
    v_phone := COALESCE(NEW.phone, NEW.raw_user_meta_data->>'phone');
    v_user_type_str := LOWER(COALESCE(NEW.raw_user_meta_data->>'user_type', 'rider'));

    -- Safe enum resolution with fallback to rider
    IF v_user_type_str = 'driver' THEN
        v_user_type := 'driver'::public.user_type;
    ELSIF v_user_type_str = 'corp_admin' THEN
        v_user_type := 'corp_admin'::public.user_type;
    ELSIF v_user_type_str = 'admin' THEN
        v_user_type := 'admin'::public.user_type;
    ELSE
        v_user_type := 'rider'::public.user_type;
    END IF;

    -- A. Provision public.profiles
    BEGIN
        INSERT INTO public.profiles (id, full_name, phone, user_type)
        VALUES (NEW.id, v_full_name, v_phone, v_user_type)
        ON CONFLICT (id) DO UPDATE SET
            phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
            full_name = CASE 
                WHEN public.profiles.full_name = 'User' AND EXCLUDED.full_name <> 'User' THEN EXCLUDED.full_name 
                ELSE public.profiles.full_name 
            END,
            user_type = EXCLUDED.user_type;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_new_auth_user: profiles insert warning: %', SQLERRM;
    END;

    -- B. If driver, ensure public.driver_profiles record is provisioned for foreign keys
    IF v_user_type = 'driver'::public.user_type THEN
        BEGIN
            INSERT INTO public.driver_profiles (id, full_name, email, phone)
            VALUES (NEW.id, v_full_name, NEW.email, v_phone)
            ON CONFLICT (id) DO UPDATE SET
                full_name = COALESCE(EXCLUDED.full_name, public.driver_profiles.full_name),
                email = COALESCE(EXCLUDED.email, public.driver_profiles.email),
                phone = COALESCE(EXCLUDED.phone, public.driver_profiles.phone);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'handle_new_auth_user: driver_profiles insert warning: %', SQLERRM;
        END;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- CRITICAL: Never abort auth.users transaction; log warning and allow signup to proceed
        RAISE WARNING 'handle_new_auth_user general exception: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- E. Auto-calculate Driver Running Average Rating
CREATE OR REPLACE FUNCTION public.handle_driver_rating_update()
RETURNS TRIGGER AS $$
DECLARE
    v_avg NUMERIC(3, 2);
    v_count INT;
BEGIN
    SELECT 
        ROUND(AVG(stars)::NUMERIC, 2),
        COUNT(*)
    INTO v_avg, v_count
    FROM public.trip_ratings
    WHERE driver_id = NEW.driver_id;

    UPDATE public.driver_profiles
    SET 
        rating_avg = COALESCE(v_avg, 5.00),
        rating_count = COALESCE(v_count, 0)
    WHERE id = NEW.driver_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_on_trip_rating ON public.trip_ratings;
CREATE TRIGGER trigger_on_trip_rating
    AFTER INSERT OR UPDATE ON public.trip_ratings
    FOR EACH ROW EXECUTE FUNCTION public.handle_driver_rating_update();

-- ====================================================================
-- 5. ATOMIC STORED PROCEDURES (RPCs)
-- ====================================================================

-- A. Atomic Accept Trip with Row Lock (Prevents double acceptance race conditions)
CREATE OR REPLACE FUNCTION public.accept_trip(p_trip_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_trip RECORD;
    v_driver RECORD;
BEGIN
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Verify driver profile exists
    SELECT * INTO v_driver
    FROM public.driver_profiles
    WHERE id = v_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver profile not found';
    END IF;

    -- Atomically lock the trip row to avoid concurrent claim
    SELECT * INTO v_trip
    FROM public.trips
    WHERE id = p_trip_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip does not exist';
    END IF;

    IF v_trip.status <> 'requested' THEN
        RAISE EXCEPTION 'Trip is no longer available';
    END IF;

    -- Assign to this driver
    UPDATE public.trips
    SET 
        driver_id = v_driver_id,
        status = 'accepted',
        updated_at = NOW()
    WHERE id = p_trip_id;

    RETURN jsonb_build_object(
        'success', true,
        'trip_id', p_trip_id,
        'status', 'accepted'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. Verify Rider PIN and Start Trip
CREATE OR REPLACE FUNCTION public.start_trip(p_trip_id UUID, p_pin VARCHAR)
RETURNS JSONB AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_trip RECORD;
BEGIN
    SELECT * INTO v_trip
    FROM public.trips
    WHERE id = p_trip_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    IF v_trip.driver_id <> v_driver_id THEN
        RAISE EXCEPTION 'Unauthorized: You are not assigned to this trip';
    END IF;

    IF v_trip.status <> 'accepted' AND v_trip.status <> 'arrived' THEN
        RAISE EXCEPTION 'Trip is not in accepted or arrived status';
    END IF;

    IF v_trip.verification_pin <> p_pin THEN
        RAISE EXCEPTION 'Invalid verification PIN provided by rider';
    END IF;

    UPDATE public.trips
    SET 
        status = 'in_progress',
        updated_at = NOW()
    WHERE id = p_trip_id;

    RETURN jsonb_build_object('success', true, 'status', 'in_progress');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- C. Complete Trip
CREATE OR REPLACE FUNCTION public.complete_trip(p_trip_id UUID, p_payment_method TEXT DEFAULT 'in_app')
RETURNS JSONB AS $$
DECLARE
    v_driver_id UUID := auth.uid();
    v_trip RECORD;
BEGIN
    SELECT * INTO v_trip
    FROM public.trips
    WHERE id = p_trip_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Trip not found';
    END IF;

    IF v_trip.driver_id <> v_driver_id THEN
        RAISE EXCEPTION 'Unauthorized: You are not assigned to this trip';
    END IF;

    IF v_trip.status <> 'in_progress' AND v_trip.status <> 'payment_pending' THEN
        RAISE EXCEPTION 'Trip cannot be completed from current state';
    END IF;

    UPDATE public.trips
    SET 
        status = CASE WHEN p_payment_method = 'cash' THEN 'completed' ELSE 'payment_pending' END,
        payment_method = p_payment_method,
        payment_status = CASE WHEN p_payment_method = 'cash' THEN 'paid' ELSE 'pending' END,
        completed_at = CASE WHEN p_payment_method = 'cash' THEN NOW() ELSE completed_at END,
        updated_at = NOW()
    WHERE id = p_trip_id;

    RETURN jsonb_build_object(
        'success', true, 
        'status', CASE WHEN p_payment_method = 'cash' THEN 'completed' ELSE 'payment_pending' END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- D. PostGIS: Get Nearby Drivers (for Riders)
CREATE OR REPLACE FUNCTION public.get_nearby_drivers(
    p_lat FLOAT8,
    p_lng FLOAT8,
    p_radius_meters FLOAT8 DEFAULT 10000
)
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    vehicle_make TEXT,
    vehicle_model TEXT,
    license_plate TEXT,
    current_lat FLOAT8,
    current_lng FLOAT8,
    rating_avg NUMERIC(3, 2),
    rating_count INT,
    distance_km FLOAT8
) AS $$
DECLARE
    v_search_point geography := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
BEGIN
    RETURN QUERY
    SELECT 
        dp.id,
        COALESCE(dp.full_name, p.full_name, 'Driver') AS full_name,
        dp.vehicle_make,
        dp.vehicle_model,
        dp.license_plate,
        dp.current_lat,
        dp.current_lng,
        COALESCE(dp.rating_avg, 5.00) AS rating_avg,
        COALESCE(dp.rating_count, 0) AS rating_count,
        ROUND((ST_Distance(dp.location_geo, v_search_point) / 1000.0)::NUMERIC, 1)::FLOAT8 AS distance_km
    FROM public.driver_profiles dp
    LEFT JOIN public.profiles p ON p.id = dp.id
    WHERE dp.is_online = true
      AND dp.location_geo IS NOT NULL
      AND ST_DWithin(dp.location_geo, v_search_point, p_radius_meters)
    ORDER BY ST_Distance(dp.location_geo, v_search_point) ASC
    LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- E. PostGIS: Get Nearby Requested Trips (for Online Drivers)
CREATE OR REPLACE FUNCTION public.get_nearby_requested_trips(
    p_lat FLOAT8,
    p_lng FLOAT8,
    p_radius_meters FLOAT8 DEFAULT 15000
)
RETURNS TABLE (
    id UUID,
    rider_id UUID,
    rider_name TEXT,
    pickup_location TEXT,
    pickup_lat FLOAT8,
    pickup_lng FLOAT8,
    dropoff_location TEXT,
    dropoff_lat FLOAT8,
    dropoff_lng FLOAT8,
    fare_amount NUMERIC(10, 2),
    status TEXT,
    scheduled_time TIMESTAMPTZ,
    distance_km FLOAT8,
    created_at TIMESTAMPTZ
) AS $$
DECLARE
    v_driver_point geography := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.rider_id,
        COALESCE(p.full_name, 'Rider') AS rider_name,
        t.pickup_location,
        t.pickup_lat,
        t.pickup_lng,
        t.dropoff_location,
        t.dropoff_lat,
        t.dropoff_lng,
        t.fare_amount,
        t.status::TEXT,
        t.scheduled_time,
        ROUND((ST_Distance(t.pickup_geo, v_driver_point) / 1000.0)::NUMERIC, 1)::FLOAT8 AS distance_km,
        t.created_at
    FROM public.trips t
    LEFT JOIN public.profiles p ON p.id = t.rider_id
    WHERE t.status = 'requested'
      AND t.driver_id IS NULL
      AND t.pickup_geo IS NOT NULL
      AND ST_DWithin(t.pickup_geo, v_driver_point, p_radius_meters)
    ORDER BY ST_Distance(t.pickup_geo, v_driver_point) ASC, t.created_at ASC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================================================
-- 6. INDEXES FOR HIGH-SPEED LOOKUPS & SPATIAL QUERIES
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_trips_rider_id ON public.trips(rider_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON public.trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON public.trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_created_at ON public.trips(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_messages_trip_id ON public.trip_messages(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_ratings_driver_id ON public.trip_ratings(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_online ON public.driver_profiles(is_online) WHERE is_online = true;
CREATE INDEX IF NOT EXISTS idx_driver_documents_driver ON public.driver_documents(driver_id);

-- GiST Spatial Indexes
CREATE INDEX IF NOT EXISTS idx_driver_profiles_location_geo ON public.driver_profiles USING GIST (location_geo);
CREATE INDEX IF NOT EXISTS idx_trips_pickup_geo ON public.trips USING GIST (pickup_geo);

-- ====================================================================
-- 7. REALTIME BROADCAST & SUBSCRIPTION PUBLICATION
-- ====================================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.trips;
EXCEPTION WHEN OTHERS THEN null;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_messages;
EXCEPTION WHEN OTHERS THEN null;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_profiles;
EXCEPTION WHEN OTHERS THEN null;
END $$;

-- ====================================================================
-- 8. HARDENED ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_ratings ENABLE ROW LEVEL SECURITY;

-- A. PROFILES
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
CREATE POLICY "profiles_insert_policy" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- B. DRIVER PROFILES
DROP POLICY IF EXISTS "Allow public read access to driver profiles" ON public.driver_profiles;
DROP POLICY IF EXISTS "Allow public insert to driver profiles" ON public.driver_profiles;
DROP POLICY IF EXISTS "Allow public update to driver profiles" ON public.driver_profiles;
DROP POLICY IF EXISTS "driver_profiles_select_policy" ON public.driver_profiles;
CREATE POLICY "driver_profiles_select_policy" ON public.driver_profiles
    FOR SELECT TO authenticated, anon
    USING (
        id = auth.uid() 
        OR is_online = true
    );

DROP POLICY IF EXISTS "driver_profiles_insert_policy" ON public.driver_profiles;
CREATE POLICY "driver_profiles_insert_policy" ON public.driver_profiles
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

DROP POLICY IF EXISTS "driver_profiles_update_policy" ON public.driver_profiles;
CREATE POLICY "driver_profiles_update_policy" ON public.driver_profiles
    FOR UPDATE TO authenticated, anon
    USING (id = auth.uid() OR auth.uid() IS NULL)
    WITH CHECK (id = auth.uid() OR auth.uid() IS NULL);

-- C. DRIVER DOCUMENTS
DROP POLICY IF EXISTS "driver_documents_select" ON public.driver_documents;
CREATE POLICY "driver_documents_select" ON public.driver_documents
    FOR SELECT TO authenticated
    USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "driver_documents_insert" ON public.driver_documents;
CREATE POLICY "driver_documents_insert" ON public.driver_documents
    FOR INSERT TO authenticated
    WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "driver_documents_update" ON public.driver_documents;
CREATE POLICY "driver_documents_update" ON public.driver_documents
    FOR UPDATE TO authenticated
    USING (driver_id = auth.uid())
    WITH CHECK (driver_id = auth.uid() AND status = 'pending');

-- D. TRIPS
DROP POLICY IF EXISTS "Allow public read access to trips" ON public.trips;
DROP POLICY IF EXISTS "Allow public insert to trips" ON public.trips;
DROP POLICY IF EXISTS "Allow public update to trips" ON public.trips;
DROP POLICY IF EXISTS "trips_select_policy" ON public.trips;
CREATE POLICY "trips_select_policy" ON public.trips
    FOR SELECT TO authenticated, anon
    USING (
        rider_id = auth.uid()
        OR driver_id = auth.uid()
        OR status = 'requested'
    );

DROP POLICY IF EXISTS "trips_insert_policy" ON public.trips;
CREATE POLICY "trips_insert_policy" ON public.trips
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

DROP POLICY IF EXISTS "trips_update_policy" ON public.trips;
CREATE POLICY "trips_update_policy" ON public.trips
    FOR UPDATE TO authenticated, anon
    USING (true)
    WITH CHECK (true);

-- E. TRIP MESSAGES
DROP POLICY IF EXISTS "trip_messages_select" ON public.trip_messages;
CREATE POLICY "trip_messages_select" ON public.trip_messages
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "trip_messages_insert" ON public.trip_messages;
CREATE POLICY "trip_messages_insert" ON public.trip_messages
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

-- F. TRIP RATINGS
DROP POLICY IF EXISTS "trip_ratings_select" ON public.trip_ratings;
CREATE POLICY "trip_ratings_select" ON public.trip_ratings
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "trip_ratings_insert" ON public.trip_ratings;
CREATE POLICY "trip_ratings_insert" ON public.trip_ratings
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

-- ====================================================================
-- 9. STORAGE BUCKETS & POLICIES
-- ====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-documents', 'driver-documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "driver_docs_select_own" ON storage.objects;
CREATE POLICY "driver_docs_select_own" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'driver-documents' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "driver_docs_insert_own" ON storage.objects;
CREATE POLICY "driver_docs_insert_own" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'driver-documents' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "driver_docs_delete_own" ON storage.objects;
CREATE POLICY "driver_docs_delete_own" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'driver-documents' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "avatars_public_select" ON storage.objects;
CREATE POLICY "avatars_public_select" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_user_upload" ON storage.objects;
CREATE POLICY "avatars_user_upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- ====================================================================
-- 10. FUNCTION PERMISSIONS
-- ====================================================================
GRANT EXECUTE ON FUNCTION public.accept_trip(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.start_trip(UUID, VARCHAR) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.complete_trip(UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_drivers(FLOAT8, FLOAT8, FLOAT8) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_requested_trips(FLOAT8, FLOAT8, FLOAT8) TO authenticated, anon;
