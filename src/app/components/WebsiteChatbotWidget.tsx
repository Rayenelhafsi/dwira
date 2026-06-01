import { useMemo, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const VISITOR_KEY = "dwira_chatbot_visitor_id";

function getVisitorId() {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const next = `web_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(VISITOR_KEY, next);
    return next;
  } catch {
    return `web_${Date.now()}`;
  }
}

function getChatbotApiBase() {
  const raw = String(import.meta.env.VITE_CHATBOT_API_URL || "http://localhost:8090").trim();
  return raw.replace(/\/+$/, "");
}

export default function WebsiteChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Bonjour, je suis l'assistant reservation Dwira. Indiquez vos dates, nombre de voyageurs et budget.",
    },
  ]);

  const visitorId = useMemo(() => getVisitorId(), []);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    const userMessage: ChatMessage = { id: `u_${Date.now()}`, role: "user", text };
    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    setSending(true);

    try {
      const response = await fetch(`${getChatbotApiBase()}/chat/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "website",
          platformUserId: visitorId,
          message: text,
        }),
      });

      if (!response.ok) {
        throw new Error("Assistant indisponible");
      }

      const data = await response.json();
      const reply = String(data?.reply || "").trim() || "Merci. Un conseiller vous repondra sous peu.";
      setMessages((prev) => [...prev, { id: `a_${Date.now()}`, role: "assistant", text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          text: "Service temporairement indisponible. Contactez-nous via WhatsApp ou Messenger.",
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
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-[95] inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700"
        aria-label="Ouvrir assistant"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-[95] flex h-[70vh] w-[min(92vw,380px)] flex-col overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-2xl">
          <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-semibold text-emerald-900">Assistant reservation Dwira</p>
            <p className="text-xs text-emerald-700">FR | AR | TN | EN</p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    msg.role === "user" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Ex: 12/08 au 18/08, 4 personnes, proche plage"
                className="h-10 flex-1 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={sending}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white disabled:opacity-50"
                aria-label="Envoyer"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
