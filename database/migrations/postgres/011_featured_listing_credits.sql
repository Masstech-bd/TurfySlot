ALTER TABLE featured_listings
  ADD COLUMN IF NOT EXISTS cash_paid NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_applied NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gateway_fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES payments(id),
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

UPDATE featured_listings
SET cash_paid = total_amount
WHERE status IN ('pending_approval','active') AND cash_paid = 0 AND credit_applied = 0;

UPDATE featured_listings
SET status = 'cancelled',
    is_active = FALSE,
    cash_paid = 0,
    credit_applied = 0,
    cancelled_at = COALESCE(cancelled_at, NOW()),
    cancellation_reason = 'Legacy payment reference was not gateway-verified.'
WHERE status IN ('pending_payment','payment_submitted');

CREATE TABLE IF NOT EXISTS platform_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  used_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (used_amount >= 0 AND used_amount <= amount),
  reason VARCHAR(100) NOT NULL CHECK (reason IN (
    'featured_listing_cancel_owner',
    'featured_listing_cancel_admin_no_fault',
    'featured_listing_cancel_platform_error',
    'promotional_grant',
    'admin_adjustment'
  )),
  source_type VARCHAR(50),
  source_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','used','expired','revoked')),
  expires_at TIMESTAMP,
  expired_at TIMESTAMP,
  revoked_at TIMESTAMP,
  revoked_by UUID REFERENCES users(id),
  revoke_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_platform_credits_owner_status ON platform_credits(owner_id,status,expires_at);

CREATE TABLE IF NOT EXISTS platform_credit_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id UUID NOT NULL REFERENCES platform_credits(id),
  amount_used NUMERIC(10,2) NOT NULL CHECK (amount_used > 0),
  used_for_type VARCHAR(50) NOT NULL CHECK (used_for_type='featured_listing'),
  used_for_id UUID NOT NULL REFERENCES featured_listings(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (credit_id,used_for_type,used_for_id)
);
CREATE INDEX IF NOT EXISTS idx_credit_usages_credit ON platform_credit_usages(credit_id);

CREATE TABLE IF NOT EXISTS featured_listing_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES featured_listings(id),
  cancelled_by UUID NOT NULL REFERENCES users(id),
  cancelled_by_role VARCHAR(20) NOT NULL CHECK (cancelled_by_role IN ('owner','admin','system')),
  reason TEXT,
  days_total INTEGER NOT NULL,
  days_remaining INTEGER NOT NULL,
  total_paid NUMERIC(10,2) NOT NULL,
  credit_issued NUMERIC(10,2) NOT NULL,
  credit_id UUID REFERENCES platform_credits(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_featured_cancel_listing ON featured_listing_cancellations(listing_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_featured_listing_cancel_once ON featured_listing_cancellations(listing_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_featured_listing ON payments(featured_listing_id) WHERE featured_listing_id IS NOT NULL;
