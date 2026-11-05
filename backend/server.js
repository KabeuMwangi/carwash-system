require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

app.get('/api/vehicle-types', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM vehicle_types ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Could not load vehicle types' });
  }
});

const routes = require('./routes');
app.use('/api', routes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});