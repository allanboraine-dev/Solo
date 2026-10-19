-- ====================================================================
-- SOLO E-HAILING PLATFORM: MIGRATION 0010
-- POPIA Compliance, Data Protection & Database RLS Hardening
-- ====================================================================

-- 1. Revoke public/anonymous access to sensitive driver identity and KYC documents
REVOKE ALL ON public.driver_documents FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.driver_profiles FROM anon;

-- 2. Restrict driver_documents RLS
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_documents_select" ON public.driver_documents;
CREATE POLICY "driver_documents_select" ON public.driver_documents
    FOR SELECT TO authenticated
    USING (driver_id = (select auth.uid()));

DROP POLICY IF EXISTS "driver_documents_insert" ON public.driver_documents;
CREATE POLICY "driver_documents_insert" ON public.driver_documents
    FOR INSERT TO authenticated
    WITH CHECK (driver_id = (select auth.uid()));

DROP POLICY IF EXISTS "driver_documents_update" ON public.driver_documents;
CREATE POLICY "driver_documents_update" ON public.driver_documents
    FOR UPDATE TO authenticated
    USING (driver_id = (select auth.uid()))
    WITH CHECK (driver_id = (select auth.uid()));

-- 3. Restrict driver_profiles RLS: Eliminate anon updates
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_profiles_select" ON public.driver_profiles;
CREATE POLICY "driver_profiles_select" ON public.driver_profiles
    FOR SELECT TO authenticated, anon
    USING (id = (select auth.uid()) OR is_online = true);

DROP POLICY IF EXISTS "driver_profiles_update" ON public.driver_profiles;
CREATE POLICY "driver_profiles_update" ON public.driver_profiles
    FOR UPDATE TO authenticated
    USING (id = (select auth.uid()))
    WITH CHECK (id = (select auth.uid()));

-- 4. Restrict safety_incidents: Prevent public snooping on SOS distress beacons
ALTER TABLE public.safety_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read on safety_incidents" ON public.safety_incidents;
CREATE POLICY "Allow incident owner or responder read on safety_incidents" ON public.safety_incidents
    FOR SELECT TO authenticated
    USING (user_id = (select auth.uid()));

-- Emergency SOS inserts remain allowed for verified users / apps
DROP POLICY IF EXISTS "Allow public insert on safety_incidents for emergency SOS" ON public.safety_incidents;
CREATE POLICY "Allow insert on safety_incidents for emergency SOS" ON public.safety_incidents
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

-- 5. Grant least-privilege permissions
GRANT SELECT ON public.driver_profiles TO anon, authenticated;
GRANT UPDATE, INSERT ON public.driver_profiles TO authenticated;
GRANT ALL ON public.driver_documents TO authenticated;
GRANT ALL ON public.driver_documents TO service_role;
GRANT ALL ON public.driver_profiles TO service_role;
GRANT ALL ON public.safety_incidents TO service_role;
