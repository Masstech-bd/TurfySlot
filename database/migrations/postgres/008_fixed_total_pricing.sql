ALTER TABLE turf_pricing_rules
  ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(20) NOT NULL DEFAULT 'hourly'
  CHECK (pricing_mode IN ('hourly', 'fixed_total'));
