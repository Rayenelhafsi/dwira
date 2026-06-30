import { redis } from "../config/redis.js";
import { prisma } from "../config/prisma.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { parseUserIntent } from "./ai/intent.service.js";
import { sendMetaMessage } from "./meta/sender.service.js";
import { runCustomerAgentTurn } from "./agent/customerAgent.service.js";
import { STATES } from "./stateMachine.js";

const CONTEXT_TTL_SEC = 60 * 60 * 24;
const WEBSITE_BASE_URL = String(process.env.WEBSITE_BASE_URL || "https://www.dwiraimmobilier.com").replace(/\/+$/, "");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHATBOT_MEDIA_DIR = path.resolve(__dirname, "..", "..", "uploads", "chatbot-media");
const LOCAL_SITE_CHATBOT_MEDIA_DIR = path.resolve(__dirname, "..", "..", "..", "..", "public", "chatbot-media");

function parseDate(value) {
  const text = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}

function isMeaningfulValue(value) {
  const text = String(value || "").trim().toLowerCase();
  return Boolean(text && text !== "autre" && text !== "other" && text !== "unknown" && text !== "auto");
}

function hasTunisianDialectMarkers(value) {
  const text = String(value || "").toLowerCase();
  if (!text.trim()) return false;
  return [
    "aslema", "aslama", "sallem", "salam", "marhbe", "mar7be", "ahla",
    "chnw", "chnowa", "chno", "win", "nheb", "n7eb", "brabi", "fama",
    "bch", "tawa", "mouch", "9adech", "b9adech", "warini", "warri",
    "najem", "naawnouk", "kifech", "kifesh", "3lech", "3andi", "andek",
  ].some((marker) => text.includes(marker));
}

function resolveConversationLanguage(baseLanguage, extractedLanguage, rawMessage) {
  const base = String(baseLanguage || "").trim().toLowerCase();
  const extracted = String(extractedLanguage || "").trim().toLowerCase();
  const message = String(rawMessage || "").trim();
  if (hasTunisianDialectMarkers(message)) return "tn";
  if (base === "tn" && !/[\u0600-\u06FF]/.test(message) && extracted !== "en") return "tn";
  if (isMeaningfulValue(extracted)) return extracted;
  if (isMeaningfulValue(base)) return base;
  return "fr";
}

function extractTunisianWordNumber(text) {
  const source = String(text || "").toLowerCase();
  if (!source.trim()) return null;
  if (/\b(wa7ed|wahd|wahed)\b/.test(source)) return 1;
  if (/\b(lzouz|zouz|zouz|jouj)\b/.test(source)) return 2;
  if (/\b(thletha|thalatha|tlata|thlatha)\b/.test(source)) return 3;
  if (/\b(arba3a|arbaa|rb3a)\b/.test(source)) return 4;
  if (/\b(khamsa|khmsa)\b/.test(source)) return 5;
  return null;
}

function extractGuestBreakdownFromMessage(message) {
  const text = String(message || "").toLowerCase();
  if (!text.trim()) return { adults: null, children: null };
  const adultsMatch = text.match(/(\d{1,2})\s*(adultes?|adults?)/i);
  const childrenMatch = text.match(/(\d{1,2})\s*(enfants?|kids?|children|child)/i);
  const fallbackAdults = extractTunisianWordNumber(text);
  return {
    adults: adultsMatch?.[1] ? Number(adultsMatch[1]) : fallbackAdults,
    children: childrenMatch?.[1] ? Number(childrenMatch[1]) : null,
  };
}

