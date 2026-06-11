import { prisma } from "../config/prisma.js";
import { redis } from "../config/redis.js";
import { parseUserIntent } from "../services/ai/intent.service.js";
import { processIncomingMessage } from "../services/conversationProcessor.service.js";
import { sendMetaMessage } from "../services/meta/sender.service.js";
import {
  advanceReservationDemandToOwnerAcceptedFromChat,
  advanceReservationDemandToPaymentStageFromChat,
  confirmManualReservationPaymentFromChat,
  createReservationCheckoutFromChat,
  fetchReservationDemandById,
  uploadReservationPaymentReceiptLinkFromChat,
} from "../services/projectBooking.service.js";

function normalizePlatformUserId(value) {
  const raw = String(value || "").trim();
  return raw || `debug_web_${Date.now()}`;
}

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
      return `The owner accepted your request. Your contract is ready${contractUrl ? `: ${contractUrl}` : ""}. To finalize the reservation, choose your payment method: ClickToPay or bank transfer. If you choose ClickToPay, I will send the payment link. If you choose bank transfer, send the receipt and we will wait for payment success confirmation. Payment page: ${paymentPageUrl}`;
    }
    return `Le proprietaire a accepte votre demande. Votre contrat est pret${contractUrl ? ` : ${contractUrl}` : ""}. Pour finaliser la reservation, choisissez votre mode de paiement: ClickToPay ou virement. Si vous choisissez ClickToPay, je vous enverrai le lien de paiement. Si vous choisissez le virement, envoyez le recu et nous attendrons la confirmation du paiement. Page paiement: ${paymentPageUrl}`;
  }
  if (status === "recu_paiement_envoye") {
    if (lang === "tn") return `Recu paiement tsajjel. Taw nstannaw ta2kid succes mta3 paiement. Page paiement: ${paymentPageUrl}`;
    if (lang === "en") return `Your payment receipt has been recorded. We are now waiting for payment success confirmation. You can follow the reservation here: ${paymentPageUrl}`;
    return `Votre recu de paiement a ete enregistre. Nous attendons maintenant la confirmation du paiement. Suivi ici: ${paymentPageUrl}`;
  }
  if (status === "succes_paiement") {
    if (lang === "tn") return `Paiement reservation mte3ek tsajjel b succes. Merci pour votre confiance.${contractUrl ? ` Hedha contratk: ${contractUrl}` : ""}`;
    if (lang === "en") return `Your reservation payment was successful. Thank you for your trust.${contractUrl ? ` Here is your contract: ${contractUrl}` : ""}`;
    return `Le paiement de votre reservation a ete confirme avec succes. Merci pour votre confiance.${contractUrl ? ` Voici votre contrat: ${contractUrl}` : ""}`;
  }
  return null;
}

async function notifyDemandConversation(demand) {
  const demandId = String(demand?.id || "").trim();
  if (!demandId) return;
  const conversationId = String(await redis.get(`reservation:demand:conversation:${demandId}`) || "").trim();
  if (!conversationId) return;
  const conversation = await prisma.conversation.findUnique({
    where: { id: Number(conversationId) },
    include: { client: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!conversation?.client) return;
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
  if (!reply) return;
  const lastMessage = Array.isArray(conversation.messages) ? conversation.messages[0] : null;
  if (String(lastMessage?.senderType || "").trim() === "bot" && String(lastMessage?.content || "").trim() === reply.trim()) {
    return;
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
}

export async function debugEvaluateChatController(req, res) {
  const platform = String(req.body?.platform || "website").trim() || "website";
  const platformUserId = normalizePlatformUserId(req.body?.platformUserId);
  const message = String(req.body?.message || "").trim();
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  const reset = req.body?.reset === true;

  if (!message && attachments.length === 0) {
    return res.status(400).json({ error: "message or attachments is required" });
  }

  if (reset) {
    await debugResetChatSessionController(
      {
        params: { platform, platformUserId },
      },
      {
        json() {},
        status() {
          return this;
        },
      }
    );
  }

  const parsedIntent = await parseUserIntent(message);
  const result = await processIncomingMessage({
    platform,
    platformUserId,
    message,
    attachments,
    parsedIntent,
  });
  const snapshot = await loadConversationSnapshot(platform, platformUserId);
  const reservationDemandId = String(snapshot?.context?.reservationDemandId || result?.reservationDemandId || "").trim();
  const reservationDemand = reservationDemandId ? await fetchReservationDemandById(reservationDemandId) : null;

  return res.json({
    platform,
    platformUserId,
    parsedIntent,
    result,
    snapshot,
    reservationDemand,
  });
}

export async function debugChatSessionController(req, res) {
  const platform = String(req.params.platform || "website").trim() || "website";
  const platformUserId = normalizePlatformUserId(req.params.platformUserId);
  const snapshot = await loadConversationSnapshot(platform, platformUserId);

  return res.json({
    platform,
    platformUserId,
    snapshot,
  });
}

export async function debugResetChatSessionController(req, res) {
  const platform = String(req.params.platform || "website").trim() || "website";
  const platformUserId = normalizePlatformUserId(req.params.platformUserId);
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
    return res.json({
      platform,
      platformUserId,
      cleared: false,
      message: "Session not found.",
    });
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
    platform,
    platformUserId,
    cleared: true,
    deletedConversationCount: conversationIds.length,
  });
}

export async function debugReservationDemandController(req, res) {
  const demandId = String(req.params.id || "").trim();
  if (!demandId) {
    return res.status(400).json({ error: "reservation demand id is required" });
  }
  const demand = await fetchReservationDemandById(demandId);
  if (!demand) {
    return res.status(404).json({ error: "Reservation demand not found" });
  }
  return res.json({ demand });
}

export async function debugReservationDemandActionController(req, res) {
  const demandId = String(req.params.id || "").trim();
  const action = String(req.body?.action || "").trim().toLowerCase();
  if (!demandId) {
    return res.status(400).json({ error: "reservation demand id is required" });
  }
  if (!action) {
    return res.status(400).json({ error: "action is required" });
  }

  try {
    let payload = null;
    if (action === "owner_accept") {
      await advanceReservationDemandToOwnerAcceptedFromChat(demandId);
      payload = await advanceReservationDemandToPaymentStageFromChat(demandId);
    } else if (action === "advance_to_payment") {
      payload = await advanceReservationDemandToPaymentStageFromChat(demandId);
    } else if (action === "upload_receipt_link") {
      payload = await uploadReservationPaymentReceiptLinkFromChat(demandId, {
        receiptUrl: req.body?.receiptUrl,
        note: req.body?.note,
        paymentReference: req.body?.paymentReference,
      });
    } else if (action === "create_clicktopay_checkout") {
      payload = await createReservationCheckoutFromChat(demandId, "clicktopay", String(req.body?.scope || "reservation"));
    } else if (action === "create_flouci_checkout") {
      payload = await createReservationCheckoutFromChat(demandId, "flouci", String(req.body?.scope || "reservation"));
    } else if (action === "mark_paid") {
      payload = await confirmManualReservationPaymentFromChat(
        demandId,
        String(req.body?.scope || "reservation"),
        String(req.body?.method || "virement")
      );
    } else {
      return res.status(400).json({ error: `Unsupported action: ${action}` });
    }

    const demand = await fetchReservationDemandById(demandId);
    if (demand) {
      await notifyDemandConversation(demand);
    }
    return res.json({ action, payload, demand });
  } catch (error) {
    return res.status(500).json({ error: String(error?.message || error || "Action failed") });
  }
}

