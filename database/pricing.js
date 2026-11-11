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

const pricingMode = (rule) => rule?.pricing_mode ?? rule?.pricingMode ?? 'hourly';
const ruleStartTime = (rule) => String(rule?.start_time ?? rule?.startTime ?? '').slice(0, 5);
const ruleEndTime = (rule) => String(rule?.end_time ?? rule?.endTime ?? '').slice(0, 5);
const ruleAmount = (rule) => Number(rule?.price_per_hour ?? rule?.pricePerHour);
const ruleKey = (rule) => String(rule?.id ?? [
  rule?.date ?? rule?.special_date ?? rule?.dayOfWeek ?? rule?.day_of_week,
  ruleStartTime(rule),
  ruleEndTime(rule),
  pricingMode(rule),
  ruleAmount(rule),
].join(':'));

export const calculateBaseAmountForSlots = ({ basePrice, rules, date, slots }) => {
  if (!Array.isArray(slots) || slots.length === 0) throw new Error('At least one booking slot is required.');
  const matchedRules = slots.map((slot) => findPricingRuleForSlot(rules, date, slot.start_time ?? slot.startTime));
  const dateValue = new Date(`${date}T12:00:00Z`);
  const weekday = dateValue.getUTCDay();
  const fixedRules = (rules || []).filter((rule) => {
    if (pricingMode(rule) !== 'fixed_total') return false;
    const ruleDate = rule?.special_date ?? rule?.date;
    const ruleWeekday = rule?.day_of_week ?? rule?.dayOfWeek;
    const appliesToDate = ruleDate != null
      ? String(ruleDate).slice(0, 10) === date
      : Number(ruleWeekday) === weekday;
    if (!appliesToDate) return false;
    const start = timeInMinutes(ruleStartTime(rule));
    const end = timeInMinutes(ruleEndTime(rule));
    return slots.some((slot, index) => {
      const slotStart = timeInMinutes(slot.start_time ?? slot.startTime);
      const slotEnd = timeInMinutes(slot.end_time ?? slot.endTime);
      const higherPriorityDateRule = ruleDate == null &&
        (matchedRules[index]?.special_date ?? matchedRules[index]?.date) != null;
      return !higherPriorityDateRule && slotStart < end && slotEnd > start;
    });
  });
  if (!fixedRules.length) {
    return roundMoney(slots.reduce((sum, slot, index) => {
      const rule = matchedRules[index];
      return sum + (rule ? ruleAmount(rule) : Number(basePrice));
    }, 0));
  }

  const fixedRule = fixedRules[0];
  const ruleStart = timeInMinutes(ruleStartTime(fixedRule));
  const ruleEnd = timeInMinutes(ruleEndTime(fixedRule));
  const requestStart = timeInMinutes(slots[0].start_time ?? slots[0].startTime);
  const requestEnd = timeInMinutes(slots[slots.length - 1].end_time ?? slots[slots.length - 1].endTime);
  const matchesOneRule = fixedRules.length === 1 &&
    matchedRules.every((rule) => rule && pricingMode(rule) === 'fixed_total' && ruleKey(rule) === ruleKey(fixedRule));
  const expectedHours = (ruleEnd - ruleStart) / 60;
  const validBlock = matchesOneRule && Number.isInteger(expectedHours) && expectedHours > 0 &&
    requestStart === ruleStart && requestEnd === ruleEnd && slots.length === expectedHours &&
    slots.every((slot, index) => {
      const start = timeInMinutes(slot.start_time ?? slot.startTime);
      const end = timeInMinutes(slot.end_time ?? slot.endTime);
      return end - start === 60 && (index === 0 || start === timeInMinutes(slots[index - 1].end_time ?? slots[index - 1].endTime));
    });
  if (!validBlock) throw new Error('A fixed-price time range must be booked as its exact full block without other hours.');
  return roundMoney(ruleAmount(fixedRule));
};