function normalizeConversationContext(existing, extracted, rawMessage = "") {
  const base = existing || {};
  const extractedGuests = Number(extracted?.guests);
  const extractedBudget = Number(extracted?.budget);
  const messageGuestBreakdown = extractGuestBreakdownFromMessage(rawMessage);
  const adultGuests = Number.isFinite(messageGuestBreakdown.adults)
    ? messageGuestBreakdown.adults
    : (Number.isFinite(Number(base.adultGuests)) ? Number(base.adultGuests) : null);
  const childGuests = Number.isFinite(messageGuestBreakdown.children)
    ? messageGuestBreakdown.children
    : (Number.isFinite(Number(base.childGuests)) ? Number(base.childGuests) : 0);
  const guests = Number.isFinite(extractedGuests) && extractedGuests > 0
    ? extractedGuests
    : (Number.isFinite(adultGuests) && adultGuests > 0 ? adultGuests + Math.max(0, childGuests) : base.guests || null);

  return {
    startDate: parseDate(extracted?.dates?.start) || base.startDate || null,
    endDate: parseDate(extracted?.dates?.end) || base.endDate || null,
    guests,
    adultGuests: Number.isFinite(adultGuests) && adultGuests > 0 ? adultGuests : null,
    childGuests: Number.isFinite(childGuests) && childGuests >= 0 ? childGuests : 0,
    budget: Number.isFinite(extractedBudget) && extractedBudget > 0 ? extractedBudget : base.budget || null,
    location: String(extracted?.location || base.location || "").trim() || null,
    type: (
      isMeaningfulValue(extracted?.type)
        ? String(extracted.type).trim().toLowerCase()
        : String(base.type || "").trim().toLowerCase()
    ) || null,
    subType: (
      isMeaningfulValue(extracted?.subType)
        ? String(extracted.subType).trim().toLowerCase()
        : String(base.subType || "").trim().toLowerCase()
    ) || null,
    bedrooms: Number.isFinite(Number(extracted?.bedrooms)) && Number(extracted.bedrooms) > 0 ? Number(extracted.bedrooms) : base.bedrooms || null,
    floor: String(base.floor || "").trim().toLowerCase() || null,
    preferences: Array.from(new Set([...(Array.isArray(base.preferences) ? base.preferences : []), ...(Array.isArray(extracted?.preferences) ? extracted.preferences : [])])),
    rawRequestText: String(rawMessage || "").trim() || String(base.rawRequestText || "").trim() || null,
    language: resolveConversationLanguage(base.language, extracted?.language, rawMessage),
    selectedPropertyId: base.selectedPropertyId ?? null,
    selectedPropertyRef: String(extracted?.propertyReference || base.selectedPropertyRef || "").trim() || null,
    reservationDemandId: String(base.reservationDemandId || "").trim() || null,
    profile: {
      fullName: String(base?.profile?.fullName || "").trim() || null,
      phone: String(base?.profile?.phone || "").trim() || null,
      email: String(base?.profile?.email || "").trim() || null,
      address: String(base?.profile?.address || "").trim() || null,
      identityNumber: String(base?.profile?.identityNumber || "").trim() || null,
      identityImageUrl: String(base?.profile?.identityImageUrl || "").trim() || null,
    },
    payment: {
      method: String(base?.payment?.method || "").trim() || null,
      receiptProvided: Boolean(base?.payment?.receiptProvided),
    },
    browse: {
      shownOptionIds: Array.isArray(base?.browse?.shownOptionIds) ? base.browse.shownOptionIds.map((item) => String(item)) : [],
      lastShownCount: Number.isFinite(Number(base?.browse?.lastShownCount)) ? Number(base.browse.lastShownCount) : 0,
      lastOptions: Array.isArray(base?.browse?.lastOptions) ? base.browse.lastOptions : [],
    },
  };
}

