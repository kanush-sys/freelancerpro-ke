-- ═══════════════════════════════════════════════════════════════
-- FreelancerPro KE — Supabase Database Schema
-- ═══════════════════════════════════════════════════════════════
-- HOW TO USE:
--   1. Go to your Supabase project → SQL Editor → New Query
--   2. Paste this entire file and click RUN
--   3. All tables, indexes, triggers and RLS policies are created
-- ═══════════════════════════════════════════════════════════════


-- ── 1. PROFILES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id               UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT        NOT NULL UNIQUE,
  name             TEXT        NOT NULL,
  premium          BOOLEAN     NOT NULL DEFAULT FALSE,
  premium_since    TIMESTAMPTZ,
  premium_expires  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_all" ON public.profiles;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Correct service-role check for modern Supabase
CREATE POLICY "profiles_service_all"
  ON public.profiles FOR ALL
  USING ((SELECT auth.role()) = 'service_role');


-- ── 2. PAYMENTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id                   BIGSERIAL   PRIMARY KEY,
  checkout_request_id  TEXT        NOT NULL UNIQUE,
  merchant_request_id  TEXT,
  user_id              UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  phone                TEXT        NOT NULL,
  amount               INTEGER     NOT NULL DEFAULT 399,
  status               TEXT        NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','success','failed','cancelled','timeout')),
  mpesa_code           TEXT,
  premium_granted      BOOLEAN     DEFAULT FALSE,
  failure_reason       TEXT,
  callback_payload     JSONB,
  confirmed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_checkout_idx ON public.payments(checkout_request_id);
CREATE INDEX IF NOT EXISTS payments_user_idx     ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS payments_phone_idx    ON public.payments(phone);
CREATE INDEX IF NOT EXISTS payments_status_idx   ON public.payments(status);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select_own"  ON public.payments;
DROP POLICY IF EXISTS "payments_service_all" ON public.payments;

CREATE POLICY "payments_select_own"
  ON public.payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "payments_service_all"
  ON public.payments FOR ALL
  USING ((SELECT auth.role()) = 'service_role');


-- ── 3. PENDING PREMIUMS ───────────────────────────────────────
-- Stores payments made before a user account existed.
-- On login, user can claim their premium using their phone number.
CREATE TABLE IF NOT EXISTS public.pending_premiums (
  id          BIGSERIAL   PRIMARY KEY,
  phone       TEXT        NOT NULL UNIQUE,
  mpesa_code  TEXT        NOT NULL,
  amount      INTEGER,
  claimed     BOOLEAN     DEFAULT FALSE,
  claimed_by  UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at  TIMESTAMPTZ
);

ALTER TABLE public.pending_premiums ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pending_premiums_service_all" ON public.pending_premiums;

CREATE POLICY "pending_premiums_service_all"
  ON public.pending_premiums FOR ALL
  USING ((SELECT auth.role()) = 'service_role');


-- ── 4. SAVED CLIENTS (Premium feature) ───────────────────────
CREATE TABLE IF NOT EXISTS public.saved_clients (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  email      TEXT,
  phone      TEXT,
  company    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clients_user_idx ON public.saved_clients(user_id);

ALTER TABLE public.saved_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_own_all"     ON public.saved_clients;
DROP POLICY IF EXISTS "clients_service_all" ON public.saved_clients;

CREATE POLICY "clients_own_all"
  ON public.saved_clients FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "clients_service_all"
  ON public.saved_clients FOR ALL
  USING ((SELECT auth.role()) = 'service_role');


-- ── 5. INVOICE HISTORY (Premium feature) ─────────────────────
CREATE TABLE IF NOT EXISTS public.invoices (
  id             BIGSERIAL      PRIMARY KEY,
  user_id        UUID           NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  invoice_number TEXT           NOT NULL,
  client_name    TEXT,
  total_amount   NUMERIC(12,2),
  currency       TEXT           DEFAULT 'KES',
  status         TEXT           DEFAULT 'unpaid'
                   CHECK (status IN ('unpaid','paid','overdue')),
  payload        JSONB,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoices_user_idx ON public.invoices(user_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_own_all"     ON public.invoices;
DROP POLICY IF EXISTS "invoices_service_all" ON public.invoices;

CREATE POLICY "invoices_own_all"
  ON public.invoices FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "invoices_service_all"
  ON public.invoices FOR ALL
  USING ((SELECT auth.role()) = 'service_role');


-- ═══════════════════════════════════════════════════════════════
-- DONE. All 5 tables created with RLS and indexes.
-- ═══════════════════════════════════════════════════════════════
