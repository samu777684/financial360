// db/bd.js  ← REEMPLAZA TODO EL ARCHIVO CON ESTO
const mysql = require('mysql2');

const connection = mysql.createPool({
  host: 'localhost',
  user: 'root',           // ← cambia si usas otro usuario
  password: '',           // ← pon tu contraseña de MySQL aquí
  database: 'financial360', // ← nombre exacto de tu base de datos
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Esto es CRUCIAL para que las promises funcionen
const pool = connection.promise();

console.log("Conectado a la base de datos MySQL con promises");

// Exportamos el pool con promise()
module.exports = pool;