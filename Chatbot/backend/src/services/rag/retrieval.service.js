import { qdrant } from "../../config/qdrant.js";
import { config } from "../../config/env.js";
import { embedText } from "./embedding.service.js";

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout`)), Math.max(1, ms))),
  ]);
}

export async function retrieveContext(query, limit = 6) {
  try {
    const vector = await withTimeout(embedText(query), config.ragTimeoutMs, "rag_embed");
    const results = await withTimeout(
      qdrant.search(config.qdrantCollection, {
        vector,
        limit,
        with_payload: true,
      }),
      config.ragTimeoutMs,
      "rag_search"
    );
    return results.map((r) => r.payload?.text).filter(Boolean).join("\n\n");
  } catch {
    return "";
  }
}
