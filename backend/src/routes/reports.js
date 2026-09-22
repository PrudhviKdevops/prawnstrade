const express = require('express');
const { pool } = require('../db');
const { buildReportPdf } = require('../utils/pdf');
const { buildReportExcel } = require('../utils/excel');

const router = express.Router();

const VALID_TYPES = ['purchase', 'sales', 'commission', 'payment', 'complete'];

async function fetchReportRows({ from, to, farmer_id, exporter_id }) {
  const params = [];
  let where = 'WHERE is_deleted = FALSE';
  if (from) { params.push(from); where += ` AND transaction_date >= $${params.length}`; }
  if (to) { params.push(to); where += ` AND transaction_date <= $${params.length}`; }
  if (farmer_id) { params.push(farmer_id); where += ` AND farmer_id = $${params.length}`; }
  if (exporter_id) { params.push(exporter_id); where += ` AND exporter_id = $${params.length}`; }

  const { rows } = await pool.query(
    `SELECT * FROM transactions ${where} ORDER BY transaction_date ASC, id ASC`,
    params
  );
  return rows;
}

function computeTotals(rows) {
  const totalTonnage = rows.reduce((s, r) => s + Number(r.tonnage_kg), 0);
  const totalPurchase = rows.reduce((s, r) => s + Number(r.purchase_amount), 0);
  const totalSales = rows.reduce((s, r) => s + Number(r.sales_amount), 0);
  const totalCommission = rows.reduce((s, r) => s + Number(r.commission_amount), 0);
  return {
    'Total Transactions': rows.length,
    'Total Tonnage (KG)': totalTonnage.toLocaleString('en-IN'),
    'Total Purchase': `₹${totalPurchase.toLocaleString('en-IN')}`,
    'Total Sales': `₹${totalSales.toLocaleString('en-IN')}`,
    'Total Commission': `₹${totalCommission.toLocaleString('en-IN')}`,
  };
}

// GET /api/reports/:type?from=&to=&farmer_id=&exporter_id=
router.get('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid report type.' });
    const rows = await fetchReportRows(req.query);
    res.json({ type, rows, totals: computeTotals(rows) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not generate report.' });
  }
});

// GET /api/reports/:type/export/pdf?from=&to=
router.get('/:type/export/pdf', async (req, res) => {
  try {
    const { type } = req.params;
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid report type.' });
    const rows = await fetchReportRows(req.query);
    buildReportPdf({ type, from: req.query.from, to: req.query.to, rows, totals: computeTotals(rows) }, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not generate PDF report.' });
  }
});

// GET /api/reports/:type/export/excel?from=&to=
router.get('/:type/export/excel', async (req, res) => {
  try {
    const { type } = req.params;
    if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid report type.' });
    const rows = await fetchReportRows(req.query);
    await buildReportExcel({ type, rows }, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not generate Excel report.' });
  }
});

// Single-transaction "bill" PDF
router.get('/transaction/:id/pdf', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM transactions WHERE id = $1 AND is_deleted = FALSE', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Transaction not found.' });
    buildReportPdf({ type: 'complete', from: null, to: null, rows, totals: computeTotals(rows) }, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not generate transaction PDF.' });
  }
});

module.exports = router;
