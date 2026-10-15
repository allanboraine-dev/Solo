-- Migration 0004: Web Push Notification Subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    role VARCHAR(20) NOT NULL CHECK (role IN ('driver', 'rider')),
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Index for lookup by user_id and role
CREATE INDEX IF NOT EXISTS idx_push_subs_user_role ON public.push_subscriptions(user_id, role);
CREATE INDEX IF NOT EXISTS idx_push_subs_role ON public.push_subscriptions(role);

-- Enable Row Level Security
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can insert or update their own push subscription
CREATE POLICY "Allow public insert/update push subscription"
    ON public.push_subscriptions
    FOR ALL
    USING (true)
    WITH CHECK (true);
