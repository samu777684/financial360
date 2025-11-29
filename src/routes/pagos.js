const express = require("express");
const mercadopago = require("mercadopago");
const db = require("./db"); // Tu conexión a BD

const router = express.Router();

// Configurar Mercado Pago
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN || "TEST-XXXXXXXXXXXXXXXXXXXXXXXXXXXX",
});

// ✅ Obtener planes activos
router.get("/planes", (req, res) => {
  const query = "SELECT * FROM tipos_plan WHERE activo = 1 ORDER BY precio ASC";
  
  db.query(query, (err, results) => {
    if (err) {
      console.error("❌ Error obteniendo planes:", err);
      return res.status(500).json({ 
        success: false, 
        error: "Error obteniendo planes" 
      });
    }
    
    res.json({
      success: true,
      planes: results
    });
  });
});

// ✅ Crear preferencia de pago MEJORADA
router.post("/crear-preferencia", async (req, res) => {
  try {
    const { planId, userId, userEmail, referidoCode } = req.body;

    console.log('🔄 Creando preferencia para:', { planId, userId, userEmail, referidoCode });

    // Validar datos requeridos
    if (!planId || !userId || !userEmail) {
      return res.status(400).json({ 
        success: false,
        error: "Datos incompletos: planId, userId y userEmail son requeridos" 
      });
    }

    // Obtener información del plan desde la BD
    const planQuery = "SELECT * FROM tipos_plan WHERE id = ? AND activo = 1";
    
    db.query(planQuery, [planId], async (err, planResults) => {
      if (err) {
        console.error("❌ Error en consulta de plan:", err);
        return res.status(500).json({ 
          success: false,
          error: "Error interno del servidor" 
        });
      }

      if (planResults.length === 0) {
        return res.status(400).json({ 
          success: false,
          error: "Plan no encontrado o inactivo" 
        });
      }

      const plan = planResults[0];
      const externalReference = `user_${userId}_plan_${planId}_${Date.now()}`;

      // Configurar metadata
      const metadata = {
        plan_id: planId,
        user_id: userId,
        user_email: userEmail,
        referido_code: referidoCode || null,
        tipo_servicio: "membresia",
        comision_porcentaje: plan.comision_referido || 20 // Default 20% si no existe
      };

      const preference = {
        items: [
          {
            id: plan.id.toString(),
            title: plan.nombre,
            unit_price: parseFloat(plan.precio),
            quantity: 1,
            currency_id: plan.moneda || 'COP',
            description: plan.descripcion || `Plan ${plan.nombre} - Financial 360`,
            picture_url: "https://financial360.com/logo.png"
          },
        ],
        payer: {
          email: userEmail,
        },
        back_urls: {
          success: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pago-exitoso`,
          failure: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pago-fallido`, 
          pending: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/pago-pendiente`,
        },
        auto_return: "approved",
        notification_url: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/mercadopago/webhook`,
        metadata: metadata,
        external_reference: externalReference,
      };

      try {
        const respuesta = await mercadopago.preferences.create(preference);
        
        console.log('✅ Preferencia creada:', respuesta.body.id);
        
        // Registrar transacción en BD
        const transaccionQuery = `
          INSERT INTO transacciones_mp 
          (id_usuario, preference_id, plan_id, monto, estado, external_reference, metadata) 
          VALUES (?, ?, ?, ?, 'pending', ?, ?)
        `;
        
        db.query(transaccionQuery, [
          userId,
          respuesta.body.id,
          planId,
          plan.precio,
          externalReference,
          JSON.stringify(metadata)
        ], (dbErr) => {
          if (dbErr) {
            console.error("❌ Error guardando transacción:", dbErr);
            // No retornamos error aquí para no interrumpir el flujo de pago
          }
        });

        res.json({ 
          success: true,
          id: respuesta.body.id,
          init_point: respuesta.body.init_point,
          sandbox_init_point: respuesta.body.sandbox_init_point,
          external_reference: externalReference
        });
      } catch (mpError) {
        console.error("❌ Error Mercado Pago:", mpError);
        res.status(500).json({ 
          success: false,
          error: mpError.message || "Error procesando pago con Mercado Pago" 
        });
      }
    });

  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    res.status(500).json({ 
      success: false,
      error: "Error interno del servidor" 
    });
  }
});

// ✅ Webhook mejorado
router.post("/webhook", async (req, res) => {
  try {
    const { type, data } = req.body;
    
    console.log('📩 Webhook recibido:', type);

    if (type === "payment") {
      const paymentId = data.id;
      
      const payment = await mercadopago.payment.findById(paymentId);
      const paymentData = payment.body;
      
      console.log('💰 Estado del pago:', paymentData.status, 'ID:', paymentId);

      if (paymentData.status === 'approved') {
        await procesarPagoExitoso(paymentData);
      } else if (paymentData.status === 'rejected') {
        await actualizarEstadoTransaccion(paymentData, 'rejected');
      } else if (paymentData.status === 'in_process') {
        await actualizarEstadoTransaccion(paymentData, 'pending');
      }
      
      res.status(200).send("OK");
    } else {
      console.log('ℹ️ Evento no manejado:', type);
      res.status(200).send("OK - Evento no manejado");
    }
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.status(500).send("Error");
  }
});

// ✅ Actualizar estado de transacción
async function actualizarEstadoTransaccion(paymentData, estado) {
  return new Promise((resolve) => {
    const updateQuery = `
      UPDATE transacciones_mp 
      SET 
        payment_id = ?,
        estado = ?,
        datos_pago = ?,
        fecha_actualizacion = CURRENT_TIMESTAMP
      WHERE external_reference = ?
    `;
    
    db.query(updateQuery, [
      paymentData.id,
      estado,
      JSON.stringify({
        status: paymentData.status,
        status_detail: paymentData.status_detail,
        payment_method: paymentData.payment_method_id,
        date_approved: paymentData.date_approved
      }),
      paymentData.external_reference
    ], (err) => {
      if (err) {
        console.error('❌ Error actualizando transacción:', err);
      } else {
        console.log(`✅ Transacción actualizada a: ${estado}`);
      }
      resolve();
    });
  });
}

// ✅ Procesar pago exitoso MEJORADO
async function procesarPagoExitoso(paymentData) {
  try {
    const metadata = paymentData.metadata || {};
    const { plan_id, user_id, user_email, referido_code, comision_porcentaje } = metadata;
    
    console.log('🔄 Procesando pago exitoso para usuario:', user_id);

    // 1. Actualizar transacción
    await actualizarEstadoTransaccion(paymentData, 'approved');

    // 2. Activar/renovar plan del usuario
    await activarPlanUsuario(user_id, plan_id, paymentData);

    // 3. Procesar comisión por referido si existe
    if (referido_code) {
      await procesarComisionReferido(
        referido_code, 
        user_id, 
        user_email, 
        plan_id, 
        paymentData.transaction_amount,
        comision_porcentaje || 20
      );
    }

    console.log('✅ Pago procesado correctamente para usuario:', user_id);
    
  } catch (error) {
    console.error('❌ Error procesando pago exitoso:', error);
  }
}

// ✅ Activar plan del usuario
async function activarPlanUsuario(userId, planId, paymentData) {
  return new Promise((resolve, reject) => {
    // Primero desactivar planes anteriores
    const deactivateQuery = `
      UPDATE usuarios_planes 
      SET activo = 0 
      WHERE user_id = ?
    `;
    
    db.query(deactivateQuery, [userId], (deactivateErr) => {
      if (deactivateErr) {
        console.error('❌ Error desactivando planes anteriores:', deactivateErr);
      }

      // Insertar nuevo plan activo
      const activateQuery = `
        INSERT INTO usuarios_planes 
        (user_id, plan_id, activo, fecha_activacion, fecha_expiracion, monto_pagado, metodo_pago) 
        VALUES (?, ?, 1, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), ?, ?)
      `;
      
      db.query(activateQuery, [
        userId,
        planId,
        paymentData.transaction_amount,
        paymentData.payment_method_id
      ], (activateErr, results) => {
        if (activateErr) {
          console.error('❌ Error activando plan:', activateErr);
          reject(activateErr);
        } else {
          console.log('✅ Plan activado para usuario:', userId);
          resolve(results);
        }
      });
    });
  });
}

// ✅ Procesar comisión por referido MEJORADO
async function procesarComisionReferido(codigoReferido, idNuevoUsuario, emailNuevoUsuario, planId, montoTotal, porcentajeComision) {
  return new Promise((resolve, reject) => {
    console.log('🔄 Procesando comisión por referido:', codigoReferido);

    // Buscar el referidor por código
    const findReferrerQuery = `
      SELECT r.id, r.id_usuario 
      FROM referidos r 
      WHERE r.codigo_referido = ?
    `;
    
    db.query(findReferrerQuery, [codigoReferido], (findErr, findResults) => {
      if (findErr) {
        console.error("❌ Error buscando referidor:", findErr);
        reject(findErr);
        return;
      }

      if (findResults.length === 0) {
        console.log("❌ Referidor no encontrado:", codigoReferido);
        resolve(false);
        return;
      }

      const idReferidor = findResults[0].id_usuario;
      const idReferidoRow = findResults[0].id;
      
      // Verificar si el referidor tiene perfil completo
      const checkPerfilQuery = `SELECT id FROM perfil_usuario WHERE id_usuario = ?`;
      
      db.query(checkPerfilQuery, [idReferidor], (perfilErr, perfilResults) => {
        if (perfilErr) {
          console.error("❌ Error verificando perfil:", perfilErr);
          reject(perfilErr);
          return;
        }

        if (perfilResults.length === 0) {
          console.log("❌ Referidor sin perfil completo:", idReferidor);
          resolve(false);
          return;
        }

        console.log('✅ Referidor válido encontrado:', idReferidor);

        // Calcular comisión
        const montoComision = montoTotal * (porcentajeComision / 100);

        // Registrar en el historial
        const insertQuery = `
          INSERT INTO referidos_historial 
          (id_referidor, id_referido, referido_email, tipo_servicio, monto_comision, estado, descripcion, currency) 
          VALUES (?, ?, ?, ?, ?, 'pendiente', ?, 'COP')
        `;

        const descripcion = `Comisión del ${porcentajeComision}% por nueva membresía ${planId}`;

        db.query(insertQuery, [
          idReferidor, 
          idNuevoUsuario, 
          emailNuevoUsuario,
          planId,
          montoComision,
          descripcion
        ], (insertErr, insertResults) => {
          if (insertErr) {
            console.error("❌ Error al registrar comisión:", insertErr);
            reject(insertErr);
            return;
          }

          // Actualizar tabla referidos
          const updateQuery = `
            UPDATE referidos 
            SET 
              total_comisiones = COALESCE(total_comisiones, 0) + ?,
              referidos_activos = COALESCE(referidos_activos, 0) + 1,
              ultima_actualizacion = CURRENT_TIMESTAMP
            WHERE id = ?
          `;

          db.query(updateQuery, [montoComision, idReferidoRow], (updateErr) => {
            if (updateErr) {
              console.error("❌ Error actualizando referidos:", updateErr);
              reject(updateErr);
            } else {
              console.log(`✅ Comisión registrada: $${montoComision} COP para referidor: ${idReferidor}`);
              resolve(true);
            }
          });
        });
      });
    });
  });
}

// ✅ Verificar estado de pago
router.get("/verificar-pago/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    const payment = await mercadopago.payment.findById(paymentId);
    const paymentData = payment.body;
    
    res.json({
      success: true,
      status: paymentData.status,
      status_detail: paymentData.status_detail,
      transaction_amount: paymentData.transaction_amount,
      date_approved: paymentData.date_approved,
      metadata: paymentData.metadata
    });
  } catch (error) {
    console.error("❌ Error verificando pago:", error);
    res.status(500).json({ 
      success: false,
      error: "Error verificando pago" 
    });
  }
});

// ✅ Verificar estado de membresía del usuario
router.get("/membresia/:userId", (req, res) => {
  const { userId } = req.params;

  const query = `
    SELECT up.*, tp.nombre as plan_nombre, tp.precio as plan_precio
    FROM usuarios_planes up
    INNER JOIN tipos_plan tp ON up.plan_id = tp.id
    WHERE up.user_id = ? AND up.activo = 1
    ORDER BY up.fecha_activacion DESC
    LIMIT 1
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('❌ Error obteniendo membresía:', err);
      return res.status(500).json({ 
        success: false,
        error: "Error obteniendo membresía" 
      });
    }

    const tieneMembresia = results.length > 0;
    const membresia = tieneMembresia ? results[0] : null;
    
    if (tieneMembresia && new Date(membresia.fecha_expiracion) < new Date()) {
      // Membresía expirada
      const updateQuery = "UPDATE usuarios_planes SET activo = 0 WHERE id = ?";
      db.query(updateQuery, [membresia.id]);
      res.json({ success: true, activa: false, expirada: true });
    } else {
      res.json({ 
        success: true, 
        activa: tieneMembresia,
        membresia: membresia
      });
    }
  });
});

module.exports = router;