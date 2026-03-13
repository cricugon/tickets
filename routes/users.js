const express = require("express");
const bcrypt = require("bcryptjs");

const asyncHandler = require("../middleware/asyncHandler");
const { protect, requireRole } = require("../middleware/auth");
const User = require("../models/User");

const router = express.Router();

router.use(protect);

router.get(
  "/admins",
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const admins = await User.find({ role: "admin" }).sort({ name: 1 }).select("-passwordHash");
    res.json({ admins: admins.map((admin) => admin.toSafeObject()) });
  })
);

router.get(
  "/sites",
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    const sites = await User.distinct("site", {
      role: "consultant",
      site: { $ne: "" }
    });

    res.json({ sites: sites.sort((a, b) => a.localeCompare(b)) });
  })
);

router.get(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const query = {};

    if (req.query.role) {
      query.role = req.query.role;
    }

    const users = await User.find(query).sort({ createdAt: -1 }).select("-passwordHash");
    res.json({ users: users.map((user) => user.toSafeObject()) });
  })
);

router.post(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const { name, email, password, role = "consultant", site = "" } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Nombre, email y password son obligatorios" });
    }

    if (role === "consultant" && !site.trim()) {
      return res.status(400).json({ message: "Los consultores necesitan una web asociada" });
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

    res.status(201).json({
      message: "Usuario creado",
      user: user.toSafeObject()
    });
  })
);

module.exports = router;
