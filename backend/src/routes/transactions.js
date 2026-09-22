const express = require('express');
const { pool } = require('../db');
const {
  calcPurchaseAmount,
  calcSalesAmount,
  calcPaymentStatus,
  calcBalance,
  calcBillStatus,
  generateTransactionNumber,
  round2,
} = require('../utils/business');

const router = express.Router();

async function logAudit(client, transactionId, action, oldValue, newValue, user) {
  await client.query(
    `INSERT INTO audit_logs (transaction_id, action, old_value, new_value, created_by) VALUES ($1,$2,$3,$4,$5)`,
    [transactionId, action, oldValue != null ? String(oldValue) : null, newValue != null ? String(newValue) : null, user]
  );
}

function validateTransactionInput(body) {
  const errors = [];
  if (!body.farmer_name || !String(body.farmer_name).trim()) errors.push('Farmer Name is required.');
  if (!(Number(body.count) > 0)) errors.push('Count must be greater than zero.');
  if (!(Number(body.tonnage_kg) > 0)) errors.push('Tonnage must be greater than zero.');
  if (!(Number(body.farmer_price) >= 0)) errors.push('Farmer Price must be zero or greater.');
  if (!body.exporter_company_name || !String(body.exporter_company_name).trim()) errors.push('Exporter Company Name is required.');
  if (!(Number(body.exporter_price) >= 0)) errors.push('Exporter Price must be zero or greater.');
  if (!(Number(body.commission_amount) >= 0)) errors.push('Commission Amount cannot be negative.');
  if (!body.transaction_date) errors.push('Transaction Date is required.');
  return errors;
}

/** Finds a farmer by id, or by (creating if needed) exact name match. */
async function resolveFarmer(client, { farmer_id, farmer_name }) {
  if (farmer_id) {
    const { rows } = await client.query('SELECT * FROM farmers WHERE id = $1', [farmer_id]);
    if (rows[0]) return rows[0];
  }
  const name = String(farmer_name).trim();
  const existing = await client.query('SELECT * FROM farmers WHERE LOWER(farmer_name) = LOWER($1) AND is_deleted = FALSE', [name]);
  if (existing.rows[0]) return existing.rows[0];

  const codeRes = await client.query(`SELECT farmer_code FROM farmers WHERE farmer_code LIKE 'FRM-%' ORDER BY id DESC LIMIT 1`);
  let next = 1;
  if (codeRes.rows[0]?.farmer_code) {
    const n = parseInt(codeRes.rows[0].farmer_code.split('-')[1], 10);
    if (!Number.isNaN(n)) next = n + 1;
  }
  const code = `FRM-${String(next).padStart(4, '0')}`;
  const created = await client.query(
    `INSERT INTO farmers (farmer_code, farmer_name) VALUES ($1, $2) RETURNING *`,
    [code, name]
  );
  return created.rows[0];
}

async function resolveExporter(client, { exporter_id, exporter_company_name }) {
  if (exporter_id) {
    const { rows } = await client.query('SELECT * FROM exporters WHERE id = $1', [exporter_id]);
    if (rows[0]) return rows[0];
  }
  const name = String(exporter_company_name).trim();
  const existing = await client.query('SELECT * FROM exporters WHERE LOWER(company_name) = LOWER($1) AND is_deleted = FALSE', [name]);
  if (existing.rows[0]) return existing.rows[0];

  const codeRes = await client.query(`SELECT exporter_code FROM exporters WHERE exporter_code LIKE 'EXP-%' ORDER BY id DESC LIMIT 1`);
  let next = 1;
  if (codeRes.rows[0]?.exporter_code) {
    const n = parseInt(codeRes.rows[0].exporter_code.split('-')[1], 10);
    if (!Number.isNaN(n)) next = n + 1;
  }
  const code = `EXP-${String(next).padStart(4, '0')}`;
  const created = await client.query(
    `INSERT INTO exporters (exporter_code, company_name) VALUES ($1, $2) RETURNING *`,
    [code, name]
  );
  return created.rows[0];
}

