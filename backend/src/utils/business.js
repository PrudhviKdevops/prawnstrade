/** Rounds to 2 decimal places safely. */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Purchase value = tonnage (KG) x farmer price (per KG). */
function calcPurchaseAmount(tonnageKg, farmerPrice) {
  return round2(Number(tonnageKg) * Number(farmerPrice));
}

/** Sales value = tonnage (KG) x exporter price (per KG). */
function calcSalesAmount(tonnageKg, exporterPrice) {
  return round2(Number(tonnageKg) * Number(exporterPrice));
}

/** PENDING / PARTIALLY_PAID / PAID, based on paid vs total amount. */
function calcPaymentStatus(paidAmount, totalAmount) {
  const paid = round2(paidAmount);
  const total = round2(totalAmount);
  if (paid <= 0) return 'PENDING';
  if (paid >= total) return 'PAID';
  return 'PARTIALLY_PAID';
}

/** Balance never goes below zero for display purposes. */
function calcBalance(totalAmount, paidAmount) {
  const bal = round2(Number(totalAmount) - Number(paidAmount));
  return bal < 0 ? 0 : bal;
}

/**
 * OPEN            - both sides still pending / partially paid, no side fully paid
 * PARTIALLY_CLOSED- exactly one side is fully PAID, the other is not
 * CLOSED          - both sides fully PAID
 */
function calcBillStatus(exporterStatus, farmerStatus) {
  const expPaid = exporterStatus === 'PAID';
  const farmPaid = farmerStatus === 'PAID';
  if (expPaid && farmPaid) return 'CLOSED';
  if (expPaid || farmPaid) return 'PARTIALLY_CLOSED';
  return 'OPEN';
}

function generateTransactionNumber(seqValue, date) {
  const year = (date ? new Date(date) : new Date()).getFullYear();
  const padded = String(seqValue).padStart(6, '0');
  return `PRN-${year}-${padded}`;
}

module.exports = {
  round2,
  calcPurchaseAmount,
  calcSalesAmount,
  calcPaymentStatus,
  calcBalance,
  calcBillStatus,
  generateTransactionNumber,
};
