const express = require("express");
const router = express.Router();
const db = require("../db/bd");
const { authenticateToken } = require("../middleware/auth");

// ==================== OBTENER PERFIL ====================
router.get("/perfil", authenticateToken, (req, res) => {
  const userId = req.user.id;

  console.log("Buscando perfil para usuario ID:", userId);

  const query = `
    SELECT nombre_completo, cedula, telefono, pais, ciudad, codigo_postal,
           banco, tipo_cuenta, numero_cuenta, titular_cuenta
    FROM perfil_usuario 
    WHERE id_usuario = ?
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error("Error consulta perfil:", err);
      return res.status(500).json({ message: "Error del servidor" });
    }

    if (results.length === 0) {
      // No tiene perfil aún → devuelve campos vacíos
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

    res.json(results[0]);
  });
});

// ==================== COMPLETAR / ACTUALIZAR PERFIL ====================
router.post("/completar-perfil", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const {
    nombre_completo, cedula, telefono, pais, ciudad,
    codigo_postal, banco, tipo_cuenta, numero_cuenta, titular_cuenta
  } = req.body;

  // Validación obligatorios
  if (!nombre_completo || !cedula || !banco || !tipo_cuenta || !numero_cuenta || !titular_cuenta) {
    return res.status(400).json({ message: "Campos obligatorios faltantes" });
  }

  // Verificar si ya existe perfil para este usuario
  db.query("SELECT id FROM perfil_usuario WHERE id_usuario = ?", [userId], (err, rows) => {
    if (err) {
      console.error("Error verificando perfil:", err);
      return res.status(500).json({ message: "Error del servidor" });
    }

    if (rows.length > 0) {
      // ACTUALIZAR
      const sql = `
        UPDATE perfil_usuario SET
          nombre_completo=?, cedula=?, telefono=?, pais=?, ciudad=?,
          codigo_postal=?, banco=?, tipo_cuenta=?, numero_cuenta=?, titular_cuenta=?
        WHERE id_usuario=?
      `;
      db.query(sql, [nombre_completo, cedula, telefono, pais, ciudad, codigo_postal,
        banco, tipo_cuenta, numero_cuenta, titular_cuenta, userId], (err) => {
        if (err) {
          console.error("Error actualizando perfil:", err);
          return res.status(500).json({ message: "Error al actualizar" });
        }
        res.json({ success: true, message: "Perfil actualizado correctamente" });
      });

    } else {
      // CREAR NUEVO
      const sql = `
        INSERT INTO perfil_usuario 
        (id_usuario, nombre_completo, cedula, telefono, pais, ciudad, codigo_postal,
         banco, tipo_cuenta, numero_cuenta, titular_cuenta)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      db.query(sql, [userId, nombre_completo, cedula, telefono, pais, ciudad, codigo_postal,
        banco, tipo_cuenta, numero_cuenta, titular_cuenta], (err) => {
        if (err) {
          console.error("Error creando perfil:", err);
          return res.status(500).json({ message: "Error al crear perfil" });
        }
        res.json({ success: true, message: "Perfil creado correctamente" });
      });
    }
  });
});

// ==================== VERIFICAR SI TIENE PERFIL ====================
router.get("/tiene-perfil", authenticateToken, (req, res) => {
  const userId = req.user.id;

  db.query("SELECT 1 FROM perfil_usuario WHERE id_usuario = ? LIMIT 1", [userId], (err, results) => {
    if (err) return res.status(500).json({ message: "Error del servidor" });
    res.json({ tienePerfil: results.length > 0 });
  });
});

module.exports = router;