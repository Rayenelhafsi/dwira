import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
if (!fs.existsSync(envPath)) {
  console.error("Missing .env file");
  process.exit(1);
}

const raw = fs.readFileSync(envPath, "utf8");
const env = {};
for (const line of raw.split(/\r?\n/)) {
  if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
  const idx = line.indexOf("=");
  const k = line.slice(0, idx).trim();
  const v = line.slice(idx + 1).trim();
  env[k] = v;
}

const required = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "OPENAI_API_KEY",
  "OPENAI_CHAT_MODEL",
  "OPENAI_EMBED_MODEL",
  "QDRANT_URL",
  "QDRANT_COLLECTION",
  "META_CAPI_PIXEL_ID",
  "META_CAPI_ACCESS_TOKEN",
  "META_CAPI_TEST_EVENT_CODE",
];

const metaRequired = [
  "META_VERIFY_TOKEN",
  "META_APP_SECRET",
  "META_PAGE_ACCESS_TOKEN",
];

const missing = [];
const placeholderValues = new Set(["", "replace_me", "SET_ME", "SET_ME_OPENAI_KEY", "SET_ME_META_APP_SECRET", "SET_ME_META_PAGE_ACCESS_TOKEN", "SET_ME_META_VERIFY_TOKEN", "SET_ME_JWT_SECRET"]);

for (const key of required) {
  const value = String(env[key] || "").trim();
  if (!value || placeholderValues.has(value)) missing.push(key);
}

const metaEnabled = String(env.META_INTEGRATION_ENABLED || "false").trim().toLowerCase() === "true";
if (metaEnabled) {
  for (const key of metaRequired) {
    const value = String(env[key] || "").trim();
    if (!value || placeholderValues.has(value)) missing.push(key);
  }
}

if (missing.length) {
  console.error("Missing or placeholder variables:");
  for (const key of missing) console.error(`- ${key}`);
  process.exit(2);
}

console.log("Environment validation passed.");
