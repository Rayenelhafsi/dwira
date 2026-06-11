import { createHash } from "node:crypto";
import { openai } from "../../config/openai.js";
import { config } from "../../config/env.js";
import { redis } from "../../config/redis.js";

const ALLOWED_ANSWER_MODES = new Set([
  "greeting",
  "zone_summary",
  "price_summary",
  "zone_price_summary",
  "property_list",
  "comparison",
  "booking",
  "status",
  "clarify",
]);

const ALLOWED_SEARCH_MODES = new Set([
  "none",
  "broad_discovery",
  "exact_then_alternatives",
  "reference_first",
  "zone_aggregation",
]);

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout`)), Math.max(1, ms))),
  ]);
}

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
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
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function canonicalAnswerMode(value) {
  const raw = norm(value);
  if (!raw) return null;
  if (ALLOWED_ANSWER_MODES.has(raw)) return raw;
  if (raw.includes("greet")) return "greeting";
  if (raw.includes("zone") && raw.includes("price")) return "zone_price_summary";
  if (raw.includes("zone")) return "zone_summary";
  if (raw.includes("price") || raw.includes("prix")) return "price_summary";
  if (raw.includes("book") || raw.includes("reserv")) return "booking";
  if (raw.includes("status")) return "status";
  if (raw.includes("clar")) return "clarify";
  return "property_list";
}

function canonicalSearchMode(value) {
  const raw = norm(value);
  if (!raw) return null;
  if (ALLOWED_SEARCH_MODES.has(raw)) return raw;
  if (raw.includes("reference")) return "reference_first";
  if (raw.includes("zone")) return "zone_aggregation";
  if (raw.includes("broad")) return "broad_discovery";
  if (raw.includes("alternative")) return "exact_then_alternatives";
  if (raw.includes("none")) return "none";
  return "exact_then_alternatives";
}

function toMissingFields(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
        .filter((item) => ["dates", "guests", "budget", "location", "property_reference", "identity", "phone"].includes(item))
    )
  );
}

function trimQuestion(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 240) : "";
}

function detectMessageAnswerMode(text, constraints = {}) {
  const s = norm(text);
  if (!s) return null;
  if (/(bonjour|bonsoir|sallem|slm|salem|hello|hi|ahla|marhbe|aslema|coucou|cc)\b/.test(s)) return "greeting";
  const asksZone = /(?:\bwin\b|\bou\b|\bwhere\b|anahi|fama win|zone|zones|quartier|quartiers)/.test(s);
  const asksPrice = /(?:price|prix|tarif|combien|b9adech|bqadech|9adech|9addech|soum|soumou)/.test(s);
  const asksList = /(?:\blist\b|liste|options?|show|montre|warri|warini|nchouf|nra|chnw\s+andek|chnowa\s+andek)/.test(s);
  const asksKnowledge = isGeneralInfoMessage(s);
  const hasSearchContext = hasMeaningfulSearchSignal(constraints);
  if (asksList && hasSearchContext) return "property_list";
  if (/^(w|et)\s+(soum|prix|price)\b/.test(s) && hasSearchContext) return "price_summary";
  if (/^(w|et)\s+(win|ou|where|zone|zones)\b/.test(s) && hasSearchContext) return "zone_summary";
  if (/^(w|et)\s+(kifeh|kifesh|paiement|payment|reservation|check-?in|check-?out|regle|regles)\b/.test(s)) return "clarify";
  if (asksZone && asksPrice) return "zone_price_summary";
  if (asksZone) return "zone_summary";
  if (asksPrice) return "price_summary";
  if (asksKnowledge) return "clarify";
  if (/(alternative|autre choix|autres choix|badel|badeli|ken ma famech|sinon|autre proposition|chnw\s*e5er|chnowa\s*e5er|e5er|ekher)/.test(s) && hasSearchContext) return "property_list";
  return null;
}

function detectSearchModeFromMessage(text, constraints = {}) {
  const s = norm(text);
  if (!s) return null;
  if (isGeneralInfoMessage(s)) return "none";
  if (/(?:\bref\b|reference|r?f?rence)/.test(s)) return "reference_first";
  if (/(?:\blist\b|liste|options?|show|montre|warri|warini|nchouf|nra|chnw\s+andek|chnowa\s+andek)/.test(s) && hasMeaningfulSearchSignal(constraints)) return "exact_then_alternatives";
  if (/(?:\bwin\b|\bou\b|\bwhere\b|anahi|fama win|zone|zones|quartier|quartiers)/.test(s)) return "zone_aggregation";
  if (/(alternative|autre choix|autres choix|badel|badeli|ken ma famech|sinon|autre proposition|chnw\s*e5er|chnowa\s*e5er|e5er|ekher)/.test(s) && hasMeaningfulSearchSignal(constraints)) return "exact_then_alternatives";
  return null;
}

function isGeneralInfoMessage(text) {
  return /(?:comment|kifeh|kifesh|chnowa|achno|policy|regle|regles|r[eè]gle|paiement|payment|reservation|reserver|booking|annulation|cancel|check-?in|check-?out|minimum nuit|minimum nuits|disponibilit[eé]|\bfaq\b)/i.test(String(text || ""));
}

function hasMeaningfulSearchSignal(constraints) {
  return Boolean(
    String(constraints?.location || "").trim()
    || (String(constraints?.type || "").trim() && String(constraints?.type || "").trim().toLowerCase() !== "autre")
    || (String(constraints?.subType || "").trim() && String(constraints?.subType || "").trim().toLowerCase() !== "autre")
    || (Number.isFinite(Number(constraints?.guests)) && Number(constraints.guests) > 0)
    || (Number.isFinite(Number(constraints?.budget)) && Number(constraints.budget) > 0)
    || (Array.isArray(constraints?.preferences) && constraints.preferences.length > 0)
  );
}

function reasoningFromPlan({ answerMode, searchMode, shouldSearch, shouldUseRag, hasSearchSignal, hasReference }) {
  if (answerMode === "greeting") return "Greeting only, no search needed.";
  if (answerMode === "clarify" && shouldUseRag) return "General information question routed to knowledge base without property search.";
  if (hasReference || searchMode === "reference_first") return "Specific property flow, reference-first search.";
  if (answerMode === "zone_summary") return shouldSearch ? "Zone-oriented request, aggregate matching zones from current search context." : "Zone-oriented request, but more search context is needed.";
  if (answerMode === "price_summary") return shouldSearch ? "Price-oriented request, search inventory and summarize pricing." : "Price-oriented request, but more search context is needed.";
  if (answerMode === "zone_price_summary") return shouldSearch ? "Combined zone and price request, search inventory and summarize both." : "Combined zone and price request, but more search context is needed.";
  if (answerMode === "property_list") {
    if (shouldSearch && hasSearchSignal) return "Property discovery request, search inventory and list matching options.";
    return "Property discovery request, but more search context is needed.";
  }
  if (answerMode === "status") return shouldUseRag ? "Status or process question answered from knowledge context." : "Status-oriented request.";
  if (answerMode === "booking") return "Booking-oriented request.";
  return "Conversation plan normalized from current user intent and context.";
}

function buildFallbackPlan(input) {
  const extracted = input?.extracted || {};
  const constraints = input?.constraints || {};
  const message = String(input?.userMessage || "");
  const messageMode = detectMessageAnswerMode(message, constraints);
  const responseMode = messageMode || canonicalAnswerMode(extracted.responseMode || "") || "property_list";
  const messageSearchMode = detectSearchModeFromMessage(message, constraints);
  const extractedGreeting = String(extracted.intent || "").trim().toLowerCase() === "greeting";
  const isGreeting = responseMode === "greeting" || (extractedGreeting && !messageMode);
  const hasReference = Boolean(String(extracted.propertyReference || "").trim());
  const infoLikeQuestion = isGeneralInfoMessage(message);
  const hasAnySearchSignal = hasMeaningfulSearchSignal(constraints);

  if (isGreeting) {
    return {
      message,
      constraints,
      userGoal: "greeting",
      answerMode: "greeting",
      searchMode: "none",
      shouldSearch: false,
      shouldUseRag: false,
      shouldAskClarification: false,
      missingFields: [],
      clarificationQuestion: "",
      reasoning: "Greeting only.",
    };
  }

  if (infoLikeQuestion && !hasReference && !hasAnySearchSignal) {
    return {
      message,
      constraints,
      userGoal: "general_info",
      answerMode: "clarify",
      searchMode: "none",
      shouldSearch: false,
      shouldUseRag: true,
      shouldAskClarification: false,
      missingFields: [],
      clarificationQuestion: "",
      reasoning: "General information or policy question.",
    };
  }

  if (hasReference) {
    return {
      message,
      constraints,
      userGoal: "specific_property",
      answerMode: responseMode === "status" ? "status" : responseMode,
      searchMode: "reference_first",
      shouldSearch: true,
      shouldUseRag: false,
      shouldAskClarification: false,
      missingFields: [],
      clarificationQuestion: "",
      reasoning: "Specific property reference detected.",
    };
  }

  if (responseMode === "zone_summary") {
    return {
      message,
      constraints,
      userGoal: "browse_zones",
      answerMode: "zone_summary",
      searchMode: messageSearchMode || "zone_aggregation",
      shouldSearch: hasAnySearchSignal,
      shouldUseRag: false,
      shouldAskClarification: !hasAnySearchSignal,
      missingFields: hasAnySearchSignal ? [] : ["location", "type"],
      clarificationQuestion: "",
      reasoning: "Zone discovery request.",
    };
  }

  if (responseMode === "price_summary" || responseMode === "zone_price_summary") {
    return {
      message,
      constraints,
      userGoal: "price_discovery",
      answerMode: responseMode,
      searchMode: messageSearchMode || (responseMode === "zone_price_summary" ? "zone_aggregation" : "exact_then_alternatives"),
      shouldSearch: hasAnySearchSignal,
      shouldUseRag: false,
      shouldAskClarification: !hasAnySearchSignal,
      missingFields: hasAnySearchSignal ? [] : ["location", "type"],
      clarificationQuestion: "",
      reasoning: "Price-oriented discovery request.",
    };
  }

  return {
    message,
    constraints,
    userGoal: "browse_properties",
    answerMode: responseMode,
    searchMode: messageSearchMode || "exact_then_alternatives",
    shouldSearch: hasAnySearchSignal,
    shouldUseRag: false,
    shouldAskClarification: !hasAnySearchSignal,
    missingFields: hasAnySearchSignal ? [] : ["location", "type"],
    clarificationQuestion: "",
    reasoning: "Fallback browse plan.",
  };
}

function normalizePlan(rawPlan, fallback) {
  const baseConstraints = rawPlan?.constraints || fallback?.constraints || {};
  const explicitMessageMode = detectMessageAnswerMode(rawPlan?.message || fallback?.message || "", baseConstraints);
  let answerMode = explicitMessageMode || canonicalAnswerMode(rawPlan?.answerMode) || fallback.answerMode;
  if (fallback.answerMode === "zone_price_summary" && answerMode !== "greeting" && answerMode !== "clarify") {
    answerMode = "zone_price_summary";
  } else if (fallback.answerMode === "zone_summary" && answerMode === "price_summary") {
    answerMode = "zone_summary";
  }
  const explicitSearchMode = detectSearchModeFromMessage(rawPlan?.message || fallback?.message || "", baseConstraints);
  const searchMode = explicitSearchMode || canonicalSearchMode(rawPlan?.searchMode) || fallback.searchMode;
  let shouldSearch = typeof rawPlan?.shouldSearch === "boolean" ? rawPlan.shouldSearch : fallback.shouldSearch;
  const shouldUseRag = typeof rawPlan?.shouldUseRag === "boolean" ? rawPlan.shouldUseRag : fallback.shouldUseRag;
  const shouldAskClarification =
    typeof rawPlan?.shouldAskClarification === "boolean"
      ? rawPlan.shouldAskClarification
      : fallback.shouldAskClarification;
  const infoLikeQuestion = isGeneralInfoMessage(rawPlan?.message || fallback?.message || "");
  const forceKnowledge = infoLikeQuestion && !hasMeaningfulSearchSignal(baseConstraints);
  if (explicitMessageMode && ["zone_summary", "price_summary", "zone_price_summary", "property_list"].includes(explicitMessageMode) && hasMeaningfulSearchSignal(baseConstraints)) {
    shouldSearch = true;
  }
  const userGoalFromMode =
    answerMode === "greeting" ? "greeting" :
    answerMode === "zone_summary" ? "browse_zones" :
    answerMode === "price_summary" || answerMode === "zone_price_summary" ? "price_discovery" :
    answerMode === "clarify" ? "general_info" :
    answerMode === "booking" ? "booking" :
    answerMode === "status" ? "status" :
    answerMode === "property_list" ? "browse_properties" :
    String(rawPlan?.userGoal || fallback.userGoal || "").trim().toLowerCase() || "browse_properties";
  const normalizedReasoning = reasoningFromPlan({
    answerMode: forceKnowledge ? "clarify" : answerMode,
    searchMode: forceKnowledge ? "none" : searchMode,
    shouldSearch: forceKnowledge ? false : shouldSearch,
    shouldUseRag: forceKnowledge ? true : shouldUseRag,
    hasSearchSignal: hasMeaningfulSearchSignal(baseConstraints),
    hasReference: Boolean(String(rawPlan?.propertyReference || rawPlan?.constraints?.propertyReference || fallback?.constraints?.propertyReference || "").trim()),
  });

  return {
    userGoal: userGoalFromMode,
    answerMode: forceKnowledge ? "clarify" : answerMode,
    searchMode: forceKnowledge ? "none" : searchMode,
    shouldSearch: forceKnowledge ? false : shouldSearch,
    shouldUseRag: forceKnowledge ? true : shouldUseRag,
    shouldAskClarification: forceKnowledge ? false : shouldAskClarification,
    missingFields: toMissingFields(rawPlan?.missingFields || fallback.missingFields),
    clarificationQuestion: trimQuestion(rawPlan?.clarificationQuestion || fallback.clarificationQuestion),
    reasoning: trimQuestion(normalizedReasoning || rawPlan?.reasoning || fallback.reasoning),
  };
}

export async function planConversationTurn(input) {
  const fallback = buildFallbackPlan(input);
  const forceKnowledgeRoute = isGeneralInfoMessage(input?.userMessage || "") && !hasMeaningfulSearchSignal(input?.constraints || {});
  const cachePayload = {
    plannerVersion: 3,
    userMessage: String(input?.userMessage || "").trim(),
    previousState: String(input?.previousState || "").trim() || null,
    extracted: input?.extracted || {},
    constraints: {
      location: input?.constraints?.location || null,
      type: input?.constraints?.type || null,
      subType: input?.constraints?.subType || null,
      guests: input?.constraints?.guests || null,
      budget: input?.constraints?.budget || null,
      startDate: input?.constraints?.startDate || null,
      endDate: input?.constraints?.endDate || null,
      preferences: Array.isArray(input?.constraints?.preferences) ? input.constraints.preferences : [],
      propertyReference: input?.extracted?.propertyReference || null,
    },
  };
  const cacheKey = `chatbot:planner:${createHash("sha1").update(stableStringify(cachePayload)).digest("hex")}`;

  try {
    const cachedRaw = await redis.get(cacheKey);
    const cached = parseJsonSafe(cachedRaw);
    if (cached) {
      const normalized = normalizePlan(cached, fallback);
      return forceKnowledgeRoute
        ? { ...normalized, userGoal: "general_info", answerMode: "clarify", searchMode: "none", shouldSearch: false, shouldUseRag: true, shouldAskClarification: false }
        : normalized;
    }
  } catch {
    // Ignore cache read errors.
  }

  const prompt = `
