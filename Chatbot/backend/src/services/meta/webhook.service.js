import crypto from "crypto";
import { config } from "../../config/env.js";

export function verifyMetaSignature(rawBody, signatureHeader) {
  if (!signatureHeader || !config.meta.appSecret) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", config.meta.appSecret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}

export function parseMetaIncoming(body) {
  const messages = [];
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      for (const msg of value.messages || []) {
        const attachments = [];
        if (msg.image?.id) {
          attachments.push({
            type: "image",
            url: String(msg.image.id).trim(),
            mimeType: String(msg.image.mime_type || "image/*").trim(),
            name: "meta-image",
          });
        }
        if (msg.document?.id) {
          attachments.push({
            type: "document",
            url: String(msg.document.id).trim(),
            mimeType: String(msg.document.mime_type || "application/octet-stream").trim(),
            name: String(msg.document.filename || "meta-document").trim(),
          });
        }
        messages.push({
          platform: value.messaging_product || "messenger",
          platformUserId: msg.from,
          text: msg.text?.body || "",
          messageId: msg.id,
          attachments,
        });
      }
    }
  }
  return messages;
}
