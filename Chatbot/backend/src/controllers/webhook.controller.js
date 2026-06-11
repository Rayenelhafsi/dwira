import { config } from "../config/env.js";
import { incomingMessageQueue } from "../queues/incomingMessage.queue.js";
import { parseMetaIncoming, verifyMetaSignature } from "../services/meta/webhook.service.js";

export function metaVerifyController(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === config.meta.verifyToken) return res.status(200).send(challenge);
  return res.sendStatus(403);
}

export async function metaWebhookController(req, res) {
  const sig = req.headers["x-hub-signature-256"];
  const ok = verifyMetaSignature(req.rawBody || "", sig);
  if (!ok) return res.status(401).json({ error: "Invalid signature" });

  const parsed = await parseMetaIncoming(req.body);
  await Promise.all(
    parsed.map((m) =>
      incomingMessageQueue.add("incoming", {
        platform: m.platform,
        platformUserId: m.platformUserId,
        message: m.text,
        attachments: m.attachments || [],
      })
    )
  );

  return res.sendStatus(200);
}
