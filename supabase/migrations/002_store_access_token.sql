-- Add cached Shopify access token to stores table.
-- Token is fetched once via client_credentials OAuth exchange and reused.
alter table public.stores
  add column if not exists shopify_access_token text;
