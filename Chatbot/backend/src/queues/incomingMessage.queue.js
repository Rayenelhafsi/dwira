import { Queue } from "bullmq";
import { redisWorker } from "../config/redis.js";

export const incomingMessageQueue = new Queue("incoming-messages", {
  connection: redisWorker,
  skipVersionCheck: true,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  },
});
