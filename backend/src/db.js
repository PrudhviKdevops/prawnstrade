const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const useSSL = String(process.env.PGSSL).toLowerCase() === 'true';

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: useSSL ? { rejectUnauthorized: false } : false,
    })
  : new Pool({
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT) || 5432,
      database: process.env.PGDATABASE || 'prawn_trade',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      ssl: useSSL ? { rejectUnauthorized: false } : false,
    });

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error on idle client', err);
});

/**
 * Creates every table the application needs, only if it does not already
 * exist. Safe to run every time the server starts.
 */
async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id              SERIAL PRIMARY KEY,
        username        VARCHAR(100) UNIQUE NOT NULL,
        password_hash   VARCHAR(255) NOT NULL,
        role            VARCHAR(50)  NOT NULL DEFAULT 'ADMIN',
        status          VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS farmers (
        id             SERIAL PRIMARY KEY,
        farmer_code    VARCHAR(50) UNIQUE,
        farmer_name    VARCHAR(200) NOT NULL,
        mobile         VARCHAR(20),
        village        VARCHAR(150),
        mandal         VARCHAR(150),
        district       VARCHAR(150),
        address        TEXT,
        bank_details   TEXT,
        pan            VARCHAR(20),
        notes          TEXT,
        is_deleted     BOOLEAN NOT NULL DEFAULT FALSE,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS exporters (
        id               SERIAL PRIMARY KEY,
        exporter_code    VARCHAR(50) UNIQUE,
        company_name     VARCHAR(200) NOT NULL,
        contact_person   VARCHAR(150),
        mobile           VARCHAR(20),
        email            VARCHAR(150),
        address          TEXT,
        gst_number       VARCHAR(50),
        payment_terms    VARCHAR(150),
        bank_details     TEXT,
        notes            TEXT,
        is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`CREATE SEQUENCE IF NOT EXISTS transaction_seq START 1;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id                        SERIAL PRIMARY KEY,
        transaction_number        VARCHAR(50) UNIQUE NOT NULL,
        transaction_date          DATE NOT NULL,

        farmer_id                 INTEGER REFERENCES farmers(id),
        farmer_name_snapshot      VARCHAR(200) NOT NULL,
        count_value               NUMERIC(10,2) NOT NULL CHECK (count_value > 0),
        tonnage_kg                NUMERIC(14,3) NOT NULL CHECK (tonnage_kg > 0),
        farmer_price              NUMERIC(14,2) NOT NULL CHECK (farmer_price >= 0),
        purchase_amount           NUMERIC(16,2) NOT NULL DEFAULT 0,

        exporter_id               INTEGER REFERENCES exporters(id),
        exporter_name_snapshot    VARCHAR(200) NOT NULL,
        exporter_price            NUMERIC(14,2) NOT NULL CHECK (exporter_price >= 0),
        sales_amount              NUMERIC(16,2) NOT NULL DEFAULT 0,

        commission_amount         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),

        exporter_paid_amount      NUMERIC(16,2) NOT NULL DEFAULT 0,
        exporter_balance          NUMERIC(16,2) NOT NULL DEFAULT 0,
        exporter_payment_status   VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        exporter_payment_date     DATE,
        exporter_payment_ref      VARCHAR(150),

        farmer_paid_amount        NUMERIC(16,2) NOT NULL DEFAULT 0,
        farmer_balance            NUMERIC(16,2) NOT NULL DEFAULT 0,
        farmer_payment_status     VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        farmer_payment_date       DATE,
        farmer_payment_ref        VARCHAR(150),

        bill_status               VARCHAR(30) NOT NULL DEFAULT 'OPEN',

        notes                     TEXT,
        is_deleted                BOOLEAN NOT NULL DEFAULT FALSE,

        created_by                VARCHAR(100),
        updated_by                VARCHAR(100),
        created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_farmer ON transactions(farmer_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_exporter ON transactions(exporter_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_transactions_bill_status ON transactions(bill_status);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id                  SERIAL PRIMARY KEY,
        transaction_id      INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        payment_type        VARCHAR(20) NOT NULL CHECK (payment_type IN ('EXPORTER','FARMER')),
        amount              NUMERIC(16,2) NOT NULL CHECK (amount > 0),
        payment_date        DATE NOT NULL DEFAULT CURRENT_DATE,
        payment_reference   VARCHAR(150),
        notes               TEXT,
        created_by          VARCHAR(100),
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id               SERIAL PRIMARY KEY,
        transaction_id   INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
        action           VARCHAR(150) NOT NULL,
        old_value        TEXT,
        new_value        TEXT,
        created_by       VARCHAR(100),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_transaction ON audit_logs(transaction_id);`);

    // Seed a default admin user only if the users table is completely empty.
    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM users');
    if (rows[0].count === 0) {
      const username = process.env.ADMIN_USERNAME || 'admin';
      const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
      const hash = await bcrypt.hash(password, 10);
      await client.query(
        `INSERT INTO users (username, password_hash, role, status) VALUES ($1, $2, 'ADMIN', 'ACTIVE')`,
        [username, hash]
      );
      console.log(`\nA default admin user was created:\n  username: ${username}\n  password: ${password}\nPlease log in and consider rotating credentials.\n`);
    }

    await client.query('COMMIT');
    console.log('Database schema is ready.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to initialize database schema:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initSchema };
