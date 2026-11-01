ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_status_check;
ALTER TABLE tournaments ADD CONSTRAINT tournaments_status_check CHECK (status IN ('pending_review','changes_requested','open','registration_closed','ongoing','completed','cancelled'));
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS review_message TEXT;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS review_revision INTEGER NOT NULL DEFAULT 1;
