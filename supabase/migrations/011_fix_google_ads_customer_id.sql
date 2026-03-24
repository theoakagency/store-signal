-- ============================================================
-- Store Signal — Migration 011: Fix Google Ads customer ID
-- ============================================================
-- Corrects a previously stored 9-digit value (914574200) to
-- the correct 10-digit customer ID (9145748200).

UPDATE public.stores
SET google_ads_customer_id = '9145748200'
WHERE google_ads_customer_id = '914574200';
