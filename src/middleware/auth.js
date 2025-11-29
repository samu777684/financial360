const jwt = require("jsonwebtoken");

// Clave secreta (nunca más fallback inseguro)
const JWT_SECRET = process.env.JWT_SECRET || "financial360_2025_clave_super_secreta_definitiva";

// Tiempo de vida del token (ajusta según entorno)
const TOKEN_EXPIRES_IN = process.env.NODE_ENV === "production" ? "7d" : "30d";

/**
 * Middleware: authenticateToken
 * Verifica que el JWT sea válido
 */
const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"] || req.headers["Authorization"];
    const token = authHeader && authHeader.startsWith("Bearer ") 
      ? authHeader.split(" ")[1] 
      : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Acceso denegado: token no proporcionado",
      });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        console.error("JWT verification failed:", {
          error: err.message,
          expired: err.name === "TokenExpiredError",
          tokenPreview: token.substring(0, 20) + "..."
        });

        if (err.name === "TokenExpiredError") {
          return res.status(401).json({
            success: false,
            message: "Sesión expirada. Por favor inicia sesión nuevamente.",
            code: "TOKEN_EXPIRED"
          });
        }

        return res.status(403).json({
          success: false,
          message: "Token inválido",
          code: "TOKEN_INVALID"
        });
      }

      // Token válido → adjuntamos los datos del usuario
      req.user = decoded;
      next();
    });
  } catch (error) {
    console.error("Error crítico en authenticateToken:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

/**
 * Middleware: requireAdmin
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Autenticación requerida",
    });
  }

  if (req.user.rol !== 1) {
    return res.status(403).json({
      success: false,
      message: "Acceso denegado: requiere permisos de administrador",
    });
  }

  next();
};

/**
 * Función auxiliar: generar token (úsala en tu login)
 */
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
};

module.exports = {
  authenticateToken,
  requireAdmin,
  generateToken, // ¡NUEVA! Úsala en tu ruta de login
};