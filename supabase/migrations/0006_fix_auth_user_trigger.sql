-- ====================================================================
-- SOLO E-HAILING PLATFORM: MIGRATION 0006
-- Fix Auth User Registration Trigger & Prevent "Database error saving new user"
-- ====================================================================

-- 1. Ensure user_type enum exists and contains all valid roles
DO $$ BEGIN
  CREATE TYPE public.user_type AS ENUM ('driver', 'rider', 'corp_admin', 'admin');
EXCEPTION
  WHEN duplicate_object THEN 
    ALTER TYPE public.user_type ADD VALUE IF NOT EXISTS 'driver';
    ALTER TYPE public.user_type ADD VALUE IF NOT EXISTS 'rider';
    ALTER TYPE public.user_type ADD VALUE IF NOT EXISTS 'corp_admin';
    ALTER TYPE public.user_type ADD VALUE IF NOT EXISTS 'admin';
END $$;

-- 2. Hardened handle_new_auth_user with explicit search_path and safety exception handling
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

-- 3. Re-bind the trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 4. Grant table privileges to authenticated and service_role
GRANT ALL ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.driver_profiles TO authenticated;
GRANT ALL ON public.driver_profiles TO service_role;
