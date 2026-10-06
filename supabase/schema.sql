-- SOLO Supabase Initial Schema

-- 1. Create Driver Profiles Table
CREATE TABLE IF NOT EXISTS public.driver_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  vehicle_make TEXT,
  vehicle_model TEXT,
  license_plate TEXT,
  prdp_number TEXT,
  has_license BOOLEAN DEFAULT false,
  has_prdp BOOLEAN DEFAULT false,
  has_roadworthy BOOLEAN DEFAULT false,
  subscription_active BOOLEAN DEFAULT true,
  subscription_plan TEXT DEFAULT 'trial',
  trial_started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Create Trips Table
CREATE TABLE IF NOT EXISTS public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL, -- Will link to an auth.users ID later
  driver_id UUID REFERENCES public.driver_profiles(id),
  pickup_location TEXT NOT NULL,
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  dropoff_location TEXT NOT NULL,
  dropoff_lat DOUBLE PRECISION NOT NULL,
  dropoff_lng DOUBLE PRECISION NOT NULL,
  fare_amount DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested', 'accepted', 'in_progress', 'payment_pending', 'completed')),
  scheduled_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable Realtime for trips
-- (Needed so riders can listen for updates to their trips)
alter publication supabase_realtime add table public.trips;

-- Set up basic Row Level Security (RLS) policies
-- Note: In Phase 1 we allow public access just to test connectivity,
-- but we will lock this down using Auth in Phase 2.
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to driver profiles" ON public.driver_profiles FOR SELECT USING (true);
CREATE POLICY "Allow public insert to driver profiles" ON public.driver_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update to driver profiles" ON public.driver_profiles FOR UPDATE USING (true);

CREATE POLICY "Allow public read access to trips" ON public.trips FOR SELECT USING (true);
CREATE POLICY "Allow public insert to trips" ON public.trips FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update to trips" ON public.trips FOR UPDATE USING (true);