// ---------------------------------------------------------------- LIST -----
router.get('/', async (req, res) => {
  try {
    const {
      search = '', date_from, date_to, count, farmer_id, exporter_id,
      bill_status, exporter_payment_status, farmer_payment_status,
      page = 1, limit = 20, sort = 'transaction_date', dir = 'DESC',
    } = req.query;

    const params = [];
    const conditions = ['t.is_deleted = FALSE'];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(t.transaction_number ILIKE $${params.length} OR t.farmer_name_snapshot ILIKE $${params.length} OR t.exporter_name_snapshot ILIKE $${params.length})`);
    }
    if (date_from) { params.push(date_from); conditions.push(`t.transaction_date >= $${params.length}`); }
    if (date_to) { params.push(date_to); conditions.push(`t.transaction_date <= $${params.length}`); }
    if (count) { params.push(count); conditions.push(`t.count_value = $${params.length}`); }
    if (farmer_id) { params.push(farmer_id); conditions.push(`t.farmer_id = $${params.length}`); }
    if (exporter_id) { params.push(exporter_id); conditions.push(`t.exporter_id = $${params.length}`); }
    if (bill_status) { params.push(bill_status); conditions.push(`t.bill_status = $${params.length}`); }
    if (exporter_payment_status) { params.push(exporter_payment_status); conditions.push(`t.exporter_payment_status = $${params.length}`); }
    if (farmer_payment_status) { params.push(farmer_payment_status); conditions.push(`t.farmer_payment_status = $${params.length}`); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const allowedSort = ['transaction_date', 'transaction_number', 'commission_amount', 'tonnage_kg', 'created_at'];
    const sortCol = allowedSort.includes(sort) ? sort : 'transaction_date';
    const sortDir = String(dir).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const totalRes = await pool.query(`SELECT COUNT(*)::int AS count FROM transactions t ${where}`, params);

    const offset = (Number(page) - 1) * Number(limit);
    params.push(Number(limit), offset);
    const dataRes = await pool.query(
      `SELECT t.* FROM transactions t ${where} ORDER BY t.${sortCol} ${sortDir}, t.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ data: dataRes.rows, total: totalRes.rows[0].count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch transactions.' });
  }
});

// ------------------------------------------------------------- DETAILS -----
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM transactions WHERE id = $1 AND is_deleted = FALSE', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Transaction not found.' });

    const payments = await pool.query(
      'SELECT * FROM payments WHERE transaction_id = $1 ORDER BY payment_date DESC, id DESC',
      [req.params.id]
    );
    const audit = await pool.query(
      'SELECT * FROM audit_logs WHERE transaction_id = $1 ORDER BY created_at DESC, id DESC',
      [req.params.id]
    );

    res.json({ ...rows[0], payments: payments.rows, audit_logs: audit.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch transaction.' });
  }
});

// -------------------------------------------------------------- CREATE -----
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const errors = validateTransactionInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const {
      transaction_date, farmer_id, farmer_name, count, tonnage_kg, farmer_price,
      exporter_id, exporter_company_name, exporter_price, commission_amount, notes,
    } = req.body;

    await client.query('BEGIN');

    const farmer = await resolveFarmer(client, { farmer_id, farmer_name });
    const exporter = await resolveExporter(client, { exporter_id, exporter_company_name });

    const purchaseAmount = calcPurchaseAmount(tonnage_kg, farmer_price);
    const salesAmount = calcSalesAmount(tonnage_kg, exporter_price);

    const seqRes = await client.query("SELECT nextval('transaction_seq') AS seq");
    const transactionNumber = generateTransactionNumber(seqRes.rows[0].seq, transaction_date);

    const user = req.user?.username || 'system';

    const { rows } = await client.query(
      `INSERT INTO transactions (
         transaction_number, transaction_date,
         farmer_id, farmer_name_snapshot, count_value, tonnage_kg, farmer_price, purchase_amount,
         exporter_id, exporter_name_snapshot, exporter_price, sales_amount,
         commission_amount,
         exporter_paid_amount, exporter_balance, exporter_payment_status,
         farmer_paid_amount, farmer_balance, farmer_payment_status,
         bill_status, notes, created_by, updated_by
       ) VALUES (
         $1,$2, $3,$4,$5,$6,$7,$8, $9,$10,$11,$12, $13,
         0,$14,'PENDING', 0,$15,'PENDING', 'OPEN', $16, $17, $17
       ) RETURNING *`,
      [
        transactionNumber, transaction_date,
        farmer.id, farmer.farmer_name, count, tonnage_kg, farmer_price, purchaseAmount,
        exporter.id, exporter.company_name, exporter_price, salesAmount,
        round2(commission_amount),
        salesAmount, purchaseAmount, notes || null, user,
      ]
    );

    await logAudit(client, rows[0].id, 'Transaction Created', null, transactionNumber, user);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Could not create transaction.' });
  } finally {
    client.release();
  }
});

