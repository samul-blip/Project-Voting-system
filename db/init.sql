CREATE TABLE elections (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  theme JSONB NOT NULL DEFAULT '{"primary":"#1e66f5","accent":"#f5a623","logo":""}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','closed')),
  show_live_results BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ
);

CREATE TABLE positions (
  id SERIAL PRIMARY KEY,
  election_id INT NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sort_order INT DEFAULT 0
);

CREATE TABLE candidates (
  id SERIAL PRIMARY KEY,
  position_id INT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade_section TEXT,
  bio TEXT,
  photo_url TEXT,
  account_username TEXT,
  account_password_hash TEXT,
  profile_photo_url TEXT,
  profile_photo_data BYTEA,
  profile_photo_mime TEXT,
  profile_bio TEXT,
  social_links JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE voters (
  id SERIAL PRIMARY KEY,
  election_id INT NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  full_name TEXT,
  grade_section TEXT,
  code_hash TEXT NOT NULL,
  code_enc TEXT,
  has_voted BOOLEAN NOT NULL DEFAULT FALSE,
  profile_photo_url TEXT,
  profile_photo_data BYTEA,
  profile_photo_mime TEXT,
  profile_bio TEXT,
  social_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (election_id, student_id)
);

CREATE TABLE admins (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_main BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  display_name TEXT,
  profile_photo_url TEXT,
  profile_photo_data BYTEA,
  profile_photo_mime TEXT,
  profile_bio TEXT,
  social_links JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE voter_receipts (
  voter_id INT PRIMARY KEY REFERENCES voters(id) ON DELETE CASCADE,
  receipt_enc TEXT NOT NULL
);

-- Intentionally NO voter_id here: ballots are anonymous
CREATE TABLE votes (
  id BIGSERIAL PRIMARY KEY,
  election_id INT NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  position_id INT NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  candidate_id INT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  cast_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_votes_candidate ON votes(candidate_id);

-- Session table for connect-pg-simple
CREATE TABLE "session" (
  "sid" varchar NOT NULL PRIMARY KEY,
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
);
CREATE INDEX "IDX_session_expire" ON "session" ("expire");