function extractIdentity(message) {
  const text = String(message || "").trim();
  const hasIdentityCue = /\b(my name is|name is|full name|nom|prenom|phone|telephone|tel|numero|portable|gsm|tlf|ismi|esmi|esmii|ism|carte\s*d'?identite|cin|identity\s*card|id\s*card|email|adresse|address|photo\s*cin)\b/i.test(text);
  if (!hasIdentityCue) return { fullName: null, phone: null, email: null, address: null, identityNumber: null, identityImageUrl: null };
  const phoneMatch = text.match(/(\+?\d[\d\s.-]{7,}\d)/);
  const phone = phoneMatch ? normalizePhone(phoneMatch[1]) : null;
  const emailMatch = text.match(/\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/i);
  const identityMatch = text.match(/(?:carte\s*d'?identite|cin\b|c\.?i\.?n\b|identity\s*card|id\s*card|numero\s*d'?identite)\s*[:#-]?\s*([a-z0-9]{5,20})/i);
  const imageUrlMatch = text.match(/\b(https?:\/\/\S+\.(?:png|jpe?g|webp|gif|bmp))\b/i);
  const addressMatch = text.match(/(?:adresse|address)\s*[:\-]?\s*(.+)$/i);
  const namePatterns = [
    /(?:my\s+(?:full\s+)?name\s+is|name\s+is)\s*[:\-]?\s*(.+?)(?:\s+(?:phone|telephone|tel|numero|cin|email|adresse|address)\b|$)/i,
    /(?:nom|prenom)\s*[:\-]?\s*(.+?)(?:\s+(?:phone|telephone|tel|numero|cin|email|adresse|address)\b|$)/i,
    /(?:ismi|esmi|esmii|ism)\s*[:\-]?\s*(.+?)(?:\s+(?:phone|telephone|tel|numero|cin|email|adresse|address)\b|$)/i,
  ];
  let fullName = null;
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      fullName = String(match[1]).trim();
      break;
    }
  }
  return {
    fullName: fullName && fullName.length >= 3 ? fullName : null,
    phone,
    email: emailMatch?.[1] ? String(emailMatch[1]).trim().toLowerCase() : null,
    address: addressMatch?.[1] ? String(addressMatch[1]).trim() : null,
    identityNumber: identityMatch?.[1] ? String(identityMatch[1]).trim().toUpperCase() : null,
    identityImageUrl: imageUrlMatch?.[1] ? String(imageUrlMatch[1]).trim() : null,
  };
}

async function persistAttachmentDataUrl(dataUrl, fileName = "") {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match?.[1] || !match?.[2]) return null;
  const mimeType = String(match[1]).toLowerCase();
  const ext =
    mimeType.includes("png") ? "png"
    : mimeType.includes("webp") ? "webp"
    : mimeType.includes("gif") ? "gif"
    : "jpg";
  await fs.mkdir(CHATBOT_MEDIA_DIR, { recursive: true });
  const safeBase = String(fileName || "chatbot-image")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "chatbot-image";
  const storedName = `${safeBase}-${Date.now()}.${ext}`;
  const fileBuffer = Buffer.from(match[2], "base64");
  await fs.writeFile(path.join(CHATBOT_MEDIA_DIR, storedName), fileBuffer);
  try {
    await fs.mkdir(LOCAL_SITE_CHATBOT_MEDIA_DIR, { recursive: true });
    await fs.writeFile(path.join(LOCAL_SITE_CHATBOT_MEDIA_DIR, storedName), fileBuffer);
  } catch {
    // Best effort only.
  }
  return `${WEBSITE_BASE_URL}/chatbot-media/${storedName}`;
}

async function getFirstAttachmentImageUrl(payload) {
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];
  for (const attachment of attachments) {
    const type = String(attachment?.type || "").trim().toLowerCase();
    const mimeType = String(attachment?.mimeType || "").trim().toLowerCase();
    const url = String(attachment?.url || "").trim();
    if (url && (type === "image" || mimeType.startsWith("image/"))) return url;
    if (String(attachment?.dataUrl || "").trim() && (type === "image" || mimeType.startsWith("image/") || !type)) {
      const persistedUrl = await persistAttachmentDataUrl(attachment.dataUrl, attachment.name || "chatbot-image");
      if (persistedUrl) return persistedUrl;
    }
  }
  return null;
}

