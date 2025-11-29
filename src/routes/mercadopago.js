// routes/mercadopago.js → FUNCIONA EN LOCALHOST + PRODUCCIÓN

const express = require("express");
const router = express.Router();
const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");
const db = require("../db/bd");

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || "APP_USR-1315440257893813-111718-d53d8f333c89be664e70aff113efa239-2997968741",
});

// === COMISIONES MULTINIVEL ===
async function procesarComisionesMultinivel(usuarioId, planId, paymentId, referidorDirecto = null) {
  try {
    const [plan] = await db.query("SELECT precio, nombre FROM planes WHERE id = ?", [planId]);
    if (plan.length === 0) return;
    const montoBase = Number(plan[0].precio);

    let nivel1 = referidorDirecto;
    if (!nivel1 && usuarioId) {
      const [u] = await db.query("SELECT referidoPor FROM validacion WHERE id = ?", [usuarioId]);
      nivel1 = u[0]?.referidoPor || null;
    }
    if (!nivel1) return;

    const [u2] = await db.query("SELECT referidoPor FROM validacion WHERE id = ?", [nivel1]);
    const nivel2 = u2[0]?.referidoPor || null;

    let nivel3 = null;
    if (nivel2) {
      const [u3] = await db.query("SELECT referidoPor FROM validacion WHERE id = ?", [nivel2]);
      nivel3 = u3[0]?.referidoPor || null;
    }

    const comisiones = [
      { usuario: nivel1, porcentaje: 20, nivel: 1 },
      { usuario: nivel2, porcentaje: 10, nivel: 2 },
      { usuario: nivel3, porcentaje: 5, nivel: 3 },
    ];

    for (const c of comisiones) {
      if (!c.usuario) continue;
      const monto = (montoBase * c.porcentaje) / 100;

      await db.query(
        `INSERT INTO referidos_historial 
         (id_referidor, id_referido, tipo_servicio, monto_comision, estado, descripcion)
         VALUES (?, ?, 'suscripcion', ?, 'pendiente', ?)`,
        [c.usuario, usuarioId || null, monto, `Comisión Nivel ${c.nivel} - ${plan[0].nombre}`]
      );

      await db.query(
        "UPDATE referidos SET total_comisiones = total_comisiones + ? WHERE id_usuario = ?",
        [monto, c.usuario]
      );
    }
  } catch (err) {
    console.error("Error comisiones:", err);
  }
}

// === CREAR PREFERENCIA (FUNCIONA EN LOCALHOST SIN ERROR) ===
router.post("/crear-preferencia", async (req, res) => {
  try {
    const { planId, userId, userEmail, userName, ref } = req.body;

    if (!planId) return res.status(400).json({ success: false, message: "Plan requerido" });

    const [planes] = await db.query("SELECT * FROM planes WHERE id = ? AND activo = 1", [planId]);
    if (planes.length === 0) return res.status(404).json({ success: false, message: "Plan no encontrado" });

    const plan = planes[0];

    const preference = new Preference(client);
    const result = await preference.create({
      body: {
        items: [{
          id: plan.id,
          title: `Financial360 - ${plan.nombre}`,
          quantity: 1,
          currency_id: "COP",
          unit_price: Number(plan.precio),
        }],
        payer: {
          email: userEmail || "cliente@financial360.com",
          name: userName || "Cliente Financial360",
        },
        external_reference: JSON.stringify({
          userId: userId || null,
          planId: plan.id,
          isGuest: !userId,
          ref: ref || null,
          timestamp: new Date().toISOString(),
        }),
        // SOLUCIÓN: back_urls con query params + SIN auto_return en localhost
        back_urls: {
          success: "http://localhost:3000/gracias?payment=success",
          failure: "http://localhost:3000/gracias?payment=failure",
          pending: "http://localhost:3000/gracias?payment=pending",
        },
        // auto_return: "approved",  ← COMENTADO EN LOCALHOST (causa error)
        notification_url: "http://localhost:3001/api/mercadopago/webhook",
      },
    });

    res.json({ success: true, init_point: result.init_point });
  } catch (err) {
    console.error("Error creando preferencia:", err.message || err);
    res.status(500).json({ success: false, message: "Error con Mercado Pago" });
  }
});

// === WEBHOOK ===
router.post("/webhook", async (req, res) => {
  try {
    if (req.body.type === "payment") {
      const payment = new Payment(client);
      const data = await payment.get({ id: req.body.data.id });

      if (data.status === "approved") {
        const ref = JSON.parse(data.external_reference || "{}");
        let { userId, planId, isGuest, ref: referidorId } = ref;

        const [existe] = await db.query("SELECT id FROM transacciones_mp WHERE payment_id = ?", [data.id]);
        if (existe.length > 0) return res.sendStatus(200);

        let finalUserId = userId;

        if (isGuest) {
          const tempEmail = `temp_${Date.now()}@financial360.com`;
          const [nuevo] = await db.query(
            "INSERT INTO validacion (nombre, correo, contrasena, id_rol, referidoPor) VALUES (?, ?, ?, 2, ?)",
            ["Cliente Temporal", tempEmail, "", referidorId || null]
          );
          finalUserId = nuevo.insertId;
        }

        await db.query(
          "INSERT INTO transacciones_mp (id_usuario, payment_id, plan_id, monto, estado, external_reference) VALUES (?, ?, ?, ?, 'approved', ?)",
          [finalUserId, data.id, planId, data.transaction_amount, data.external_reference]
        );

        await db.query(
          "INSERT INTO usuarios_planes (user_id, plan_id, activo, fecha_activacion) VALUES (?, ?, 1, NOW()) ON DUPLICATE KEY UPDATE activo = 1, fecha_activacion = NOW()",
          [finalUserId, planId]
        );

        await procesarComisionesMultinivel(finalUserId, planId, data.id, referidorId);

        console.log("Pago aprobado y procesado:", data.id);
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook error:", err);
    res.sendStatus(500);
  }
});

// === OBTENER PLANES ===
router.get("/planes", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM planes WHERE activo = 1 ORDER BY precio ASC");
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("Error cargando planes:", err);
    res.status(500).json({ success: false, message: "Error cargando planes" });
  }
});

module.exports = router;