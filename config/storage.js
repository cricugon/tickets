const crypto = require("crypto");
const path = require("path");

const DEFAULT_MAX_ATTACHMENTS = 5;
const DEFAULT_MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getAttachmentLimits() {
  return {
    maxAttachments: parsePositiveInt(process.env.MAX_ATTACHMENTS_PER_ITEM, DEFAULT_MAX_ATTACHMENTS),
    maxAttachmentSizeBytes: parsePositiveInt(process.env.MAX_ATTACHMENT_SIZE_BYTES, DEFAULT_MAX_ATTACHMENT_SIZE_BYTES),
    maxTotalAttachmentBytes: parsePositiveInt(
      process.env.MAX_TOTAL_ATTACHMENT_BYTES,
      DEFAULT_MAX_TOTAL_ATTACHMENT_BYTES
    )
  };
}

function deriveSupabaseUrlFromDbUrl(connectionString = "") {
  if (!connectionString) {
    return "";
  }

  try {
    const parsed = new URL(connectionString);
    const host = parsed.hostname || "";
    const match = host.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i);

    if (!match) {
      return "";
    }

    return `https://${match[1]}.supabase.co`;
  } catch (_error) {
    return "";
  }
}

function getStorageConfig() {
  const urlFromDb =
    deriveSupabaseUrlFromDbUrl(process.env.SUPABASE_DB_URL) ||
    deriveSupabaseUrlFromDbUrl(process.env.SUPABASE_DATABASE_URL);

  return {
    supabaseUrl: (process.env.SUPABASE_URL || urlFromDb || "").replace(/\/+$/, ""),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    bucket: process.env.SUPABASE_STORAGE_BUCKET || process.env.SUPABASE_BUCKET || "",
    limits: getAttachmentLimits()
  };
}

function isStorageConfigured() {
  const { supabaseUrl, serviceRoleKey, bucket } = getStorageConfig();
  return Boolean(supabaseUrl && serviceRoleKey && bucket);
}

function ensureStorageConfigured() {
  if (!isStorageConfigured()) {
    throw new Error(
      "Los adjuntos no estan configurados. Revisa SUPABASE_URL o SUPABASE_DB_URL, SUPABASE_SERVICE_ROLE_KEY y SUPABASE_STORAGE_BUCKET."
    );
  }
}

function encodeStoragePath(value) {
  return String(value)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function safeText(value = "") {
  return String(value).trim();
}

function sanitizeFileName(filename = "") {
  const extension = path.extname(filename);
  const baseName = path.basename(filename, extension);
  const normalizedBase = baseName
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  const normalizedExtension = extension
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^a-zA-Z0-9.]+/g, "")
    .slice(0, 16);
  const base = normalizedBase || "archivo";
  return `${base}${normalizedExtension}`.slice(0, 120);
}

function parseAttachmentContent(content = "", fallbackContentType = "") {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(content);

  if (!match) {
    throw new Error("Uno de los adjuntos no tiene un formato valido.");
  }

  const contentType = safeText(match[1]) || fallbackContentType || "application/octet-stream";
  return {
    contentType,
    buffer: Buffer.from(match[2], "base64")
  };
}

function normalizeAttachments(attachments = []) {
  if (!Array.isArray(attachments)) {
    throw new Error("El formato de los adjuntos no es valido.");
  }

  const { maxAttachments, maxAttachmentSizeBytes, maxTotalAttachmentBytes } = getAttachmentLimits();

  if (attachments.length > maxAttachments) {
    throw new Error(`Solo se permiten ${maxAttachments} adjuntos por envio.`);
  }

  let totalBytes = 0;
  const normalized = attachments.map((attachment) => {
    if (!attachment || typeof attachment !== "object") {
      throw new Error("Uno de los adjuntos no es valido.");
    }

    const originalName = safeText(attachment.name);

    if (!originalName) {
      throw new Error("Cada adjunto debe tener nombre.");
    }

    const { buffer, contentType } = parseAttachmentContent(attachment.content, attachment.type);
    const declaredSize = Number.parseInt(attachment.size, 10);
    const size = Number.isFinite(declaredSize) && declaredSize > 0 ? declaredSize : buffer.length;

    if (!buffer.length || size <= 0) {
      throw new Error(`El adjunto ${originalName} esta vacio.`);
    }

    if (buffer.length > maxAttachmentSizeBytes || size > maxAttachmentSizeBytes) {
      throw new Error(`El adjunto ${originalName} supera el limite de ${maxAttachmentSizeBytes} bytes.`);
    }

    totalBytes += buffer.length;

    if (totalBytes > maxTotalAttachmentBytes) {
      throw new Error(
        `La suma de adjuntos supera el limite de ${maxTotalAttachmentBytes} bytes por envio.`
      );
    }

    return {
      originalName,
      safeName: sanitizeFileName(originalName),
      contentType,
      size: buffer.length,
      buffer
    };
  });

  return normalized;
}

function buildStoragePath({ ticketId, segment, safeName }) {
  const datePrefix = new Date().toISOString().slice(0, 10);
  return [
    "tickets",
    ticketId,
    segment,
    `${datePrefix}-${crypto.randomUUID()}-${safeName}`
  ].join("/");
}

async function requestStorage(url, options = {}) {
  const { serviceRoleKey } = getStorageConfig();
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(payload || "No se pudo completar la operacion en Supabase Storage.");
  }

  return response;
}

async function uploadAttachments({ ticketId, segment, attachments = [], actor }) {
  if (!attachments.length) {
    return [];
  }

  ensureStorageConfigured();

  const { supabaseUrl, bucket } = getStorageConfig();
  const normalizedAttachments = normalizeAttachments(attachments);
  const uploaded = [];

  try {
    for (const attachment of normalizedAttachments) {
      const storagePath = buildStoragePath({
        ticketId,
        segment,
        safeName: attachment.safeName
      });
      const uploadUrl = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(storagePath)}`;

      await requestStorage(uploadUrl, {
        method: "POST",
        headers: {
          "content-type": attachment.contentType,
          "x-upsert": "false"
        },
        body: attachment.buffer
      });

      uploaded.push({
        bucket,
        path: storagePath,
        originalName: attachment.originalName,
        contentType: attachment.contentType,
        size: attachment.size,
        uploadedBy: actor._id,
        uploadedByName: actor.name
      });
    }

    return uploaded;
  } catch (error) {
    await cleanupUploadedAttachments(uploaded);
    throw error;
  }
}

async function cleanupUploadedAttachments(attachments = []) {
  if (!attachments.length || !isStorageConfigured()) {
    return;
  }

  const { supabaseUrl } = getStorageConfig();

  await Promise.allSettled(
    attachments.map((attachment) => {
      const bucket = attachment.bucket || getStorageConfig().bucket;
      const deleteUrl = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(attachment.path)}`;
      return requestStorage(deleteUrl, { method: "DELETE" });
    })
  );
}

async function downloadAttachment(attachment) {
  ensureStorageConfigured();

  const { supabaseUrl, bucket: configuredBucket } = getStorageConfig();
  const bucket = attachment.bucket || configuredBucket;
  const downloadUrl = `${supabaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodeStoragePath(
    attachment.path
  )}`;

  const response = await requestStorage(downloadUrl, {
    method: "GET"
  });

  return {
    contentType: response.headers.get("content-type") || attachment.contentType || "application/octet-stream",
    body: Buffer.from(await response.arrayBuffer())
  };
}

module.exports = {
  cleanupUploadedAttachments,
  downloadAttachment,
  getAttachmentLimits,
  getStorageConfig,
  isStorageConfigured,
  uploadAttachments
};
