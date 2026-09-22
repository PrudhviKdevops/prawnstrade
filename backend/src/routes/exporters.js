const express = require('express');
const { pool } = require('../db');

const router = express.Router();

async function nextExporterCode() {
  const { rows } = await pool.query(
    `SELECT exporter_code FROM exporters WHERE exporter_code LIKE 'EXP-%' ORDER BY id DESC LIMIT 1`
  );
  let next = 1;
  if (rows[0]?.exporter_code) {
    const n = parseInt(rows[0].exporter_code.split('-')[1], 10);
    if (!Number.isNaN(n)) next = n + 1;
  }
  return `EXP-${String(next).padStart(4, '0')}`;
}

router.get('/', async (req, res) => {
  try {
    const { search = '', page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const params = [];
    let where = 'WHERE is_deleted = FALSE';
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (company_name ILIKE $${params.length} OR exporter_code ILIKE $${params.length} OR gst_number ILIKE $${params.length})`;
    }
    const totalRes = await pool.query(`SELECT COUNT(*)::int AS count FROM exporters ${where}`, params);
    params.push(Number(limit), offset);
    const dataRes = await pool.query(
      `SELECT * FROM exporters ${where} ORDER BY company_name ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: dataRes.rows, total: totalRes.rows[0].count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch exporters.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM exporters WHERE id = $1 AND is_deleted = FALSE', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Exporter not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch exporter.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { company_name, contact_person, mobile, email, address, gst_number, payment_terms, bank_details, notes } = req.body;
    if (!company_name || !company_name.trim()) {
      return res.status(400).json({ error: 'Exporter company name is required.' });
    }
    const code = await nextExporterCode();
    const { rows } = await pool.query(
      `INSERT INTO exporters (exporter_code, company_name, contact_person, mobile, email, address, gst_number, payment_terms, bank_details, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [code, company_name.trim(), contact_person, mobile, email, address, gst_number, payment_terms, bank_details, notes]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create exporter.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { company_name, contact_person, mobile, email, address, gst_number, payment_terms, bank_details, notes } = req.body;
    if (!company_name || !company_name.trim()) {
      return res.status(400).json({ error: 'Exporter company name is required.' });
    }
    const { rows } = await pool.query(
      `UPDATE exporters SET company_name=$1, contact_person=$2, mobile=$3, email=$4, address=$5,
         gst_number=$6, payment_terms=$7, bank_details=$8, notes=$9, updated_at=NOW()
       WHERE id=$10 AND is_deleted = FALSE RETURNING *`,
      [company_name.trim(), contact_person, mobile, email, address, gst_number, payment_terms, bank_details, notes, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Exporter not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update exporter.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE exporters SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Exporter not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete exporter.' });
  }
});

module.exports = router;