// -------------------------------------------------------------- UPDATE -----
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const errors = validateTransactionInput(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    await client.query('BEGIN');
    const existingRes = await client.query('SELECT * FROM transactions WHERE id = $1 AND is_deleted = FALSE', [req.params.id]);
    const existing = existingRes.rows[0];
    if (!existing) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const {
      transaction_date, farmer_id, farmer_name, count, tonnage_kg, farmer_price,
      exporter_id, exporter_company_name, exporter_price, commission_amount, notes,
    } = req.body;

    const farmer = await resolveFarmer(client, { farmer_id, farmer_name });
    const exporter = await resolveExporter(client, { exporter_id, exporter_company_name });

    const purchaseAmount = calcPurchaseAmount(tonnage_kg, farmer_price);
    const salesAmount = calcSalesAmount(tonnage_kg, exporter_price);

    // Recompute balances/status against unchanged paid amounts.
    const farmerBalance = calcBalance(purchaseAmount, existing.farmer_paid_amount);
    const exporterBalance = calcBalance(salesAmount, existing.exporter_paid_amount);
    const farmerStatus = calcPaymentStatus(existing.farmer_paid_amount, purchaseAmount);
    const exporterStatus = calcPaymentStatus(existing.exporter_paid_amount, salesAmount);
    const billStatus = calcBillStatus(exporterStatus, farmerStatus);

    const user = req.user?.username || 'system';

    const { rows } = await client.query(
      `UPDATE transactions SET
         transaction_date=$1, farmer_id=$2, farmer_name_snapshot=$3, count_value=$4, tonnage_kg=$5,
         farmer_price=$6, purchase_amount=$7,
         exporter_id=$8, exporter_name_snapshot=$9, exporter_price=$10, sales_amount=$11,
         commission_amount=$12,
         farmer_balance=$13, farmer_payment_status=$14,
         exporter_balance=$15, exporter_payment_status=$16,
         bill_status=$17, notes=$18, updated_by=$19, updated_at=NOW()
       WHERE id=$20 RETURNING *`,
      [
        transaction_date, farmer.id, farmer.farmer_name, count, tonnage_kg,
        farmer_price, purchaseAmount,
        exporter.id, exporter.company_name, exporter_price, salesAmount,
        round2(commission_amount),
        farmerBalance, farmerStatus,
        exporterBalance, exporterStatus,
        billStatus, notes || null, user, req.params.id,
      ]
    );

    const changes = [];
    if (Number(existing.exporter_price) !== Number(exporter_price)) changes.push(`Exporter Price ₹${existing.exporter_price} → ₹${exporter_price}`);
    if (Number(existing.farmer_price) !== Number(farmer_price)) changes.push(`Farmer Price ₹${existing.farmer_price} → ₹${farmer_price}`);
    if (Number(existing.tonnage_kg) !== Number(tonnage_kg)) changes.push(`Tonnage ${existing.tonnage_kg}KG → ${tonnage_kg}KG`);
    if (Number(existing.commission_amount) !== Number(commission_amount)) changes.push(`Commission ₹${existing.commission_amount} → ₹${commission_amount}`);
    if (changes.length) {
      await logAudit(client, req.params.id, 'Transaction Updated', null, changes.join('; '), user);
    }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Could not update transaction.' });
  } finally {
    client.release();
  }
});

