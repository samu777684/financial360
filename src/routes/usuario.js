const express = require("express");
const router = express.Router();
const db = require("../db/bd");
const { authenticateToken } = require("../middleware/auth");

// =============================================
// GET - Obtener perfil del usuario (CORREGIDO)
// =============================================
router.get("/perfil", authenticateToken, (req, res) => {
  const userId = req.user.id;

  console.log("Buscando perfil para usuario:", userId);

  const query = `
    SELECT nombre_completo, cedula, telefono, pais, ciudad, codigo_postal,
           banco, tipo_cuenta, numero_cuenta, titular_cuenta
    FROM perfil_usuario 
    WHERE id_usuario = ?
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error("Error en consulta de perfil:", err);
      return res.status(500).json({
        message: "Error interno del servidor",
        error: err.message,
      });
    }

    console.log("Resultados de perfil:", results);

    // SIEMPRE usar return + res.json
    if (results.length === 0) {
      return res.json({
        nombre_completo: "",
        cedula: "",
        telefono: "",
        pais: "",
        ciudad: "",
        codigo_postal: "",
        banco: "",
        tipo_cuenta: "",
        numero_cuenta: "",
        titular_cuenta: "",
      });
    }

    // ¡AQUÍ ESTABA EL ERROR! Ahora con return
    return res.json(results[0]);
  });
});

// =============================================
// POST - Completar o actualizar perfil
// =============================================
router.post("/completar-perfil", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const {
    nombre_completo,
    cedula,
    telefono,
    pais,
    ciudad,
    codigo_postal,
    banco,
    tipo_cuenta,
    numero_cuenta,
    titular_cuenta,
  } = req.body;

  console.log("Datos recibidos para perfil:", req.body);

  // Validación de campos obligatorios
  if (
    !nombre_completo ||
    !cedula ||
    !banco ||
    !tipo_cuenta ||
    !numero_cuenta ||
    !titular_cuenta
  ) {
    return res.status(400).json({
      message: "Todos los campos marcados con * son obligatorios",
    });
  }

  // Verificar si ya existe perfil
  db.query(
    "SELECT id FROM perfil_usuario WHERE id_usuario = ?",
    [userId],
    (checkErr, checkResults) => {
      if (checkErr) {
        console.error("Error al verificar perfil:", checkErr);
        return res.status(500).json({ message: "Error del servidor" });
      }

      let query, params;

      if (checkResults.length > 0) {
        // ACTUALIZAR
        query = `
          UPDATE perfil_usuario 
          SET nombre_completo = ?, cedula = ?, telefono = ?, pais = ?, ciudad = ?, 
              codigo_postal = ?, banco = ?, tipo_cuenta = ?, numero_cuenta = ?, titular_cuenta = ?,
              fecha_actualizacion = CURRENT_TIMESTAMP
          WHERE id_usuario = ?
        `;
        params = [
          nombre_completo,
          cedula,
          telefono,
          pais,
          ciudad,
          codigo_postal,
          banco,
          tipo_cuenta,
          numero_cuenta,
          titular_cuenta,
          userId,
        ];
      } else {
        // INSERTAR NUEVO
        query = `
          INSERT INTO perfil_usuario 
          (id_usuario, nombre_completo, cedula, telefono, pais, ciudad, codigo_postal,
           banco, tipo_cuenta, numero_cuenta, titular_cuenta)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        params = [
          userId,
          nombre_completo,
          cedula,
          telefono,
          pais,
          ciudad,
          codigo_postal,
          banco,
          tipo_cuenta,
          numero_cuenta,
          titular_cuenta,
        ];
      }

      db.query(query, params, (err, results) => {
        if (err) {
          console.error("Error al guardar perfil:", err);
          return res.status(500).json({
            message: "Error al guardar el perfil",
            error: err.message,
          });
        }

        console.log("Perfil guardado/actualizado correctamente");

        return res.json({
          success: true,
          message: checkResults.length > 0 ? "Perfil actualizado correctamente" : "Perfil creado correctamente",
        });
      });
    }
  );
});

// =============================================
// GET - Verificar si tiene perfil (optimizado)
// =============================================
router.get("/tiene-perfil", authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.query(
    "SELECT 1 FROM perfil_usuario WHERE id_usuario = ? LIMIT 1",
    [userId],
    (err, results) => {
      if (err) {
        console.error("Error al verificar perfil:", err);
        return res.status(500).json({ message: "Error del servidor" });
      }

      return res.json({
        tienePerfil: results.length > 0,
      });
    }
  );
});

module.exports = router;