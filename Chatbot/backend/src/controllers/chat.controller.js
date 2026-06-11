import { incomingMessageQueue } from "../queues/incomingMessage.queue.js";
import { prisma } from "../config/prisma.js";
import { redis } from "../config/redis.js";
import { processIncomingMessage } from "../services/conversationProcessor.service.js";
import {
  fetchReservationDemandById,
  submitReservationIdentityFromChat,
} from "../services/projectBooking.service.js";
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

function toAbsoluteWebsiteUrl(rawUrl, websiteBaseUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${websiteBaseUrl}${value.startsWith("/") ? value : `/${value}`}`;
}

function buildDemandAutomationReply(lang, demand) {
  const status = String(demand?.status || "").trim();
  const demandId = String(demand?.id || "").trim();
  const websiteBaseUrl = String(process.env.WEBSITE_BASE_URL || "http://localhost:5173").replace(/\/+$/, "");
  const contractUrl = toAbsoluteWebsiteUrl(demand?.contract_url, websiteBaseUrl);
  const paymentPageUrl = `${websiteBaseUrl}/mes-reservations/${encodeURIComponent(demandId)}/paiement`;

  if (status === "reponse_positive_attente_confirmation_client") {
    if (lang === "tn") {
      return "El proprietaire 9bel ettaleb mte3ek. Tawa n7atherlek el contrat, w ki yetsajjel nab3athoulek houni m3a tari9et el paiement.";
    }
    if (lang === "en") {
      return "The owner accepted your request. I am preparing your contract now and I will send it here with the payment options.";
    }
    return "Le proprietaire a accepte votre demande. Je prepare maintenant votre contrat et je vous l'enverrai ici avec les options de paiement.";
  }

  if (["client_procede_vers_paiement_en_cours", "contrat_realise"].includes(status)) {
    if (!contractUrl) return null;
    if (lang === "tn") {
      return `El proprietaire 9bel ettaleb mte3ek. Hedha contratk PDF: ${contractUrl}. Bech nkamlou finalisation, 9olli t7eb t5alles b clicktopay wala b virement. Ken clicktopay, nab3athlek lien paiement. Ken virement, ab3athli recu paiement houni.`;
    }
    if (lang === "en") {
      return `The owner accepted your request. Here is your PDF contract: ${contractUrl}. To finalize the reservation, choose your payment method: ClickToPay or bank transfer. If you choose ClickToPay, I will send the payment link. If you choose bank transfer, send me the receipt here.`;
    }
    return `Le proprietaire a accepte votre demande. Voici votre contrat PDF : ${contractUrl}. Pour finaliser la reservation, choisissez votre mode de paiement : ClickToPay ou virement. Si vous choisissez ClickToPay, je vous enverrai le lien. Si vous choisissez le virement, envoyez-moi le recu ici.`;
  }

  if (status === "recu_paiement_envoye") {
    if (lang === "tn") return `Recu paiement tsajjel. Taw nstannaw ta2kid succes mta3 paiement. Page paiement: ${paymentPageUrl}`;
    if (lang === "en") return `Your payment receipt has been recorded. We are waiting for payment confirmation. Payment page: ${paymentPageUrl}`;
    return `Votre recu de paiement a ete enregistre. Nous attendons la confirmation du paiement. Page paiement : ${paymentPageUrl}`;
  }

  if (status === "succes_paiement") {
    if (lang === "tn") return `Paiement mte3ek ta3mal b succes. Reservation mte3ek tkamlet${contractUrl ? ` w hedha contratk: ${contractUrl}` : ""}.`;
    if (lang === "en") return `Your payment was successful. Your reservation is finalized${contractUrl ? ` and here is your contract: ${contractUrl}` : ""}.`;
    return `Votre paiement a ete confirme avec succes. Votre reservation est finalisee${contractUrl ? ` et voici votre contrat : ${contractUrl}` : ""}.`;
  }

  return null;
}

function buildIdentityProfileFromSources(demand, context) {
  const profile = context?.profile || {};
  const fullName = String(
    profile.fullName
    || demand?.client_name
    || [demand?.identity_first_name, demand?.identity_last_name].filter(Boolean).join(" ")
    || ""
  ).trim();
  const phone = String(profile.phone || "").trim();
  const email = String(profile.email || demand?.client_email || "").trim();
  const address = String(profile.address || "").trim();
  const identityNumber = String(
    profile.identityNumber
    || demand?.identity_document_number
    || ""
  ).trim();
  const identityImageUrl = String(
    profile.identityImageUrl
    || demand?.identity_document_image_url
    || ""
  ).trim();

  if (!fullName || !identityNumber || !identityImageUrl) return null;
  return {
    fullName,
    phone,
    email,
    address,
    identityNumber,
    identityImageUrl,
  };
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
  let effectiveDemand = demand;
  if (String(effectiveDemand?.status || "").trim() === "reponse_positive_attente_confirmation_client" && !String(effectiveDemand?.contract_id || "").trim()) {
    const identityProfile = buildIdentityProfileFromSources(effectiveDemand, context);
    if (identityProfile) {
      try {
        await submitReservationIdentityFromChat(demandId, identityProfile);
        effectiveDemand = await fetchReservationDemandById(demandId) || effectiveDemand;
      } catch {
        // Keep the owner-accepted fallback message when automatic contract generation is not ready.
      }
    }
  }

  const reply = buildDemandAutomationReply(lang, effectiveDemand);
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

