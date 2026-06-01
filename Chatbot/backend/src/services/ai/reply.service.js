import { openai } from "../../config/openai.js";
import { config } from "../../config/env.js";

const SYSTEM_RULES = `
You are a multilingual vacation-rental booking assistant.
Supported user languages: Arabic, Tunisian dialect, French, English.
Rules:
- Reply in the same language as user.
- Use only these language codes: fr, en, ar, tn.
- Use only provided database and RAG context.
- Never invent properties, prices, availability, or discounts.
- Never switch to another language.
- Currency must be shown as TND only (for example: 480 TND/night).
- Output plain text only. Do not use markdown, bullets with stars, or image markdown syntax.
- If no property matches, clearly say none are available and ask for alternative dates/budget.
- If required info is missing, ask concise follow-up questions.
- Keep a professional and concise conversion-focused tone.
`;

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
