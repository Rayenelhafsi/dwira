import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { qdrant } from "../src/config/qdrant.js";
import { config } from "../src/config/env.js";
import { embedText } from "../src/services/rag/embedding.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.resolve(__dirname, "../knowledge");

function chunkMarkdown(text, source) {
  const cleaned = String(text || "").replace(/\r/g, "").trim();
  if (!cleaned) return [];
  const sections = cleaned.split(/\n(?=# )/g).map((item) => item.trim()).filter(Boolean);
  const chunks = [];
  for (const section of sections) {
    const parts = section
      .split(/\n{2,}/g)
      .map((item) => item.trim())
      .filter(Boolean);
    let current = "";
    for (const part of parts) {
      const candidate = current ? `${current}\n\n${part}` : part;
      if (candidate.length > 1200 && current) {
        chunks.push({ source, text: current });
        current = part;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push({ source, text: current });
  }
  return chunks;
}

async function ensureCollection(vectorSize) {
  try {
    await qdrant.getCollection(config.qdrantCollection);
  } catch {
    await qdrant.createCollection(config.qdrantCollection, {
      vectors: { size: vectorSize, distance: "Cosine" },
    });
  }
}

async function readKnowledgeChunks() {
  const entries = await fs.readdir(KNOWLEDGE_DIR, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name).sort();
  const chunks = [];
  for (const file of files) {
    const fullPath = path.join(KNOWLEDGE_DIR, file);
    const content = await fs.readFile(fullPath, "utf8");
    chunks.push(...chunkMarkdown(content, file));
  }
  return chunks;
}

async function main() {
  const chunks = await readKnowledgeChunks();
  if (!chunks.length) {
    console.log("No knowledge chunks to index.");
    return;
  }

  const firstVector = await embedText(chunks[0].text);
  await ensureCollection(firstVector.length);

  const points = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const vector = await embedText(chunk.text);
    points.push({
      id: index + 1,
      vector,
      payload: {
        source: chunk.source,
        text: chunk.text,
      },
    });
  }

  await qdrant.upsert(config.qdrantCollection, {
    wait: true,
    points,
  });
  console.log(`Indexed ${points.length} knowledge chunks into ${config.qdrantCollection}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
