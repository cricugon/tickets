const jwt = require("jsonwebtoken");

const User = require("../models/User");

function buildAuthCookie() {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
}

function signToken(userId) {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("Falta JWT_SECRET en el entorno.");
  }

  return jwt.sign({ id: userId }, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });
}

async function protect(req, res, next) {
  const header = req.headers.authorization || "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const token = req.cookies.token || bearerToken;

  if (!token) {
    return res.status(401).json({ message: "Debes iniciar sesion" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-passwordHash");

    if (!user) {
      return res.status(401).json({ message: "Usuario no valido" });
    }

    req.user = user;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Sesion invalida o expirada" });
  }
}

function requireRole(...roles) {
  return function roleMiddleware(req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "No tienes permisos para esta accion" });
    }

    return next();
  };
}

module.exports = {
  buildAuthCookie,
  signToken,
  protect,
  requireRole
};
