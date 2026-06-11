import { openai } from "../../config/openai.js";
import { config } from "../../config/env.js";

const ALLOWED_LANGS = new Set(["fr", "en", "ar", "tn"]);

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout`)), Math.max(1, ms))),
  ]);
}

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
  if (s.includes("appartement") || /\bs\s*\+\s*\d+/.test(s)) return "appartement";
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
  if (["studio", "duplex", "triplex", "bungalow"].includes(s)) return s;
  return null;
}

function canonicalResponseMode(raw) {
  const s = norm(raw);
  if (!s) return null;
  if (/(greeting|salutation|social|hello)/.test(s)) return "greeting";
  if (/(zone|zones|quartier|quartiers|where|win|ou|anahi|fama win)/.test(s) && /(price|prix|tarif|combien|b9adech|bqadech|9adech|9addech|soum|soumou)/.test(s)) return "zone_price_summary";
  if (/(zone|zones|quartier|quartiers|where|win|ou|anahi|fama win)/.test(s)) return "zone_summary";
  if (/(price|prix|tarif|combien|b9adech|bqadech|9adech|9addech|soum|soumou)/.test(s)) return "price_summary";
  if (/(compare|comparaison)/.test(s)) return "comparison";
  if (/(reserve|booking|book|reservation)/.test(s)) return "booking";
  if (/(status|statut|etat)/.test(s)) return "status";
  if (/(list|liste|options|show|montre|warri|warini|nchouf|nra)/.test(s)) return "property_list";
  return "property_list";
}

function inferPreferencesFromText(text) {
  const s = norm(text);
  const out = new Set();
  if (/(pied dans l eau|front de mer|bord de mer|acces direct plage|pied dans l'eau)/.test(s)) out.add("beachfront");
  if (/(vue sur mer|vue mer|sea view|vista mer|vue_mer)/.test(s)) out.add("sea_view");
  if (/(proche plage|pres de la plage|a quelques pas de la plage|near beach)/.test(s)) out.add("near_beach");
  if (/(piscine privee|piscine prive|private pool)/.test(s)) {
    out.add("pool");
    out.add("pool_private");
  }
  if (/(piscine partagee|piscine partage|piscine commune|piscine collective|shared pool)/.test(s)) {
    out.add("pool");
    out.add("pool_shared");
  }
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

function inferYearForMonthDay(monthIndex, day) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const candidate = new Date(currentYear, monthIndex - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (Number.isNaN(candidate.getTime())) return currentYear;
  return candidate < today ? currentYear + 1 : currentYear;
}

function formatLocalIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeChronologicalDateRange(start, end) {
  if (!start || !end) return { start, end };
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return { start, end };
  if (endDate >= startDate) return { start, end };
  const repairedEnd = new Date(endDate);
  repairedEnd.setFullYear(startDate.getFullYear());
  const repairedSameYear = formatLocalIsoDate(repairedEnd);
  if (repairedEnd >= startDate) {
    return {
      start,
      end: repairedSameYear || end,
    };
  }
  repairedEnd.setFullYear(startDate.getFullYear() + 1);
  const repairedNextYear = formatLocalIsoDate(repairedEnd);
  return {
    start,
    end: repairedNextYear || end,
  };
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
  if (iso.length === 1) return { start: iso[0], end: null };

  const dmy = [...s.matchAll(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/g)].map((m) => {
    const d = String(Number(m[1])).padStart(2, "0");
    const mo = String(Number(m[2])).padStart(2, "0");
    const y = Number(m[3]);
    return `${y}-${mo}-${d}`;
  });
  if (dmy.length >= 2) return { start: dmy[0], end: dmy[1] };
  if (dmy.length === 1) return { start: dmy[0], end: null };

  const monthMap = new Map([
    ["janvier", 1], ["janv", 1], ["january", 1],
    ["fevrier", 2], ["fevr", 2], ["fev", 2], ["february", 2], ["feb", 2],
    ["mars", 3], ["march", 3],
    ["avril", 4], ["avr", 4], ["april", 4], ["apr", 4],
    ["mai", 5], ["may", 5],
    ["juin", 6], ["june", 6],
    ["juillet", 7], ["juil", 7], ["july", 7],
    ["aout", 8], ["august", 8], ["aug", 8],
    ["septembre", 9], ["sept", 9], ["september", 9],
    ["octobre", 10], ["oct", 10], ["october", 10],
    ["novembre", 11], ["nov", 11], ["november", 11],
    ["decembre", 12], ["dec", 12], ["december", 12],
  ]);
  const normalized = norm(s);
  const sharedMonthRange = normalized.match(/\b(?:min|men|du|de|from)?\s*(\d{1,2})\s*(?:lil|lel|ila|il|to|au|-|jusqua|jusqu'a)\s*(\d{1,2})\s+(janvier|janv|january|fevrier|fevr|fev|february|feb|mars|march|avril|avr|april|apr|mai|may|juin|june|juillet|juil|july|aout|august|aug|septembre|sept|september|octobre|oct|october|novembre|nov|november|decembre|dec|december)(?:\s+(20\d{2}))?\b/i);
  if (sharedMonthRange) {
    const startDay = Number(sharedMonthRange[1]);
    const endDay = Number(sharedMonthRange[2]);
    const month = monthMap.get(String(sharedMonthRange[3] || "").toLowerCase());
    const explicitYear = sharedMonthRange[4] ? Number(sharedMonthRange[4]) : null;
    if (month && startDay && endDay) {
      const startYear = explicitYear || inferYearForMonthDay(month, startDay);
      const endYear = explicitYear || startYear;
      return normalizeChronologicalDateRange(
        `${startYear}-${String(month).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`,
        `${endYear}-${String(month).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`
      );
    }
  }
  const textualDates = [...normalized.matchAll(/\b(\d{1,2})\s+(janvier|janv|january|fevrier|fevr|fev|february|feb|mars|march|avril|avr|april|apr|mai|may|juin|june|juillet|juil|july|aout|august|aug|septembre|sept|september|octobre|oct|october|novembre|nov|november|decembre|dec|december)(?:\s+(20\d{2}))?\b/g)]
    .map((m) => {
      const day = Number(m[1]);
      const month = monthMap.get(m[2]);
      const year = m[3] ? Number(m[3]) : inferYearForMonthDay(month, day);
      if (!month || !day) return null;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    })
    .filter(Boolean);
  if (textualDates.length >= 2) return normalizeChronologicalDateRange(textualDates[0], textualDates[1]);
  if (textualDates.length === 1) return { start: textualDates[0], end: null };

  return { start: null, end: null };
}

function hasExplicitYearInText(text) {
  return /\b20\d{2}\b/.test(String(text || ""));
}

function extractGuestsFromText(text) {
  const s = norm(text);
  const m = s.match(/(\d{1,2})\s*(personnes?|people|guests?|personne|voyageurs?|adultes?|enfants?)/);
  if (m?.[1]) return Number(m[1]);
  const m2 = s.match(/\b(nous sommes|on est|we are)\s+(\d{1,2})\b/);
  if (m2?.[2]) return Number(m2[2]);
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

function extractPropertyReferenceFromText(text) {
  const raw = String(text || "");
  const explicit = raw.match(/\bref(?:erence)?\s*[:#-]?\s*([a-z0-9-]{2,30})\b/i);
  if (explicit?.[1]) return String(explicit[1]).trim();
  const compact = raw.match(/\bREF[\s-]?\d{2,10}\b/i);
  if (compact?.[0]) return compact[0].trim();
  return null;
}

function extractLocationFromText(text) {
  const s = String(text || "");
  const m = s.match(/(?:\b(?:a|in|fi)\b)\s+([A-Za-z\u0600-\u06FF\s'-]{3,40})/i);
  if (!m?.[1]) return null;
  return m[1].trim().replace(/\s{2,}/g, " ");
}

function extractSpecificLocationHint(text) {
  const raw = String(text || "");
  const normalized = norm(raw)
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const knownZones = [
    "petit paris",
    "dar chabeb",
    "fatha",
    "ain grenz",
    "sidi mansoura",
    "mansoura",
    "kelibia la blanche",
    "rejiche",
    "dar allouche",
    "ezzahra",
    "mrezga",
    "dherwa",
    "corniche plage mahdia",
    "chat mariem",
  ];
  const knownCities = [
    "kelibia",
    "mahdia",
    "hammamet",
    "sousse",
    "nabeul",
    "dar allouche",
    "rejiche",
  ];

  const matchedZone = knownZones
    .filter((zone) => normalized.includes(zone))
    .sort((a, b) => b.length - a.length)[0];
  if (!matchedZone) return null;

  const matchedCity = knownCities
    .filter((city) => city !== matchedZone && normalized.includes(city))
    .sort((a, b) => b.length - a.length)[0];

  if (matchedCity && !matchedZone.includes(matchedCity)) {
    return `${matchedZone}, ${matchedCity}`;
  }
  return matchedZone;
}

function inferIntentLabel(text) {
  const s = norm(text);
  if (!s) return "info";
  if (/(bonjour|bonsoir|sallem|slm|salem|aslema|aslama|3aslema|hello|hi|ahla|marhbe)/.test(s)) return "greeting";
  if (/(reserve|booking|book|nheb n7ajjez|hajz)/.test(s)) return "booking";
  if (/(status|statut|etat|7alet|halet)/.test(s)) return "status";
  return "search_property";
}

function hasIdentityPayload(text) {
  return /\b(full name|name is|nom|prenom|ismi|esmi|esmii|tel|telephone|phone|portable|gsm|cin|carte\s*d'?identite|identity\s*card|photo\s*cin|email|adresse|address)\b/i.test(String(text || ""));
}

function buildFallbackIntent(userMessage) {
  const fallbackDates = extractDatesFromText(userMessage);
  const fallbackGuests = extractGuestsFromText(userMessage);
  const fallbackBudget = extractBudgetFromText(userMessage);
  const fallbackLocation = extractLocationFromText(userMessage);
  const specificLocationHint = extractSpecificLocationHint(userMessage);
  const fallbackBedrooms = extractBedroomsFromText(userMessage);
  const fallbackPropertyReference = extractPropertyReferenceFromText(userMessage);
  return {
    language: detectLanguageFallback(userMessage),
    dates: {
      start: fallbackDates.start || null,
      end: fallbackDates.end || null,
    },
    guests: fallbackGuests,
    budget: fallbackBudget,
    location: sanitizeLocation(specificLocationHint || fallbackLocation || ""),
    type: canonicalMainType(userMessage),
    subType: canonicalSubType(userMessage),
    bedrooms: fallbackBedrooms,
    preferences: inferPreferencesFromText(userMessage),
    fullName: null,
    phone: null,
    propertyReference: String(fallbackPropertyReference || "").trim() || null,
    intent: inferIntentLabel(userMessage),
    responseMode: inferResponseModeFromText(userMessage),
  };
}

function inferResponseModeFromText(text) {
  const s = norm(text);
  if (inferIntentLabel(text) === "greeting") return "greeting";
  if (/(comment|kifeh|kifesh|chnowa|achno|policy|regle|regles|r[eè]gle|paiement|payment|reservation|reserver|booking|annulation|cancel|check-?in|check-?out|minimum nuit|minimum nuits|disponibilit[eé]|\bfaq\b)/.test(s)) return "clarify";
  if (/(win|where|ou|anahi|zone|zones|quartier|quartiers)/.test(s) && /(price|prix|tarif|combien|b9adech|bqadech|9adech|9addech|soum|soumou)/.test(s)) return "zone_price_summary";
  if (/(win|where|ou|anahi|zone|zones|quartier|quartiers)/.test(s)) return "zone_summary";
  if (/(price|prix|tarif|combien|b9adech|bqadech|9adech|9addech|soum|soumou)/.test(s)) return "price_summary";
  return "property_list";
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

function isTunisianLatinizedText(text) {
  const msg = norm(text)
    .replace(/\s+/g, " ")
    .trim();
  if (!msg) return false;
  const markers = [
    "sallem", "slm", "salam", "aslema", "aslama", "3aslema", "ahla", "ahlan", "marhbe", "mar7be", "marhaba",
    "chnia", "chniaa", "chnowa", "chnw", "chno", "ach", "ash",
    "b9adech", "bqadech", "9adech", "9addech", "soum", "soumou",
    "nheb", "n7eb", "nhab", "habet", "heb", "brabi", "brabbi",
    "fama", "famach", "andkom", "3andkom", "andi", "3andi",
    "win", "winek", "kifeh", "kifesh", "labes", "lebes", "behi", "behy",
    "yesser", "barsha", "barcha", "tawa", "hakka", "haka", "mouch", "mech",
    "warini", "warri", "hab nra", "nra", "nchouf", "mta3"
  ];
  return markers.some((token) => msg.includes(token));
}

export function detectLanguageFallback(text) {
  const msg = String(text || "").trim();
  if (!msg) return "fr";
  if (/[\u0600-\u06FF]/.test(msg)) return "ar";
  if (isTunisianLatinizedText(msg)) return "tn";
  if (/\b(hello|hi|need|looking for|from|to|guests?)\b/i.test(msg)) return "en";
  return "fr";
}

export async function parseUserIntent(userMessage) {
  const prompt = `
Extract booking intent as strict JSON with keys:
language, dates{start,end}, guests, budget, location, type, subType, bedrooms, preferences[], fullName, phone, propertyReference, intent, responseMode.

Rules:
- Supported language codes: fr, en, ar, tn.
- Use "tn" when the user writes Tunisian dialect in Latin/Facebook style like: sallem, chnowa, nheb, brabi, 3andi, fama.
- Understand Tunisian Arabic written with Latin letters and digits like 3, 7, 9.
- Keep unknown values as null.
- Normalize subtype like s+1, s+2, s+3 when implied.
- Put a requested property reference like REF-234 in propertyReference, not in phone.
- preferences can include: sea_view, near_beach, beachfront, pool, pool_private, pool_shared, parking, ground_floor, first_floor.
- intent should be one short label like search_property, booking, greeting, status, info.
- responseMode should be one of: greeting, zone_summary, price_summary, zone_price_summary, property_list, comparison, booking, status, clarify.
- If the message is mainly a greeting, a polite opener, or social contact with no concrete search request yet, choose intent "greeting" and responseMode "greeting".
- Do not force a search mode for messages like bonjour, sallem, aslema, ahla, cc, coucou, marhbe, or similar variants and spellings.
- If the user asks where / in which zones properties exist, choose zone_summary even if a property type is present.
- If the user asks about price level like "b9adech s+2" or "prix des villas", choose price_summary.
- If the user asks both where and price in the same request, choose zone_price_summary.
- If the user asks how reservation, payment, cancellation, stay rules, check-in/check-out, minimum nights, or chatbot behavior works in general, choose intent "info" and responseMode "clarify".

Input:
${userMessage}`.trim();

  let parsed = {};
  try {
    const res = await withTimeout(
      openai.chat.completions.create({
        model: config.openaiChatModel,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
      config.openaiTimeoutMs,
      "intent"
    );
    parsed = JSON.parse(res.choices[0]?.message?.content || "{}");
  } catch {
    parsed = buildFallbackIntent(userMessage);
  }
  const aiLang = normalizeLang(parsed.language);
  const fallbackLang = detectLanguageFallback(userMessage);
  const hasTunisianLatinizedMarkers = isTunisianLatinizedText(userMessage);
  const chosenLang =
    !aiLang ? fallbackLang :
    (aiLang === "tn" && !hasTunisianLatinizedMarkers && fallbackLang !== "tn") ? fallbackLang :
    (aiLang === "fr" && fallbackLang !== "fr" ? fallbackLang : aiLang);
  parsed.language = ALLOWED_LANGS.has(chosenLang) ? chosenLang : "fr";
  const inferredPrefs = inferPreferencesFromText(userMessage);
  const aiPrefs = Array.isArray(parsed.preferences) ? parsed.preferences.map((x) => norm(x)) : [];
  parsed.preferences = Array.from(new Set([...aiPrefs, ...inferredPrefs]));
  parsed.type = canonicalMainType(parsed.type || userMessage);
  parsed.subType = canonicalSubType(parsed.subType || parsed.type || "");
  const inferredResponseMode = inferResponseModeFromText(userMessage);
  const aiResponseMode = canonicalResponseMode(parsed.responseMode || "");
  parsed.responseMode =
    String(parsed.intent || "").trim().toLowerCase() === "greeting"
      ? "greeting"
      : inferredResponseMode === "clarify"
        ? "clarify"
      : inferredResponseMode === "zone_price_summary"
        ? "zone_price_summary"
        : canonicalResponseMode(aiResponseMode || inferredResponseMode || "property_list");
  const fallbackDates = extractDatesFromText(userMessage);
  const fallbackGuests = extractGuestsFromText(userMessage);
  const fallbackBudget = extractBudgetFromText(userMessage);
  const fallbackLocation = extractLocationFromText(userMessage);
  const specificLocationHint = extractSpecificLocationHint(userMessage);
  const fallbackBedrooms = extractBedroomsFromText(userMessage);
  const fallbackPropertyReference = extractPropertyReferenceFromText(userMessage);
  parsed.dates = parsed.dates || {};
  const explicitYear = hasExplicitYearInText(userMessage);
  parsed.dates.start = (!explicitYear && fallbackDates.start) ? fallbackDates.start : (parsed?.dates?.start || fallbackDates.start || null);
  parsed.dates.end = (!explicitYear && fallbackDates.end) ? fallbackDates.end : (parsed?.dates?.end || fallbackDates.end || null);
  parsed.guests = Number.isFinite(Number(parsed.guests)) ? Number(parsed.guests) : fallbackGuests;
  parsed.bedrooms = Number.isFinite(Number(parsed.bedrooms)) ? Number(parsed.bedrooms) : fallbackBedrooms;
  parsed.budget = Number.isFinite(Number(parsed.budget)) ? Number(parsed.budget) : fallbackBudget;
  parsed.phone = /^\+?\d[\d\s-]{6,}\d$/.test(String(parsed.phone || "").trim()) ? String(parsed.phone || "").trim() : null;
  parsed.propertyReference = String(parsed.propertyReference || fallbackPropertyReference || "").trim() || null;
  const aiLocation = sanitizeLocation(parsed.location || "");
  const fallbackSanitizedLocation = sanitizeLocation(specificLocationHint || fallbackLocation || "");
  parsed.location =
    fallbackSanitizedLocation && (
      !aiLocation
      || norm(aiLocation) === "kelibia"
      || norm(aiLocation) === "mahdia"
      || norm(aiLocation) === "hammamet"
      || norm(aiLocation) === "sousse"
      || norm(aiLocation).length < norm(fallbackSanitizedLocation).length
    )
      ? fallbackSanitizedLocation
      : aiLocation;
  const carriesBookingData = Boolean(
    parsed.propertyReference
    || parsed.fullName
    || parsed.phone
    || parsed.dates?.start
    || parsed.dates?.end
    || (Number.isFinite(Number(parsed.guests)) && Number(parsed.guests) > 0)
    || hasIdentityPayload(userMessage)
  );
  if (carriesBookingData && String(parsed.intent || "").trim().toLowerCase() === "greeting") {
    parsed.intent = "booking";
  }
  if (carriesBookingData && String(parsed.responseMode || "").trim().toLowerCase() === "greeting") {
    parsed.responseMode = "booking";
  }
  return parsed;
}
