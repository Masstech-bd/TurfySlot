const roundMoney = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;

const timeInMinutes = (value) => {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!match) return NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) return NaN;
  return hours * 60 + minutes;
};

export const findPricingRuleForSlot = (rules, date, startTime) => {
  const slotStart = timeInMinutes(startTime);
  const dateValue = new Date(`${date}T12:00:00Z`);
  if (!Array.isArray(rules) || !Number.isFinite(slotStart) || Number.isNaN(dateValue.getTime())) return undefined;
  const weekday = dateValue.getUTCDay();
  const matchesTime = (rule) => timeInMinutes(rule.start_time ?? rule.startTime) <= slotStart &&
    timeInMinutes(rule.end_time ?? rule.endTime) > slotStart;
  const specialDateRule = rules.find((rule) => {
    const ruleDate = rule.special_date ?? rule.date;
    return ruleDate != null && String(ruleDate).slice(0, 10) === date && matchesTime(rule);
  });
  if (specialDateRule) return specialDateRule;
  return rules.find((rule) => {
    const ruleDate = rule.special_date ?? rule.date;
    const ruleWeekday = rule.day_of_week ?? rule.dayOfWeek;
    return ruleDate == null && Number(ruleWeekday) === weekday && matchesTime(rule);
  });
};

export const calculateBookingAmounts = ({ baseAmount, platformRate, gatewayRate }) => {
  const subtotal = roundMoney(Number(baseAmount));
  const platformFeeAmount = roundMoney(subtotal * platformRate / 100);
  const gatewayFeeAmount = roundMoney(subtotal * gatewayRate / 100);

  return {
    commissionAmount: 0,
    platformFeeAmount,
    gatewayFeeAmount,
    netOwnerAmount: subtotal,
    totalPayable: roundMoney(subtotal + platformFeeAmount + gatewayFeeAmount),
  };
};

export const calculateDisplayedTurfPrice = ({ baseAmount, platformRate, gatewayRate, showFeeBreakdown }) => {
  const subtotal = roundMoney(Number(baseAmount));
  if (showFeeBreakdown) return subtotal;
  return calculateBookingAmounts({ baseAmount: subtotal, platformRate, gatewayRate }).totalPayable;
};

export const calculateCancellationRefund = ({
  baseAmount,
  addonTotal = 0,
  platformFeeAmount = 0,
  gatewayFeeAmount = 0,
  totalPayable,
  refundPercentage,
  isManual = false,
  ownerInitiated = false,
  adminOverride = false,
}) => {
  const subtotal = roundMoney(Number(baseAmount) + Number(addonTotal));
  const platformFee = Number(platformFeeAmount);
  const gatewayFee = Number(gatewayFeeAmount);
  const percentage = Number(refundPercentage);
  if (!Number.isFinite(subtotal) || subtotal < 0 || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error('Cancellation refund amounts are invalid.');
  }

  const ownerOrAdminCancellation = ownerInitiated || adminOverride;
  const refundAmount = ownerOrAdminCancellation
    ? Number(totalPayable) - (isManual ? 0 : gatewayFee)
    : isManual
      ? (subtotal - platformFee) * percentage / 100
      : subtotal * percentage / 100;
  const turfPriceRefunded = ownerOrAdminCancellation ? subtotal : subtotal * percentage / 100;
  return {
    refundAmount: roundMoney(Math.max(0, refundAmount)),
    turfPriceRefunded: roundMoney(Math.max(0, turfPriceRefunded)),
  };
};