import { incomingMessageQueue } from "../queues/incomingMessage.queue.js";
import { processIncomingMessage } from "../services/conversationProcessor.service.js";
import { chatSchema } from "../utils/validators.js";

export async function chatController(req, res) {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const payload = parsed.data;
  await incomingMessageQueue.add("incoming", payload, {
    jobId: `${payload.platform}:${payload.platformUserId}:${Date.now()}`,
  });

  return res.json({ queued: true });
}

export async function chatSyncController(req, res) {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const result = await processIncomingMessage(parsed.data);
  if (!result) return res.status(429).json({ error: "Conversation locked, retry shortly." });

  return res.json({
    conversationId: result.conversationId,
    reply: result.reply || "",
    options: result.options || [],
  });
}
