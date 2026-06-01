import { openai } from "../../config/openai.js";
import { config } from "../../config/env.js";

export async function embedText(text) {
  const out = await openai.embeddings.create({
    model: config.openaiEmbedModel,
    input: text,
  });
  return out.data[0].embedding;
}
