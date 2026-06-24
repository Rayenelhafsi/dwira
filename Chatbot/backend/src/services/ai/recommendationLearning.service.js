import { prisma } from "../../config/prisma.js";
import { config } from "../../config/env.js";

const CACHE_TTL_MS = 30 * 1000;
const STOP_WORDS = new Set([
  "le", "la", "les", "de", "des", "du", "un", "une", "et", "ou", "au", "aux", "en", "sur",
  "pour", "avec", "dans", "par", "que", "qui", "est", "sont", "the", "and", "for", "with",
  "you", "your", "this", "that", "tn", "fr", "ar", "en", "eli", "ella", "mta3", "mte3",
  "fi", "fel", "men", "ila", "wala", "nheb", "n7eb", "chnowa", "chnw", "kifech", "fama",
]);

let cachedFeedbackRows = [];
let cachedAt = 0;

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function scoreFeedbackRow(row, messageTokens, language, state) {
  const questionTokens = new Set(tokenize(row?.question));
  const reasonTokens = new Set(tokenize(row?.reason));
  const correctedTokens = new Set(tokenize(row?.correctedAnswer));
  let score = 0;
  for (const token of messageTokens) {
    if (questionTokens.has(token)) score += 4;
    if (reasonTokens.has(token)) score += 2;
    if (correctedTokens.has(token)) score += 1;
  }
  if (language === "tn" && /tounsi|tn|dialect|messenger|naturel/i.test(String(row?.reason || ""))) score += 2;
  if (state && String(row?.reason || "").toLowerCase().includes(String(state || "").toLowerCase())) score += 1;
  return score;
}

function normalizeLooseText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, " ")
    .replace(/[^a-z0-9\u0600-\u06ff]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadFeedbackRows() {
  const now = Date.now();
  if (cachedAt && (now - cachedAt) < CACHE_TTL_MS) return cachedFeedbackRows;
  const rows = await prisma.feedbackLearning.findMany({
    where: {
      OR: [
        { correctedAnswer: { not: null } },
        { reason: { not: null } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: Math.max(10, config.replyCoachingCorpusSize),
  });
  cachedFeedbackRows = Array.isArray(rows) ? rows : [];
  cachedAt = now;
  return cachedFeedbackRows;
}

function selectMatchingRows(rows, messageTokens, language, state) {
  return rows
    .map((row) => ({ row, score: scoreFeedbackRow(row, messageTokens, language, state) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.row?.id || 0) - Number(a.row?.id || 0))
    .slice(0, Math.max(1, config.replyCoachingSelectionLimit))
    .map(({ row, score }) => ({ row, score }));
}

export async function getReplyCoachingDirectives({ userMessage, language, state }) {
  if (!config.replyCoachingEnabled) {
    return {
      matched: false,
      forcePropertyList: false,
      preferSearchLinkWhenMany: false,
      preferPropertyLinksWhenFew: false,
      propertyLinkThreshold: 3,
      matchedRows: [],
    };
  }
  const messageTokens = tokenize(userMessage);
  if (messageTokens.length === 0) {
    return {
      matched: false,
      forcePropertyList: false,
      preferSearchLinkWhenMany: false,
      preferPropertyLinksWhenFew: false,
      propertyLinkThreshold: 3,
      matchedRows: [],
    };
  }

  const rows = await loadFeedbackRows();
  if (!rows.length) {
    return {
      matched: false,
      forcePropertyList: false,
      preferSearchLinkWhenMany: false,
      preferPropertyLinksWhenFew: false,
      propertyLinkThreshold: 3,
      matchedRows: [],
    };
  }

  const matched = selectMatchingRows(rows, messageTokens, language, state);
  const directiveText = matched
    .map((entry) => `${String(entry.row?.correctedAnswer || "").trim()}\n${String(entry.row?.reason || "").trim()}`)
    .join("\n")
    .trim();
  const normalizedDirectiveText = normalizeLooseText(directiveText);
  const forcePropertyList = (
    normalizedDirectiveText.includes("pas les zones")
    || normalizedDirectiveText.includes("zone ne sont pas demandees")
    || normalizedDirectiveText.includes("zones ne sont pas demandees")
    || normalizedDirectiveText.includes("ce sont les biens")
    || normalizedDirectiveText.includes("liste des biens")
    || normalizedDirectiveText.includes("show properties")
    || normalizedDirectiveText.includes("property list")
  );
  const preferSearchLinkWhenMany = (
    normalizedDirectiveText.includes("envoyer un lien de recherche")
    || normalizedDirectiveText.includes("lien de recherche large")
    || normalizedDirectiveText.includes("filtered search link")
    || normalizedDirectiveText.includes("share search link")
  );
  const preferPropertyLinksWhenFew = (
    normalizedDirectiveText.includes("moins de 3 biens envoyer des liens de biens")
    || normalizedDirectiveText.includes("moins de 3 biens")
    || normalizedDirectiveText.includes("when you find less than 3")
    || normalizedDirectiveText.includes("include direct property links")
  );
  const thresholdMatch = normalizedDirectiveText.match(/moins de (\d+) biens|less than (\d+)/i);
  const propertyLinkThreshold = Math.max(
    1,
    Number(thresholdMatch?.[1] || thresholdMatch?.[2] || 3)
  );

  return {
    matched: matched.length > 0,
    forcePropertyList,
    preferSearchLinkWhenMany,
    preferPropertyLinksWhenFew,
    propertyLinkThreshold,
    matchedRows: matched.map((entry) => entry.row),
  };
}

export async function buildReplyCoachingContext({ userMessage, language, state }) {
  if (!config.replyCoachingEnabled) return "";
  const messageTokens = tokenize(userMessage);
  if (messageTokens.length === 0) return "";
  const rows = await loadFeedbackRows();
  if (!rows.length) return "";

  const selected = selectMatchingRows(rows, messageTokens, language, state).map(({ row }) => row);

  if (!selected.length) return "";

  return selected.map((row, index) => {
    const parts = [`HIGH_PRIORITY_EXAMPLE ${index + 1}`];
    if (String(row?.question || "").trim()) parts.push(`User case: ${String(row.question).trim()}`);
    if (String(row?.botAnswer || "").trim()) parts.push(`Weak answer to avoid: ${String(row.botAnswer).trim()}`);
    if (String(row?.correctedAnswer || "").trim()) parts.push(`Preferred answer style: ${String(row.correctedAnswer).trim()}`);
    if (String(row?.reason || "").trim()) parts.push(`Instruction: ${String(row.reason).trim()}`);
    return parts.join("\n");
  }).join("\n\n");
}

export function invalidateReplyCoachingCache() {
  cachedFeedbackRows = [];
  cachedAt = 0;
}
