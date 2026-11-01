ALTER TABLE turfs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS turf_removal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id UUID NOT NULL REFERENCES turfs(id),
  owner_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT,
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  review_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_turf_removal_requests_status ON turf_removal_requests(status, requested_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_turf_removal_one_pending ON turf_removal_requests(turf_id) WHERE status='pending';
