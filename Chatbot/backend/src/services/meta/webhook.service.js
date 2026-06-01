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
        messages.push({
          platform: value.messaging_product || "messenger",
          platformUserId: msg.from,
          text: msg.text?.body || "",
          messageId: msg.id,
        });
      }
    }
  }
  return messages;
}
