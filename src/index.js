try {
  require('dotenv').config();
} catch (e) {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k && v.length > 0) process.env[k.trim()] = v.join('=').trim();
    });
  }
}
const express = require('express');
const cors = require('cors');
const { getDb } = require('./db/db');
const { seedNova } = require('./db/seed');
const createBudgetRouter = require('./routes/budgetRoutes');
const createTransactionRouter = require('./routes/transactionRoutes');
const createTelemetryRouter = require('./routes/telemetryRoutes');
const createActionRouter = require('./routes/actionRoutes');

const app = express();
const PORT = process.env.NOVA_PORT || 4001;

app.use(cors());
app.use(express.json());

const db = getDb();
try {
  seedNova('user_demo_nova', db);
} catch (err) {
  console.log('[Nova V4] Seed notice:', err.message);
}

app.use('/api/budget', createBudgetRouter(getDb));
app.use('/api/transactions', createTransactionRouter(getDb));
app.use('/api/nova/telemetry', createTelemetryRouter(getDb));
app.use('/api/actions', createActionRouter(getDb));

app.get('/health', (_req, res) => {
  res.json({
    status: 'online',
    agent: 'Nova',
    version: '4.0.0',
    specification: 'Nova: Agent Specification (V4)',
    title: 'Active Real-Time Sub-Agent (Budget Tracker and Category Guardian)',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime())
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🛡️  NOVA V4 — Real-Time Budget Guardian Server Online`);
    console.log(`🚀 Running at: http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🎯 Budget API:   http://localhost:${PORT}/api/budget`);
    console.log(`💳 Expense API:  http://localhost:${PORT}/api/transactions`);
    console.log(`⚡ Action Svc:   http://localhost:${PORT}/api/actions`);
    console.log(`📡 Telemetry:    http://localhost:${PORT}/api/nova/telemetry`);
    console.log(`====================================================`);
  });
}

module.exports = app;
