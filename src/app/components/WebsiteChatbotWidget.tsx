import { useEffect, useRef, useState } from "react";
import { ImagePlus, MessageCircle, Send, X } from "lucide-react";
import { createChatbotFeedback } from "../services/chatbotFeedback";

type ChatOption = {
  id: string | number;
  title: string;
  location?: string | null;
  pricePerNightTnd?: number | null;
};

type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  previewUrl: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  options?: ChatOption[];
  attachments?: ChatAttachment[];
};

type FeedbackDraft = {
  beforeReplyInstruction: string;
  correctedAnswer: string;
  reason: string;
};

type SendChatMessageParams = {
  attachments?: ChatAttachment[];
  targetVisitorId?: string;
  text: string;
};

type SessionMessage = {
  id?: string | number | null;
  senderType?: string | null;
  content?: string | null;
  createdAt?: string | null;
};

const VISITOR_KEY = "dwira_chatbot_visitor_id";
const WELCOME_TEXT = "Marhbe bik. A7ki m3aya b franca, عربي, english wala tounsi. Tnajem zeda تبعث photo CIN wala reçu paiement men houni.";
const messageStorageKey = (visitorId: string) => `dwira_chatbot_messages_${visitorId}`;
let resolvedChatbotApiBasePromise: Promise<string> | null = null;

function getVisitorId() {
  const next = `web_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    localStorage.setItem(VISITOR_KEY, next);
    return next;
  } catch {
    return next;
  }
}

function replaceVisitorId() {
  const next = `web_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    localStorage.setItem(VISITOR_KEY, next);
  } catch {
    // Ignore storage failure and still return a fresh in-memory id.
  }
  return next;
}

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

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Impossible de lire l'image"));
    reader.readAsDataURL(file);
  });
}

function normalizeOptions(rawOptions: any[]): ChatOption[] {
  return rawOptions
    .slice(0, 3)
    .map((option) => ({
      id: option?.id ?? "",
      title: String(option?.title || "").trim(),
      location: String(option?.location || "").trim() || null,
      pricePerNightTnd: Number.isFinite(Number(option?.pricePerNightTnd)) ? Number(option.pricePerNightTnd) : null,
    }))
    .filter((option) => option.title);
}

function buildWelcomeMessage(idSuffix?: string): ChatMessage {
  return {
    id: `welcome_${idSuffix || Date.now()}`,
    role: "assistant",
    text: WELCOME_TEXT,
  };
}

function serializeMessages(messages: ChatMessage[]) {
  return JSON.stringify(
    (Array.isArray(messages) ? messages : []).map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      options: Array.isArray(message.options) ? message.options : [],
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
    }))
  );
}

