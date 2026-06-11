import { incomingMessageQueue } from "../queues/incomingMessage.queue.js";
import { prisma } from "../config/prisma.js";
import { redis } from "../config/redis.js";
import { processIncomingMessage } from "../services/conversationProcessor.service.js";
import { fetchReservationDemandById } from "../services/projectBooking.service.js";
import { sendMetaMessage } from "../services/meta/sender.service.js";
import { chatSchema, chatSessionSchema } from "../utils/validators.js";

async function loadConversationSnapshot(platform, platformUserId) {
  const client = await prisma.client.findUnique({
    where: {
      platform_platformUserId: {
        platform,
        platformUserId,
      },
    },
  });

  if (!client) {
    return { client: null, conversation: null, context: null };
  }

  const conversation = await prisma.conversation.findFirst({
    where: { clientId: client.id },
    orderBy: { updatedAt: "desc" },
    include: {
      client: true,
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!conversation) {
    return { client, conversation: null, context: null };
  }

  const rawContext = await redis.get(`conversation:ctx:${conversation.id}`);
  let context = null;
  if (rawContext) {
    try {
      context = JSON.parse(rawContext);
    } catch {
      context = null;
    }
  }

  return { client, conversation, context };
}

function buildDemandAutomationReply(lang, demand) {
  const status = String(demand?.status || "").trim();
  const demandId = String(demand?.id || "").trim();
  const websiteBaseUrl = String(process.env.WEBSITE_BASE_URL || "http://localhost:5173").replace(/\/+$/, "");
  const rawContractUrl = String(demand?.contract_url || "").trim();
  const contractUrl = !rawContractUrl ? "" : /^https?:\/\//i.test(rawContractUrl)
    ? rawContractUrl
    : `${websiteBaseUrl}${rawContractUrl.startsWith("/") ? rawContractUrl : `/${rawContractUrl}`}`;
  const paymentPageUrl = `${websiteBaseUrl}/mes-reservations/${encodeURIComponent(demandId)}/paiement`;
  if (status === "reponse_positive_attente_confirmation_client") {
    if (lang === "tn") {
      return `El proprietaire 9bel ettaleb mte3ek. Tawa l contrat mazelt yeta7dher 9bal el paiement. Tnajem ttab3 men houni: ${websiteBaseUrl}/mes-reservations`;
    }
    if (lang === "en") {
      return `The owner accepted your request. The contract is being prepared before payment. Track it here: ${websiteBaseUrl}/mes-reservations`;
    }
    return `Le proprietaire a accepte votre demande. Le contrat est en cours de preparation avant le paiement. Vous pouvez suivre votre reservation ici: ${websiteBaseUrl}/mes-reservations`;
  }
  if (["client_procede_vers_paiement_en_cours", "contrat_realise"].includes(status)) {
    if (!contractUrl) return null;
    if (lang === "tn") {
      return `El propriétaire 9bel ettaleb mte3ek. El contrat جاهز${contractUrl ? `: ${contractUrl}` : ""}. Bech nkamlou finalisation, ikhtar tari9et el paiement elli tnasbek: clicktopay wala virement. Page paiement: ${paymentPageUrl}`;
    }
    if (lang === "en") {
      return `The owner accepted your request. Your contract is ready${contractUrl ? `: ${contractUrl}` : ""}. To finalize the reservation, choose your payment method. Payment page: ${paymentPageUrl}`;
    }
    return `Le proprietaire a accepte votre demande. Votre contrat est pret${contractUrl ? ` : ${contractUrl}` : ""}. Pour finaliser la reservation, choisissez votre mode de paiement. Page paiement: ${paymentPageUrl}`;
  }
  if (status === "recu_paiement_envoye") {
    if (lang === "tn") return `Recu paiement tsajjel. Taw نستناو ta2kid succes mta3 paiement. Suivi: ${paymentPageUrl}`;
    if (lang === "en") return `Your payment receipt has been recorded. We are waiting for payment confirmation. Track here: ${paymentPageUrl}`;
    return `Votre recu de paiement a ete enregistre. Nous attendons la confirmation du paiement. Suivi ici: ${paymentPageUrl}`;
  }
  if (status === "succes_paiement") {
    if (lang === "tn") return `Paiement mte3ek ta3mal b succes. Reservation mte3ek tkamlet${contractUrl ? ` w hedha contratk: ${contractUrl}` : ""}.`;
    if (lang === "en") return `Your payment was successful. Your reservation is finalized${contractUrl ? ` and here is your contract: ${contractUrl}` : ""}.`;
    return `Votre paiement a ete confirme avec succes. Votre reservation est finalisee${contractUrl ? ` et voici votre contrat: ${contractUrl}` : ""}.`;
  }
  return null;
}

async function notifyDemandConversation(demand) {
  const demandId = String(demand?.id || "").trim();
  if (!demandId) return { delivered: false, reason: "missing_demand_id" };
  const conversationId = String(await redis.get(`reservation:demand:conversation:${demandId}`) || "").trim();
  if (!conversationId) return { delivered: false, reason: "missing_conversation_binding" };
  const conversation = await prisma.conversation.findUnique({
    where: { id: Number(conversationId) },
    include: { client: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!conversation?.client) return { delivered: false, reason: "conversation_not_found" };
  let context = null;
  const rawContext = await redis.get(`conversation:ctx:${conversation.id}`);
  if (rawContext) {
    try {
      context = JSON.parse(rawContext);
    } catch {
      context = null;
    }
  }
  const lang = String(context?.language || conversation.client.language || "fr").trim().toLowerCase();
  const reply = buildDemandAutomationReply(lang, demand);
  if (!reply) return { delivered: false, reason: "unsupported_status" };
  const lastMessage = Array.isArray(conversation.messages) ? conversation.messages[0] : null;
  if (String(lastMessage?.senderType || "").trim() === "bot" && String(lastMessage?.content || "").trim() === reply.trim()) {
    return { delivered: true, deduplicated: true, reply };
  }
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderType: "bot",
      content: reply,
    },
  });
  if (conversation.client.platform !== "website") {
    await sendMetaMessage(conversation.client.platformUserId, reply);
  }
  return { delivered: true, reply };
}

export async function chatController(req, res) {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const payload = parsed.data;
  await incomingMessageQueue.add("incoming", payload, {
    jobId: `${payload.platform}:${payload.platformUserId}:${Date.now()}`,
  });

  return res.json({ queued: true });
}

export async function chatSyncController(req, res) {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const result = await processIncomingMessage(parsed.data);
  if (!result) return res.status(429).json({ error: "Conversation locked, retry shortly." });

  return res.json({
    conversationId: result.conversationId,
    reply: result.reply || "",
    options: result.options || [],
  });
}

export async function chatSessionController(req, res) {
  const platform = String(req.params.platform || "website").trim() || "website";
  const platformUserId = String(req.params.platformUserId || "").trim();
  if (!platformUserId) return res.status(400).json({ error: "platformUserId is required" });
  const snapshot = await loadConversationSnapshot(platform, platformUserId);
  return res.json({
    platform,
    platformUserId,
    snapshot,
  });
}

export async function resetChatSessionController(req, res) {
  const parsed = chatSessionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const { platform, platformUserId } = parsed.data;
  const client = await prisma.client.findUnique({
    where: {
      platform_platformUserId: {
        platform,
        platformUserId,
      },
    },
    include: {
      conversations: {
        select: { id: true },
      },
    },
  });

  if (!client) {
    return res.json({ cleared: true, deletedConversationCount: 0 });
  }

  const conversationIds = client.conversations.map((conversation) => conversation.id);
  if (conversationIds.length > 0) {
    await prisma.message.deleteMany({
      where: { conversationId: { in: conversationIds } },
    });
    await prisma.conversation.deleteMany({
      where: { id: { in: conversationIds } },
    });
    await Promise.all(conversationIds.map((id) => redis.del(`conversation:ctx:${id}`)));
  }

  await prisma.client.delete({
    where: { id: client.id },
  });

  return res.json({
    cleared: true,
    deletedConversationCount: conversationIds.length,
  });
}

export async function notifyReservationDemandChatController(req, res) {
  const demandId = String(req.body?.demandId || "").trim();
  if (!demandId) return res.status(400).json({ error: "demandId is required" });
  const demand = await fetchReservationDemandById(demandId);
  if (!demand) return res.status(404).json({ error: "Reservation demand not found" });
  const result = await notifyDemandConversation(demand);
  return res.json({
    demandId,
    demandStatus: String(demand.status || "").trim(),
    ...result,
  });
}
