// routes/auth.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { query } = require("../db/promises");

const JWT_SECRET = process.env.JWT_SECRET || "tu_clave_secreta_super_segura_2025";

// ==================== LOGIN (AHORA FUNCIONA SI O SI) ====================
router.post("/login", async (req, res) => {
  const { correo, contrasena } = req.body;

  console.log("Intentando login con:", correo);

  if (!correo || !contrasena) {
    return res.status(400).json({ message: "Faltan correo o contraseña" });
  }

  try {
    const correoNormalizado = correo.trim().toLowerCase();

    const results = await query(
      `SELECT id, nombre, correo, contrasena, id_rol 
       FROM validacion 
       WHERE LOWER(TRIM(correo)) = ? 
       LIMIT 1`,
      [correoNormalizado]
    );

    if (results.length === 0) {
      return res.status(401).json({ message: "Usuario no encontrado" });
    }

    const usuario = results[0];

    // SI LA CONTRASEÑA NO ESTÁ HASHEADA → LA HASHEAMOS EN EL MOMENTO
    let hashValido = usuario.contrasena;

    if (!usuario.contrasena?.startsWith("$2b$") && !usuario.contrasena?.startsWith("$2a$")) {
      console.log("Contraseña en texto plano detectada, hasheando en vivo...");
      if (contrasena === usuario.contrasena) {
        // Hashear y guardar automáticamente
        hashValido = await bcrypt.hash(contrasena, 10);
        await query(
          "UPDATE validacion SET contrasena = ? WHERE id = ?",
          [hashValido, usuario.id]
        );
        console.log("Contraseña hasheada y actualizada en BD");
      } else {
        return res.status(401).json({ message: "Contraseña incorrecta" });
      }
    }

    // Ahora sí comparamos con bcrypt
    const match = await bcrypt.compare(contrasena, hashValido);

    if (!match) {
      return res.status(401).json({ message: "Contraseña incorrecta" });
    }

    // Generar token
    const token = jwt.sign(
      { id: usuario.id, correo: usuario.correo, rol: usuario.id_rol },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    const rol_nombre = usuario.id_rol === 1 ? "admin" : "usuario";

    console.log("LOGIN EXITOSO:", usuario.nombre, rol_nombre);

    res.json({
      success: true,
      message: "Login exitoso",
      token,
      usuario: usuario.nombre,
      rol: usuario.id_rol,
      rol_nombre
    });

  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: "Error del servidor" });
  }
});

// ==================== REGISTRO (ya hashea bien) ====================
router.post("/register", async (req, res) => {
  const { nombre, correo, contrasena } = req.body;

  if (!nombre || !correo || !contrasena) {
    return res.status(400).json({ message: "Todos los campos son obligatorios" });
  }

  if (contrasena.length < 6) {
    return res.status(400).json({ message: "Mínimo 6 caracteres" });
  }

  try {
    const correoNormalizado = correo.trim().toLowerCase();

    const existe = await query("SELECT id FROM validacion WHERE LOWER(TRIM(correo)) = ?", [correoNormalizado]);
    if (existe.length > 0) {
      return res.status(400).json({ message: "Este correo ya está registrado" });
    }

    const hash = await bcrypt.hash(contrasena, 10);

    await query(
      "INSERT INTO validacion (nombre, correo, contrasena, id_rol) VALUES (?, ?, ?, 2)",
      [nombre.trim(), correoNormalizado, hash]
    );

    res.json({ success: true, message: "Cuenta creada correctamente" });

  } catch (error) {
    console.error("Error en registro:", error);
    res.status(500).json({ message: "Error al crear cuenta" });
  }
});

// ==================== RESTABLECER CONTRASEÑA ====================
router.post("/reset-password", async (req, res) => {
  const { correo, nuevaContrasena } = req.body;

  if (!correo || !nuevaContrasena || nuevaContrasena.length < 6) {
    return res.status(400).json({ message: "Datos inválidos" });
  }

  try {
    const correoNormalizado = correo.trim().toLowerCase();
    const results = await query("SELECT id FROM validacion WHERE LOWER(TRIM(correo)) = ?", [correoNormalizado]);

    if (results.length === 0) {
      return res.status(404).json({ message: "Correo no encontrado" });
    }

    const hash = await bcrypt.hash(nuevaContrasena, 10);

    await query(
      "UPDATE validacion SET contrasena = ? WHERE LOWER(TRIM(correo)) = ?",
      [hash, correoNormalizado]
    );

    res.json({ success: true, message: "Contraseña actualizada" });

  } catch (error) {
    console.error("Error en reset:", error);
    res.status(500).json({ message: "Error del servidor" });
  }
});

module.exports = router;