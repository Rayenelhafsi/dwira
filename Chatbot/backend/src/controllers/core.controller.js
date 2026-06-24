import { prisma } from "../config/prisma.js";
import { searchAvailableProperties } from "../services/propertySearch.service.js";
import { config } from "../config/env.js";
import { qdrant } from "../config/qdrant.js";
import { ensureChatbotSchema } from "../services/chatbotSchema.service.js";
import { feedbackLearningSchema } from "../utils/validators.js";
import { invalidateReplyCoachingCache } from "../services/ai/recommendationLearning.service.js";

export async function searchPropertiesController(req, res) {
  const data = await searchAvailableProperties({
    location: req.query.location,
    guests: req.query.guests ? Number(req.query.guests) : null,
    bedrooms: req.query.bedrooms ? Number(req.query.bedrooms) : null,
    floor: req.query.floor || null,
    budget: req.query.budget ? Number(req.query.budget) : null,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    nearBeach: req.query.nearBeach === "true",
    seaView: req.query.seaView === "true",
    beachfront: req.query.beachfront === "true",
    pool: req.query.pool === "true",
    parking: req.query.parking === "true",
    type: req.query.type || null,
    subType: req.query.subType || null,
  });
  return res.json(data);
}

export async function hybridHealthController(_req, res) {
  let qdrantUp = false;
  let propertyIndexCount = 0;
  let ragIndexCount = 0;
  let qdrantError = null;

  try {
    await qdrant.getCollections();
    qdrantUp = true;
    try {
      const pc = await qdrant.count(config.qdrantPropertyCollection, { exact: true });
      propertyIndexCount = Number(pc?.count || 0);
    } catch {}
    try {
      const rc = await qdrant.count(config.qdrantCollection, { exact: true });
      ragIndexCount = Number(rc?.count || 0);
    } catch {}
  } catch (e) {
    qdrantError = String(e?.message || e);
  }

  return res.json({
    hybridSearchEnabled: config.hybridSearchEnabled,
    qdrantUp,
    qdrantUrl: config.qdrantUrl || null,
    propertyCollection: config.qdrantPropertyCollection,
    propertyIndexCount,
    ragCollection: config.qdrantCollection,
    ragIndexCount,
    qdrantError,
  });
}

export async function reservationController(req, res) {
  const payload = req.body;
  const created = await prisma.reservation.create({
    data: {
      propertyId: payload.propertyId,
      clientId: payload.clientId,
      startDate: new Date(payload.startDate),
      endDate: new Date(payload.endDate),
      guests: payload.guests,
      totalPrice: payload.totalPrice,
      status: "pending",
    },
  });
  return res.status(201).json(created);
}

export async function humanTakeoverController(req, res) {
  const { conversationId, enabled } = req.body;
  const conv = await prisma.conversation.update({
    where: { id: conversationId },
    data: { isHumanTakeover: Boolean(enabled) },
  });
  return res.json(conv);
}

export async function feedbackController(req, res) {
  const parsed = feedbackLearningSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  await ensureChatbotSchema();
  const payload = parsed.data;
  const row = await prisma.feedbackLearning.create({
    data: {
      question: payload.question,
      botAnswer: payload.botAnswer || "",
      correctedAnswer: payload.correctedAnswer || null,
      reason: payload.reason || null,
    },
  });
  invalidateReplyCoachingCache();
  return res.status(201).json({
    id: row.id,
    stored: true,
    message: "Recommendation saved and ready to influence future replies.",
  });
}

export async function feedbackListController(_req, res) {
  await ensureChatbotSchema();
  const rows = await prisma.feedbackLearning.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return res.json(rows.map((row) => ({
    id: row.id,
    question: row.question,
    botAnswer: row.botAnswer,
    correctedAnswer: row.correctedAnswer,
    reason: row.reason,
    createdAt: row.createdAt,
  })));
}

export async function conversationByIdController(req, res) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: Number(req.params.id) },
    include: { messages: true, client: true },
  });
  if (!conversation) return res.sendStatus(404);
  return res.json(conversation);
}
