BEGIN;
CREATE SCHEMA IF NOT EXISTS portal;
REVOKE ALL ON SCHEMA portal FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS portal.users (
 id uuid PRIMARY KEY REFERENCES auth.users(id), name text NOT NULL, email text UNIQUE NOT NULL,
 role text NOT NULL CHECK(role IN ('admin','equipe','partenaire')), active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
DROP INDEX IF EXISTS portal.sole_admin;
-- Administrators create additional administrators through the secured portal only.
ALTER TABLE portal.users DROP CONSTRAINT IF EXISTS approved_administrators;
CREATE TABLE IF NOT EXISTS portal.sessions (hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES portal.users(id),expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS portal.categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text UNIQUE NOT NULL,position integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS portal.files (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),path text UNIQUE NOT NULL,kind text NOT NULL CHECK(kind IN ('pdf','docx','video','signature','receipt')),created_by uuid NOT NULL REFERENCES portal.users(id),created_at timestamptz NOT NULL DEFAULT now());
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_constraint WHERE conname='files_kind_check' AND conrelid='portal.files'::regclass) THEN ALTER TABLE portal.files DROP CONSTRAINT files_kind_check; END IF;
  ALTER TABLE portal.files ADD CONSTRAINT files_kind_check CHECK(kind IN ('pdf','docx','video','signature','receipt','contract_founder','contract_final'));
END $$;
CREATE TABLE IF NOT EXISTS portal.videos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),category_id uuid NOT NULL REFERENCES portal.categories(id),title text NOT NULL,description text NOT NULL DEFAULT '',url text,file_id uuid REFERENCES portal.files(id),position integer NOT NULL DEFAULT 0,archived boolean NOT NULL DEFAULT false,CHECK((url IS NULL)<>(file_id IS NULL)));
CREATE TABLE IF NOT EXISTS portal.completions (user_id uuid REFERENCES portal.users(id),video_id uuid REFERENCES portal.videos(id),completed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,video_id));
CREATE TABLE IF NOT EXISTS portal.draft (id boolean PRIMARY KEY DEFAULT true CHECK(id),title text NOT NULL DEFAULT 'Livret d’accueil, règles et procédures',content text NOT NULL DEFAULT '',effective_date date,original_file_id uuid REFERENCES portal.files(id),pdf_file_id uuid REFERENCES portal.files(id),revision integer NOT NULL DEFAULT 0);
INSERT INTO portal.draft(id) VALUES(true) ON CONFLICT DO NOTHING;
ALTER TABLE portal.draft ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Livret d’accueil, règles et procédures';
ALTER TABLE portal.draft ADD COLUMN IF NOT EXISTS effective_date date;
ALTER TABLE portal.draft ADD COLUMN IF NOT EXISTS original_file_id uuid REFERENCES portal.files(id);
ALTER TABLE portal.draft ADD COLUMN IF NOT EXISTS pdf_file_id uuid REFERENCES portal.files(id);
CREATE TABLE IF NOT EXISTS portal.versions (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,title text NOT NULL DEFAULT 'Livret d’accueil, règles et procédures',content text NOT NULL,hash text NOT NULL,source_hash text,original_file_id uuid REFERENCES portal.files(id),pdf_file_id uuid REFERENCES portal.files(id),effective_date date,founder_name text NOT NULL,approved_by uuid NOT NULL REFERENCES portal.users(id),published_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE portal.versions ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT 'Livret d’accueil, règles et procédures';
ALTER TABLE portal.versions ADD COLUMN IF NOT EXISTS source_hash text;
ALTER TABLE portal.versions ADD COLUMN IF NOT EXISTS original_file_id uuid REFERENCES portal.files(id);
ALTER TABLE portal.versions ADD COLUMN IF NOT EXISTS pdf_file_id uuid REFERENCES portal.files(id);
ALTER TABLE portal.versions ADD COLUMN IF NOT EXISTS effective_date date;
CREATE TABLE IF NOT EXISTS portal.acknowledgments (user_id uuid REFERENCES portal.users(id),version_id integer REFERENCES portal.versions(id),name text NOT NULL,email text NOT NULL,evidence text NOT NULL,document_hash text,auth_method text NOT NULL DEFAULT 'password_session',signature_file_id uuid REFERENCES portal.files(id),receipt_file_id uuid REFERENCES portal.files(id),acknowledged_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,version_id));
ALTER TABLE portal.acknowledgments ADD COLUMN IF NOT EXISTS document_hash text;
ALTER TABLE portal.acknowledgments ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'password_session';
ALTER TABLE portal.acknowledgments ADD COLUMN IF NOT EXISTS signature_file_id uuid REFERENCES portal.files(id);
ALTER TABLE portal.acknowledgments ADD COLUMN IF NOT EXISTS receipt_file_id uuid REFERENCES portal.files(id);
CREATE TABLE IF NOT EXISTS portal.settings (id boolean PRIMARY KEY DEFAULT true CHECK(id),founder_name text NOT NULL DEFAULT 'Anna Douaa Almaleh',founder_title text NOT NULL DEFAULT 'Fondatrice',founder_signature_path text,founder_approved_at timestamptz);
INSERT INTO portal.settings(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS portal.contracts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES portal.users(id),file_id uuid NOT NULL UNIQUE REFERENCES portal.files(id),title text NOT NULL,status text NOT NULL CHECK(status IN ('signed','proposed')),agreement_date date NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE portal.contracts ADD COLUMN IF NOT EXISTS founder_file_id uuid REFERENCES portal.files(id);
ALTER TABLE portal.contracts ADD COLUMN IF NOT EXISTS founder_signed_at timestamptz;
ALTER TABLE portal.contracts ADD COLUMN IF NOT EXISTS document_hash text;
CREATE TABLE IF NOT EXISTS portal.contract_signatures (contract_id uuid PRIMARY KEY REFERENCES portal.contracts(id),partner_name text NOT NULL,partner_email text NOT NULL,signature_file_id uuid NOT NULL REFERENCES portal.files(id),final_file_id uuid NOT NULL REFERENCES portal.files(id),signed_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS portal.audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor uuid,action text NOT NULL,resource text,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS portal.mail (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),dedupe text NOT NULL UNIQUE,recipient text NOT NULL,subject text NOT NULL,body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz,attempts integer NOT NULL DEFAULT 0,last_error text);
CREATE TABLE IF NOT EXISTS portal.limits (key text PRIMARY KEY,hits integer NOT NULL DEFAULT 1,expires_at timestamptz NOT NULL);
CREATE OR REPLACE FUNCTION portal.immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('portal.allow_hard_delete',true)='true' THEN RETURN OLD; END IF; RAISE EXCEPTION 'Archive immutable'; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['versions','acknowledgments','contracts','audit'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='immutable_'||t AND tgrelid=('portal.'||t)::regclass) THEN
   EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON portal.%I FOR EACH ROW EXECUTE FUNCTION portal.immutable()', 'immutable_'||t,t);
  END IF;
 END LOOP;
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='portal' LOOP
  EXECUTE format('ALTER TABLE portal.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('REVOKE ALL ON portal.%I FROM PUBLIC, anon, authenticated', t);
 END LOOP;
END $$;
INSERT INTO portal.categories(name,position) VALUES ('Coiffure & Coloration',1),('Onglerie',2),('Soins du visage',3),('Massages',4),('Épilation',5),('Cils & Sourcils',6) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('portal-private','portal-private',false,52428800,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','video/mp4','video/webm']) ON CONFLICT(id) DO NOTHING;
UPDATE storage.buckets SET allowed_mime_types=ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/png','video/mp4','video/webm'] WHERE id='portal-private';
COMMIT;