function readLocalMessages(visitorId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(messageStorageKey(visitorId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((message, index) => ({
        id: String(message?.id || `local_${index}`),
        role: message?.role === "user" ? "user" : "assistant",
        text: String(message?.text || ""),
        options: Array.isArray(message?.options) ? normalizeOptions(message.options) : [],
        attachments: Array.isArray(message?.attachments)
          ? message.attachments
              .map((attachment: any, attachmentIndex: number) => ({
                id: String(attachment?.id || `local_att_${index}_${attachmentIndex}`),
                name: String(attachment?.name || "image"),
                mimeType: String(attachment?.mimeType || "image/*"),
                dataUrl: String(attachment?.dataUrl || attachment?.previewUrl || ""),
                previewUrl: String(attachment?.previewUrl || attachment?.dataUrl || ""),
              }))
              .filter((attachment: ChatAttachment) => attachment.previewUrl)
          : [],
      }))
      .filter((message) => message.text || (Array.isArray(message.attachments) && message.attachments.length > 0));
  } catch {
    return [];
  }
}

function writeLocalMessages(visitorId: string, messages: ChatMessage[]) {
  try {
    localStorage.setItem(messageStorageKey(visitorId), serializeMessages(messages));
  } catch {
    // Ignore storage issues.
  }
}

function sanitizeAssistantReply(text: string) {
  return String(text || "").trim();
}

function getMessageSignature(message: Pick<ChatMessage, "role" | "text" | "attachments">) {
  const attachmentSignature = Array.isArray(message.attachments)
    ? message.attachments.map((attachment) => `${attachment.name}|${attachment.previewUrl}`).join("||")
    : "";
  return `${message.role}::${String(message.text || "").trim()}::${attachmentSignature}`;
}

function mergeStoredMessages(rawMessages: SessionMessage[], localMessages: ChatMessage[]): ChatMessage[] {
  const restored = (Array.isArray(rawMessages) ? rawMessages : [])
    .map((message, index) => {
      const sender = String(message?.senderType || "").trim().toLowerCase();
      const text = String(message?.content || "");
      const localMatch = Array.isArray(localMessages) ? localMessages[index] : null;
      const attachments =
        localMatch?.role === (sender === "client" ? "user" : "assistant")
        && String(localMatch?.text || "") === text
        && Array.isArray(localMatch?.attachments)
        ? localMatch.attachments
        : [];
      if (!text.trim() && attachments.length === 0) return null;
      return {
        id: String(message?.id || `stored_${index}`),
        role: sender === "client" ? "user" : "assistant",
        text,
        attachments,
      } satisfies ChatMessage;
    })
    .filter((message): message is ChatMessage => Boolean(message));

  if (restored.length === 0) {
    return localMessages.length > 0 ? localMessages : [buildWelcomeMessage("restored")];
  }

  const restoredSignatures = new Set(restored.map((message) => getMessageSignature(message)));
  const extras = localMessages
    .slice(restored.length)
    .filter((message) => (message.text || (message.attachments?.length || 0) > 0) && !restoredSignatures.has(getMessageSignature(message)));
  return extras.length > 0 ? [...restored, ...extras] : restored;
}

function findPreviousUserMessage(messages: ChatMessage[], assistantMessageId: string) {
  const index = messages.findIndex((message) => message.id === assistantMessageId);
  if (index <= 0) return "";
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = messages[cursor];
    if (candidate?.role === "user" && String(candidate.text || "").trim()) {
      return String(candidate.text || "").trim();
    }
  }
  return "";
}

