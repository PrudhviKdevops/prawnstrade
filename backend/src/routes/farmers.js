const express = require('express');
const { pool } = require('../db');

const router = express.Router();

async function nextFarmerCode() {
  const { rows } = await pool.query(
    `SELECT farmer_code FROM farmers WHERE farmer_code LIKE 'FRM-%' ORDER BY id DESC LIMIT 1`
  );
  let next = 1;
  if (rows[0]?.farmer_code) {
    const n = parseInt(rows[0].farmer_code.split('-')[1], 10);
    if (!Number.isNaN(n)) next = n + 1;
  }
  return `FRM-${String(next).padStart(4, '0')}`;
}

// GET /api/farmers?search=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const params = [];
    let where = 'WHERE is_deleted = FALSE';
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (farmer_name ILIKE $${params.length} OR farmer_code ILIKE $${params.length} OR mobile ILIKE $${params.length})`;
    }
    const totalRes = await pool.query(`SELECT COUNT(*)::int AS count FROM farmers ${where}`, params);
    params.push(Number(limit), offset);
    const dataRes = await pool.query(
      `SELECT * FROM farmers ${where} ORDER BY farmer_name ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: dataRes.rows, total: totalRes.rows[0].count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch farmers.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM farmers WHERE id = $1 AND is_deleted = FALSE', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Farmer not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch farmer.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { farmer_name, mobile, village, mandal, district, address, bank_details, pan, notes } = req.body;
    if (!farmer_name || !farmer_name.trim()) {
      return res.status(400).json({ error: 'Farmer name is required.' });
    }
    const code = await nextFarmerCode();
    const { rows } = await pool.query(
      `INSERT INTO farmers (farmer_code, farmer_name, mobile, village, mandal, district, address, bank_details, pan, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [code, farmer_name.trim(), mobile, village, mandal, district, address, bank_details, pan, notes]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create farmer.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { farmer_name, mobile, village, mandal, district, address, bank_details, pan, notes } = req.body;
    if (!farmer_name || !farmer_name.trim()) {
      return res.status(400).json({ error: 'Farmer name is required.' });
    }
    const { rows } = await pool.query(
      `UPDATE farmers SET farmer_name=$1, mobile=$2, village=$3, mandal=$4, district=$5,
         address=$6, bank_details=$7, pan=$8, notes=$9, updated_at=NOW()
       WHERE id=$10 AND is_deleted = FALSE RETURNING *`,
      [farmer_name.trim(), mobile, village, mandal, district, address, bank_details, pan, notes, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Farmer not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update farmer.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE farmers SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Farmer not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete farmer.' });
  }
});

// GET /api/farmers/:id/summary - totals for one farmer (used by farmer search screen)
router.get('/:id/summary', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total_transactions,
         COALESCE(SUM(tonnage_kg),0) AS total_tonnage,
         COALESCE(SUM(purchase_amount),0) AS total_purchase,
         COALESCE(SUM(sales_amount),0) AS total_sales,
         COALESCE(SUM(commission_amount),0) AS total_commission,
         COUNT(*) FILTER (WHERE bill_status = 'OPEN')::int AS open_bills,
         COUNT(*) FILTER (WHERE bill_status = 'CLOSED')::int AS closed_bills
       FROM transactions WHERE farmer_id = $1 AND is_deleted = FALSE`,
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch farmer summary.' });
  }
});

module.exports = router;
