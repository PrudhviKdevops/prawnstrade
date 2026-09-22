const express = require('express');
const { pool } = require('../db');

const router = express.Router();

function periodToRange(period, from, to) {
  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  switch (period) {
    case 'today':
      return { from: fmt(today), to: fmt(today) };
    case 'week': {
      const start = new Date(today);
      start.setDate(today.getDate() - today.getDay());
      return { from: fmt(start), to: fmt(today) };
    }
    case 'month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fmt(start), to: fmt(today) };
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmt(start), to: fmt(end) };
    }
    case 'year': {
      const start = new Date(today.getFullYear(), 0, 1);
      return { from: fmt(start), to: fmt(today) };
    }
    case 'custom':
      return { from: from || null, to: to || null };
    default:
      return { from: null, to: null }; // all time
  }
}

router.get('/', async (req, res) => {
  try {
    const { period = 'all', from, to } = req.query;
    const range = periodToRange(period, from, to);
    const params = [];
    let where = 'WHERE is_deleted = FALSE';
    if (range.from) { params.push(range.from); where += ` AND transaction_date >= $${params.length}`; }
    if (range.to) { params.push(range.to); where += ` AND transaction_date <= $${params.length}`; }

    const summary = await pool.query(
      `SELECT
         COUNT(*)::int AS total_transactions,
         COALESCE(SUM(tonnage_kg),0) AS total_tonnage,
         COALESCE(SUM(purchase_amount),0) AS total_purchase,
         COALESCE(SUM(sales_amount),0) AS total_sales,
         COALESCE(SUM(commission_amount),0) AS total_commission,
         COUNT(*) FILTER (WHERE bill_status='OPEN')::int AS open_bills,
         COUNT(*) FILTER (WHERE bill_status='PARTIALLY_CLOSED')::int AS partially_closed_bills,
         COUNT(*) FILTER (WHERE bill_status='CLOSED')::int AS closed_bills,
         COALESCE(SUM(exporter_balance),0) AS exporter_receivable,
         COALESCE(SUM(farmer_balance),0) AS farmer_payment_pending,
         COALESCE(SUM(exporter_paid_amount),0) AS exporter_payments_received,
         COALESCE(SUM(farmer_paid_amount),0) AS farmer_payments_completed
       FROM transactions ${where}`,
      params
    );

    const monthly = await pool.query(
      `SELECT TO_CHAR(transaction_date, 'YYYY-MM') AS month,
              COALESCE(SUM(purchase_amount),0) AS purchase,
              COALESCE(SUM(sales_amount),0) AS sales,
              COALESCE(SUM(commission_amount),0) AS commission
       FROM transactions
       WHERE is_deleted = FALSE AND transaction_date >= (CURRENT_DATE - INTERVAL '12 months')
       GROUP BY month ORDER BY month ASC`
    );

    const countWise = await pool.query(
      `SELECT count_value AS count, COALESCE(SUM(tonnage_kg),0) AS tonnage
       FROM transactions ${where}
       GROUP BY count_value ORDER BY count_value ASC`,
      params
    );

    const exporterWise = await pool.query(
      `SELECT exporter_name_snapshot AS name, COALESCE(SUM(sales_amount),0) AS sales
       FROM transactions ${where}
       GROUP BY exporter_name_snapshot ORDER BY sales DESC LIMIT 10`,
      params
    );

    const farmerWise = await pool.query(
      `SELECT farmer_name_snapshot AS name, COALESCE(SUM(tonnage_kg),0) AS tonnage
       FROM transactions ${where}
       GROUP BY farmer_name_snapshot ORDER BY tonnage DESC LIMIT 10`,
      params
    );

    const recent = await pool.query(
      `SELECT id, transaction_number, transaction_date, farmer_name_snapshot, count_value, tonnage_kg,
              exporter_name_snapshot, commission_amount, bill_status
       FROM transactions WHERE is_deleted = FALSE ORDER BY created_at DESC LIMIT 10`
    );

    res.json({
      period: range,
      summary: summary.rows[0],
      charts: {
        monthly: monthly.rows,
        count_wise: countWise.rows,
        exporter_wise: exporterWise.rows,
        farmer_wise: farmerWise.rows,
      },
      recent_transactions: recent.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load dashboard data.' });
  }
});

module.exports = router;
