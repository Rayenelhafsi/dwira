import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "../config/env.js";

export const qdrant = new QdrantClient({
  url: config.qdrantUrl,
  apiKey: config.qdrantApiKey || undefined,
});
