-- =======================================================
-- OHM Certificates — Directory & Appliances Migration
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- =======================================================

-- 1. AGENTS / AGENCIES
CREATE TABLE IF NOT EXISTS directory_agents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  email2 TEXT,
  phone TEXT,
  mobile TEXT,
  addr1 TEXT,
  addr2 TEXT,
  town TEXT,
  county TEXT,
  postcode TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- 2. LANDLORDS
CREATE TABLE IF NOT EXISTS directory_landlords (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  landlord_name TEXT NOT NULL,
  company_name TEXT,
  email TEXT,
  email2 TEXT,
  phone TEXT,
  mobile TEXT,
  addr1 TEXT,
  addr2 TEXT,
  town TEXT,
  county TEXT,
  postcode TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- 3. PROPERTIES
CREATE TABLE IF NOT EXISTS directory_properties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  addr1 TEXT NOT NULL,
  addr2 TEXT,
  town TEXT,
  county TEXT,
  postcode TEXT,
  property_ref TEXT,
  landlord_id UUID REFERENCES directory_landlords(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES directory_agents(id) ON DELETE SET NULL,
  access_notes TEXT,
  keysafe TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- 4. CONTACTS
CREATE TABLE IF NOT EXISTS directory_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  role TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- 5. APPLIANCE TEMPLATES
CREATE TABLE IF NOT EXISTS appliance_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  manufacturer TEXT,
  model TEXT,
  fuel_type TEXT,
  default_location TEXT,
  notes TEXT,
  defaults JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_dir_agents_name   ON directory_agents(lower(agency_name));
CREATE INDEX IF NOT EXISTS idx_dir_agents_pc     ON directory_agents(postcode);
CREATE INDEX IF NOT EXISTS idx_dir_landlords_name ON directory_landlords(lower(landlord_name));
CREATE INDEX IF NOT EXISTS idx_dir_landlords_pc  ON directory_landlords(postcode);
CREATE INDEX IF NOT EXISTS idx_dir_props_addr    ON directory_properties(lower(addr1));
CREATE INDEX IF NOT EXISTS idx_dir_props_pc      ON directory_properties(postcode);
CREATE INDEX IF NOT EXISTS idx_appl_name         ON appliance_templates(lower(name));
CREATE INDEX IF NOT EXISTS idx_appl_cat          ON appliance_templates(category);

-- ROW LEVEL SECURITY
ALTER TABLE directory_agents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE directory_landlords  ENABLE ROW LEVEL SECURITY;
ALTER TABLE directory_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE directory_contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE appliance_templates  ENABLE ROW LEVEL SECURITY;

-- All authenticated users: read + write (tighten to admin role later if needed)
CREATE POLICY "dir_agents_all"     ON directory_agents     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dir_landlords_all"  ON directory_landlords  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dir_properties_all" ON directory_properties FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dir_contacts_all"   ON directory_contacts   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "appliance_all"      ON appliance_templates  FOR ALL TO authenticated USING (true) WITH CHECK (true);
