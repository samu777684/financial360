const express = require('express');
const router = express.Router();
const db = require('../db/bd');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// 🔹 Obtener estadísticas generales
router.get('/estadisticas', authenticateToken, requireAdmin, (req, res) => {
  const queries = {
    total_usuarios: "SELECT COUNT(*) as total FROM usuario WHERE activo = 1",
    servicios_activos: "SELECT COUNT(*) as total FROM servicio WHERE estado IN ('Pendiente', 'En proceso', 'En revisión')",
    comisiones_pendientes: "SELECT COALESCE(SUM(monto_comision), 0) as total FROM referidos_historial WHERE estado = 'pendiente'",
    ingresos_totales: "SELECT COALESCE(SUM(valor_total), 0) as total FROM servicio WHERE estado = 'Finalizado'",
    total_prospectos: "SELECT COUNT(*) as total FROM visita_comercial",
    prospectos_concretados: "SELECT COUNT(*) as total FROM visita_comercial WHERE resultado = 'Interesado'",
    usuarios_con_referidos: "SELECT COUNT(DISTINCT id_referidor) as total FROM referidos_historial",
    total_comisiones_generadas: "SELECT COALESCE(SUM(monto_comision), 0) as total FROM referidos_historial",
    total_comisiones_pagadas: "SELECT COALESCE(SUM(monto_comision), 0) as total FROM referidos_historial WHERE estado = 'pagado'",
    comisiones_pagadas_mes: `
      SELECT COALESCE(SUM(monto_comision), 0) as total 
      FROM referidos_historial 
      WHERE estado = 'pagado' 
      AND MONTH(fecha_registro) = MONTH(CURRENT_DATE())
      AND YEAR(fecha_registro) = YEAR(CURRENT_DATE())
    `,
    comisiones_pagadas_total: "SELECT COALESCE(SUM(monto_comision), 0) as total FROM referidos_historial WHERE estado = 'pagado'"
  };

  const stats = {};
  let completedQueries = 0;
  const totalQueries = Object.keys(queries).length;

  Object.keys(queries).forEach(key => {
    db.query(queries[key], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ message: 'Error del servidor' });
      }

      stats[key] = results[0].total;
      completedQueries++;

      if (completedQueries === totalQueries) {
        res.json(stats);
      }
    });
  });
});

// 🔹 Obtener prospectos
router.get('/prospectos', authenticateToken, requireAdmin, (req, res) => {
  const query = `
    SELECT v.*, u.nombre_completo as comercial 
    FROM visita_comercial v 
    LEFT JOIN validacion val ON v.id_comercial = val.id 
    LEFT JOIN usuario u ON val.id = u.id_validacion 
    ORDER BY v.fecha_visita DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error del servidor' });
    }
    res.json(results);
  });
});

// 🔹 Agregar prospecto
router.post('/prospectos', authenticateToken, requireAdmin, (req, res) => {
  const { nombre_prospecto, contacto, tipo_prospecto, resultado, comentarios } = req.body;
  const id_comercial = req.user.id;

  const query = `
    INSERT INTO visita_comercial (id_comercial, nombre_prospecto, contacto, tipo_prospecto, resultado, comentarios)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  db.query(query, [id_comercial, nombre_prospecto, contacto, tipo_prospecto, resultado, comentarios], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error del servidor' });
    }
    res.json({ message: 'Prospecto agregado exitosamente', id: results.insertId });
  });
});

// 🔹 Actualizar estado del prospecto
router.put('/prospectos/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  const query = 'UPDATE visita_comercial SET resultado = ? WHERE id_visita = ?';

  db.query(query, [estado, id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error del servidor' });
    }
    res.json({ message: 'Estado actualizado exitosamente' });
  });
});

