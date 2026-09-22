require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const { initSchema } = require('./db');
const { authenticateToken } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const farmerRoutes = require('./routes/farmers');
const exporterRoutes = require('./routes/exporters');
const transactionRoutes = require('./routes/transactions');
const dashboardRoutes = require('./routes/dashboard');
const reportRoutes = require('./routes/reports');
const countRateRoutes = require('./routes/countRates');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

// Public
app.use('/api/auth', authRoutes);

// Protected API
app.use('/api/farmers', authenticateToken, farmerRoutes);
app.use('/api/exporters', authenticateToken, exporterRoutes);
app.use('/api/transactions', authenticateToken, transactionRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/reports', authenticateToken, reportRoutes);
app.use('/api/count-rates', authenticateToken, countRateRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Serve the frontend
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Fallback error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await initSchema();
    app.listen(PORT, () => {
      console.log(`\n🦐 Prawn Trade server running at http://localhost:${PORT}\n`);
    });
  } catch (err) {
    console.error('Server failed to start because the database schema could not be initialized.');
    process.exit(1);
  }
})();
