const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const express = require('express');
const cors = require('cors');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Copy .env.example to .env and set it before starting.');
  process.exit(1);
}

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'finmate-backend' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/profile', require('./routes/users'));
app.use('/api/goals', require('./routes/goals'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/budget', require('./routes/budget'));
app.use('/api/budgets', require('./routes/budget'));
app.use('/api/insights', require('./routes/insights'));
app.use('/api/coach', require('./routes/coach'));
app.use('/api/ai', require('./routes/coach'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/v1', require('./routes/v1'));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(port, () => console.log(`FinMate backend listening on http://localhost:${port}`));
}

module.exports = app;
