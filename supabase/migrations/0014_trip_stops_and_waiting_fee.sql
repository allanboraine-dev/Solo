-- =============================================================================
-- Migration 0014: Multi-Stop Trips & 2-Minute Pickup Grace Period Waiting Fee
-- =============================================================================

ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS stops JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS base_agreed_fare NUMERIC(10, 2);
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS stops_fare_adjustment NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS waiting_fee_amount NUMERIC(10, 2) DEFAULT 0;
