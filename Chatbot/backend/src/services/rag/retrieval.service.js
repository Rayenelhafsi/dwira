import { qdrant } from "../../config/qdrant.js";
import { config } from "../../config/env.js";
import { embedText } from "./embedding.service.js";

export async function retrieveContext(query, limit = 6) {
  try {
    const vector = await embedText(query);
    const results = await qdrant.search(config.qdrantCollection, {
      vector,
      limit,
      with_payload: true,
    });
    return results.map((r) => r.payload?.text).filter(Boolean).join("\n\n");
  } catch {
    return "";
  }
}
