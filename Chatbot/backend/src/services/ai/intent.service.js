import { openai } from "../../config/openai.js";
import { config } from "../../config/env.js";

const ALLOWED_LANGS = new Set(["fr", "en", "ar", "tn"]);

function normalizeLang(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw.startsWith("fr")) return "fr";
  if (raw.startsWith("en")) return "en";
  if (raw === "tn" || raw.includes("tunis")) return "tn";
  if (raw.startsWith("ar")) return "ar";
  return null;
}

function norm(v) {
  return String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function canonicalMainType(raw) {
  const s = norm(raw);
  if (!s) return null;
  if (s.includes("appartement") || /^s\+\d+/.test(s)) return "appartement";
  if (s.includes("villa") || s.includes("maison") || s.includes("bungalow")) return "villa_maison";
  if (s.includes("studio")) return "studio";
  if (s.includes("immeuble")) return "immeuble";
  return "autre";
}

function canonicalSubType(raw) {
  const s = norm(raw);
  if (!s) return null;
  const sPlus = s.match(/s\s*\+\s*(\d+)/);
  if (sPlus?.[1]) return `s+${sPlus[1]}`;
  const chambres = s.match(/(\d+)\s*chambre/);
  if (chambres?.[1]) return `s+${chambres[1]}`;
  return s;
}

function inferPreferencesFromText(text) {
  const s = norm(text);
  const out = new Set();
  if (/(pied dans l eau|front de mer|bord de mer|acces direct plage|pied dans l'eau)/.test(s)) out.add("beachfront");
  if (/(vue sur mer|vue mer|sea view|vista mer|vue_mer)/.test(s)) out.add("sea_view");
  if (/(proche plage|pres de la plage|a quelques pas de la plage|near beach)/.test(s)) out.add("near_beach");
  if (/(piscine|pool)/.test(s)) out.add("pool");
  if (/(parking|garage|car park)/.test(s)) out.add("parking");
  if (/\brdc\b|rez de chaussee|rez-de-chaussee/.test(s)) out.add("ground_floor");
  if (/1er etage|premier etage|1st floor/.test(s)) out.add("first_floor");
  return Array.from(out);
}

function extractBedroomsFromText(text) {
  const s = norm(text);
  const sPlus = s.match(/s\s*\+\s*(\d+)/);
  if (sPlus?.[1]) return Number(sPlus[1]);
  const chambres = s.match(/(\d{1,2})\s*chambres?/);
  if (chambres?.[1]) return Number(chambres[1]);
  return null;
}

function extractDatesFromText(text) {
  const s = String(text || "");
  const iso = [...s.matchAll(/\b(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\b/g)].map((m) => {
    const y = Number(m[1]);
    const mo = String(Number(m[2])).padStart(2, "0");
    const d = String(Number(m[3])).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  });
  if (iso.length >= 2) return { start: iso[0], end: iso[1] };
  return { start: null, end: null };
}

function extractGuestsFromText(text) {
  const s = norm(text);
  const m = s.match(/(\d{1,2})\s*(personnes?|people|guests?|personne)/);
  if (m?.[1]) return Number(m[1]);
  const m2 = s.match(/\b(\d{1,2})\b/);
  if (m2?.[1]) return Number(m2[1]);
  return null;
}

function extractBudgetFromText(text) {
  const s = norm(text);
  const m = s.match(/(?:budget|max|jusqu a|jusqua)\s*(\d{2,6})/);
  if (m?.[1]) return Number(m[1]);
  const tnd = s.match(/(\d{2,6})\s*(tnd|dt)/);
  if (tnd?.[1]) return Number(tnd[1]);
  return null;
}

function extractLocationFromText(text) {
  const s = String(text || "");
  const m = s.match(/(?:\b(?:a|in|fi)\b)\s+([A-Za-z\u0600-\u06FF\s'-]{3,40})/i);
  if (!m?.[1]) return null;
  return m[1].trim().replace(/\s{2,}/g, " ");
}

function sanitizeLocation(value) {
  let s = String(value || "").trim();
  if (!s) return null;
  s = s.replace(/\b(from|to|du|au|de|الى|من)\b.*$/i, "").trim();
  s = s.replace(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b.*$/i, "").trim();
  s = s.replace(/[.,;:!?]+$/g, "").trim();
  if (!s) return null;
  const normalized = s.toLowerCase();
  const aliasMap = [
    { ar: "\u0627\u0644\u0645\u0646\u0635\u0648\u0631\u0629", latin: "mansoura" },
    { ar: "\u0645\u0646\u0635\u0648\u0631\u0629", latin: "mansoura" },
    { ar: "\u0642\u0644\u064a\u0628\u064a\u0629", latin: "kelibia" },
    { ar: "\u0643\u0644\u064a\u0628\u064a\u0627", latin: "kelibia" },
    { ar: "\u0627\u0644\u0645\u0647\u062f\u064a\u0629", latin: "mahdia" },
    { ar: "\u0633\u0648\u0633\u0629", latin: "sousse" },
  ];
  for (const a of aliasMap) {
    if (normalized.includes(a.ar)) return a.latin;
  }
  return s;
}

export function detectLanguageFallback(text) {
  const msg = String(text || "").trim();
  if (!msg) return "fr";
  if (/[\u0600-\u06FF]/.test(msg)) return "ar";
  if (/\b(hello|hi|need|looking for|from|to|guests?)\b/i.test(msg)) return "en";
  return "fr";
}

export async function parseUserIntent(userMessage) {
  const prompt = `Extract JSON with keys: language, dates{start,end}, guests, budget, location, type, subType, preferences[], fullName, phone, intent.\nIf unknown keep null. Input: ${userMessage}`;

  const res = await openai.chat.completions.create({
    model: config.openaiChatModel,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: prompt }],
  });

  const parsed = JSON.parse(res.choices[0]?.message?.content || "{}");
  const aiLang = normalizeLang(parsed.language);
  const fallbackLang = detectLanguageFallback(userMessage);
  const chosenLang =
    !aiLang ? fallbackLang :
    (aiLang === "fr" && fallbackLang !== "fr" ? fallbackLang : aiLang);
  parsed.language = ALLOWED_LANGS.has(chosenLang) ? chosenLang : "fr";
  const inferredPrefs = inferPreferencesFromText(userMessage);
  const aiPrefs = Array.isArray(parsed.preferences) ? parsed.preferences.map((x) => norm(x)) : [];
  parsed.preferences = Array.from(new Set([...aiPrefs, ...inferredPrefs]));
  parsed.type = canonicalMainType(parsed.type || userMessage);
  parsed.subType = canonicalSubType(parsed.subType || parsed.type || "");
  const fallbackDates = extractDatesFromText(userMessage);
  const fallbackGuests = extractGuestsFromText(userMessage);
  const fallbackBudget = extractBudgetFromText(userMessage);
  const fallbackLocation = extractLocationFromText(userMessage);
  const fallbackBedrooms = extractBedroomsFromText(userMessage);
  parsed.dates = parsed.dates || {};
  parsed.dates.start = parsed?.dates?.start || fallbackDates.start || null;
  parsed.dates.end = parsed?.dates?.end || fallbackDates.end || null;
  parsed.guests = Number.isFinite(Number(parsed.guests)) ? Number(parsed.guests) : fallbackGuests;
  parsed.bedrooms = Number.isFinite(Number(parsed.bedrooms)) ? Number(parsed.bedrooms) : fallbackBedrooms;
  parsed.budget = Number.isFinite(Number(parsed.budget)) ? Number(parsed.budget) : fallbackBudget;
  parsed.location = sanitizeLocation(parsed.location || fallbackLocation || "");
  return parsed;
}
