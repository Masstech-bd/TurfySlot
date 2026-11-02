import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBookingAmounts, calculateCancellationRefund, calculateDisplayedTurfPrice, findPricingRuleForSlot } from '../database/pricing.js';

test('weekly pricing rules match PostgreSQL times at the exact start boundary', () => {
  const rule = { day_of_week: 1, start_time: '18:00:00', end_time: '20:00:00', price_per_hour: 2200 };
  assert.equal(findPricingRuleForSlot([rule], '2026-11-02', '18:00'), rule);
  assert.equal(findPricingRuleForSlot([rule], '2026-11-02', '19:00'), rule);
  assert.equal(findPricingRuleForSlot([rule], '2026-11-02', '20:00'), undefined);
  assert.equal(findPricingRuleForSlot([rule], '2026-11-03', '18:00'), undefined);
});

test('special-date pricing takes precedence over a weekly rule', () => {
  const weeklyRule = { dayOfWeek: 1, startTime: '18:00', endTime: '20:00', pricePerHour: 2200 };
  const specialDateRule = { date: '2026-11-02', startTime: '18:00:00', endTime: '20:00:00', pricePerHour: 1800 };
  assert.equal(findPricingRuleForSlot([weeklyRule, specialDateRule], '2026-11-02', '19:00'), specialDateRule);
});

test('gateway fee is calculated on booking subtotal without platform fee', () => {
  assert.deepEqual(calculateBookingAmounts({ baseAmount: 1000, platformRate: 5, gatewayRate: 2.5 }), {
    commissionAmount: 0,
    platformFeeAmount: 50,
    gatewayFeeAmount: 25,
    netOwnerAmount: 1000,
    totalPayable: 1075,
  });
});

test('subscription bookings retain gateway fee without platform fee', () => {
  assert.deepEqual(calculateBookingAmounts({ baseAmount: 1600, platformRate: 0, gatewayRate: 2.5 }), {
    commissionAmount: 0,
    platformFeeAmount: 0,
    gatewayFeeAmount: 40,
    netOwnerAmount: 1600,
    totalPayable: 1640,
  });
});

test('disabled fees do not change the total', () => {
  assert.deepEqual(calculateBookingAmounts({ baseAmount: 1600, platformRate: 0, gatewayRate: 0 }), {
    commissionAmount: 0,
    platformFeeAmount: 0,
    gatewayFeeAmount: 0,
    netOwnerAmount: 1600,
    totalPayable: 1600,
  });
});

test('turf cards show the fee-inclusive total when the fee breakdown is hidden', () => {
  assert.equal(calculateDisplayedTurfPrice({
    baseAmount: 1600, platformRate: 5, gatewayRate: 2.5, showFeeBreakdown: false,
  }), 1720);
  assert.equal(calculateDisplayedTurfPrice({
    baseAmount: 1600, platformRate: 5, gatewayRate: 2.5, showFeeBreakdown: true,
  }), 1600);
});

test('subscription turf card prices do not include a platform fee', () => {
  assert.equal(calculateDisplayedTurfPrice({
    baseAmount: 1600, platformRate: 0, gatewayRate: 2.5, showFeeBreakdown: false,
  }), 1640);
});

test('online add-on refunds use the combined booking subtotal and exclude the gateway fee', () => {
  assert.deepEqual(calculateCancellationRefund({
    baseAmount: 1000, addonTotal: 250, platformFeeAmount: 62.5,
    gatewayFeeAmount: 31.25, totalPayable: 1343.75, refundPercentage: 50,
  }), { refundAmount: 625, turfPriceRefunded: 625 });
  assert.deepEqual(calculateCancellationRefund({
    baseAmount: 1000, addonTotal: 250, platformFeeAmount: 62.5,
    gatewayFeeAmount: 31.25, totalPayable: 1343.75, refundPercentage: 100, ownerInitiated: true,
  }), { refundAmount: 1312.5, turfPriceRefunded: 1250 });
});

test('manual cancellation refunds match the policy matrix after the platform fee', () => {
  assert.deepEqual(calculateCancellationRefund({
    baseAmount: 1000, platformFeeAmount: 50, totalPayable: 1050,
    refundPercentage: 50, isManual: true,
  }), { refundAmount: 475, turfPriceRefunded: 500 });
  assert.deepEqual(calculateCancellationRefund({
    baseAmount: 1000, platformFeeAmount: 50, totalPayable: 1050,
    refundPercentage: 100, isManual: true,
  }), { refundAmount: 950, turfPriceRefunded: 1000 });
});