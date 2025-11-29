const express = require('express');
const router = express.Router();
const db = require('../db/bd');

router.post('/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body;

    if (type === 'payment') {
      const paymentId = data.id;

      // Aquí deberías obtener los detalles del pago de MercadoPago
      // Por simplicidad, asumimos que recibimos los datos necesarios
      const { external_reference, status } = req.body;

      if (external_reference) {
        // Actualizar estado de la transacción
        await db.query(
          `UPDATE transacciones_mp 
           SET estado = ?, payment_id = ?, fecha_actualizacion = NOW() 
           WHERE external_reference = ?`,
          [status, paymentId, external_reference]
        );

        // Si el pago fue aprobado, activar el plan del usuario
        if (status === 'approved') {
          const [transacciones] = await db.query(
            `SELECT * FROM transacciones_mp WHERE external_reference = ?`,
            [external_reference]
          );

          if (transacciones.length > 0) {
            const transaccion = transacciones[0];
            
            // Activar plan del usuario
            const fechaExpiracion = new Date();
            fechaExpiracion.setDate(fechaExpiracion.getDate() + 30); // 30 días

            await db.query(
              `INSERT INTO usuarios_planes 
               (user_id, plan_id, activo, fecha_activacion, fecha_expiracion) 
               VALUES (?, ?, 1, NOW(), ?) 
               ON DUPLICATE KEY UPDATE 
               activo = 1, fecha_activacion = NOW(), fecha_expiracion = ?`,
              [
                transaccion.id_usuario,
                transaccion.plan_id,
                fechaExpiracion,
                fechaExpiracion
              ]
            );
          }
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error en webhook:', error);
    res.status(500).send('Error');
  }
});

module.exports = router;