You are planning the next action for a vacation-rental chatbot.
Your job is to decide how the assistant should interpret the user need, what type of database search should run, and whether clarification is needed.

Return ONLY valid JSON with this exact shape:
{
  "userGoal": "greeting|browse_zones|price_discovery|browse_properties|specific_property|booking|status|smalltalk",
  "answerMode": "greeting|zone_summary|price_summary|zone_price_summary|property_list|comparison|booking|status|clarify",
  "searchMode": "none|broad_discovery|exact_then_alternatives|reference_first|zone_aggregation",
  "shouldSearch": true,
  "shouldUseRag": false,
  "shouldAskClarification": false,
  "missingFields": ["dates","guests","budget","location","property_reference","identity","phone"],
  "clarificationQuestion": "",
  "reasoning": "short internal summary"
}

Rules:
- Be pragmatic. Do not ask for missing fields if the question can already be answered approximately from current inventory.
- If the user asks for zones, set answerMode "zone_summary" and searchMode "zone_aggregation".
- If the user asks for prices, set answerMode "price_summary" unless they explicitly also want zones.
- If the user asks both zones and prices, set answerMode "zone_price_summary".
- If the user provides a property reference or clearly asks about one precise property, set searchMode "reference_first".
- If the message is just a greeting or social opener with no rental need, set answerMode "greeting" and searchMode "none".
- If the user asks how reservation, payment, cancellation, availability rules, stay rules, check-in, check-out, or chatbot behavior works in general, prefer shouldUseRag true and searchMode "none".
- Use clarification only when the request is too ambiguous to answer usefully.
- shouldUseRag should be true only for knowledge/policy/general-info questions, not normal property search.
- clarificationQuestion must be in the same language/style as the user, short and natural.

CURRENT STRUCTURED CONTEXT:
${JSON.stringify(cachePayload, null, 2)}
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
      "conversation_planner"
    );
    const content = completion.choices[0]?.message?.content || "";
    const parsed = parseJsonSafe(content);
    const normalized = normalizePlan(parsed || {}, fallback);
    try {
      await redis.set(cacheKey, JSON.stringify(normalized), "EX", 120);
    } catch {
      // Ignore cache write errors.
    }
    return forceKnowledgeRoute
      ? { ...normalized, userGoal: "general_info", answerMode: "clarify", searchMode: "none", shouldSearch: false, shouldUseRag: true, shouldAskClarification: false }
      : normalized;
  } catch {
    return forceKnowledgeRoute
      ? { ...fallback, userGoal: "general_info", answerMode: "clarify", searchMode: "none", shouldSearch: false, shouldUseRag: true, shouldAskClarification: false }
      : fallback;
  }
}
