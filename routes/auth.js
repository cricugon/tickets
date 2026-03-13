const express = require("express");
const bcrypt = require("bcryptjs");

const asyncHandler = require("../middleware/asyncHandler");
const { buildAuthCookie, protect, signToken } = require("../middleware/auth");
const User = require("../models/User");

const router = express.Router();

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { name, email, password, role = "consultant", site = "", adminCode = "" } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Nombre, email y password son obligatorios" });
    }

    if (role === "consultant" && !site.trim()) {
      return res.status(400).json({ message: "El consultor debe estar asociado a una web" });
    }

    if (role === "admin" && adminCode !== process.env.ADMIN_REGISTRATION_CODE) {
      return res.status(403).json({ message: "Codigo de registro de admin incorrecto" });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });

    if (existingUser) {
      return res.status(409).json({ message: "Ya existe un usuario con ese email" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role: role === "admin" ? "admin" : "consultant",
      site: role === "consultant" ? site.trim() : ""
    });

    const token = signToken(user._id.toString());
    res.cookie("token", token, buildAuthCookie());

    return res.status(201).json({
      message: "Registro completado",
      user: user.toSafeObject()
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email y password son obligatorios" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    const isValidPassword = await user.comparePassword(password);

    if (!isValidPassword) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    const token = signToken(user._id.toString());
    res.cookie("token", token, buildAuthCookie());

    return res.json({
      message: "Sesion iniciada",
      user: user.toSafeObject()
    });
  })
);

router.post("/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ message: "Sesion cerrada" });
});

router.get(
  "/me",
  protect,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user.toSafeObject() });
  })
);

module.exports = router;
