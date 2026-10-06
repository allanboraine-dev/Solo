-- Enable pgcrypto for UUIDs if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create ENUM types
CREATE TYPE user_type AS ENUM ('driver', 'rider', 'corp_admin');
CREATE TYPE subscription_status AS ENUM ('active', 'trial', 'expired');
CREATE TYPE trip_status AS ENUM ('requested', 'accepted', 'in_progress', 'completed', 'cancelled');
CREATE TYPE trip_type AS ENUM ('standard', 'corporate');

-- 1. profiles
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT,
    user_type user_type NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. driver_profiles
CREATE TABLE driver_profiles (
    id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    vehicle_model TEXT,
    license_plate TEXT,
    prdp_number TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    is_online BOOLEAN DEFAULT FALSE,
    current_lat FLOAT8,
    current_lng FLOAT8,
    subscription_status subscription_status DEFAULT 'trial',
    subscription_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. corporate_accounts
CREATE TABLE corporate_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    wallet_balance NUMERIC(10, 2) DEFAULT 0.00,
    management_fee_rate NUMERIC(3, 2) DEFAULT 0.05,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. trips
CREATE TABLE trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rider_id UUID NOT NULL REFERENCES profiles(id),
    driver_id UUID REFERENCES driver_profiles(id),
    corp_account_id UUID REFERENCES corporate_accounts(id),
    pickup_location TEXT NOT NULL,
    pickup_lat FLOAT8 NOT NULL,
    pickup_lng FLOAT8 NOT NULL,
    dropoff_location TEXT NOT NULL,
    dropoff_lat FLOAT8 NOT NULL,
    dropoff_lng FLOAT8 NOT NULL,
    fare_amount NUMERIC(10, 2) NOT NULL,
    status trip_status DEFAULT 'requested',
    trip_type trip_type DEFAULT 'standard',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Setup Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporate_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

-- Basic Policies (To be tightened in production)
CREATE POLICY "Public profiles are viewable by everyone." ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile." ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile." ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Public driver profiles are viewable by everyone." ON driver_profiles FOR SELECT USING (true);
CREATE POLICY "Drivers can update own profile." ON driver_profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Corporate accounts viewable by public." ON corporate_accounts FOR SELECT USING (true);

CREATE POLICY "Trips are viewable by everyone." ON trips FOR SELECT USING (true);
CREATE POLICY "Anyone can create a trip." ON trips FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update a trip." ON trips FOR UPDATE USING (true);

-- Enable Realtime for the 'trips' and 'driver_profiles' tables
alter publication supabase_realtime add table trips;
alter publication supabase_realtime add table driver_profiles;
