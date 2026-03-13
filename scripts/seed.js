require("dotenv").config();

const bcrypt = require("bcryptjs");

const connectDB = require("../config/db");
const User = require("../models/User");
const Ticket = require("../models/Ticket");

async function seed() {
  await connectDB();

  const adminPasswordHash = await bcrypt.hash("Admin1234!", 10);
  const consultantPasswordHash = await bcrypt.hash("Consultor1234!", 10);

  const [admin, secondAdmin, consultant] = await Promise.all([
    User.findOneAndUpdate(
      { email: "admin@tickets.local" },
      {
        name: "Admin Principal",
        email: "admin@tickets.local",
        passwordHash: adminPasswordHash,
        role: "admin",
        site: ""
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ),
    User.findOneAndUpdate(
      { email: "soporte@tickets.local" },
      {
        name: "Admin Soporte",
        email: "soporte@tickets.local",
        passwordHash: adminPasswordHash,
        role: "admin",
        site: ""
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ),
    User.findOneAndUpdate(
      { email: "consultor@acme.local" },
      {
        name: "Consultor ACME",
        email: "consultor@acme.local",
        passwordHash: consultantPasswordHash,
        role: "consultant",
        site: "acme.com"
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  ]);

  const existingTicket = await Ticket.findOne({ title: "Integracion del formulario de leads" });

  if (!existingTicket) {
    await Ticket.create({
      title: "Integracion del formulario de leads",
      description: "Necesitamos revisar que los leads de la web entren en el CRM.",
      severity: "high",
      status: "in_progress",
      site: "acme.com",
      consultant: consultant._id,
      primaryAdmin: admin._id,
      supportingAdmins: [secondAdmin._id],
      invitedAdmins: [secondAdmin._id],
      messages: [
        {
          author: consultant._id,
          authorName: consultant.name,
          authorRole: consultant.role,
          body: "Necesitamos revisar que los leads de la web entren en el CRM."
        },
        {
          author: admin._id,
          authorName: admin.name,
          authorRole: admin.role,
          body: "Estamos revisando logs y configuracion del endpoint."
        }
      ],
      activityLog: [
        {
          type: "ticket_created",
          actor: consultant._id,
          actorName: consultant.name,
          actorRole: consultant.role,
          description: `${consultant.name} creo el ticket`
        },
        {
          type: "ticket_claimed",
          actor: admin._id,
          actorName: admin.name,
          actorRole: admin.role,
          description: `${admin.name} tomo el ticket como admin principal`
        },
        {
          type: "admin_invited",
          actor: admin._id,
          actorName: admin.name,
          actorRole: admin.role,
          description: `${admin.name} invito a ${secondAdmin.name} a unirse`
        },
        {
          type: "admin_joined",
          actor: secondAdmin._id,
          actorName: secondAdmin.name,
          actorRole: secondAdmin.role,
          description: `${secondAdmin.name} se unio al ticket como apoyo`
        }
      ]
    });
  }

  console.log("Seed completado");
  console.log("Admin: admin@tickets.local / Admin1234!");
  console.log("Admin apoyo: soporte@tickets.local / Admin1234!");
  console.log("Consultor: consultor@acme.local / Consultor1234!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Error en seed:", error);
  process.exit(1);
});