export default function WebsiteChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [feedbackSavingId, setFeedbackSavingId] = useState<string | null>(null);
  const [feedbackOpenId, setFeedbackOpenId] = useState<string | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, FeedbackDraft>>({});
  const [visitorId, setVisitorId] = useState(() => getVisitorId());
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const initialVisitorId = getVisitorId();
    const localMessages = readLocalMessages(initialVisitorId);
    return localMessages.length > 0 ? localMessages : [buildWelcomeMessage("initial")];
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const pollingRef = useRef<number | null>(null);
  const hydratedVisitorRef = useRef<string | null>(null);

  useEffect(() => {
    const node = messageListRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, pendingAttachments, open]);

  useEffect(() => {
    writeLocalMessages(visitorId, messages);
  }, [visitorId, messages]);

  const hydrateConversation = async (targetVisitorId = visitorId) => {
    const apiBase = await resolveChatbotApiBase();
    const response = await fetch(`${apiBase}/chat/session/website/${encodeURIComponent(targetVisitorId)}`);
    if (!response.ok) return;
    const data = await response.json();
    const localMessages = readLocalMessages(targetVisitorId);
    const storedMessages = mergeStoredMessages(data?.snapshot?.conversation?.messages || [], localMessages);
    setMessages((current) => {
      const currentSignature = serializeMessages(current);
      const nextSignature = serializeMessages(storedMessages);
      return currentSignature === nextSignature ? current : storedMessages;
    });
    hydratedVisitorRef.current = targetVisitorId;
  };

  useEffect(() => {
    if (!open) {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    void hydrateConversation(visitorId);
    pollingRef.current = window.setInterval(() => {
      if (sending || uploading || resetting) return;
      void hydrateConversation(visitorId);
    }, 4000);

    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [open, visitorId, sending, uploading, resetting]);

  useEffect(() => {
    if (hydratedVisitorRef.current === visitorId) return;
    void hydrateConversation(visitorId);
  }, [visitorId]);

  const resetLocalConversation = (nextVisitorId?: string) => {
    setDraft("");
    setPendingAttachments([]);
    setMessages([buildWelcomeMessage(nextVisitorId)]);
    try {
      localStorage.removeItem(messageStorageKey(visitorId));
    } catch {
      // Ignore storage issues.
    }
    hydratedVisitorRef.current = nextVisitorId || null;
  };

  const handleNewConversation = async () => {
    if (sending || uploading || resetting) return;
    setResetting(true);
    try {
      const apiBase = await resolveChatbotApiBase();
      await fetch(`${apiBase}/chat/session/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "website",
          platformUserId: visitorId,
        }),
      });
    } catch {
      // Local reset still matters even if the backend reset fails.
    } finally {
      const nextVisitorId = replaceVisitorId();
      setVisitorId(nextVisitorId);
      resetLocalConversation(nextVisitorId);
      setResetting(false);
    }
  };

  const handlePickImage = () => {
    if (sending || uploading || resetting) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setUploading(true);
    try {
      const nextAttachments: ChatAttachment[] = [];
      for (const file of files.slice(0, 3)) {
        if (!file.type.startsWith("image/")) continue;
        const dataUrl = await fileToDataUrl(file);
        nextAttachments.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: file.name || "image",
          mimeType: file.type || "image/*",
          dataUrl,
          previewUrl: dataUrl,
        });
      }
      if (nextAttachments.length) {
        setPendingAttachments((prev) => [...prev, ...nextAttachments].slice(0, 3));
      }
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const removePendingAttachment = (attachmentId: string) => {
    setPendingAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
  };

  const openFeedbackDraft = (messageId: string) => {
    setFeedbackOpenId(messageId);
    setFeedbackDrafts((current) => ({
      ...current,
      [messageId]: current[messageId] || { beforeReplyInstruction: "", correctedAnswer: "", reason: "" },
    }));
  };

  const closeFeedbackDraft = (messageId: string) => {
    setFeedbackOpenId((current) => (current === messageId ? null : current));
  };

  const updateFeedbackDraft = (messageId: string, patch: Partial<FeedbackDraft>) => {
    setFeedbackDrafts((current) => ({
      ...current,
      [messageId]: {
        beforeReplyInstruction: current[messageId]?.beforeReplyInstruction || "",
        correctedAnswer: current[messageId]?.correctedAnswer || "",
        reason: current[messageId]?.reason || "",
        ...patch,
      },
    }));
  };

  const sendChatMessage = async ({ text, attachments = [], targetVisitorId }: SendChatMessageParams) => {
    const normalizedText = String(text || "").trim();
    const attachmentsToSend = Array.isArray(attachments) ? attachments : [];
    if (!normalizedText && attachmentsToSend.length === 0) return null;

    const effectiveVisitorId = String(targetVisitorId || visitorId).trim() || visitorId;
    const apiBase = await resolveChatbotApiBase();
    const response = await fetch(`${apiBase}/chat/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: "website",
        platformUserId: effectiveVisitorId,
        message: normalizedText,
        attachments: attachmentsToSend.map((attachment) => ({
          type: "image",
          name: attachment.name,
          mimeType: attachment.mimeType,
          dataUrl: attachment.dataUrl,
        })),
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const detail = String(payload?.detail || payload?.message || payload?.error || "").trim();
      throw new Error(detail || "Assistant indisponible");
    }

    const data = await response.json();
    return {
      options: Array.isArray(data?.options) ? normalizeOptions(data.options) : [],
      reply: sanitizeAssistantReply(String(data?.reply || "").trim()) || "Merci. Un conseiller vous repondra sous peu.",
    };
  };

  const submitFeedback = async (assistantMessage: ChatMessage, shouldRetest = false) => {
    const draftState = feedbackDrafts[assistantMessage.id] || { beforeReplyInstruction: "", correctedAnswer: "", reason: "" };
    const beforeReplyInstruction = String(draftState.beforeReplyInstruction || "").trim();
    const correctedAnswer = String(draftState.correctedAnswer || "").trim();
    const reason = String(draftState.reason || "").trim();
    const composedReason = [beforeReplyInstruction ? `Avant de repondre comme ca, il faut d'abord dire: ${beforeReplyInstruction}` : "", reason]
      .filter(Boolean)
      .join("\n");
    const question = findPreviousUserMessage(messages, assistantMessage.id);
    const botAnswer = String(assistantMessage.text || "").trim();
    if (!question || (!correctedAnswer && !composedReason) || feedbackSavingId) return;

    setFeedbackSavingId(assistantMessage.id);
    try {
      await createChatbotFeedback({
        question,
        botAnswer,
        correctedAnswer: correctedAnswer || null,
        reason: composedReason || null,
      });
      setFeedbackDrafts((current) => ({
        ...current,
        [assistantMessage.id]: { beforeReplyInstruction: "", correctedAnswer: "", reason: "" },
      }));
      setFeedbackOpenId((current) => (current === assistantMessage.id ? null : current));
      if (!shouldRetest) {
        setMessages((current) => [
          ...current,
          {
            id: `a_feedback_${Date.now()}`,
            role: "assistant",
            text: "Merci. Correction tsajlet, w bch t3aweni n7assen الردود fi حالات شبيهة.",
          },
        ]);
        return;
      }

      const nextVisitorId = replaceVisitorId();
      setVisitorId(nextVisitorId);
      resetLocalConversation(nextVisitorId);
      const retestQuestion: ChatMessage = {
        id: `u_retest_${Date.now()}`,
        role: "user",
        text: question,
      };
      setMessages((current) => [...current, retestQuestion]);
      const retestResult = await sendChatMessage({
        text: question,
        targetVisitorId: nextVisitorId,
      });
      setMessages((current) => [
        ...current,
        {
          id: `a_retest_info_${Date.now()}`,
          role: "assistant",
          text: "Retest lancé fi discussion jdida bech nra ken l correction tetsabba9 tawa.",
        },
        {
          id: `a_retest_${Date.now() + 1}`,
          role: "assistant",
          text: String(retestResult?.reply || "").trim(),
          options: Array.isArray(retestResult?.options) ? retestResult.options : [],
        },
      ]);
      hydratedVisitorRef.current = nextVisitorId;
    } catch (error) {
      const detail = String(error instanceof Error ? error.message : "").trim();
      setMessages((current) => [
        ...current,
        {
          id: `a_feedback_err_${Date.now()}`,
          role: "assistant",
          text: import.meta.env.DEV && detail ? `Impossible d'enregistrer la correction.\n[debug] ${detail}` : "Impossible d'enregistrer la correction pour le moment.",
        },
      ]);
    } finally {
      setFeedbackSavingId(null);
    }
  };

  const canSubmitFeedback = (messageId: string) => {
    const draftState = feedbackDrafts[messageId];
    return Boolean(
      String(draftState?.beforeReplyInstruction || "").trim()
      || String(draftState?.correctedAnswer || "").trim()
      || String(draftState?.reason || "").trim()
    );
  };

  const sendMessage = async () => {
    const text = draft.trim();
    const attachmentsToSend = pendingAttachments;
    if ((!text && attachmentsToSend.length === 0) || sending || uploading || resetting) return;

    const userMessage: ChatMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      text,
      attachments: attachmentsToSend,
    };
    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    setPendingAttachments([]);
    setSending(true);

    try {
      const result = await sendChatMessage({
        text,
        attachments: attachmentsToSend,
      });
      const reply = String(result?.reply || "").trim() || "Merci. Un conseiller vous repondra sous peu.";
      const options = Array.isArray(result?.options) ? result.options : [];
      await hydrateConversation(visitorId);
      setMessages((current) => {
        const lastAssistantMessage = [...current].reverse().find((message) => message.role === "assistant");
        if (lastAssistantMessage && lastAssistantMessage.text.trim() === reply) {
          return current;
        }
        return [...current, { id: `a_${Date.now()}`, role: "assistant", text: reply, options }];
      });
      hydratedVisitorRef.current = visitorId;
    } catch (error) {
      const fallbackText = "Service temporairement indisponible. Essayez encore ou contactez-nous via WhatsApp / Messenger.";
      const detail = String(error instanceof Error ? error.message : "").trim();
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          text: import.meta.env.DEV && detail ? `${fallbackText}\n\n[debug] ${detail}` : fallbackText,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-5 right-5 z-[95] inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition hover:bg-emerald-700"
        aria-label="Ouvrir assistant"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-[95] flex h-[78vh] w-[min(94vw,420px)] flex-col overflow-hidden rounded-[28px] border border-emerald-100 bg-white shadow-2xl">
          <div className="border-b border-emerald-100 bg-[linear-gradient(135deg,#effcf4,#ecfdf5_55%,#f8fffb)] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-900">Assistant reservation Dwira</p>
                <p className="text-xs text-emerald-700">FR | AR | TN | EN</p>
              </div>
              <button
                type="button"
                onClick={() => void handleNewConversation()}
                disabled={sending || uploading || resetting}
                className="rounded-lg border border-emerald-200 px-2.5 py-1 text-[11px] font-medium text-emerald-900 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resetting ? "Reset..." : "Nouvelle discussion"}
              </button>
            </div>
          </div>

          <div ref={messageListRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50/45 px-3 py-3">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    message.role === "user" ? "bg-emerald-600 text-white" : "bg-white text-slate-800"
                  }`}
                >
                  {message.text ? <div className="whitespace-pre-line">{message.text}</div> : null}

                  {Array.isArray(message.attachments) && message.attachments.length > 0 ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {message.attachments.map((attachment) => (
                        <img
                          key={attachment.id}
                          src={attachment.previewUrl}
                          alt={attachment.name}
                          className="h-24 w-full rounded-xl object-cover ring-1 ring-black/5"
                        />
                      ))}
                    </div>
                  ) : null}

                  {message.role === "assistant" && Array.isArray(message.options) && message.options.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {message.options.map((option) => (
                        <div key={String(option.id)} className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-xs text-slate-700">
                          <div className="font-semibold text-slate-900">{option.title}</div>
                          {option.location ? <div>{option.location}</div> : null}
                          {option.pricePerNightTnd ? <div>{option.pricePerNightTnd} TND / nuit</div> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {message.role === "assistant" && !String(message.id || "").startsWith("welcome_") ? (
                    <div className="mt-3 border-t border-slate-100 pt-2">
                      <button
                        type="button"
                        onClick={() => openFeedbackDraft(message.id)}
                        className="text-[11px] font-medium text-emerald-700 transition hover:text-emerald-900"
                      >
                        Corriger cette reponse
                      </button>

                      {feedbackOpenId === message.id ? (
                        <div className="mt-2 space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-2.5">
                          <textarea
                            value={feedbackDrafts[message.id]?.beforeReplyInstruction || ""}
                            onChange={(event) => updateFeedbackDraft(message.id, { beforeReplyInstruction: event.target.value })}
                            rows={2}
                            placeholder="Avant de repondre comme ca, il faut d'abord dire..."
                            className="w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500"
                          />
                          <textarea
                            value={feedbackDrafts[message.id]?.correctedAnswer || ""}
                            onChange={(event) => updateFeedbackDraft(message.id, { correctedAnswer: event.target.value })}
                            rows={3}
                            placeholder="Ce qu'il aurait mieux fait de repondre..."
                            className="w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500"
                          />
                          <textarea
                            value={feedbackDrafts[message.id]?.reason || ""}
                            onChange={(event) => updateFeedbackDraft(message.id, { reason: event.target.value })}
                            rows={2}
                            placeholder="Instruction courte: dans un cas proche, repondre plutot comme ceci..."
                            className="w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-emerald-500"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => closeFeedbackDraft(message.id)}
                              disabled={feedbackSavingId === message.id}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600"
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              onClick={() => void submitFeedback(message)}
                              disabled={
                                feedbackSavingId === message.id
                                || !canSubmitFeedback(message.id)
                              }
                              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {feedbackSavingId === message.id ? "Envoi..." : "Enregistrer"}
                            </button>
                            <button
                              type="button"
                              onClick={() => void submitFeedback(message, true)}
                              disabled={
                                feedbackSavingId === message.id
                                || !canSubmitFeedback(message.id)
                              }
                              className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {feedbackSavingId === message.id ? "Retest..." : "Enregistrer + retester"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {pendingAttachments.length > 0 ? (
              <div className="rounded-2xl border border-dashed border-emerald-200 bg-white px-3 py-3">
                <div className="mb-2 text-xs font-medium text-slate-600">Images pretes a envoyer</div>
                <div className="grid grid-cols-3 gap-2">
                  {pendingAttachments.map((attachment) => (
                    <div key={attachment.id} className="relative">
                      <img
                        src={attachment.previewUrl}
                        alt={attachment.name}
                        className="h-20 w-full rounded-xl object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePendingAttachment(attachment.id)}
                        className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
                        aria-label="Supprimer image"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-100 bg-white p-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handlePickImage}
                disabled={sending || uploading || resetting || pendingAttachments.length >= 3}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-800 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ImagePlus size={15} />
                {uploading ? "Chargement image..." : "Ajouter image"}
              </button>
              <span className="text-[11px] text-slate-500">CIN, recu, capture, photo du document</span>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Ex: nheb ref-251 / photo CIN / 12-18 aout, 4 personnes"
                className="h-11 flex-1 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={sending || uploading || resetting || (!draft.trim() && pendingAttachments.length === 0)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white transition disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Envoyer"
              >
                <Send size={17} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
