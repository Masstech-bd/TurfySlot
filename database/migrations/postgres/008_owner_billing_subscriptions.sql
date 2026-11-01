ALTER TABLE turf_owner_profiles
  ADD COLUMN IF NOT EXISTS billing_model VARCHAR(32) NOT NULL DEFAULT 'commission',
  ADD COLUMN IF NOT EXISTS subscription_due_date DATE,
  ADD COLUMN IF NOT EXISTS subscription_due_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS subscription_paid_through DATE,
  ADD COLUMN IF NOT EXISTS subscription_paid_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS subscription_payment_reference VARCHAR(255);

ALTER TABLE turf_owner_profiles
  ADD CONSTRAINT turf_owner_profiles_billing_model_check
  CHECK (billing_model IN ('commission', 'monthly_subscription'));

ALTER TABLE turfs
  ADD COLUMN IF NOT EXISTS subscription_disabled_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_owner_profiles_subscription_due
  ON turf_owner_profiles(billing_model, approval_status, subscription_due_date);

CREATE TABLE IF NOT EXISTS owner_subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  billing_period_end DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  received_at TIMESTAMP NOT NULL,
  reference VARCHAR(255),
  recorded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, billing_period_end)
);