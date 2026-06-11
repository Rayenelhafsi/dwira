import { useEffect, useRef, useState } from "react";
import { ImagePlus, MessageCircle, Send, X } from "lucide-react";

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

type SessionMessage = {
  id?: string | number | null;
  senderType?: string | null;
  content?: string | null;
  createdAt?: string | null;
};

const VISITOR_KEY = "dwira_chatbot_visitor_id";
const WELCOME_TEXT = "Marhbe bik. A7ki m3aya b franca, عربي, english wala tounsi. Tnajem zeda تبعث photo CIN wala reçu paiement men houni.";
const messageStorageKey = (visitorId: string) => `dwira_chatbot_messages_${visitorId}`;

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

  const extras = localMessages.slice(restored.length).filter((message) => message.text || (message.attachments?.length || 0) > 0);
  return extras.length > 0 ? [...restored, ...extras] : restored;
}

export default function WebsiteChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resetting, setResetting] = useState(false);
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
    const response = await fetch(`${getChatbotApiBase()}/chat/session/website/${encodeURIComponent(targetVisitorId)}`);
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
      await fetch(`${getChatbotApiBase()}/chat/session/reset`, {
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
      const response = await fetch(`${getChatbotApiBase()}/chat/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "website",
          platformUserId: visitorId,
          message: text,
          attachments: attachmentsToSend.map((attachment) => ({
            type: "image",
            name: attachment.name,
            mimeType: attachment.mimeType,
            dataUrl: attachment.dataUrl,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Assistant indisponible");
      }

      const data = await response.json();
      const reply = String(data?.reply || "").trim() || "Merci. Un conseiller vous repondra sous peu.";
      const options = Array.isArray(data?.options) ? normalizeOptions(data.options) : [];
      setMessages((prev) => [...prev, { id: `a_${Date.now()}`, role: "assistant", text: reply, options }]);
      hydratedVisitorRef.current = visitorId;
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          text: "Service temporairement indisponible. Essayez encore ou contactez-nous via WhatsApp / Messenger.",
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
