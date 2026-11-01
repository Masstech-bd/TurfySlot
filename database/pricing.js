const roundMoney = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;

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