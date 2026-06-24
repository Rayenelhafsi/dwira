import { openai } from "../../config/openai.js";
import { config } from "../../config/env.js";
import { buildReplyCoachingContext } from "./recommendationLearning.service.js";

const SYSTEM_RULES = `
You are a multilingual vacation-rental booking assistant.
Supported user languages: Arabic, Tunisian dialect, French, English.
Rules:
- Reply in the same language as user.
- Use only these language codes: fr, en, ar, tn.
- If language is tn, reply in Tunisian dialect written in Latin/Facebook style using French characters and common Tunisian chat spelling.
- For tn, keep the tone natural and short, like a real Tunisian agent on Messenger. Example style: "sallem", "najem", "fama", "brabi", "nheb", "chnowa".
- Use only provided database and RAG context.
- Never invent properties, prices, availability, or discounts.
- Never switch to another language.
- Currency must be shown as TND only (for example: 480 TND/night).
- Output plain text only. Do not use markdown, bullets with stars, or image markdown syntax.
- When suggesting properties, include the property reference and the page link whenever available.
- When the request is broad and multiple properties may fit, prefer sharing the filtered Dwira search link if available.
- When the request is specific or there are 1-3 strong matches, include one or more direct property page links.
- If no property matches, clearly say none are available and ask for alternative dates/budget.
- If required info is missing, ask concise follow-up questions.
- Keep a professional and concise conversion-focused tone.
- Sound like a real human agent in a live discussion, not like a rigid form.
`;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}_timeout`)), Math.max(1, ms))),
  ]);
}

function collectProtectedTokens(text) {
  const source = String(text || "");
  const refs = source.match(/\bREF[\s-]?\d+[A-Z0-9-]*\b/gi) || [];
  const urls = source.match(/https?:\/\/\S+/gi) || [];
  const dates = source.match(/\b20\d{2}-\d{2}-\d{2}\b/g) || [];
  const money = source.match(/\b\d+(?:[.,]\d+)?\s*TND(?:\/(?:nuit|night|semaine|week))?\b/gi) || [];
  return {
    refs: refs.map((value) => value.replace(/\s+/g, "").toUpperCase()).sort(),
    urls: urls.sort(),
    dates: dates.sort(),
    money: money.map((value) => value.replace(/\s+/g, " ").trim().toUpperCase()).sort(),
  };
}

function sameProtectedTokens(a, b) {
  return JSON.stringify(collectProtectedTokens(a)) === JSON.stringify(collectProtectedTokens(b));
}

function normalizeConversationTranscript(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join("\n");
  }
  return String(value || "").trim();
}

function compactPropertyOptions(propertyOptions) {
  return (Array.isArray(propertyOptions) ? propertyOptions : []).slice(0, 6).map((item) => ({
    reference: item?.reference || null,
    title: item?.title || null,
    location: item?.location || null,
    pricePerNightTnd: item?.pricePerNightTnd || null,
    pricePerWeekTnd: item?.pricePerWeekTnd || null,
    link: item?.link || null,
  }));
}

function formatLinkContext(shareLinks) {
  const payload = shareLinks && typeof shareLinks === "object" ? shareLinks : {};
  return JSON.stringify({
    seasonalSearchUrl: payload?.seasonalSearchUrl || null,
    seasonalSearchRelativeUrl: payload?.seasonalSearchRelativeUrl || null,
    selectedPropertyUrl: payload?.selectedPropertyUrl || null,
    optionLinks: Array.isArray(payload?.optionLinks) ? payload.optionLinks : [],
  }, null, 2);
}

function shouldKeepSearchLinkReplyAsIs(reply) {
  const text = String(reply || "").trim();
  if (!text) return false;
  return /(?:lien de recherche|lien recherche|search link)\s*:/i.test(text);
}

export async function generateAssistantReply(input) {
  const {
    userMessage,
    language,
    state,
    extracted,
    constraints,
    propertyOptions,
    ragContext,
    conversationTranscript,
    platform,
    shareLinks,
  } = input;
  const contextBlock = JSON.stringify({
    language,
    state,
    platform: String(platform || "").trim().toLowerCase() || "website",
    extracted,
    constraints,
    propertyOptions: compactPropertyOptions(propertyOptions),
  }, null, 2);
  const transcriptBlock = normalizeConversationTranscript(conversationTranscript) || "none";
  const linkBlock = formatLinkContext(shareLinks);
  const coachingBlock = await buildReplyCoachingContext({ userMessage, language, state });

  const completion = await openai.chat.completions.create({
    model: config.openaiChatModel,
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_RULES },
      { role: "system", content: `RAG_CONTEXT:\n${ragContext || "none"}` },
      { role: "system", content: `LIVE_CONVERSATION_TRANSCRIPT:\n${transcriptBlock}` },
      { role: "system", content: `LINK_CONTEXT:\n${linkBlock}` },
      { role: "system", content: `REPLY_COACHING:\n${coachingBlock || "none"}` },
      { role: "system", content: `STRUCTURED_CONTEXT:\n${contextBlock}` },
      { role: "user", content: userMessage },
    ],
  });

  return completion.choices[0]?.message?.content || "";
}

export async function generateKnowledgeReply(input) {
  const {
    userMessage,
    language,
    ragContext,
    constraints,
    conversationState,
    conversationTranscript,
    platform,
    shareLinks,
  } = input || {};
  const context = String(ragContext || "").trim();
  if (!context) return "";
  const searchContext = {
    conversationState: conversationState || null,
    platform: String(platform || "").trim().toLowerCase() || "website",
    location: constraints?.location || null,
    type: constraints?.type || null,
    subType: constraints?.subType || null,
    selectedPropertyRef: constraints?.selectedPropertyRef || null,
    startDate: constraints?.startDate || null,
    endDate: constraints?.endDate || null,
  };

  const prompt = `
