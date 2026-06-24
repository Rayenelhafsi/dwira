export type ChatbotFeedbackRow = {
  id: number;
  question: string;
  botAnswer: string;
  correctedAnswer?: string | null;
  reason?: string | null;
  createdAt: string;
};

export type CreateChatbotFeedbackInput = {
  question: string;
  botAnswer?: string;
  correctedAnswer?: string | null;
  reason?: string | null;
};

let resolvedChatbotApiBasePromise: Promise<string> | null = null;

function getChatbotApiBase() {
  const configured = String(import.meta.env.VITE_CHATBOT_API_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");

  const host = window.location.hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  if (isLocalHost) return "http://localhost:8090";

  return `${window.location.origin.replace(/\/+$/, "")}/chatbot-api`;
}

function buildChatbotApiCandidates() {
  const configured = String(import.meta.env.VITE_CHATBOT_API_URL || "").trim().replace(/\/+$/, "");
  const origin = window.location.origin.replace(/\/+$/, "");
  const host = window.location.hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  const candidates = [
    configured,
    window.location.protocol === "http:" ? `http://${host}:8090` : "",
    isLocalHost ? "http://localhost:8090" : "",
    isLocalHost ? "http://127.0.0.1:8090" : "",
    `${origin}/chatbot-api`,
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}

async function probeChatbotApiBase(baseUrl: string) {
  const normalizedBase = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!normalizedBase) return false;
  try {
    const response = await fetch(`${normalizedBase}/health`, {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => null);
    return Boolean(payload?.ok);
  } catch {
    return false;
  }
}

async function resolveChatbotApiBase() {
  if (!resolvedChatbotApiBasePromise) {
    resolvedChatbotApiBasePromise = (async () => {
      const candidates = buildChatbotApiCandidates();
      for (const candidate of candidates) {
        if (await probeChatbotApiBase(candidate)) {
          return candidate;
        }
      }
      return getChatbotApiBase();
    })().catch((error) => {
      resolvedChatbotApiBasePromise = null;
      throw error;
    });
  }
  return resolvedChatbotApiBasePromise;
}

async function fetchChatbotJson<T>(path: string, init?: RequestInit): Promise<T> {
  const apiBase = await resolveChatbotApiBase();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${apiBase}${normalizedPath}`, {
    credentials: "include",
    ...(init || {}),
    headers: {
      ...(init?.headers || {}),
    },
  });

  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    if (raw.trim().startsWith("<")) {
      throw new Error(`HTML recu depuis ${apiBase}`);
    }
    throw new Error(`Reponse non JSON depuis ${apiBase}`);
  }

  if (!response.ok) {
    throw new Error(String(data?.detail || data?.message || data?.error || `Erreur API depuis ${apiBase}`));
  }

  return data as T;
}

export async function listChatbotFeedback(): Promise<ChatbotFeedbackRow[]> {
  return fetchChatbotJson<ChatbotFeedbackRow[]>("/feedback");
}

export async function createChatbotFeedback(input: CreateChatbotFeedbackInput): Promise<{ id: number; stored: boolean; message: string }> {
  return fetchChatbotJson<{ id: number; stored: boolean; message: string }>("/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: String(input.question || "").trim(),
      botAnswer: String(input.botAnswer || "").trim(),
      correctedAnswer: String(input.correctedAnswer || "").trim() || null,
      reason: String(input.reason || "").trim() || null,
    }),
  });
}
