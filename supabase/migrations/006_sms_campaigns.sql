-- ============================================================
-- Store Signal — Migration 006: SMS Campaign Support
-- ============================================================

-- Add channel column to klaviyo_campaigns (email | sms)
ALTER TABLE public.klaviyo_campaigns
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email';

-- Add channel column to klaviyo_flows (email | sms | multi)
ALTER TABLE public.klaviyo_flows
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email';
