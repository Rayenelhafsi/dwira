import { redis } from "../config/redis.js";
import { prisma } from "../config/prisma.js";
import { parseUserIntent } from "./ai/intent.service.js";
import { retrieveContext } from "./rag/retrieval.service.js";
import { searchAvailableProperties } from "./propertySearch.service.js";
import { generateAssistantReply } from "./ai/reply.service.js";
import { sendMetaMessage } from "./meta/sender.service.js";
import { createReservationDemandFromChat, listReservationDemandsByPhone } from "./projectBooking.service.js";
import { STATES } from "./stateMachine.js";

const CONTEXT_TTL_SEC = 60 * 60 * 24;
const DATA_SOURCE = String(process.env.CHATBOT_DATA_SOURCE || "chatbot").trim().toLowerCase();
const PROJECT_DB = String(process.env.PROJECT_DB_NAME || "dwira").trim();
const WEBSITE_BASE_URL = String(process.env.WEBSITE_BASE_URL || "https://www.dwiraimmobilier.com").replace(/\/+$/, "");

function parseDate(value) {
  const s = String(value || "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function normalizeConstraints(existing, extracted) {
  const base = existing || {};
  const startDate = parseDate(extracted?.dates?.start) || base.startDate || null;
  const endDate = parseDate(extracted?.dates?.end) || base.endDate || null;
  const extractedGuests = Number(extracted?.guests);
  const guests =
    Number.isFinite(extractedGuests) && extractedGuests >= 1 && extractedGuests <= 30
      ? extractedGuests
      : base.guests || null;
  const extractedBudget = Number(extracted?.budget);
  const budget =
    Number.isFinite(extractedBudget) && extractedBudget >= 50 && extractedBudget <= 100000
      ? extractedBudget
      : base.budget || null;
  const location = String(extracted?.location || base.location || "").trim() || null;
  const pref = new Set([...(Array.isArray(base.preferences) ? base.preferences : []), ...(Array.isArray(extracted?.preferences) ? extracted.preferences : [])]);
  const type = String(extracted?.type || base.type || "").trim().toLowerCase() || null;
  const subType = String(extracted?.subType || base.subType || "").trim().toLowerCase() || null;
  const extractedBedrooms = Number(extracted?.bedrooms);
  const bedrooms = Number.isFinite(extractedBedrooms) && extractedBedrooms > 0 ? extractedBedrooms : base.bedrooms || null;
  let floor = base.floor || null;
  if (!floor && Array.isArray(extracted?.preferences)) {
    if (extracted.preferences.includes("ground_floor")) floor = "ground";
    else if (extracted.preferences.includes("first_floor")) floor = "first";
  }
  return {
    startDate,
    endDate,
    guests,
    budget,
    location,
    type,
    subType,
    bedrooms,
    floor,
    preferences: Array.from(pref),
    language: base.language || extracted?.language || "fr",
    selectedPropertyId: Number.isFinite(Number(base.selectedPropertyId)) ? Number(base.selectedPropertyId) : null,
    selectedPropertyRef: String(base.selectedPropertyRef || "").trim() || null,
    reservationDemandId: String(base.reservationDemandId || "").trim() || null,
    profile: {
      fullName: String(base?.profile?.fullName || "").trim() || null,
      phone: String(base?.profile?.phone || "").trim() || null,
    },
    payment: {
      method: String(base?.payment?.method || "").trim() || null,
      receiptProvided: Boolean(base?.payment?.receiptProvided),
    },
  };
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
}

function toPropertyCards(properties) {
  return properties.map((p) => ({
    id: p.id,
    title: p.title,
    location: p.location,
    capacity: p.capacity,
    pricePerNightTnd: Number(p.pricePerNight),
    nearBeach: Boolean(p.nearBeach),
    seaView: Boolean(p.seaView),
    beachDistanceM: Number.isFinite(Number(p.beachDistanceM)) ? Number(p.beachDistanceM) : null,
    pool: Boolean(p.pool),
    parking: Boolean(p.parking),
    type: p.type,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    floor: p.floor || null,
    description: p.description,
    link: `${WEBSITE_BASE_URL}/properties/${String(p.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    photos: (p.media || []).map((m) => m.imageUrl).filter(Boolean),
  }));
}

function normText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function computeMatchMeta(property, constraints) {
  let score = 0;
  let maxScore = 0;
  const reasons = [];
  const text = normText([property.title, property.location, property.description, property.type].join(" "));

  if (constraints.location) {
    maxScore += 18;
    if (text.includes(normText(constraints.location))) score += 18;
    else reasons.push("location");
  }
  if (constraints.type && constraints.type !== "autre") {
    maxScore += 16;
    if (normText(property.type).includes(normText(constraints.type))) score += 16;
    else reasons.push("type");
  }
  if (constraints.subType && constraints.subType !== "autre") {
    maxScore += 16;
    if (text.includes(normText(constraints.subType))) score += 16;
    else reasons.push("subtype");
  }
  if (Number.isFinite(Number(constraints.bedrooms)) && Number(constraints.bedrooms) > 0) {
    maxScore += 8;
    if (Number(property.bedrooms || 0) >= Number(constraints.bedrooms)) score += 8;
    else reasons.push("bedrooms");
  }
  if (constraints.preferences.includes("sea_view")) {
    maxScore += 10;
    if (property.seaView) score += 10;
    else reasons.push("comfort");
  }
  if (constraints.preferences.includes("near_beach")) {
    maxScore += 10;
    if (property.nearBeach) score += 10;
    else reasons.push("comfort");
  }
  if (constraints.preferences.includes("beachfront")) {
    maxScore += 10;
    const isBeachfront = property.seaView && Number.isFinite(Number(property.beachDistanceM)) && Number(property.beachDistanceM) <= 50;
    if (isBeachfront) score += 10;
    else reasons.push("comfort");
  }
  if (Number.isFinite(Number(constraints.budget))) {
    maxScore += 10;
    if (Number(property.pricePerNightTnd || 0) <= Number(constraints.budget)) score += 10;
    else reasons.push("budget");
  }

  const normalizedScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 100;
  return { score: normalizedScore, reasons: Array.from(new Set(reasons)) };
}

function parseQuickIntent(message) {
  const m = normText(message);
  const wantsStatus =
    /(status|etat reservation|reservation status|statut|etat)/.test(m) ||
    m.includes("حالة") ||
    m.includes("الحجز");
  const wantsReserve =
    /(reserver|reserve|book|booking)/.test(m) ||
    m.includes("نحب نحجز") ||
    m.includes("احجز");
  const asksReceipt =
    /(recu|receipt|preuve|paiement|payment|virement)/.test(m) ||
    m.includes("وصل") ||
    m.includes("ايصال");
  const mentionsAlternative =
    /(alternative|autre|another)/.test(m) ||
    m.includes("بديل") ||
    m.includes("غير");
  const hasReceiptLink = /(https?:\/\/\S+\.(png|jpe?g|webp|pdf)\b|preuve de paiement|payment proof)/.test(m);
  const paymentMethod =
    /\b(cash|especes|espece)\b/.test(m) ? "cash" :
    /\b(virement|transfer|bank)\b/.test(m) ? "bank_transfer" :
    /\b(carte|card)\b/.test(m) ? "card" : null;
  return { wantsStatus, wantsReserve, asksReceipt, mentionsAlternative, hasReceiptLink, paymentMethod };
}

function extractSelectionId(message) {
  const match = String(message || "").match(/\b(?:id|ref|property)\s*[:#-]?\s*(\d+)\b/i);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

function languagePack(lang) {
  if (lang === "en") {
    return {
      askMissing: "Please share missing details: dates, guests, budget, and preferred location.",
      none: "No exact match is available now. I can suggest alternatives if you relax one condition (dates/budget/location).",
      choose: "I found options. Reply with the property id to continue booking.",
      askIdentity: "To create your profile and reservation, please share full name and phone number.",
      pending: "Your reservation request is created with status pending.",
      askPayment: "Please choose payment method (cash, bank transfer, card) and send receipt image/link to confirm payment.",
      receiptReceived: "Receipt received. Payment confirmation will be reviewed by admin.",
      statusNone: "No reservation found yet for your profile.",
    };
  }
  if (lang === "ar" || lang === "tn") {
    return {
      askMissing: "من فضلك زودني بالمعطيات الناقصة: التواريخ، عدد الضيوف، الميزانية، والموقع.",
      none: "لا توجد نتيجة مطابقة الآن. أقدر نقترح بدائل إذا نخفف شرط واحد (التواريخ/الميزانية/الموقع).",
      choose: "لقيت خيارات مناسبة. ابعثلي رقم العقار (id) باش نكمل الحجز.",
      askIdentity: "باش نعمل البروفايل والحجز، ابعث الاسم الكامل ورقم الهاتف.",
      pending: "تم إنشاء طلب الحجز وحالته حاليا: pending.",
      askPayment: "اختر طريقة الدفع (كاش، تحويل بنكي، بطاقة) وابعت صورة/رابط الوصل لتأكيد الدفع.",
      receiptReceived: "تم استلام الوصل. سيتم مراجعة تأكيد الدفع من طرف الإدارة.",
      statusNone: "ما فماش حجز مسجل حاليا لهذا البروفايل.",
    };
  }
  return {
    askMissing: "Merci de partager les infos manquantes: dates, voyageurs, budget et localisation.",
    none: "Aucune option exacte disponible. Je peux proposer des alternatives si vous assouplissez une condition (dates/budget/localisation).",
    choose: "J'ai trouvé des options. Répondez avec l'id du bien pour continuer la réservation.",
    askIdentity: "Pour créer votre profil et la réservation, envoyez nom complet et téléphone.",
    pending: "Votre demande de réservation a été créée avec le statut pending.",
    askPayment: "Choisissez le mode de paiement (espèces, virement, carte) et envoyez l'image/le lien du reçu pour confirmer le paiement.",
    receiptReceived: "Reçu reçu. La confirmation du paiement sera validée par l'administration.",
    statusNone: "Aucune réservation trouvée pour votre profil pour le moment.",
  };
}

async function findAlternatives(constraints) {
  return searchAvailableProperties({
    location: constraints.location,
    guests: constraints.guests,
    budget: null,
    startDate: constraints.startDate,
    endDate: constraints.endDate,
    nearBeach: constraints.preferences.includes("near_beach") || constraints.preferences.includes("beachfront"),
    seaView: constraints.preferences.includes("sea_view"),
    beachfront: false,
    pool: constraints.preferences.includes("pool"),
    parking: constraints.preferences.includes("parking"),
    type: constraints.type,
    subType: constraints.subType,
    bedrooms: constraints.bedrooms,
    floor: constraints.floor,
  });
}

function extractIdentity(message) {
  const text = String(message || "").trim();
  const hasIdentityCue = /\b(my name is|name is|full name|nom|prenom|phone|telephone|tel|سمي|اسمي|رقم)\b/i.test(text);
  if (!hasIdentityCue) return { fullName: null, phone: null };
  const phoneMatch = text.match(/(\+?\d[\d\s-]{7,}\d)/);
  const phone = phoneMatch ? phoneMatch[1].replace(/\s+/g, "") : null;
  const sanitizedPhone = phone && /^\d{4}-\d{2}-\d{2}$/.test(phone) ? null : phone;
  let name = text;
  const enName = text.match(/my\s+(?:full\s+)?name\s+is\s+(.+?)(?:\s+and\s+phone|\s+phone|$)/i);
  const frName = text.match(/(?:nom|prenom)\s*[:\-]?\s*(.+?)(?:\s+telephone|\s+tel|$)/i);
  if (enName?.[1]) name = enName[1];
  else if (frName?.[1]) name = frName[1];
  else {
    name = text
      .replace(/(\+?\d[\d\s-]{7,}\d)/, "")
      .replace(/my name is|name is|full name|nom|prenom|phone|telephone|tel|سمي|اسمي|رقم/gi, "")
      .replace(/[:\-]/g, " ")
      .trim();
  }
  return {
    fullName: name.length >= 5 ? name : null,
    phone: sanitizedPhone,
  };
}

async function getLatestReservation(clientId) {
  return prisma.reservation.findFirst({
    where: { clientId },
    orderBy: { id: "desc" },
    include: { property: true },
  });
}

function formatProjectReservationStatus(lang, demand) {
  const status = String(demand?.status || "").trim() || "pending";
  const id = String(demand?.id || "");
  const ref = String(demand?.reference || demand?.reservation_ref || "").trim();
  const contractLink = `${WEBSITE_BASE_URL}/mes-reservations`;
  const paymentLink = `${WEBSITE_BASE_URL}/mes-reservations/${encodeURIComponent(id || ref)}/paiement`;
  if (lang === "en") return `Request ${id || ref}: status ${status}. Contract: ${contractLink} Payment: ${paymentLink}`;
  if (lang === "ar" || lang === "tn") return `Demande ${id || ref}: statut ${status}. Contrat: ${contractLink} Paiement: ${paymentLink}`;
  return `Demande ${id || ref}: statut ${status}. Contrat: ${contractLink} Paiement: ${paymentLink}`;
}

async function createPendingReservation(clientId, constraints, selectedPropertyId) {
  if (!selectedPropertyId || !constraints.startDate || !constraints.endDate || !constraints.guests) return null;
  const property = await prisma.property.findUnique({ where: { id: selectedPropertyId } });
  if (!property) return null;
  const start = new Date(constraints.startDate);
  const end = new Date(constraints.endDate);
  const nights = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)));
  const totalPrice = Number(property.pricePerNight) * nights;
  return prisma.reservation.create({
    data: {
      propertyId: property.id,
      clientId,
      startDate: start,
      endDate: end,
      guests: constraints.guests,
      totalPrice,
      status: "pending",
    },
  });
}

async function createProjectReservationDemand(constraints, selectedProperty) {
  if (!selectedProperty || !constraints.startDate || !constraints.endDate || !constraints.guests) return null;
  const payload = {
    bien_id: String(selectedProperty.id),
    client_name: constraints.profile.fullName || "",
    client_email: null,
    start_date: constraints.startDate,
    end_date: constraints.endDate,
    guests: constraints.guests,
    adult_guests: constraints.guests,
    child_guests: 0,
    payment_mode: "avance",
    total_amount: Number(selectedProperty.pricePerNightTnd || 0),
    amount_due_now: Number(selectedProperty.pricePerNightTnd || 0),
    selected_fixed_services: [],
    selected_variable_services: [],
    client_note: `Created by chatbot assistant | phone:${constraints.profile.phone || ""}`,
    request_type: "reservation",
  };
  const created = await createReservationDemandFromChat(payload);
  return created;
}

async function findProjectReservationStatus(constraints, client) {
  const phoneRaw = String(constraints?.profile?.phone || client?.phone || "").trim();
  const phoneDigits = phoneRaw.replace(/\D+/g, "");
  const fullName = String(constraints?.profile?.fullName || client?.fullName || "").trim();
  const params = [];
  const where = [];
  if (phoneDigits.length >= 6) {
    where.push("(REPLACE(REPLACE(REPLACE(COALESCE(amicale_phone,''),'+',''),' ',''),'-','') LIKE ? OR REPLACE(REPLACE(REPLACE(COALESCE(client_note,''),'+',''),' ',''),'-','') LIKE ?)");
    params.push(`%${phoneDigits}%`, `%${phoneDigits}%`);
  }
  if (fullName.length >= 3) {
    where.push("LOWER(COALESCE(client_name,'')) = LOWER(?)");
    params.push(fullName);
  }
  if (!where.length) return null;
  const sql = `SELECT id, status, updated_at FROM ${PROJECT_DB}.reservation_demands WHERE ${where.join(" OR ")} ORDER BY updated_at DESC LIMIT 1`;
  const rows = await prisma.$queryRawUnsafe(sql, ...params);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
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

    const extracted = await parseUserIntent(payload.message);
    const quick = parseQuickIntent(payload.message);
    const prevCtx = await getConversationContext(conversation.id);
    const constraints = normalizeConstraints(prevCtx, extracted);
    if (quick.paymentMethod) constraints.payment.method = quick.paymentMethod;
    await setConversationContext(conversation.id, constraints);

    const ragContext = await retrieveContext(payload.message);
    const properties = await searchAvailableProperties({
      location: constraints.location,
      guests: constraints.guests,
      budget: constraints.budget,
      startDate: constraints.startDate,
      endDate: constraints.endDate,
      nearBeach: constraints.preferences.includes("near_beach"),
      seaView: constraints.preferences.includes("sea_view"),
      beachfront: constraints.preferences.includes("beachfront"),
      pool: constraints.preferences.includes("pool"),
      parking: constraints.preferences.includes("parking"),
      type: constraints.type,
      subType: constraints.subType,
      bedrooms: constraints.bedrooms,
      floor: constraints.floor,
    });
    let propertyCards = toPropertyCards(properties);
    if (quick.mentionsAlternative || propertyCards.length < 3) {
      const alternatives = toPropertyCards(await findAlternatives(constraints));
      const seen = new Set(propertyCards.map((p) => String(p.id)));
      for (const alt of alternatives) {
        if (seen.has(String(alt.id))) continue;
        propertyCards.push(alt);
        if (propertyCards.length >= 10) break;
      }
    }
    propertyCards = propertyCards
      .map((p) => {
        const meta = computeMatchMeta(p, constraints);
        return { ...p, matchScore: meta.score, alternativeReasons: meta.reasons };
      })
      .sort((a, b) => Number(b.matchScore || 0) - Number(a.matchScore || 0));
    if (process.env.NODE_ENV !== "production") {
      console.log(
        "[chatbot-debug]",
        JSON.stringify({
          user: payload.platformUserId,
          constraints,
          properties: propertyCards.map((p) => ({ id: p.id, title: p.title })),
        })
      );
    }

    const lang = constraints.language || extracted.language || client.language || "fr";
    const L = languagePack(lang);
    let reply = "";
    let options = propertyCards;
    let newState = conversation.state;

    if (quick.wantsStatus) {
      if (DATA_SOURCE === "project") {
        const phone = constraints.profile.phone || client.phone || "";
        if (!phone) {
          reply = L.askIdentity;
        } else {
          const rows = await listReservationDemandsByPhone(phone);
          if (rows.length) {
            reply = formatProjectReservationStatus(lang, rows[0]);
          } else {
            const direct = await findProjectReservationStatus(constraints, client);
            reply = direct ? formatProjectReservationStatus(lang, direct) : L.statusNone;
          }
        }
      } else {
        const latest = await getLatestReservation(client.id);
        if (!latest) {
          reply = L.statusNone;
        } else {
          reply = `Reservation #${latest.id} - ${latest.property.title} - status: ${latest.status} - total: ${Number(latest.totalPrice)} TND.`;
        }
      }
      newState = STATES.PENDING_CONFIRMATION;
    } else if (!constraints.startDate || !constraints.endDate || !constraints.guests || !constraints.location) {
      reply = L.askMissing;
      newState = STATES.ASKING_PREFERENCES;
    } else if (propertyCards.length === 0) {
      const alternatives = toPropertyCards(await findAlternatives(constraints));
      options = alternatives;
      if (alternatives.length > 0) {
        reply = `${L.none} ${L.choose}`;
      } else {
        reply = L.none;
      }
      newState = STATES.SHOWING_OPTIONS;
    } else {
      const selectedId = extractSelectionId(payload.message);
      if (selectedId && propertyCards.some((p) => p.id === selectedId)) {
        constraints.selectedPropertyId = selectedId;
      } else if (!constraints.selectedPropertyId && propertyCards.length === 1) {
        constraints.selectedPropertyId = propertyCards[0].id;
      }

      if (newState === STATES.COLLECTING_IDENTITY || quick.wantsReserve || /name|nom|phone|telephone|اسمي|رقم/i.test(payload.message)) {
        const idData = extractIdentity(payload.message);
        if (!constraints.profile.fullName && idData.fullName) constraints.profile.fullName = idData.fullName;
        if (!constraints.profile.phone && idData.phone) constraints.profile.phone = idData.phone;
      }

      if (!constraints.selectedPropertyId) {
        reply = L.choose;
        newState = STATES.WAITING_SELECTION;
      } else if (!constraints.profile.fullName || !constraints.profile.phone) {
        reply = L.askIdentity;
        newState = STATES.COLLECTING_IDENTITY;
      } else {
        await prisma.client.update({
          where: { id: client.id },
          data: { fullName: constraints.profile.fullName, phone: constraints.profile.phone, language: lang },
        });
        const selectedProperty = options.find((p) => String(p.id) === String(constraints.selectedPropertyId)) || null;
        const reservation =
          DATA_SOURCE === "project"
            ? await createProjectReservationDemand(constraints, selectedProperty)
            : await createPendingReservation(client.id, constraints, constraints.selectedPropertyId);
        if (reservation) {
          if (DATA_SOURCE === "project") {
            constraints.reservationDemandId = String(reservation.id || "");
          }
          const reservationLink = `${WEBSITE_BASE_URL}/mes-reservations`;
          const paymentLink = `${WEBSITE_BASE_URL}/mes-reservations/${encodeURIComponent(String(reservation?.id || constraints.reservationDemandId || ""))}/paiement`;
          if (quick.asksReceipt || quick.hasReceiptLink) {
            constraints.payment.receiptProvided = true;
            reply = `${L.pending} ${L.receiptReceived} ${reservationLink}`;
          } else {
            reply = `${L.pending} ${L.askPayment} ${paymentLink}`;
          }
          newState = STATES.PENDING_CONFIRMATION;
        } else {
          reply = L.askMissing;
          newState = STATES.ASKING_DATES;
        }
      }
    }

    if (!reply) {
      reply = await generateAssistantReply({
        userMessage: payload.message,
        language: lang,
        state: newState,
        extracted,
        constraints,
        propertyOptions: options,
        ragContext,
      });
    }
    await setConversationContext(conversation.id, constraints);
    await prisma.conversation.update({ where: { id: conversation.id }, data: { state: newState } });

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: "bot",
        content: reply,
      },
    });

    if (payload.platform !== "website") {
      await sendMetaMessage(payload.platformUserId, reply);
    }

    return { conversationId: conversation.id, reply, options };
  });
}