async function getConversationContext(conversationId) {
  const raw = await redis.get(`conversation:ctx:${conversationId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setConversationContext(conversationId, ctx) {
  await redis.set(`conversation:ctx:${conversationId}`, JSON.stringify(ctx), "EX", CONTEXT_TTL_SEC);
  const demandId = String(ctx?.reservationDemandId || "").trim();
  if (demandId) {
    await redis.set(`reservation:demand:conversation:${demandId}`, String(conversationId), "EX", CONTEXT_TTL_SEC);
  }
}

async function loadRecentConversationTranscript(conversationId, limit = 12) {
  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, limit),
  });
  return rows
    .slice()
    .reverse()
    .map((row) => {
      const sender = row.senderType === "client" ? "Client" : row.senderType === "admin" ? "Admin" : "Assistant";
      return `${sender}: ${String(row.content || "").trim()}`;
    })
    .filter((line) => !/: $/.test(line))
    .join("\n");
}

async function withConversationLock(key, fn) {
  const lockKey = `lock:conversation:${key}`;
  const acquired = await redis.set(lockKey, "1", "NX", "EX", 30);
  if (!acquired) return null;
  try {
    return await fn();
  } finally {
    await redis.del(lockKey);
  }
}

export async function processIncomingMessage(payload) {
  return withConversationLock(`${payload.platform}:${payload.platformUserId}`, async () => {
    const client = await prisma.client.upsert({
      where: {
        platform_platformUserId: {
          platform: payload.platform,
          platformUserId: payload.platformUserId,
        },
      },
      update: {},
      create: {
        platform: payload.platform,
        platformUserId: payload.platformUserId,
        language: "auto",
      },
    });

    let conversation = await prisma.conversation.findFirst({
      where: { clientId: client.id },
      orderBy: { updatedAt: "desc" },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { clientId: client.id, state: STATES.NEW_LEAD },
      });
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: "client",
        content: payload.message,
      },
    });

    if (conversation.isHumanTakeover) {
      return { conversationId: conversation.id, reply: "" };
    }

    const conversationTranscript = await loadRecentConversationTranscript(conversation.id);
    const extracted = payload?.parsedIntent || await parseUserIntent(payload.message);
    const previousContext = await getConversationContext(conversation.id);
    const constraints = normalizeConversationContext(previousContext, extracted, payload.message);

    const identityFromText = extractIdentity(payload.message);
    const incomingIdentityImageUrl = await getFirstAttachmentImageUrl(payload);
    if (!constraints.profile.fullName && identityFromText.fullName) constraints.profile.fullName = identityFromText.fullName;
    if (!constraints.profile.phone && identityFromText.phone) constraints.profile.phone = identityFromText.phone;
    if (!constraints.profile.email && identityFromText.email) constraints.profile.email = identityFromText.email;
    if (!constraints.profile.address && identityFromText.address) constraints.profile.address = identityFromText.address;
    if (!constraints.profile.identityNumber && identityFromText.identityNumber) constraints.profile.identityNumber = identityFromText.identityNumber;
    if (!constraints.profile.identityImageUrl && identityFromText.identityImageUrl) constraints.profile.identityImageUrl = identityFromText.identityImageUrl;
    if (!constraints.profile.identityImageUrl && incomingIdentityImageUrl) constraints.profile.identityImageUrl = incomingIdentityImageUrl;

    await setConversationContext(conversation.id, constraints);

    const agentResult = await runCustomerAgentTurn({
      payload,
      client,
      conversation,
      constraints,
      extracted,
      conversationTranscript,
    });

    const updatedConstraints = agentResult?.updatedConstraints || constraints;
    const newState = agentResult?.newState || conversation.state || STATES.NEW_LEAD;
    const reply = String(agentResult?.reply || "").trim() || "Je peux chercher sur le site, suivre une reference, expliquer le processus ou avancer dans la reservation.";
    const options = Array.isArray(agentResult?.options) ? agentResult.options : [];

    if (String(updatedConstraints?.profile?.fullName || "").trim() || String(updatedConstraints?.profile?.phone || "").trim()) {
      await prisma.client.update({
        where: { id: client.id },
        data: {
          fullName: String(updatedConstraints?.profile?.fullName || "").trim() || client.fullName || null,
          phone: String(updatedConstraints?.profile?.phone || "").trim() || client.phone || null,
          language: String(updatedConstraints?.language || extracted?.language || client.language || "fr").trim().toLowerCase(),
        },
      });
    }

    await setConversationContext(conversation.id, updatedConstraints);
    await prisma.conversation.update({ where: { id: conversation.id }, data: { state: newState } });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: "bot",
        content: reply,
      },
    });

    if (payload.platform !== "website") {
      await sendMetaMessage(payload.platform, payload.platformUserId, reply);
    }

    return {
      conversationId: conversation.id,
      reply,
      options,
      diagnostics: {
        ...(agentResult?.diagnostics || {}),
        responseMode: "agent_rag",
        optionsCount: options.length,
      },
    };
  });
}
