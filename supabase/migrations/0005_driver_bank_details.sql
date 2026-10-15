-- Migration 0005: Driver Bank Settlement Details for South African Direct Payouts
ALTER TABLE public.driver_profiles
    ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS bank_code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS branch_code VARCHAR(10),
    ADD COLUMN IF NOT EXISTS account_number_last4 VARCHAR(4),
    ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'cheque',
    ADD COLUMN IF NOT EXISTS paystack_recipient_code VARCHAR(100),
    ADD COLUMN IF NOT EXISTS payout_verified BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS bank_updated_at TIMESTAMPTZ;

-- Index for recipient lookup
CREATE INDEX IF NOT EXISTS idx_driver_paystack_recipient ON public.driver_profiles(paystack_recipient_code);
