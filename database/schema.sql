CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50),
  password_hash TEXT,
  role VARCHAR(50) NOT NULL CHECK (role IN ('player', 'turf_owner', 'staff', 'admin')),
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending_approval', 'suspended', 'deactivated')),
  token_version INTEGER NOT NULL DEFAULT 0,
  avatar TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS auth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(40) NOT NULL CHECK (purpose IN ('email_verification', 'password_reset')),
  code_hash VARCHAR(128) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_codes_lookup ON auth_codes(user_id,purpose,created_at DESC);

CREATE TABLE IF NOT EXISTS turf_owner_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name VARCHAR(255) NOT NULL,
  nid_or_trade_license VARCHAR(255),
  business_documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  payout_method VARCHAR(50) NOT NULL CHECK (payout_method IN ('bkash', 'nagad', 'rocket', 'bank_account')),
  payout_details JSONB,
  approval_status VARCHAR(50) NOT NULL DEFAULT 'pending_approval' CHECK (approval_status IN ('pending_approval', 'active', 'rejected', 'suspended')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP,
  review_message TEXT,
  commission_override NUMERIC(5,2),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE turf_owner_profiles ADD COLUMN IF NOT EXISTS business_documents JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE turf_owner_profiles ADD COLUMN IF NOT EXISTS review_message TEXT;

CREATE TABLE IF NOT EXISTS turfs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  address VARCHAR(255) NOT NULL,
  area VARCHAR(255),
  city VARCHAR(255),
  latitude DECIMAL(9,6),
  longitude DECIMAL(9,6),
  sport_types TEXT[],
  amenities TEXT[],
  base_price_per_hour NUMERIC(10,2) NOT NULL,
  operating_hours JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'pending_review' CHECK (status IN ('draft', 'pending_review', 'active', 'inactive', 'suspended')),
  commission_rate_override NUMERIC(5,2),
  rating NUMERIC(3,2) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP,
  correction_message TEXT
);
ALTER TABLE turfs
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS correction_message TEXT;

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

