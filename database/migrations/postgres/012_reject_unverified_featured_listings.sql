UPDATE featured_listings fl
SET status = 'cancelled',
    is_active = FALSE,
    cash_paid = 0,
    credit_applied = 0,
    gateway_fee_amount = 0,
    cancelled_at = COALESCE(cancelled_at, NOW()),
    cancellation_reason = 'Legacy featured listing payment was not gateway-verified.',
    updated_at = NOW()
WHERE fl.status = 'pending_approval'
  AND NOT EXISTS (
    SELECT 1
    FROM payments p
    WHERE p.featured_listing_id = fl.id
      AND p.status = 'paid'
      AND p.validation_id IS NOT NULL
  )
  AND COALESCE((
    SELECT SUM(u.amount_used)
    FROM platform_credit_usages u
    WHERE u.used_for_type = 'featured_listing'
      AND u.used_for_id = fl.id
  ), 0) < fl.total_amount
