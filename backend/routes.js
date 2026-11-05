const express = require('express');
const pool = require('./db');
const { cleanPlate, cleanPhone, isValidPlate, isValidPhone } = require('./helpers');

const router = express.Router();
const WASHES_FOR_FREE = 5;

// ---------- Employees ----------
router.get('/employees', async (req, res) => {
  const r = await pool.query(
    'SELECT id, name FROM employees WHERE is_active = TRUE ORDER BY name'
  );
  res.json(r.rows);
});

router.post('/employees', async (req, res) => {
  const name = String((req.body && req.body.name) || '').trim();  if (!name) return res.status(400).json({ error: 'Name is required' });
  const r = await pool.query(
    'INSERT INTO employees (name) VALUES ($1) RETURNING id, name', [name]
  );
  res.status(201).json(r.rows[0]);
});

// ---------- Helpers ----------
function normalise(kind, value) {
  if (kind === 'plate') {
    const id = cleanPlate(value);
    return isValidPlate(id) ? id : null;
  }
  if (kind === 'phone') {
    const id = cleanPhone(value);
    return isValidPhone(id) ? id : null;
  }
  return null;
}

async function getStatus(client, identifier) {
  const v = await client.query(
    'SELECT id, identifier, identifier_kind, created_at FROM vehicles WHERE identifier = $1',
    [identifier]
  );
  if (v.rows.length === 0) {
    return { isNew: true, count: 0, isFree: false, remaining: WASHES_FOR_FREE, totalVisits: 0 };
  }
  const vehicle = v.rows[0];
  const c = await client.query(
    `SELECT COUNT(*)::int AS count FROM washes
     WHERE vehicle_id = $1 AND is_free = FALSE
     AND washed_at > COALESCE(
       (SELECT MAX(washed_at) FROM washes WHERE vehicle_id = $1 AND is_free = TRUE),
       '-infinity')`,
    [vehicle.id]
  );
  const t = await client.query(
    'SELECT COUNT(*)::int AS total FROM washes WHERE vehicle_id = $1', [vehicle.id]
  );
  const count = c.rows[0].count;
  const isFree = count >= WASHES_FOR_FREE;
  return {
    isNew: false, vehicleId: vehicle.id, identifier: vehicle.identifier,
    firstSeen: vehicle.created_at, count, isFree,
    remaining: isFree ? 0 : WASHES_FOR_FREE - count,
    totalVisits: t.rows[0].total,
  };
}

// ---------- Lookup (before confirming) ----------
router.post('/lookup', async (req, res) => {
  const { kind, value } = req.body;
  const identifier = normalise(kind, value);
  if (!identifier) return res.status(400).json({ error: `Invalid ${kind}` });
  const status = await getStatus(pool, identifier);
  res.json({ identifier, kind, ...status });
});

// ---------- Record wash ----------
router.post('/washes', async (req, res) => {
  const { kind, value, vehicleTypeId, employeeId } = req.body;
  const identifier = normalise(kind, value);
  if (!identifier) return res.status(400).json({ error: `Invalid ${kind}` });
  if (!vehicleTypeId || !employeeId)
    return res.status(400).json({ error: 'Vehicle type and employee are required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create the vehicle if new (safe if two requests arrive together)
    await client.query(
      `INSERT INTO vehicles (identifier, identifier_kind, vehicle_type_id)
       VALUES ($1, $2, $3) ON CONFLICT (identifier) DO NOTHING`,
      [identifier, kind, vehicleTypeId]
    );
    const v = await client.query(
      'SELECT id FROM vehicles WHERE identifier = $1 FOR UPDATE', [identifier]
    );
    const status = await getStatus(client, identifier);

    await client.query(
      `INSERT INTO washes (vehicle_id, vehicle_type_id, employee_id, is_free)
       VALUES ($1, $2, $3, $4)`,
      [v.rows[0].id, vehicleTypeId, employeeId, status.isFree]
    );
    await client.query('COMMIT');

    res.status(201).json({
      message: status.isFree ? 'Free wash recorded' : 'Wash recorded',
      wasFree: status.isFree,
      newCount: status.isFree ? 0 : status.count + 1,
      remaining: status.isFree ? WASHES_FOR_FREE
                              : Math.max(WASHES_FOR_FREE - status.count - 1, 0),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Could not record wash' });
  } finally {
    client.release();
  }
});

module.exports = router;