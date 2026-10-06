-- =======================================================
-- OHM Certificates — Engineers Migration
-- APPLIED: 2026-09-29 via Supabase MCP
-- SAFE: only creates new table, does NOT touch existing ones
-- Requires: migration_companies.sql applied first
-- =======================================================

CREATE TABLE IF NOT EXISTS engineers (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id             UUID REFERENCES companies(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  email                  TEXT,
  phone                  TEXT,
  mobile                 TEXT,
  gas_safe_number        TEXT,   -- company Gas Safe number
  gas_licence            TEXT,   -- individual Gas Safe licence number
  niceic_number          TEXT,   -- individual NICEIC number if differs from company
  am2_cert_number        TEXT,
  pat_cert_number        TEXT,
  cert_types             TEXT[] NOT NULL DEFAULT '{}',
  user_id                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  signature_storage_path TEXT,
  is_primary             BOOLEAN NOT NULL DEFAULT FALSE,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  usage_count            INTEGER NOT NULL DEFAULT 0,
  last_used_at           TIMESTAMPTZ,
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_engineers_company ON engineers(company_id);
CREATE INDEX IF NOT EXISTS idx_engineers_name    ON engineers(lower(name));
CREATE INDEX IF NOT EXISTS idx_engineers_user    ON engineers(user_id);

ALTER TABLE engineers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engineers_all" ON engineers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed: I. Ahmad — OHM Electrical
INSERT INTO engineers (company_id, name, cert_types, is_primary)
SELECT id, 'I. Ahmad', ARRAY['pat','el','eicr'], TRUE
FROM companies WHERE slug = 'ohm-electrical';

-- Seed: M. Khan — MK Heating
INSERT INTO engineers (company_id, name, gas_safe_number, gas_licence, cert_types, is_primary)
SELECT id, 'M. Khan', '6053462', '567294', ARRAY['gas'], TRUE
FROM companies WHERE slug = 'mk-heating';
