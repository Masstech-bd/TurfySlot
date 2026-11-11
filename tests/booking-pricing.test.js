import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addPricingToAvailability,
  calculateBaseAmountForSlots,
  calculateBookingAmounts,
  calculateCancellationRefund,
  calculateDisplayedTurfPrice,
  findPricingRuleForSlot,
  getDisplayedPricingSlots,
  getPricingBlockSlots,
} from '../database/pricing.js';

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

test('legacy hourly pricing still applies the rate to every booked hour', () => {
  const slots = [
    { start_time: '17:00:00', end_time: '18:00:00' },
    { start_time: '18:00:00', end_time: '19:00:00' },
    { start_time: '19:00:00', end_time: '20:00:00' },
  ];
  assert.equal(calculateBaseAmountForSlots({
    basePrice: 1600,
    rules: [{ id: 'hourly', day_of_week: 3, start_time: '17:00', end_time: '20:00', price_per_hour: 4000 }],
    date: '2026-11-04',
    slots,
  }), 12000);
});

test('fixed-total pricing charges its amount once for the exact full block', () => {
  const rule = { id: 'fixed', day_of_week: 3, start_time: '17:00', end_time: '20:00', price_per_hour: 4000, pricing_mode: 'fixed_total' };
  const slots = [
    { start_time: '17:00:00', end_time: '18:00:00' },
    { start_time: '18:00:00', end_time: '19:00:00' },
    { start_time: '19:00:00', end_time: '20:00:00' },
  ];
  assert.equal(calculateBaseAmountForSlots({ basePrice: 1600, rules: [rule], date: '2026-11-04', slots }), 4000);
});

test('booking fees are calculated once on the fixed-total block amount', () => {
  const baseAmount = calculateBaseAmountForSlots({
    basePrice: 1600,
    rules: [{ id: 'fixed', day_of_week: 3, start_time: '17:00', end_time: '20:00', price_per_hour: 4000, pricing_mode: 'fixed_total' }],
    date: '2026-11-04',
    slots: [
      { start_time: '17:00:00', end_time: '18:00:00' },
      { start_time: '18:00:00', end_time: '19:00:00' },
      { start_time: '19:00:00', end_time: '20:00:00' },
    ],
  });
  assert.equal(baseAmount, 4000);
  assert.equal(calculateBookingAmounts({ baseAmount, platformRate: 5, gatewayRate: 2.5 }).totalPayable, 4300);
});

test('fixed-total pricing rejects partial, extended, and combined bookings', () => {
  const rule = { id: 'fixed', day_of_week: 3, start_time: '17:00', end_time: '20:00', price_per_hour: 4000, pricing_mode: 'fixed_total' };
  const full = [
    { start_time: '17:00:00', end_time: '18:00:00' },
    { start_time: '18:00:00', end_time: '19:00:00' },
    { start_time: '19:00:00', end_time: '20:00:00' },
  ];
  for (const slots of [
    full.slice(0, 2),
    [{ start_time: '16:00:00', end_time: '17:00:00' }, ...full],
    [...full, { start_time: '20:00:00', end_time: '21:00:00' }],
  ]) {
    assert.throws(
      () => calculateBaseAmountForSlots({ basePrice: 1600, rules: [rule], date: '2026-11-04', slots }),
      /exact full block/,
    );
  }
  assert.throws(
    () => calculateBaseAmountForSlots({
      basePrice: 1600,
      rules: [{ id: 'misaligned', day_of_week: 3, start_time: '17:30', end_time: '19:30', price_per_hour: 3000, pricing_mode: 'fixed_total' }],
      date: '2026-11-04',
      slots: [{ start_time: '17:00:00', end_time: '18:00:00' }],
    }),
    /exact full block/,
  );
});

test('date-specific pricing overrides a weekly fixed-total rule', () => {
  const weeklyFixed = { id: 'weekly-fixed', day_of_week: 3, start_time: '17:00', end_time: '19:00', price_per_hour: 4000, pricing_mode: 'fixed_total' };
  const dateHourly = { id: 'date-hourly', special_date: '2026-11-04', start_time: '17:00', end_time: '19:00', price_per_hour: 2500 };
  const slots = [
    { start_time: '17:00:00', end_time: '18:00:00' },
    { start_time: '18:00:00', end_time: '19:00:00' },
  ];
  assert.equal(calculateBaseAmountForSlots({ basePrice: 1600, rules: [weeklyFixed, dateHourly], date: '2026-11-04', slots }), 5000);
});

test('availability displays fixed-total pricing as one block over its reserved hourly slots', () => {
  const rule = { id: 'fixed', day_of_week: 3, start_time: '17:00', end_time: '20:00', price_per_hour: 4000, pricing_mode: 'fixed_total', label: 'Evening' };
  const schedule = [
    { startTime: '17:00', endTime: '18:00' },
    { startTime: '18:00', endTime: '19:00' },
    { startTime: '19:00', endTime: '20:00' },
  ];
  const slots = schedule.map((slot, index) => ({
    id: `slot-${index}`, start_time: `${slot.startTime}:00`, end_time: `${slot.endTime}:00`, status: 'available',
  }));
  const rows = addPricingToAvailability({ slots, configuredSlots: schedule, rules: [rule], date: '2026-11-04', basePrice: 1600 });
  assert.deepEqual(getDisplayedPricingSlots(rows).map((slot) => slot.id), ['slot-0']);
  assert.deepEqual(rows.map((slot) => slot.price), [4000, 0, 0]);
  assert.deepEqual(getPricingBlockSlots(rows, rows[0]).map((slot) => slot.id), ['slot-0', 'slot-1', 'slot-2']);
  assert.equal(rows[0].fixed_block_end_time, '20:00');
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
    baseAmount: 3200, platformRate: 5, gatewayRate: 2.5, showFeeBreakdown: false,
  }), 3440);
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