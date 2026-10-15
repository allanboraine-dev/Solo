-- ====================================================================
-- SOLO E-Hailing Platform: Production Hardening & RLS Migration
-- Migration: 0002_production_hardening.sql
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMS & TYPES HARDENING
DO $$ BEGIN
  CREATE TYPE user_type AS ENUM ('driver', 'rider', 'corp_admin', 'admin');
EXCEPTION
  WHEN duplicate_object THEN 
    -- Add admin if missing
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

-- 3. PROFILES TABLE ENHANCEMENTS
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    user_type user_type NOT NULL DEFAULT 'rider',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist if table was already created
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 4. DRIVER PROFILES ENHANCEMENTS
CREATE TABLE IF NOT EXISTS public.driver_profiles (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    vehicle_make TEXT,
    vehicle_model TEXT,
    vehicle_year INT,
    vehicle_color TEXT,
    license_plate TEXT,
    prdp_number TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    is_online BOOLEAN DEFAULT FALSE,
    current_lat FLOAT8,
    current_lng FLOAT8,
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

ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS vehicle_make TEXT;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS vehicle_year INT;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS vehicle_color TEXT;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'trial';
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3, 2) DEFAULT 5.00;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS rating_count INT DEFAULT 0;
ALTER TABLE public.driver_profiles ADD COLUMN IF NOT EXISTS verification_notes TEXT;

-- 5. DRIVER KYC & VERIFICATION DOCUMENTS
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

-- 6. TRIPS TABLE ENHANCEMENTS
CREATE TABLE IF NOT EXISTS public.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES public.profiles(id),
    driver_id UUID REFERENCES public.driver_profiles(id),
    pickup_location TEXT NOT NULL,
    pickup_lat FLOAT8 NOT NULL,
    pickup_lng FLOAT8 NOT NULL,
    dropoff_location TEXT NOT NULL,
    dropoff_lat FLOAT8 NOT NULL,
    dropoff_lng FLOAT8 NOT NULL,
    fare_amount NUMERIC(10, 2) NOT NULL,
    status trip_status DEFAULT 'requested',
    verification_pin VARCHAR(4) DEFAULT LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0'),
    scheduled_time TIMESTAMPTZ,
    payment_method TEXT DEFAULT 'in_app' CHECK (payment_method IN ('cash', 'card', 'in_app')),
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed')),
    cancelled_by UUID REFERENCES public.profiles(id),
    cancellation_reason TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS verification_pin VARCHAR(4) DEFAULT LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS scheduled_time TIMESTAMPTZ;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'in_app';
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 7. IN-APP CHAT MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.trip_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('rider', 'driver')),
    content TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. TRIP RATINGS & REVIEWS TABLE
CREATE TABLE IF NOT EXISTS public.trip_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id UUID NOT NULL UNIQUE REFERENCES public.trips(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES public.driver_profiles(id) ON DELETE CASCADE,
    rider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    stars INT NOT NULL CHECK (stars >= 1 AND stars <= 5),
    tags TEXT[] DEFAULT '{}',
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ====================================================================
-- 9. TRIGGERS & AUTOMATION
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

-- B. Sync new auth.users into public.profiles automatically
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, phone, user_type)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
        NEW.phone,
        COALESCE((NEW.raw_user_meta_data->>'user_type')::user_type, 'rider'::user_type)
    )
    ON CONFLICT (id) DO UPDATE SET
        phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
        full_name = CASE 
            WHEN public.profiles.full_name = 'User' AND EXCLUDED.full_name <> 'User' THEN EXCLUDED.full_name 
            ELSE public.profiles.full_name 
        END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- C. Automatically calculate and update driver average rating
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
-- 10. ATOMIC STORED PROCEDURES (RPCs)
-- ====================================================================

-- A. Atomic Accept Trip with Row Lock (Prevents double acceptance race condition)
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

    -- Verify driver is authorized, verified, and has active subscription
    SELECT * INTO v_driver
    FROM public.driver_profiles
    WHERE id = v_driver_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Driver profile not found';
    END IF;

    IF NOT v_driver.is_verified THEN
        RAISE EXCEPTION 'Driver account is pending verification';
    END IF;

    IF NOT v_driver.is_online THEN
        RAISE EXCEPTION 'Driver must be online to accept trips';
    END IF;

    IF v_driver.subscription_status NOT IN ('active', 'trial') THEN
        RAISE EXCEPTION 'Driver subscription is inactive';
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

-- B. Verify PIN and Start Trip
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

