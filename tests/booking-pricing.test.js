import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBookingAmounts, calculateCancellationRefund } from '../database/pricing.js';

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