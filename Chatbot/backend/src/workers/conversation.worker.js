import { Worker } from "bullmq";
import { redisWorker } from "../config/redis.js";
import { processIncomingMessage } from "../services/conversationProcessor.service.js";

new Worker(
  "incoming-messages",
  async (job) => {
    await processIncomingMessage(job.data);
  },
  { connection: redisWorker, concurrency: 20, skipVersionCheck: true }
);

console.log("Conversation worker started");
