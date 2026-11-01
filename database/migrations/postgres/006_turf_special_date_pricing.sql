ALTER TABLE turf_pricing_rules ALTER COLUMN day_of_week DROP NOT NULL;
ALTER TABLE turf_pricing_rules ADD COLUMN IF NOT EXISTS special_date DATE;
ALTER TABLE turf_pricing_rules ADD CONSTRAINT turf_pricing_rules_schedule_check
  CHECK ((day_of_week IS NOT NULL AND special_date IS NULL) OR (day_of_week IS NULL AND special_date IS NOT NULL));