CREATE TABLE IF NOT EXISTS turf_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id UUID NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS turf_pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id UUID NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  special_date DATE,
  label VARCHAR(60) NOT NULL DEFAULT 'Shift',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  price_per_hour NUMERIC(10,2) NOT NULL,
  CHECK ((day_of_week IS NOT NULL AND special_date IS NULL) OR (day_of_week IS NULL AND special_date IS NOT NULL)),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  turf_id UUID NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  permissions JSONB,
  assigned_by UUID REFERENCES users(id),
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('pending_setup', 'active')),
  invited_at TIMESTAMP,
  setup_link TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id UUID NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'locked', 'booked', 'blocked')),
  locked_until TIMESTAMP,
  locked_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_number VARCHAR(50) UNIQUE,
  idempotency_key VARCHAR(255),
  player_id UUID REFERENCES users(id),
  turf_id UUID NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  total_hours DECIMAL(4,2) NOT NULL,
  booking_source VARCHAR(50) NOT NULL DEFAULT 'online' CHECK (booking_source IN ('online', 'manual_owner', 'manual_staff', 'admin')),
  status VARCHAR(50) NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'confirmed', 'completed', 'cancelled', 'expired', 'refunded', 'partially_refunded')),
  base_amount DECIMAL(10,2) NOT NULL,
  addon_total DECIMAL(10,2) DEFAULT 0,
  commission_amount DECIMAL(10,2) NOT NULL,
  platform_fee_amount DECIMAL(10,2) NOT NULL,
  has_gateway_fee BOOLEAN DEFAULT TRUE,
  gateway_fee_amount DECIMAL(10,2) DEFAULT 0,
  net_owner_amount DECIMAL(10,2) NOT NULL,
  total_payable DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMP,
  cancellation_policy_id UUID,
  cancellation_reason TEXT,
  cancelled_by UUID REFERENCES users(id),
  cancellation_request_status VARCHAR(20),
  cancellation_request_reason TEXT,
  cancellation_requested_at TIMESTAMP,
  cancellation_request_refund_percentage DECIMAL(5,2),
  cancellation_decision_reason TEXT,
  cancellation_decided_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  slot_id UUID NOT NULL REFERENCES slots(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_slots_turf_date_start ON slots(turf_id,date,start_time);
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_assignment_unique ON staff_assignments(staff_user_id,turf_id);

ALTER TABLE booking_slots DROP CONSTRAINT IF EXISTS booking_slots_slot_id_key;
CREATE INDEX IF NOT EXISTS idx_booking_slots_slot_id ON booking_slots(slot_id);

CREATE TABLE IF NOT EXISTS manual_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  customer_email VARCHAR(255),
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'bkash', 'nagad', 'rocket', 'bank_transfer')),
  payment_status VARCHAR(50) NOT NULL CHECK (payment_status IN ('paid', 'pending', 'partial')),
  payment_reference VARCHAR(255),
  payment_amount DECIMAL(10,2),
  created_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS turf_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turf_id UUID NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL CHECK (category IN ('equipment', 'service', 'food', 'other')),
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  stock_quantity INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  addon_id UUID NOT NULL REFERENCES turf_addons(id),
  addon_name_snapshot VARCHAR(100) NOT NULL,
  addon_price_snapshot DECIMAL(10,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  total_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS turf_addon_inventory_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_id UUID NOT NULL REFERENCES turf_addons(id),
  change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('decrement', 'increment', 'adjustment')),
  quantity_change INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL,
  booking_id UUID REFERENCES bookings(id),
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  gateway VARCHAR(50) NOT NULL,
  transaction_id VARCHAR(255),
  amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'BDT',
  validation_id VARCHAR(255),
  idempotency_key VARCHAR(255),
  gateway_response JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  turf_price_refunded DECIMAL(10,2),
  platform_fee_refunded DECIMAL(10,2),
  gateway_fee_refunded DECIMAL(10,2),
  booking_source VARCHAR(50),
  reason TEXT,
  initiated_by VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  gateway_refund_ref VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL UNIQUE REFERENCES users(id),
  available_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS held_balance NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(255),
  owner_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  method VARCHAR(255),
  reference VARCHAR(255),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  booking_id UUID REFERENCES bookings(id),
  withdrawal_id UUID REFERENCES withdrawals(id),
  transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('booking_credit', 'commission_debit', 'refund_debit', 'withdrawal_debit', 'manual_adjustment', 'hold', 'release')),
  amount NUMERIC(12,2) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS gateway_request_id VARCHAR(30);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS gateway_error TEXT;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_gateway_request_id ON refunds(gateway_request_id) WHERE gateway_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refunds_booking_status ON refunds(booking_id,status);

ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_idempotency_key ON withdrawals(owner_id,idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id),
  turf_id UUID NOT NULL REFERENCES turfs(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL CHECK (type IN ('booking','payment','refund','approval','system','dispute')),
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_event_key ON notifications(user_id, (data->>'eventKey')) WHERE data ? 'eventKey';

CREATE TABLE IF NOT EXISTS favorites (
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  turf_id UUID NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (player_id, turf_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_player_created ON favorites(player_id, created_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint_hash CHAR(64) NOT NULL UNIQUE,
  encrypted_subscription JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) NOT NULL UNIQUE,
  value BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_booking_unique ON reviews(booking_id);

CREATE TABLE IF NOT EXISTS cancellation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_default_cancellation_policy
  ON cancellation_policies (is_default) WHERE is_default=TRUE;

CREATE TABLE IF NOT EXISTS cancellation_policy_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES cancellation_policies(id) ON DELETE CASCADE,
  hours_before_start_min INTEGER NOT NULL,
  hours_before_start_max INTEGER,
  refund_percentage DECIMAL(5,2) NOT NULL CHECK (refund_percentage BETWEEN 0 AND 100),
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (hours_before_start_max IS NULL OR hours_before_start_max > hours_before_start_min)
);

WITH default_policy AS (
  INSERT INTO cancellation_policies (name,description,is_default,is_active)
  SELECT 'Standard','Default Section 10 cancellation policy',TRUE,TRUE
  WHERE NOT EXISTS (SELECT 1 FROM cancellation_policies WHERE is_default=TRUE)
  RETURNING id
)
INSERT INTO cancellation_policy_tiers (policy_id,hours_before_start_min,hours_before_start_max,refund_percentage,sort_order)
SELECT id,0,6,0,0 FROM default_policy
UNION ALL SELECT id,6,24,50,1 FROM default_policy
UNION ALL SELECT id,24,NULL,100,2 FROM default_policy;

CREATE TABLE IF NOT EXISTS turf_cancellation_policies (
  turf_id UUID PRIMARY KEY REFERENCES turfs(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES cancellation_policies(id),
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS owner_cancellation_policies (
  owner_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES cancellation_policies(id),
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cancellation_policy_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES cancellation_policies(id),
  action VARCHAR(50) NOT NULL,
  actor_id UUID REFERENCES users(id),
  target_type VARCHAR(50),
  target_id UUID,
  before_value JSONB,
  after_value JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  raised_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  resolution TEXT,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'BDT';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS validation_id VARCHAR(255);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency_key ON payments(idempotency_key) WHERE idempotency_key IS NOT NULL;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_number VARCHAR(50);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS total_payable DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN ('pending_payment', 'confirmed', 'checked_in', 'completed', 'cancelled', 'expired', 'refunded', 'partially_refunded'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_idempotency_key ON bookings(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  actor_role VARCHAR(20) NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  reason TEXT,
  before_value JSONB,
  after_value JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_turfs_owner_id ON turfs(owner_id);
CREATE INDEX IF NOT EXISTS idx_turfs_status ON turfs(status);
CREATE INDEX IF NOT EXISTS idx_slots_turf_date ON slots(turf_id, date);
CREATE INDEX IF NOT EXISTS idx_bookings_turf_date ON bookings(turf_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_player ON bookings(player_id);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_staff ON staff_assignments(staff_user_id,status);
CREATE INDEX IF NOT EXISTS idx_reviews_turf ON reviews(turf_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_turf_slot_time ON slots(turf_id, date, start_time);
CREATE INDEX IF NOT EXISTS idx_cancellation_tiers_policy ON cancellation_policy_tiers(policy_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status, created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_owner ON wallet_transactions(owner_id, created_at);

INSERT INTO schema_migrations (version,name) VALUES (1,'001_initial_schema') ON CONFLICT (version) DO NOTHING;
