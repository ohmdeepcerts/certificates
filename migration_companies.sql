-- =======================================================
-- OHM Certificates — Companies Migration
-- APPLIED: 2026-09-29 via Supabase MCP
-- SAFE: only creates new table, does NOT touch existing ones
-- =======================================================

CREATE TABLE IF NOT EXISTS companies (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name               TEXT NOT NULL,
  trading_name       TEXT,
  company_type       TEXT NOT NULL DEFAULT 'multi', -- 'electrical'|'gas'|'multi'
  addr1              TEXT,
  addr2              TEXT,
  town               TEXT,
  county             TEXT,
  postcode           TEXT,
  phone              TEXT,
  mobile             TEXT,
  email              TEXT,
  website            TEXT,
  logo_storage_path  TEXT,
  cert_header_text   TEXT,
  cert_footer_text   TEXT,
  niceic_number      TEXT,   -- OHM: NICEIC scheme number (to be added)
  gas_safe_number    TEXT,   -- MK Heating: company Gas Safe registration
  gas_licence        TEXT,   -- MK Heating: engineer individual Gas Safe licence
  vat_number         TEXT,
  cert_types         TEXT[] NOT NULL DEFAULT '{}',
  slug               TEXT UNIQUE,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_type ON companies(company_type);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_read" ON companies
  FOR SELECT TO authenticated USING (true);

-- Seed: OHM Electrical Engineering Ltd
-- TODO: add niceic_number once confirmed
INSERT INTO companies (name, trading_name, company_type, niceic_number, cert_types, slug)
VALUES (
  'OHM Electrical Engineering Ltd',
  'OHM Electrical',
  'electrical',
  NULL,
  ARRAY['pat','el','eicr'],
  'ohm-electrical'
)
ON CONFLICT (slug) DO NOTHING;

-- Seed: MK Heating
INSERT INTO companies (
  name, trading_name, company_type,
  gas_safe_number, gas_licence,
  addr1, town, county, postcode, phone,
  cert_types, slug
)
VALUES (
  'MK Heating',
  'MK Heating',
  'gas',
  '6053462',
  '567294',
  '130 Woodlands Road',
  'Ilford',
  'Essex',
  'IG1 1JP',
  '07865 753925',
  ARRAY['gas'],
  'mk-heating'
)
ON CONFLICT (slug) DO NOTHING;
