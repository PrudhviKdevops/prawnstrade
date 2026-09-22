const express = require('express');
const { pool } = require('../db');

const router = express.Router();

/**
 * Count Rates is NOT a manually maintained rate card. It is derived
 * directly from the farmer_price and exporter_price actually recorded on
 * real transactions, grouped by transaction date and count. This reflects
 * what farmers and exporter companies were actually paid/charged that day.
 */

// GET /api/count-rates?count=&date_from=&date_to=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const { count, date_from, date_to, page = 1, limit = 100 } = req.query;
    const params = [];
    const conditions = ['is_deleted = FALSE'];

    if (count) { params.push(count); conditions.push(`count_value = $${params.length}`); }
    if (date_from) { params.push(date_from); conditions.push(`transaction_date >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`transaction_date <= $${params.length}`); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const totalRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM (
         SELECT transaction_date, count_value FROM transactions ${where}
         GROUP BY transaction_date, count_value
       ) sub`,
      params
    );

    const offset = (Number(page) - 1) * Number(limit);
    params.push(Number(limit), offset);
    const dataRes = await pool.query(
      `SELECT
         transaction_date AS rate_date,
         count_value,
         ROUND(AVG(farmer_price), 2) AS farmer_rate,
         MIN(farmer_price) AS farmer_rate_min,
         MAX(farmer_price) AS farmer_rate_max,
         ROUND(AVG(exporter_price), 2) AS company_rate,
         MIN(exporter_price) AS company_rate_min,
         MAX(exporter_price) AS company_rate_max,
         COUNT(*)::int AS transactions_count
       FROM transactions
       ${where}
       GROUP BY transaction_date, count_value
       ORDER BY transaction_date DESC, count_value ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ data: dataRes.rows, total: totalRes.rows[0].count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch count rates.' });
  }
});

// GET /api/count-rates/counts - distinct counts actually used in transactions, for the filter dropdown
router.get('/counts', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT DISTINCT count_value FROM transactions WHERE is_deleted = FALSE ORDER BY count_value ASC'
    );
    res.json({ counts: rows.map((r) => Number(r.count_value)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch counts.' });
  }
});

module.exports = router;