// 🔹 Obtener usuarios recientes
router.get('/usuarios-recientes', authenticateToken, requireAdmin, (req, res) => {
  const query = `
    SELECT u.*, ur.nombre_completo as referente 
    FROM usuario u 
    LEFT JOIN usuario ur ON u.id_referente = ur.id_usuario 
    WHERE u.activo = 1 
    ORDER BY u.fecha_registro DESC 
    LIMIT 10
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error del servidor' });
    }
    res.json(results);
  });
});

// 🔹 Obtener todos los servicios
router.get('/servicios', authenticateToken, requireAdmin, (req, res) => {
  const query = `
    SELECT s.*, u.nombre_completo as usuario, ts.nombre as tipo_servicio, 
           p.nombre_completo as profesional
    FROM servicio s
    LEFT JOIN usuario u ON s.id_usuario = u.id_usuario
    LEFT JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
    LEFT JOIN profesional pr ON s.id_profesional = pr.id_profesional
    LEFT JOIN usuario p ON pr.id_validacion = p.id_validacion
    ORDER BY s.fecha_creacion DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error del servidor' });
    }
    res.json(results);
  });
});

// 🔹 Obtener comisiones pendientes (MEJORADO)
router.get('/comisiones-pendientes', authenticateToken, requireAdmin, (req, res) => {
  const query = `
    SELECT 
      rh.id,
      rh.monto_comision,
      rh.tipo_servicio,
      rh.estado,
      rh.fecha_registro,
      rh.descripcion,
      rh.referido_email,
      u.nombre_completo as usuario,
      u.correo as usuario_email
    FROM referidos_historial rh
    LEFT JOIN usuario u ON rh.id_referidor = u.id_usuario
    WHERE rh.estado = 'pendiente'
    ORDER BY rh.fecha_registro DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error del servidor' });
    }
    res.json(results);
  });
});

// 🔹 MARCAR COMO PAGADO - FUNCIÓN CLAVE
router.post('/marcar-como-pagado/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  const query = 'UPDATE referidos_historial SET estado = "pagado" WHERE id = ?';

  db.query(query, [id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error del servidor' });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ message: 'Comisión no encontrada' });
    }

    res.json({ 
      success: true,
      message: 'Comisión marcada como pagada exitosamente',
      id: id
    });
  });
});

// 🔹 RECHAZAR COMISIÓN
router.post('/rechazar-comision/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;

  const query = 'UPDATE referidos_historial SET estado = "cancelado" WHERE id = ?';

  db.query(query, [id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error del servidor' });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ message: 'Comisión no encontrada' });
    }

    res.json({ 
      success: true,
      message: 'Comisión rechazada exitosamente',
      id: id
    });
  });
});

// 🔹 Obtener datos de referidos para admin
router.get('/referidos', authenticateToken, requireAdmin, (req, res) => {
  const query = `
    SELECT 
      u.id_usuario,
      u.nombre_completo,
      u.correo,
      COUNT(rh.id) as total_referidos,
      COALESCE(SUM(rh.monto_comision), 0) as total_comisiones,
      MAX(rh.fecha_registro) as ultima_comision
    FROM usuario u
    LEFT JOIN referidos_historial rh ON u.id_usuario = rh.id_referidor
    WHERE u.activo = 1
    GROUP BY u.id_usuario, u.nombre_completo, u.correo
    HAVING total_referidos > 0
    ORDER BY total_comisiones DESC
    LIMIT 20
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error del servidor' });
    }
    res.json(results);
  });
});

// 🔹 Obtener datos de pagos
router.get('/pagos', authenticateToken, requireAdmin, (req, res) => {
  const query = `
    SELECT 
      rh.*,
      u.nombre_completo,
      u.correo,
      p.banco,
      p.numero_cuenta
    FROM referidos_historial rh
    LEFT JOIN usuario u ON rh.id_referidor = u.id_usuario
    LEFT JOIN perfil_usuario p ON u.id_usuario = p.id_usuario
    WHERE rh.estado = 'pagado'
    ORDER BY rh.fecha_registro DESC
    LIMIT 50
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error del servidor' });
    }
    res.json(results);
  });
});

module.exports = router;