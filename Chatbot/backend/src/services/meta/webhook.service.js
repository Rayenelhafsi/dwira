import crypto from "crypto";
import axios from "axios";
import { config } from "../../config/env.js";

export function verifyMetaSignature(rawBody, signatureHeader) {
  if (!signatureHeader || !config.meta.appSecret) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", config.meta.appSecret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}

const META_GRAPH_BASE = `https://graph.facebook.com/${config.meta.graphVersion}`;

async function downloadMetaMediaAsDataUrl(mediaId, fallbackMimeType = "application/octet-stream") {
  const normalizedMediaId = String(mediaId || "").trim();
  if (!normalizedMediaId || !config.meta.pageAccessToken) return null;
  const metadataResponse = await axios.get(`${META_GRAPH_BASE}/${encodeURIComponent(normalizedMediaId)}`, {
    headers: {
      Authorization: `Bearer ${config.meta.pageAccessToken}`,
    },
  });
  const mediaUrl = String(metadataResponse?.data?.url || "").trim();
  if (!mediaUrl) return null;
  const mediaResponse = await axios.get(mediaUrl, {
    headers: {
      Authorization: `Bearer ${config.meta.pageAccessToken}`,
    },
    responseType: "arraybuffer",
  });
  const mimeType = String(mediaResponse.headers?.["content-type"] || fallbackMimeType).trim() || fallbackMimeType;
  const base64 = Buffer.from(mediaResponse.data).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

async function normalizeWhatsappAttachment(msg) {
  const attachments = [];
  if (msg.image?.id) {
    const dataUrl = await downloadMetaMediaAsDataUrl(msg.image.id, String(msg.image.mime_type || "image/*").trim());
    attachments.push({
      type: "image",
      url: dataUrl ? undefined : String(msg.image.id).trim(),
      dataUrl: dataUrl || undefined,
      mimeType: String(msg.image.mime_type || "image/*").trim(),
      name: "whatsapp-image",
    });
  }
  if (msg.document?.id) {
    const dataUrl = await downloadMetaMediaAsDataUrl(msg.document.id, String(msg.document.mime_type || "application/octet-stream").trim());
    attachments.push({
      type: "document",
      url: dataUrl ? undefined : String(msg.document.id).trim(),
      dataUrl: dataUrl || undefined,
      mimeType: String(msg.document.mime_type || "application/octet-stream").trim(),
      name: String(msg.document.filename || "whatsapp-document").trim(),
    });
  }
  return attachments.filter((attachment) => String(attachment.url || attachment.dataUrl || "").trim());
}

function normalizeMessengerAttachment(attachment) {
  const type = String(attachment?.type || "").trim().toLowerCase();
  const payloadUrl = String(attachment?.payload?.url || "").trim();
  if (!payloadUrl) return null;
  return {
    type: type === "image" ? "image" : "document",
    url: payloadUrl,
    mimeType: type === "image" ? "image/*" : "application/octet-stream",
    name: type === "image" ? "meta-image" : "meta-file",
  };
}

export async function parseMetaIncoming(body) {
  const messages = [];

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const messagingProduct = String(value.messaging_product || "").trim().toLowerCase();
      if (messagingProduct !== "whatsapp") continue;
      for (const msg of value.messages || []) {
        const attachments = await normalizeWhatsappAttachment(msg);
        messages.push({
          platform: "whatsapp",
          platformUserId: String(msg.from || "").trim(),
          text: String(msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "").trim(),
          messageId: String(msg.id || "").trim(),
          attachments,
        });
      }
    }
  }

  for (const entry of body.entry || []) {
    const objectType = String(body.object || "").trim().toLowerCase();
    const isInstagramObject = objectType === "instagram" || String(entry?.id || "").trim() === String(config.meta.instagramAccountId || "").trim();
    for (const messagingEvent of entry.messaging || []) {
      const senderId = String(messagingEvent?.sender?.id || "").trim();
      const message = messagingEvent?.message || null;
      if (!senderId || !message || message.is_echo) continue;
      const attachments = Array.isArray(message.attachments)
        ? message.attachments.map(normalizeMessengerAttachment).filter(Boolean)
        : [];
      messages.push({
        platform: isInstagramObject ? "instagram" : "messenger",
        platformUserId: senderId,
        text: String(message.text || "").trim(),
        messageId: String(message.mid || "").trim(),
        attachments,
      });
    }
  }

  return messages.filter((message) => message.platformUserId && (message.text || (Array.isArray(message.attachments) && message.attachments.length > 0)));
}
