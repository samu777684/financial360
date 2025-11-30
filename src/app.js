const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Bienvenido a Financial360 Backend 🚀');
});

const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const usuarioRoutes = require('./routes/usuario');
app.use('/api/usuario', usuarioRoutes);

const referidosRoutes = require('./routes/referidos');
app.use('/api/referidos', referidosRoutes);

const mercadopagoRoutes = require('./routes/mercadopago');  // ← Falta esta línea
app.use('/api', mercadopagoRoutes);  // ← Usa una variable que no existe aún

// RUTAS ADICIONALES AÑADIDAS:
const planesRoutes = require('./routes/planes');
app.use('/api/planes', planesRoutes);

const webhooksRoutes = require('./routes/webhooks');
app.use('/api/webhooks', webhooksRoutes);

module.exports = app;