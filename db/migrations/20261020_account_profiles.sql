CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_main BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admins
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo_data BYTEA,
  ADD COLUMN IF NOT EXISTS profile_photo_mime TEXT,
  ADD COLUMN IF NOT EXISTS profile_bio TEXT,
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE elections
  ADD COLUMN IF NOT EXISTS logo_data BYTEA,
  ADD COLUMN IF NOT EXISTS logo_mime TEXT;

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS account_username TEXT,
  ADD COLUMN IF NOT EXISTS account_password_hash TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo_data BYTEA,
  ADD COLUMN IF NOT EXISTS profile_photo_mime TEXT,
  ADD COLUMN IF NOT EXISTS photo_data BYTEA,
  ADD COLUMN IF NOT EXISTS photo_mime TEXT,
  ADD COLUMN IF NOT EXISTS profile_bio TEXT,
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS candidates_account_username_unique
  ON candidates (LOWER(account_username))
  WHERE account_username IS NOT NULL;

CREATE TABLE IF NOT EXISTS parties (
  id SERIAL PRIMARY KEY,
  election_id INT NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  logo_url TEXT,
  color TEXT NOT NULL DEFAULT '#1e66f5',
  platform TEXT,
  slogan TEXT,
  logo_data BYTEA,
  logo_mime TEXT,
  UNIQUE (election_id, name)
);

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS party_id INT REFERENCES parties(id) ON DELETE SET NULL;

ALTER TABLE votes
  ADD COLUMN IF NOT EXISTS party_id INT REFERENCES parties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_votes_party ON votes(party_id);
CREATE INDEX IF NOT EXISTS idx_candidates_party ON candidates(party_id);

ALTER TABLE voters
  ADD COLUMN IF NOT EXISTS code_enc TEXT,
  ADD COLUMN IF NOT EXISTS grade_section TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo_data BYTEA,
  ADD COLUMN IF NOT EXISTS profile_photo_mime TEXT,
  ADD COLUMN IF NOT EXISTS profile_bio TEXT,
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS voter_receipts (
  voter_id INT PRIMARY KEY REFERENCES voters(id) ON DELETE CASCADE,
  receipt_enc TEXT NOT NULL
);