Answer the user's general information question using only the knowledge context below.
Rules:
- Reply in the same language as the user.
- If the user language is Tunisian dialect, write in natural Tunisian Latin/Facebook style.
- Use only facts present in the knowledge context.
- Do not invent timings, policies, opening hours, discounts, or booking confirmations.
- Do not list properties unless the question explicitly asks for properties.
- Keep the answer concise and practical.
- If the user is asking a side question during an existing property search, answer the side question first without destroying the search context.
- If the answer depends on a specific property or exact stay dates and they are missing, say that briefly.
- If the knowledge context is insufficient, say so briefly and ask the user to specify the property reference or dates if needed.
- Stay coherent with the live transcript and avoid sounding robotic.
- Apply relevant coaching recommendations if they fit this case without inventing facts.

KNOWLEDGE_CONTEXT:
${context}

SEARCH_CONTEXT:
${JSON.stringify(searchContext, null, 2)}

LIVE_CONVERSATION_TRANSCRIPT:
${normalizeConversationTranscript(conversationTranscript) || "none"}

LINK_CONTEXT:
${formatLinkContext(shareLinks)}

USER_MESSAGE:
${String(userMessage || "")}
  `.trim();
  const coachingBlock = await buildReplyCoachingContext({
    userMessage,
    language,
    state: conversationState,
  });

  try {
    const completion = await withTimeout(
      openai.chat.completions.create({
        model: config.openaiChatModel,
        temperature: 0.1,
        messages: [
          { role: "system", content: SYSTEM_RULES },
          { role: "system", content: `REPLY_COACHING:\n${coachingBlock || "none"}` },
          { role: "user", content: prompt },
        ],
      }),
      config.openaiTimeoutMs,
      "knowledge_reply"
    );
    return completion.choices[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}

export async function polishAssistantReply(input) {
  const {
    draftReply,
    language,
    userMessage,
    constraints,
    propertyOptions,
    conversationTranscript,
    platform,
    shareLinks,
    state,
  } = input || {};
  const baseReply = String(draftReply || "").trim();
  if (!baseReply) return "";
  if (/^marhbe bik,\s*kifech najemou naawnouk,\s*chnw tlawej bithabet\??$/i.test(baseReply)) return baseReply;
  if (shouldKeepSearchLinkReplyAsIs(baseReply)) return baseReply;

  const compactOptions = compactPropertyOptions(propertyOptions);
  const coachingBlock = await buildReplyCoachingContext({ userMessage, language, state });

  const prompt = `
Rewrite the assistant reply so it sounds like a real live-agent message in an ongoing conversation.
Rules:
- Keep the same meaning, same facts, same prices, same references, same links.
- Do not invent any new data.
- Stay in the same language as the user. Allowed languages: fr, en, ar, tn.
- If language is tn, write natural Tunisian dialect in Latin/Facebook style.
- Keep it short, natural, and human, as if replying on ${String(platform || "website").trim() || "website"}.
- Stay coherent with the live transcript. Do not ignore what was already said in the conversation.
- If a filtered seasonal search link is provided and it helps the user continue, you may include it once naturally.
- If the user needs to browse several possible matches, prefer the filtered search link over a long manual list.
- If the user asks for a specific property or the shortlist is very strong, include the direct property page links.
- If the draft already contains the right decision, improve the phrasing instead of changing the decision.
- Use plain text only.
- Do not use markdown bullets with stars.
- Keep property references, dates, prices, and links unchanged.
- Apply relevant coaching recommendations if they fit this case, but never override factual constraints.

User message:
${String(userMessage || "")}

Conversation state:
${String(state || "").trim() || "unknown"}

Live transcript:
${normalizeConversationTranscript(conversationTranscript) || "none"}

Constraints:
${JSON.stringify(constraints || {}, null, 2)}

Options:
${JSON.stringify(compactOptions, null, 2)}

Link context:
${formatLinkContext(shareLinks)}

Reply coaching:
${coachingBlock || "none"}

Draft reply:
${baseReply}
  `.trim();

  try {
    const completion = await withTimeout(
      openai.chat.completions.create({
        model: config.openaiChatModel,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM_RULES },
          { role: "user", content: prompt },
        ],
      }),
      config.tonePolishTimeoutMs,
      "tone_polish"
    );

    const candidate = completion.choices[0]?.message?.content?.trim() || baseReply;
    if (!sameProtectedTokens(baseReply, candidate)) return baseReply;
    return candidate;
  } catch {
    return baseReply;
  }
}
