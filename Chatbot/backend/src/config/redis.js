import Redis from "ioredis";
import { config } from "./env.js";

export const redis = new Redis(config.redisUrl);
export const redisWorker = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
});
