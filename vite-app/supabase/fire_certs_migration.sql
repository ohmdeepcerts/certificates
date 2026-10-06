-- Fire Alarm Certificates table
-- Run this in Supabase SQL editor for project iihnfgmsfshrgrhargxz

CREATE TABLE IF NOT EXISTS fire_certs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_number      TEXT,
  base_ref        TEXT,
  cert_type       TEXT,            -- 'FA.1', 'FA.2', 'FA.3', 'FA.4'
  premises_address TEXT,
  test_date       TEXT,
  outcome         TEXT,
  created_by      UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  data            JSONB
);

-- Index for history queries
CREATE INDEX IF NOT EXISTS fire_certs_created_by_idx ON fire_certs (created_by);
CREATE INDEX IF NOT EXISTS fire_certs_created_at_idx ON fire_certs (created_at DESC);
CREATE INDEX IF NOT EXISTS fire_certs_deleted_at_idx ON fire_certs (deleted_at);

-- Enable Row Level Security
ALTER TABLE fire_certs ENABLE ROW LEVEL SECURITY;

-- Admins see all; engineers see their own
CREATE POLICY "fire_certs_select" ON fire_certs FOR SELECT
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "fire_certs_insert" ON fire_certs FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "fire_certs_update" ON fire_certs FOR UPDATE
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );
