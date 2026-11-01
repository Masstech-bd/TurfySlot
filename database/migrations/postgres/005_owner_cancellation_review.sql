ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_request_status VARCHAR(20);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_request_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMP;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_request_refund_percentage DECIMAL(5,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_decision_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_decided_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_bookings_cancellation_review ON bookings(cancellation_request_status, cancellation_requested_at);
