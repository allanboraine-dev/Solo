-- ====================================================================
-- SOLO E-HAILING PLATFORM: MIGRATION 0011
-- Restrict Duplicate Driver Registrations (Email, Phone, License Plate, PrDP)
-- ====================================================================

-- 1. Ensure phone numbers on driver_profiles cannot be duplicated across multiple accounts
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_profiles_unique_phone
ON public.driver_profiles (phone)
WHERE phone IS NOT NULL AND phone <> '';

-- 2. Ensure vehicle license plates are unique (case-insensitive and normalized without spaces/hyphens)
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_profiles_unique_license_plate
ON public.driver_profiles (UPPER(REGEXP_REPLACE(license_plate, '[\s\-_.]', '', 'g')))
WHERE license_plate IS NOT NULL AND license_plate <> '';

-- 3. Ensure PrDP permit numbers are unique (case-insensitive and normalized without spaces/hyphens)
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_profiles_unique_prdp_number
ON public.driver_profiles (UPPER(REGEXP_REPLACE(prdp_number, '[\s\-_.]', '', 'g')))
WHERE prdp_number IS NOT NULL AND prdp_number <> '';

-- 4. Also restrict duplicate phone numbers on base user profiles
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_unique_phone
ON public.profiles (phone)
WHERE phone IS NOT NULL AND phone <> '';
