// db/promises.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '', // ← pon tu contraseña de MySQL aquí si tienes
  database: 'financial360', // ← cambia si tu DB tiene otro nombre
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Función helper para que todo siga funcionando con "query"
const query = async (sql, params) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};

module.exports = { query };