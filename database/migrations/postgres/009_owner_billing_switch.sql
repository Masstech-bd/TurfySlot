ALTER TABLE turf_owner_profiles
  ADD COLUMN IF NOT EXISTS pending_billing_model VARCHAR(32),
  ADD COLUMN IF NOT EXISTS billing_model_change_effective_date DATE;

ALTER TABLE turf_owner_profiles
  ADD CONSTRAINT turf_owner_profiles_pending_billing_model_check
  CHECK (pending_billing_model IS NULL OR pending_billing_model IN ('commission', 'monthly_subscription'));

CREATE INDEX IF NOT EXISTS idx_owner_profiles_billing_change
  ON turf_owner_profiles(pending_billing_model, billing_model_change_effective_date)
  WHERE pending_billing_model IS NOT NULL;