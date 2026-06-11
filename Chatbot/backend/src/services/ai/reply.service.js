import { openai } from "../../config/openai.js";
import { config } from "../../config/env.js";

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
- If no property matches, clearly say none are available and ask for alternative dates/budget.
- If required info is missing, ask concise follow-up questions.
- Keep a professional and concise conversion-focused tone.
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

export async function generateAssistantReply(input) {
  const { userMessage, language, state, extracted, constraints, propertyOptions, ragContext } = input;
  const contextBlock = JSON.stringify({ language, state, extracted, constraints, propertyOptions }, null, 2);

  const completion = await openai.chat.completions.create({
    model: config.openaiChatModel,
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_RULES },
      { role: "system", content: `RAG_CONTEXT:\n${ragContext || "none"}` },
      { role: "system", content: `STRUCTURED_CONTEXT:\n${contextBlock}` },
      { role: "user", content: userMessage },
    ],
  });

  return completion.choices[0]?.message?.content || "";
}

export async function generateKnowledgeReply(input) {
  const { userMessage, language, ragContext, constraints, conversationState } = input || {};
  const context = String(ragContext || "").trim();
  if (!context) return "";
  const searchContext = {
    conversationState: conversationState || null,
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

KNOWLEDGE_CONTEXT:
${context}

SEARCH_CONTEXT:
${JSON.stringify(searchContext, null, 2)}

USER_MESSAGE:
${String(userMessage || "")}
  `.trim();

  try {
    const completion = await withTimeout(
      openai.chat.completions.create({
        model: config.openaiChatModel,
        temperature: 0.1,
        messages: [
          { role: "system", content: SYSTEM_RULES },
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
  const { draftReply, language, userMessage, constraints, propertyOptions } = input || {};
  const baseReply = String(draftReply || "").trim();
  if (!baseReply) return "";
  if (language !== "tn") return baseReply;
  if (/^marhbe bik,\s*kifech najemou naawnouk,\s*chnw tlawej bithabet\??$/i.test(baseReply)) return baseReply;

  const compactOptions = (Array.isArray(propertyOptions) ? propertyOptions : []).slice(0, 3).map((item) => ({
    reference: item?.reference || null,
    title: item?.title || null,
    location: item?.location || null,
    pricePerNightTnd: item?.pricePerNightTnd || null,
  }));

  const prompt = `
Rewrite the assistant reply in natural Tunisian dialect written in Latin/Facebook style.
Rules:
- Keep the same meaning, same facts, same prices, same references, same links.
- Do not invent any new data.
- Keep it short, natural, and human, like a Tunisian rental agent on Messenger.
- Use plain text only.
- Keep property references and links unchanged.

User message:
${String(userMessage || "")}

Constraints:
${JSON.stringify(constraints || {}, null, 2)}

Options:
${JSON.stringify(compactOptions, null, 2)}

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