-- ====================================================================
-- 11. INDEXES FOR PERFORMANCE & SEARCH
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_trips_rider_id ON public.trips(rider_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver_id ON public.trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON public.trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_created_at ON public.trips(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_messages_trip_id ON public.trip_messages(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_ratings_driver_id ON public.trip_ratings(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_online ON public.driver_profiles(is_online) WHERE is_online = true;
CREATE INDEX IF NOT EXISTS idx_driver_documents_driver ON public.driver_documents(driver_id);

-- ====================================================================
-- 12. REALTIME CONFIGURATION
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
-- 13. HARDENED ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================

-- Enable RLS across all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_ratings ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- A. PROFILES POLICIES
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;

-- Authenticated users can view profile details (required to show driver/rider names on rides)
CREATE POLICY "profiles_select_policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (true);

-- Users can only insert their own profile matching auth.uid()
CREATE POLICY "profiles_insert_policy" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id);

-- Users can only update their own profile
CREATE POLICY "profiles_update_policy" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- --------------------------------------------------------------------
-- B. DRIVER PROFILES POLICIES
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Public driver profiles are viewable by everyone." ON public.driver_profiles;
DROP POLICY IF EXISTS "Drivers can update own profile." ON public.driver_profiles;
DROP POLICY IF EXISTS "driver_profiles_select_policy" ON public.driver_profiles;
DROP POLICY IF EXISTS "driver_profiles_insert_policy" ON public.driver_profiles;
DROP POLICY IF EXISTS "driver_profiles_update_policy" ON public.driver_profiles;

-- Authenticated riders can view online & verified drivers, or driver can view their own profile
CREATE POLICY "driver_profiles_select_policy" ON public.driver_profiles
    FOR SELECT TO authenticated
    USING (
        id = auth.uid() 
        OR (is_online = true AND is_verified = true)
    );

-- Drivers can create their own profile
CREATE POLICY "driver_profiles_insert_policy" ON public.driver_profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id);

-- Drivers can update their own operational status (lat, lng, online), but NOT verification
CREATE POLICY "driver_profiles_update_policy" ON public.driver_profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- --------------------------------------------------------------------
-- C. DRIVER DOCUMENTS POLICIES
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "driver_documents_select" ON public.driver_documents;
DROP POLICY IF EXISTS "driver_documents_insert" ON public.driver_documents;
DROP POLICY IF EXISTS "driver_documents_update" ON public.driver_documents;

CREATE POLICY "driver_documents_select" ON public.driver_documents
    FOR SELECT TO authenticated
    USING (driver_id = auth.uid());

CREATE POLICY "driver_documents_insert" ON public.driver_documents
    FOR INSERT TO authenticated
    WITH CHECK (driver_id = auth.uid());

CREATE POLICY "driver_documents_update" ON public.driver_documents
    FOR UPDATE TO authenticated
    USING (driver_id = auth.uid())
    WITH CHECK (driver_id = auth.uid() AND status = 'pending');

-- --------------------------------------------------------------------
-- D. TRIPS POLICIES
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public read access to trips" ON public.trips;
DROP POLICY IF EXISTS "Allow public insert to trips" ON public.trips;
DROP POLICY IF EXISTS "Allow public update to trips" ON public.trips;
DROP POLICY IF EXISTS "Trips are viewable by everyone." ON public.trips;
DROP POLICY IF EXISTS "Anyone can create a trip." ON public.trips;
DROP POLICY IF EXISTS "Anyone can update a trip." ON public.trips;
DROP POLICY IF EXISTS "trips_select_policy" ON public.trips;
DROP POLICY IF EXISTS "trips_insert_policy" ON public.trips;
DROP POLICY IF EXISTS "trips_update_policy" ON public.trips;

-- Trips can be read by:
-- 1. The rider who booked it
-- 2. The driver assigned to it
-- 3. Verified, active online drivers IF the trip is currently unassigned and in 'requested' status
CREATE POLICY "trips_select_policy" ON public.trips
    FOR SELECT TO authenticated
    USING (
        rider_id = auth.uid()
        OR driver_id = auth.uid()
        OR (
            status = 'requested'
            AND EXISTS (
                SELECT 1 FROM public.driver_profiles
                WHERE id = auth.uid() 
                AND is_online = true 
                AND is_verified = true
                AND subscription_status IN ('active', 'trial')
            )
        )
    );

-- Only authenticated riders can create trips for themselves
CREATE POLICY "trips_insert_policy" ON public.trips
    FOR INSERT TO authenticated
    WITH CHECK (rider_id = auth.uid());

-- Trips can be updated by:
-- 1. The rider (only if trip is requested or accepted, e.g. to cancel)
-- 2. The assigned driver
CREATE POLICY "trips_update_policy" ON public.trips
    FOR UPDATE TO authenticated
    USING (
        rider_id = auth.uid()
        OR driver_id = auth.uid()
    )
    WITH CHECK (
        rider_id = auth.uid()
        OR driver_id = auth.uid()
    );

-- --------------------------------------------------------------------
-- E. TRIP MESSAGES POLICIES
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "trip_messages_select" ON public.trip_messages;
DROP POLICY IF EXISTS "trip_messages_insert" ON public.trip_messages;

-- Only the rider and assigned driver on the trip can view messages
CREATE POLICY "trip_messages_select" ON public.trip_messages
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.trips t
            WHERE t.id = trip_messages.trip_id
            AND (t.rider_id = auth.uid() OR t.driver_id = auth.uid())
        )
    );

-- Only the rider and assigned driver on the trip can send messages
CREATE POLICY "trip_messages_insert" ON public.trip_messages
    FOR INSERT TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.trips t
            WHERE t.id = trip_messages.trip_id
            AND (t.rider_id = auth.uid() OR t.driver_id = auth.uid())
        )
    );

-- --------------------------------------------------------------------
-- F. TRIP RATINGS POLICIES
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "trip_ratings_select" ON public.trip_ratings;
DROP POLICY IF EXISTS "trip_ratings_insert" ON public.trip_ratings;

-- Anyone authenticated can view ratings
CREATE POLICY "trip_ratings_select" ON public.trip_ratings
    FOR SELECT TO authenticated
    USING (true);

-- Only the rider of a completed trip can submit a rating
CREATE POLICY "trip_ratings_insert" ON public.trip_ratings
    FOR INSERT TO authenticated
    WITH CHECK (
        rider_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.trips t
            WHERE t.id = trip_ratings.trip_id
            AND t.rider_id = auth.uid()
            AND t.driver_id = trip_ratings.driver_id
            AND t.status = 'completed'
        )
    );

-- --------------------------------------------------------------------
-- 14. STORAGE BUCKET POLICIES (for driver-documents & avatars)
-- --------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-documents', 'driver-documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Driver Documents Bucket
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

-- Storage RLS: Public Avatars Bucket
DROP POLICY IF EXISTS "avatars_public_select" ON storage.objects;
CREATE POLICY "avatars_public_select" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_user_upload" ON storage.objects;
CREATE POLICY "avatars_user_upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);
