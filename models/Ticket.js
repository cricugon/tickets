const crypto = require("crypto");
const mongoose = require("mongoose");

function generateReference() {
  const year = new Date().getFullYear().toString().slice(-2);
  const chunk = crypto.randomBytes(3).toString("hex").toUpperCase();

  return `${year}${chunk.slice(0, 1)}-${chunk.slice(1, 4)}-${chunk.slice(4, 6)}`;
}

const ticketMessageSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    authorName: {
      type: String,
      required: true
    },
    authorRole: {
      type: String,
      enum: ["admin", "consultant"],
      required: true
    },
    body: {
      type: String,
      required: true,
      trim: true
    },
    kind: {
      type: String,
      enum: ["message"],
      default: "message"
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const ticketActivitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    actorName: {
      type: String,
      required: true
    },
    actorRole: {
      type: String,
      enum: ["admin", "consultant", "system"],
      default: "system"
    },
    description: {
      type: String,
      required: true
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const ticketReadStateSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const ticketSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      unique: true,
      default: generateReference
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium"
    },
    status: {
      type: String,
      enum: ["open", "claimed", "in_progress", "waiting_consultant", "client_replied", "closed"],
      default: "open"
    },
    site: {
      type: String,
      required: true,
      trim: true
    },
    consultant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    primaryAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    supportingAdmins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    invitedAdmins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    readState: [ticketReadStateSchema],
    messages: [ticketMessageSchema],
    activityLog: [ticketActivitySchema],
    closedAt: {
      type: Date,
      default: null
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  {
    timestamps: true
  }
);

ticketSchema.index({ site: 1, status: 1, updatedAt: -1 });
ticketSchema.index({ consultant: 1, updatedAt: -1 });
ticketSchema.index({ "readState.user": 1, updatedAt: -1 });

module.exports = mongoose.model("Ticket", ticketSchema);
