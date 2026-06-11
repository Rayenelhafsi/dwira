import axios from "axios";
import { config } from "../../config/env.js";

const META_GRAPH_BASE = `https://graph.facebook.com/${config.meta.graphVersion}`;

export async function sendMetaMessage(platform, recipientId, text) {
  const normalizedPlatform = String(platform || "").trim().toLowerCase();
  const normalizedRecipientId = String(recipientId || "").trim();
  const normalizedText = String(text || "").trim();
  if (!normalizedPlatform || !normalizedRecipientId || !normalizedText) return;

  if (normalizedPlatform === "whatsapp") {
    if (!config.meta.pageAccessToken || !config.meta.whatsappPhoneNumberId) return;
    await axios.post(
      `${META_GRAPH_BASE}/${encodeURIComponent(config.meta.whatsappPhoneNumberId)}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedRecipientId,
        type: "text",
        text: { body: normalizedText },
      },
      {
        headers: {
          Authorization: `Bearer ${config.meta.pageAccessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    return;
  }

  if (!config.meta.pageAccessToken) return;
  await axios.post(
    `${META_GRAPH_BASE}/me/messages`,
    {
      recipient: { id: normalizedRecipientId },
      messaging_type: "RESPONSE",
      message: { text: normalizedText },
    },
    {
      params: { access_token: config.meta.pageAccessToken },
    }
  );
}
