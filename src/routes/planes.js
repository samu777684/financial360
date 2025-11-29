const express = require('express');
const router = express.Router();
const db = require('../db/bd');
const { MercadoPagoConfig, Preference } = require('mercadopago');

// CONFIG MERCADOPAGO
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
});

// =======================================================
// GET: LISTAR PLANES
// =======================================================
router.get('/', async (req, res) => {
  try {
    const [planes] = await db.query(`
      SELECT 
        id,
        nombre,
        precio,
        duracion_dias,
        descripcion,
        moneda,
        activo,
        comision_referido,
        caracteristicas
      FROM tipos_plan 
      WHERE activo = 1
      ORDER BY precio ASC
    `);

    const planesFormateados = planes.map((p) => ({
      ...p,
      caracteristicas: JSON.parse(p.caracteristicas || "[]")
    }));

    res.json({
      success: true,
      data: planesFormateados
    });

  } catch (error) {
    console.error("❌ Error obteniendo planes:", error);
    res.status(500).json({
      success: false,
      message: "Error cargando planes"
    });
  }
});

// =======================================================
// POST: CREAR PREFERENCIA DE PAGO
// =======================================================
router.post('/crear-preferencia', async (req, res) => {
  try {
    const { planId, userId, userEmail, userName } = req.body;

    if (!planId || !userId)
      return res.status(400).json({ success: false, message: "Faltan datos" });

    const [user] = await db.query("SELECT * FROM validacion WHERE id = ?", [userId]);
    if (user.length === 0)
      return res.status(404).json({ success: false, message: "Usuario no existe" });

    const [planes] = await db.query(
      "SELECT * FROM tipos_plan WHERE id = ? AND activo = 1",
      [planId]
    );
    if (planes.length === 0)
      return res.status(404).json({ success: false, message: "Plan no existe" });

    const plan = planes[0];
    const externalReference = `PAY-${userId}-${Date.now()}`;

    const preference = new Preference(client);

    const response = await preference.create({
      body: {
        items: [
          {
            title: plan.nombre,
            description: plan.descripcion,
            quantity: 1,
            currency_id: plan.moneda || "COP",
            unit_price: parseFloat(plan.precio),
          }
        ],
        payer: { email: userEmail, name: userName },
        external_reference: externalReference,
        back_urls: {
          success: `${process.env.FRONTEND_URL}/pago-exitoso`,
          failure: `${process.env.FRONTEND_URL}/pago-fallido`,
          pending: `${process.env.FRONTEND_URL}/pago-pendiente`,
        },
        auto_return: "approved",
        notification_url: `${process.env.BACKEND_URL}/api/webhooks/mercadopago`,
        metadata: { userId, planId }
      }
    });

    await db.query(
      `INSERT INTO transacciones_mp 
        (id_usuario, preference_id, plan_id, monto, estado, external_reference) 
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [userId, response.id, planId, plan.precio, externalReference]
    );

    res.json({
      success: true,
      init_point: response.init_point,
      preference_id: response.id
    });

  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    res.status(500).json({
      success: false,
      message: "Error creando preferencia"
    });
  }
});

module.exports = router;
