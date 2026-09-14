-- =======================================================
-- OHM Certificates — Auto Background Email Migration
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- BEFORE running: replace REPLACE_WITH_SERVICE_ROLE_KEY
-- with your actual service role key (Settings → API Keys → Legacy tab)
-- =======================================================

-- 1. Add columns to both tables
ALTER TABLE gas_certs
  ADD COLUMN IF NOT EXISTS auto_email        BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_emailed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pdf_storage_path  TEXT;

ALTER TABLE pat_reports
  ADD COLUMN IF NOT EXISTS auto_email        BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_emailed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pdf_storage_path  TEXT;

-- 2. Storage bucket for PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('cert-pdfs', 'cert-pdfs', false, 10485760)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (drop first to avoid conflicts)
DROP POLICY IF EXISTS "cert_pdfs_upload"  ON storage.objects;
DROP POLICY IF EXISTS "cert_pdfs_read"    ON storage.objects;
DROP POLICY IF EXISTS "cert_pdfs_service" ON storage.objects;

CREATE POLICY "cert_pdfs_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cert-pdfs');

CREATE POLICY "cert_pdfs_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'cert-pdfs');

CREATE POLICY "cert_pdfs_service"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'cert-pdfs');

-- 3. Trigger function — fires when pdf_storage_path is set on a cert with auto_email ON
CREATE OR REPLACE FUNCTION _trigger_auto_cert_email()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    NEW.auto_email = TRUE AND
    NEW.pdf_storage_path IS NOT NULL AND
    NEW.auto_emailed_at IS NULL AND
    (OLD.pdf_storage_path IS DISTINCT FROM NEW.pdf_storage_path)
  ) THEN
    PERFORM net.http_post(
      url     := 'https://iihnfgmsfshrgrhargxz.supabase.co/functions/v1/auto-cert-email',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer REPLACE_WITH_SERVICE_ROLE_KEY'
      ),
      body    := jsonb_build_object(
        'cert_id',   NEW.id::text,
        'cert_type', TG_TABLE_NAME
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Attach to both tables
DROP TRIGGER IF EXISTS auto_email_gas ON gas_certs;
CREATE TRIGGER auto_email_gas
  AFTER UPDATE ON gas_certs
  FOR EACH ROW EXECUTE FUNCTION _trigger_auto_cert_email();

DROP TRIGGER IF EXISTS auto_email_pat ON pat_reports;
CREATE TRIGGER auto_email_pat
  AFTER UPDATE ON pat_reports
  FOR EACH ROW EXECUTE FUNCTION _trigger_auto_cert_email();