export const addPricingToAvailability = ({ slots, configuredSlots, rules, date, basePrice }) => {
  const result = slots.map((slot) => {
    const rule = findPricingRuleForSlot(rules, date, slot.start_time ?? slot.startTime);
    const mode = rule ? pricingMode(rule) : 'hourly';
    return {
      ...slot,
      price: rule ? ruleAmount(rule) : Number(basePrice),
      pricing_mode: mode,
      pricing_label: rule?.label || undefined,
      pricing_rule_id: rule?.id ? String(rule.id) : undefined,
    };
  });
  const dateValue = new Date(`${date}T12:00:00Z`);
  const weekday = dateValue.getUTCDay();
  const applicableFixedRules = (rules || []).filter((rule) => {
    const ruleDate = rule?.special_date ?? rule?.date;
    const ruleWeekday = rule?.day_of_week ?? rule?.dayOfWeek;
    return pricingMode(rule) === 'fixed_total' &&
      (ruleDate != null ? String(ruleDate).slice(0, 10) === date : Number(ruleWeekday) === weekday);
  });

  for (const rule of applicableFixedRules) {
    const start = timeInMinutes(ruleStartTime(rule));
    const end = timeInMinutes(ruleEndTime(rule));
    const intersecting = (configuredSlots || []).filter((slot) =>
      timeInMinutes(slot.startTime ?? slot.start_time) < end &&
      timeInMinutes(slot.endTime ?? slot.end_time) > start);
    const sorted = [...intersecting].sort((a, b) =>
      timeInMinutes(a.startTime ?? a.start_time) - timeInMinutes(b.startTime ?? b.start_time));
    const expectedHours = (end - start) / 60;
    const exactSchedule = Number.isInteger(expectedHours) && expectedHours > 0 && sorted.length === expectedHours &&
      timeInMinutes(sorted[0]?.startTime ?? sorted[0]?.start_time) === start &&
      timeInMinutes(sorted[sorted.length - 1]?.endTime ?? sorted[sorted.length - 1]?.end_time) === end &&
      sorted.every((slot, index) => {
        const slotStart = timeInMinutes(slot.startTime ?? slot.start_time);
        const slotEnd = timeInMinutes(slot.endTime ?? slot.end_time);
        return slotEnd - slotStart === 60 &&
          (index === 0 || slotStart === timeInMinutes(sorted[index - 1].endTime ?? sorted[index - 1].end_time));
      });
    const matched = sorted.map((slot) => findPricingRuleForSlot(rules, date, slot.startTime ?? slot.start_time));
    const oneEffectiveRule = matched.length === sorted.length && matched.every((item) =>
      item && pricingMode(item) === 'fixed_total' && ruleKey(item) === ruleKey(rule));
    const rowsByStart = new Map(result.map((slot) => [String(slot.start_time ?? slot.startTime).slice(0, 5), slot]));
    const blockRows = sorted.map((slot) => rowsByStart.get(String(slot.startTime ?? slot.start_time).slice(0, 5)));
    const completeAvailability = blockRows.length === sorted.length && blockRows.every(Boolean);
    const isBookableBlock = exactSchedule && oneEffectiveRule && completeAvailability;

    for (const slot of sorted) {
      const row = rowsByStart.get(String(slot.startTime ?? slot.start_time).slice(0, 5));
      if (!row) continue;
      if (!isBookableBlock) {
        const effectiveRule = findPricingRuleForSlot(rules, date, slot.startTime ?? slot.start_time);
        const higherPriorityDateRule = (rule?.special_date ?? rule?.date) == null &&
          (effectiveRule?.special_date ?? effectiveRule?.date) != null;
        if (higherPriorityDateRule) continue;
        row.price = 0;
        row.pricing_mode = 'fixed_total';
        row.pricing_rule_id = rule.id ? String(rule.id) : ruleKey(rule);
        row.fixed_price_total = ruleAmount(rule);
        row.fixed_block_start_time = ruleStartTime(rule);
        row.fixed_block_end_time = ruleEndTime(rule);
        if (row.status === 'available') row.status = 'blocked';
        continue;
      }
      row.pricing_mode = 'fixed_total';
      row.pricing_rule_id = rule.id ? String(rule.id) : ruleKey(rule);
      row.fixed_price_total = ruleAmount(rule);
      row.fixed_block_start_time = ruleStartTime(rule);
      row.fixed_block_end_time = ruleEndTime(rule);
      row.price = String(row.start_time ?? row.startTime).slice(0, 5) === ruleStartTime(rule) ? ruleAmount(rule) : 0;
    }
  }
  return result;
};

export const getPricingBlockSlots = (slots, selectedSlot) => {
  const mode = selectedSlot?.pricingMode ?? selectedSlot?.pricing_mode ?? 'hourly';
  if (mode !== 'fixed_total') return selectedSlot ? [selectedSlot] : [];
  const ruleId = selectedSlot.pricingRuleId ?? selectedSlot.pricing_rule_id;
  const blockStart = selectedSlot.fixedBlockStartTime ?? selectedSlot.fixed_block_start_time;
  const blockEnd = selectedSlot.fixedBlockEndTime ?? selectedSlot.fixed_block_end_time;
  return (slots || [])
    .filter((slot) => {
      const slotRuleId = slot.pricingRuleId ?? slot.pricing_rule_id;
      return (slot.pricingMode ?? slot.pricing_mode) === 'fixed_total' &&
        (ruleId ? String(slotRuleId) === String(ruleId) : (
          (slot.fixedBlockStartTime ?? slot.fixed_block_start_time) === blockStart &&
          (slot.fixedBlockEndTime ?? slot.fixed_block_end_time) === blockEnd
        ));
    })
    .sort((a, b) => timeInMinutes(a.startTime ?? a.start_time) - timeInMinutes(b.startTime ?? b.start_time));
};

export const getDisplayedPricingSlots = (slots) => (slots || []).filter((slot) => {
  if ((slot.pricingMode ?? slot.pricing_mode) !== 'fixed_total') return true;
  const start = slot.fixedBlockStartTime ?? slot.fixed_block_start_time;
  return String(slot.startTime ?? slot.start_time).slice(0, 5) === start;
});

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