const pool = require('./db');

pool.query('SELECT * FROM vehicle_types')
  .then(res => {
    console.log('Connected! Vehicle types:');
    console.table(res.rows);
    pool.end();
  })
  .catch(err => {
    console.error('Connection failed:', err.message);
    pool.end();
  });