// -------------------------------------------------------------- DELETE -----
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE transactions SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1 AND is_deleted = FALSE RETURNING id, transaction_number`,
      [req.params.id]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found.' });
    }
    await logAudit(client, rows[0].id, 'Transaction Soft-Deleted', null, null, req.user?.username || 'system');
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Could not delete transaction.' });
  } finally {
    client.release();
  }
});

// ------------------------------------------------------- RECORD PAYMENT ----
router.post('/:id/payments', async (req, res) => {
  const client = await pool.connect();
  try {
    const { payment_type, amount, payment_date, payment_reference, notes } = req.body;
    if (!['EXPORTER', 'FARMER'].includes(payment_type)) {
      return res.status(400).json({ error: 'payment_type must be EXPORTER or FARMER.' });
    }
    if (!(Number(amount) > 0)) {
      return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
    }

    await client.query('BEGIN');
    const txRes = await client.query('SELECT * FROM transactions WHERE id = $1 AND is_deleted = FALSE FOR UPDATE', [req.params.id]);
    const tx = txRes.rows[0];
    if (!tx) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const user = req.user?.username || 'system';
    const isExporter = payment_type === 'EXPORTER';
    const totalAmount = isExporter ? Number(tx.sales_amount) : Number(tx.purchase_amount);
    const currentPaid = isExporter ? Number(tx.exporter_paid_amount) : Number(tx.farmer_paid_amount);
    const newPaid = round2(currentPaid + Number(amount));

    if (newPaid > totalAmount + 0.01) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Paid amount cannot exceed the ${isExporter ? 'exporter invoice' : 'farmer purchase'} amount of ₹${totalAmount}.` });
    }

    const newBalance = calcBalance(totalAmount, newPaid);
    const newStatus = calcPaymentStatus(newPaid, totalAmount);

    await client.query(
      `INSERT INTO payments (transaction_id, payment_type, amount, payment_date, payment_reference, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [tx.id, payment_type, amount, payment_date || new Date().toISOString().slice(0, 10), payment_reference || null, notes || null, user]
    );

    let updateQuery, updateParams, otherStatus;
    if (isExporter) {
      otherStatus = tx.farmer_payment_status;
      updateQuery = `UPDATE transactions SET exporter_paid_amount=$1, exporter_balance=$2, exporter_payment_status=$3,
                       exporter_payment_date=$4, exporter_payment_ref=$5, bill_status=$6, updated_by=$7, updated_at=NOW()
                     WHERE id=$8 RETURNING *`;
    } else {
      otherStatus = tx.exporter_payment_status;
      updateQuery = `UPDATE transactions SET farmer_paid_amount=$1, farmer_balance=$2, farmer_payment_status=$3,
                       farmer_payment_date=$4, farmer_payment_ref=$5, bill_status=$6, updated_by=$7, updated_at=NOW()
                     WHERE id=$8 RETURNING *`;
    }
    const billStatus = isExporter ? calcBillStatus(newStatus, otherStatus) : calcBillStatus(otherStatus, newStatus);
    updateParams = [newPaid, newBalance, newStatus, payment_date || new Date().toISOString().slice(0, 10), payment_reference || null, billStatus, user, tx.id];

    const { rows } = await client.query(updateQuery, updateParams);

    await logAudit(
      client, tx.id,
      `${isExporter ? 'Exporter' : 'Farmer'} Payment Recorded`,
      `Paid: ₹${currentPaid}`,
      `Paid: ₹${newPaid} (+₹${amount}), Status: ${newStatus}`,
      user
    );
    if (billStatus !== tx.bill_status) {
      await logAudit(client, tx.id, 'Bill Status Changed', tx.bill_status, billStatus, user);
    }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Could not record payment.' });
  } finally {
    client.release();
  }
});

module.exports = router;
