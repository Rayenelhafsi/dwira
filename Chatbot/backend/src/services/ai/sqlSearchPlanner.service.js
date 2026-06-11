import { createHash } from "node:crypto";
import { openai } from "../../config/openai.js";
import { config } from "../../config/env.js";
import { redis } from "../../config/redis.js";

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout`)), Math.max(1, ms))),
  ]);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseJsonSafe(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim());
  } catch {
    return null;
  }
}

function toStringArray(value, limit = 8) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))).slice(0, limit);
}

function normalizeSort(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["price_asc", "price_desc", "relevance", "newest"].includes(raw)) return raw;
  return "price_asc";
}

function normalizePlan(plan, fallback) {
  const filters = plan?.filters && typeof plan.filters === "object" ? plan.filters : {};
  return {
    strategy: String(plan?.strategy || fallback?.strategy || "catalog_search").trim().toLowerCase(),
    sort: normalizeSort(plan?.sort || fallback?.sort || "price_asc"),
    limit: Math.max(1, Math.min(80, Number(plan?.limit || fallback?.limit || 24))),
    titleTerms: toStringArray(plan?.titleTerms || fallback?.titleTerms),
    textTerms: toStringArray(plan?.textTerms || fallback?.textTerms),
    zoneTerms: toStringArray(plan?.zoneTerms || fallback?.zoneTerms),
    excludeTerms: toStringArray(plan?.excludeTerms || fallback?.excludeTerms),
    filters: {
      floor: ["ground", "first", "second"].includes(String(filters?.floor || fallback?.filters?.floor || "").trim().toLowerCase())
        ? String(filters.floor || fallback.filters.floor).trim().toLowerCase()
        : null,
      exactZoneOnly: Boolean(filters?.exactZoneOnly ?? fallback?.filters?.exactZoneOnly ?? false),
      nearBeach: Boolean(filters?.nearBeach ?? fallback?.filters?.nearBeach ?? false),
      seaView: Boolean(filters?.seaView ?? fallback?.filters?.seaView ?? false),
      beachfront: Boolean(filters?.beachfront ?? fallback?.filters?.beachfront ?? false),
      poolPrivate: Boolean(filters?.poolPrivate ?? fallback?.filters?.poolPrivate ?? false),
      poolShared: Boolean(filters?.poolShared ?? fallback?.filters?.poolShared ?? false),
      parking: Boolean(filters?.parking ?? fallback?.filters?.parking ?? false),
    },
    reasoning: String(plan?.reasoning || fallback?.reasoning || "").trim().slice(0, 240),
  };
}

function buildFallbackPlan(input) {
  return {
    strategy: "catalog_search",
    sort: /moins cher|cheapest|prix/i.test(String(input?.userMessage || "")) ? "price_asc" : "price_asc",
    limit: 24,
    titleTerms: [],
    textTerms: [],
    zoneTerms: [],
    excludeTerms: [],
    filters: {
      floor: null,
      exactZoneOnly: false,
      nearBeach: false,
      seaView: false,
      beachfront: false,
      poolPrivate: false,
      poolShared: false,
      parking: false,
    },
    reasoning: "Fallback safe catalog search plan.",
  };
}

export async function planSqlPropertySearch(input) {
  const fallback = buildFallbackPlan(input);
  const payload = {
    version: 1,
    userMessage: String(input?.userMessage || "").trim(),
    language: String(input?.language || "").trim() || null,
    plannerAnswerMode: String(input?.plannerAnswerMode || "").trim() || null,
    constraints: input?.constraints || {},
  };
  const cacheKey = `chatbot:sql-plan:${createHash("sha1").update(stableStringify(payload)).digest("hex")}`;

  try {
    const cached = parseJsonSafe(await redis.get(cacheKey));
    if (cached) return normalizePlan(cached, fallback);
  } catch {
    // Ignore cache errors.
  }

  const prompt = `
You convert a rental request into a SAFE SQL search plan for a vacation rental catalog.
You must NOT generate raw SQL. Return JSON only.

Allowed output shape:
{
  "strategy": "catalog_search|reference_lookup",
  "sort": "price_asc|price_desc|relevance|newest",
  "limit": 24,
  "titleTerms": ["..."],
  "textTerms": ["..."],
  "zoneTerms": ["..."],
  "excludeTerms": ["..."],
  "filters": {
    "floor": "ground|first|second|null",
    "exactZoneOnly": false,
    "nearBeach": false,
    "seaView": false,
    "beachfront": false,
    "poolPrivate": false,
    "poolShared": false,
    "parking": false
  },
  "reasoning": "short explanation"
}

Rules:
- Think like a search engineer, not like a chat assistant.
- Capture what the client really wants to filter in database search.
- Use titleTerms/textTerms/zoneTerms for concepts that should help SQL filtering.
- Use filters.floor for requests like rdc, rez-de-chaussee, 1er etage.
- Use filters.beachfront / seaView / nearBeach / poolPrivate / poolShared / parking when the client asks for those comforts.
- Use sort price_asc for moins cher / cheapest and price_desc for plus cher / premium when relevant.
- If the user is asking for "other choices" or alternatives, keep strategy catalog_search and do not erase current constraints.
- Do not include personal data or any write operation.
- Never generate JOINs, UPDATEs, DELETEs, INSERTs, admin access, or sensitive tables.
- Prefer small, high-signal terms only.
- If uncertain, keep arrays empty instead of inventing.

CONTEXT:
${JSON.stringify(payload, null, 2)}
  `.trim();

  try {
    const completion = await withTimeout(
      openai.chat.completions.create({
        model: config.openaiChatModel,
        temperature: 0.1,
        messages: [
          { role: "system", content: "Return valid JSON only." },
          { role: "user", content: prompt },
        ],
      }),
      config.openaiTimeoutMs,
      "sql_search_planner"
    );
    const parsed = parseJsonSafe(completion.choices[0]?.message?.content || "");
    const normalized = normalizePlan(parsed || {}, fallback);
    try {
      await redis.set(cacheKey, JSON.stringify(normalized), "EX", 120);
    } catch {
      // Ignore cache write errors.
    }
    return normalized;
  } catch {
    return fallback;
  }
}
