import React, { useEffect, useState } from "react";

const quickPrompts = [
  "bonjour",
  "montre moi vos appartements s+2",
  "je cherche une villa avec piscine a kelibia",
  "12/08/2026 au 18/08/2026, 4 personnes, budget 450 tnd, proche plage",
  "houwa win andek appartements s+2 kelibia",
  "b9adech s+2 fi kelibia",
  "b9adech s+2 fi kelibia men 2026-08-12 lel 2026-08-18",
  "win w b9adech andek s+2 fi kelibia",
  "houwa andek s+2 pied dans l eau fi kelibia",
  "warini villa b piscine privee fi kelibia",
  "nheb haja proche plage mouch pied dans l eau",
  "nheb rdc, ken ma famech 1er etage ok",
];

const shellCard = {
  background: "linear-gradient(180deg, #ffffff 0%, #f6fbf8 100%)",
  border: "1px solid #d9efe1",
  borderRadius: 18,
  boxShadow: "0 18px 45px rgba(16, 69, 47, 0.08)",
};

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatMoney(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "-";
  return `${amount.toLocaleString("fr-FR")} TND`;
}

function resolveAppUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith("/") ? value : `/${value}`;
}

function formatChatLanguageLabel(code) {
  const value = String(code || "").trim().toLowerCase();
  if (value === "tn") return "tn";
  if (value === "fr") return "fr";
  if (value === "en") return "en";
  if (value === "ar") return "ar";
  return value || "n/a";
}

function formatDemandStatusLabel(status) {
  const value = String(status || "").trim();
  const labels = {
    en_attente_reponse_proprietaire: "Attente reponse proprietaire",
    reponse_positive_attente_confirmation_client: "Accord proprietaire recu",
    client_procede_vers_paiement_en_cours: "Paiement ouvert",
    contrat_realise: "Contrat genere",
    recu_paiement_envoye: "Recu paiement envoye",
    succes_paiement: "Paiement confirme",
    pas_de_reponse_proprietaire: "Pas de reponse proprietaire",
    reponse_negative_proprietaire: "Refus proprietaire",
  };
  return labels[value] || value || "-";
}

function demandStatusTone(status) {
  const value = String(status || "").trim();
  if (value === "succes_paiement") return { tone: "#166534", background: "#dcfce7" };
  if (value === "contrat_realise" || value === "client_procede_vers_paiement_en_cours") return { tone: "#1d4ed8", background: "#dbeafe" };
  if (value === "reponse_positive_attente_confirmation_client") return { tone: "#92400e", background: "#fef3c7" };
  if (value === "en_attente_reponse_proprietaire" || value === "recu_paiement_envoye") return { tone: "#7c3aed", background: "#ede9fe" };
  if (value === "reponse_negative_proprietaire" || value === "pas_de_reponse_proprietaire") return { tone: "#991b1b", background: "#fee2e2" };
  return { tone: "#475569", background: "#e2e8f0" };
}

function Badge({ label, tone = "#0f766e", background = "#d1fae5" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        color: tone,
        background,
      }}
    >
      {label}
    </span>
  );
}

export default function ChatbotLabPage() {
  const [platformUserId, setPlatformUserId] = useState("lab_user_1");
  const [draft, setDraft] = useState("montre moi vos appartements s+2");
  const [resetOnSend, setResetOnSend] = useState(false);
  const [health, setHealth] = useState(null);
  const [result, setResult] = useState(null);
  const [session, setSession] = useState(null);
  const [reservationDemand, setReservationDemand] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [actionPayload, setActionPayload] = useState(null);
  const [error, setError] = useState("");
  const [paymentScope, setPaymentScope] = useState("reservation");
  const [manualPaymentMethod, setManualPaymentMethod] = useState("virement");
  const [receiptUrl, setReceiptUrl] = useState("https://example.com/recu-virement.jpg");
  const [receiptNote, setReceiptNote] = useState("Recu test envoye depuis le chatbot lab");
  const [paymentReference, setPaymentReference] = useState("VIR-TEST-001");
  const [attachmentFile, setAttachmentFile] = useState(null);

  async function fileToDataUrl(file) {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("File read failed"));
      reader.readAsDataURL(file);
    });
  }

  async function fetchHealth() {
    const response = await fetch("/hybrid/health");
    if (!response.ok) throw new Error("Health check failed.");
    const data = await response.json();
    setHealth(data);
  }

  async function fetchSession(nextPlatformUserId = platformUserId) {
    const response = await fetch(`/debug/chat/session/website/${encodeURIComponent(nextPlatformUserId)}`);
    if (!response.ok) throw new Error("Session fetch failed.");
    const data = await response.json();
    setSession(data);
    const demandId = String(data?.snapshot?.context?.reservationDemandId || "").trim();
    if (demandId) {
      const demandResponse = await fetch(`/debug/project/reservation-demand/${encodeURIComponent(demandId)}`);
      if (demandResponse.ok) {
        const demandData = await demandResponse.json();
        setReservationDemand(demandData?.demand || null);
      }
    } else {
      setReservationDemand(null);
    }
  }

  useEffect(() => {
    void fetchHealth().catch((err) => setError(String(err.message || err)));
    void fetchSession().catch(() => {});
  }, []);

  async function handleSend(event) {
    event.preventDefault();
    const message = draft.trim();
    const sessionId = platformUserId.trim();
    if (!message || !sessionId) return;

    setLoading(true);
    setError("");

    try {
      const attachments = [];
      if (attachmentFile) {
        const dataUrl = await fileToDataUrl(attachmentFile);
        attachments.push({
          type: "image",
          dataUrl: String(dataUrl || ""),
          mimeType: attachmentFile.type || "image/jpeg",
          name: attachmentFile.name || "chatbot-cin.jpg",
        });
      }
      const response = await fetch("/debug/chat/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "website",
          platformUserId: sessionId,
          message,
          attachments,
          reset: resetOnSend,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat evaluate failed (${response.status}).`);
      }

      const data = await response.json();
      setResult(data);
      setSession({
        platform: data.platform,
        platformUserId: data.platformUserId,
        snapshot: data.snapshot,
      });
      setReservationDemand(data?.reservationDemand || null);
      setActionPayload(null);
      setAttachmentFile(null);
      await fetchHealth();
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    const sessionId = platformUserId.trim();
    if (!sessionId) return;

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/debug/chat/session/website/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(`Reset failed (${response.status}).`);
      }
      setResult(null);
      setSession(null);
      setReservationDemand(null);
      setActionPayload(null);
      await fetchSession(sessionId);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDemandAction(action, extra = {}) {
    if (!reservationDemand?.id) return;
    setActionLoading(action);
    setError("");
    try {
      const response = await fetch(`/debug/project/reservation-demand/${encodeURIComponent(reservationDemand.id)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(data?.error || `Action failed (${response.status})`));
      }
      setActionPayload(data?.payload || null);
      setReservationDemand(data?.demand || null);
      await fetchSession(platformUserId);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setActionLoading("");
    }
  }

  const snapshot = session?.snapshot || null;
  const conversation = snapshot?.conversation || null;
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const options = Array.isArray(result?.result?.options) ? result.result.options.slice(0, 5) : [];
  const diagnostics = result?.result?.diagnostics || null;
  const activeDemandId = String(reservationDemand?.id || snapshot?.context?.reservationDemandId || "").trim();
  const effectiveLanguage = snapshot?.context?.language || result?.parsedIntent?.language || null;
  const effectiveMode = diagnostics?.responseMode || result?.parsedIntent?.responseMode || null;
  const effectiveIntent = result?.parsedIntent?.intent || null;
  const statusUi = demandStatusTone(reservationDemand?.status);
  const canAdvanceOwner = reservationDemand?.status === "en_attente_reponse_proprietaire";
  const canAdvanceContract = reservationDemand?.status === "reponse_positive_attente_confirmation_client";
  const canUsePaymentTools = ["client_procede_vers_paiement_en_cours", "contrat_realise", "recu_paiement_envoye", "succes_paiement"].includes(String(reservationDemand?.status || "").trim());

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <div style={{ ...shellCard, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#0f766e", fontWeight: 800 }}>
              Local Chatbot Lab
            </div>
            <h2 style={{ margin: "8px 0 6px", fontSize: 28, color: "#113b2c" }}>Tester le flux chatbot sans toucher au site</h2>
            <p style={{ margin: 0, color: "#466556", maxWidth: 760 }}>
              Envoie un message comme un client web, inspecte l'intention extraite, le contexte stocke, les options remontees et l'historique complet de la conversation.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge
              label={health?.qdrantUp ? `Qdrant OK (${health?.propertyIndexCount || 0})` : "Qdrant indisponible"}
              tone={health?.qdrantUp ? "#166534" : "#991b1b"}
              background={health?.qdrantUp ? "#dcfce7" : "#fee2e2"}
            />
            <Badge
              label={conversation ? `Conversation #${conversation.id}` : "Nouvelle session"}
              tone="#1d4ed8"
              background="#dbeafe"
            />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.2fr) minmax(320px, 1fr)", gap: 18 }}>
        <div style={{ ...shellCard, padding: 18 }}>
          <form onSubmit={handleSend} style={{ display: "grid", gap: 14 }}>
            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 700, color: "#143c2e" }}>Session client</label>
              <input
                value={platformUserId}
                onChange={(event) => setPlatformUserId(event.target.value)}
                style={{ width: "100%", height: 42, borderRadius: 12, border: "1px solid #bfdccb", padding: "0 12px" }}
                placeholder="ex: lab_user_1"
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 700, color: "#143c2e" }}>Message a tester</label>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={5}
                style={{ width: "100%", borderRadius: 14, border: "1px solid #bfdccb", padding: 12, resize: "vertical" }}
                placeholder="Tape ton message comme un vrai client"
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 700, color: "#143c2e" }}>Image jointe optionnelle</label>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setAttachmentFile(event.target.files?.[0] || null)}
                style={{ width: "100%" }}
              />
              {attachmentFile ? (
                <div style={{ marginTop: 6, color: "#355846", fontSize: 13 }}>
                  Fichier selectionne: {attachmentFile.name}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setDraft(prompt)}
                  style={{
                    border: "1px solid #cfe6d8",
                    background: "#f6fbf8",
                    color: "#174c37",
                    borderRadius: 999,
                    padding: "8px 12px",
                    cursor: "pointer",
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#355846" }}>
              <input type="checkbox" checked={resetOnSend} onChange={(event) => setResetOnSend(event.target.checked)} />
              Reinitialiser la session avant envoi
            </label>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: "#0f9f6e",
                  color: "white",
                  border: "none",
                  borderRadius: 12,
                  padding: "12px 18px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {loading ? "Envoi..." : "Tester le chatbot"}
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void fetchSession()}
                style={{
                  background: "white",
                  color: "#174c37",
                  border: "1px solid #bfdccb",
                  borderRadius: 12,
                  padding: "12px 18px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Recharger la session
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleReset()}
                style={{
                  background: "#fff1f2",
                  color: "#9f1239",
                  border: "1px solid #fecdd3",
                  borderRadius: 12,
                  padding: "12px 18px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Vider la session
              </button>
            </div>
          </form>

          {error ? (
            <div style={{ marginTop: 14, borderRadius: 14, background: "#fef2f2", color: "#991b1b", padding: 12 }}>
              {error}
            </div>
          ) : null}

          <div style={{ marginTop: 18 }}>
            <h3 style={{ margin: "0 0 10px", color: "#123728" }}>Historique conversation</h3>
            <div style={{ display: "grid", gap: 10, maxHeight: 480, overflow: "auto", paddingRight: 4 }}>
              {messages.length === 0 ? (
                <div style={{ color: "#5a7668" }}>Aucun message pour cette session.</div>
              ) : (
                messages.map((message) => {
                  const isClient = message.senderType === "client";
                  return (
                    <div
                      key={message.id}
                      style={{
                        marginLeft: isClient ? 48 : 0,
                        marginRight: isClient ? 0 : 48,
                        borderRadius: 16,
                        padding: 12,
                        background: isClient ? "#0f9f6e" : "#eef6f1",
                        color: isClient ? "white" : "#163a2d",
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, marginBottom: 6 }}>
                        {message.senderType} · {formatTimestamp(message.createdAt)}
                      </div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          <div style={{ ...shellCard, padding: 18 }}>
            <h3 style={{ marginTop: 0, color: "#123728" }}>Intent extrait</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {result?.parsedIntent?.language ? <Badge label={`Langue parsee: ${formatChatLanguageLabel(result.parsedIntent.language)}`} tone="#1d4ed8" background="#dbeafe" /> : null}
              {result?.parsedIntent?.responseMode ? <Badge label={`Mode parse: ${result.parsedIntent.responseMode}`} tone="#7c3aed" background="#ede9fe" /> : null}
              {result?.parsedIntent?.intent ? <Badge label={`Intent parse: ${result.parsedIntent.intent}`} tone="#0f766e" background="#d1fae5" /> : null}
              {effectiveLanguage ? <Badge label={`Langue session: ${formatChatLanguageLabel(effectiveLanguage)}`} tone="#0f766e" background="#d1fae5" /> : null}
              {effectiveMode ? <Badge label={`Mode effectif: ${effectiveMode}`} tone="#92400e" background="#fef3c7" /> : null}
            </div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, color: "#15352a" }}>
              {result?.parsedIntent ? prettyJson(result.parsedIntent) : "Pas encore de message envoye."}
            </pre>
          </div>

          <div style={{ ...shellCard, padding: 18 }}>
            <h3 style={{ marginTop: 0, color: "#123728" }}>Contexte conversation</h3>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, color: "#15352a" }}>
              {snapshot?.context ? prettyJson(snapshot.context) : "Aucun contexte Redis pour cette session."}
            </pre>
          </div>

          <div style={{ ...shellCard, padding: 18 }}>
            <h3 style={{ marginTop: 0, color: "#123728" }}>Reponse et options</h3>
            <div style={{ whiteSpace: "pre-wrap", color: "#163a2d", marginBottom: 14 }}>
              {result?.result?.reply || "Aucune reponse retournee."}
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {options.length === 0 ? (
                <div style={{ color: "#5a7668" }}>Aucune option retournee.</div>
              ) : (
                options.map((option, index) => (
                  <div key={`${option.id}-${index}`} style={{ border: "1px solid #d9efe1", borderRadius: 14, padding: 12 }}>
                    <div style={{ fontWeight: 800, color: "#143c2e" }}>{option.title}</div>
                    <div style={{ color: "#355846", marginTop: 4 }}>
                      Ref: {option.reference || option.id}
                    </div>
                    <div style={{ color: "#4d685b", marginTop: 4 }}>{option.location}</div>
                    <div style={{ color: "#0f766e", marginTop: 4 }}>{option.pricePerNightTnd} TND / nuit</div>
                    <div style={{ color: "#355846", marginTop: 4, fontSize: 13 }}>
                      {[
                        option.beachfront ? "Pied dans l'eau" : null,
                        !option.beachfront && option.nearBeach ? "Proche plage" : null,
                        option.seaView ? "Vue mer" : null,
                        option.poolPrivate ? "Piscine privee" : null,
                        !option.poolPrivate && option.poolShared ? "Piscine partagee" : null,
                        option.floor ? `Etage ${option.floor}` : null,
                      ]
                        .filter(Boolean)
                        .join(" • ") || "Aucun confort structure affiche"}
                    </div>
                    {Array.isArray(option.alternativeReasons) && option.alternativeReasons.length ? (
                      <div style={{ color: "#9a3412", marginTop: 4, fontSize: 13 }}>
                        Alternatives/fallback: {option.alternativeReasons.join(", ")}
                      </div>
                    ) : null}
                    {option.link ? (
                      <div style={{ marginTop: 6 }}>
                        <a href={option.link} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>
                          {option.link}
                        </a>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ ...shellCard, padding: 18 }}>
            <h3 style={{ marginTop: 0, color: "#123728" }}>Demande de reservation active</h3>
            {!activeDemandId || !reservationDemand ? (
              <div style={{ color: "#5a7668" }}>Aucune demande active dans cette session.</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Badge label={`ID: ${reservationDemand.id}`} tone="#1d4ed8" background="#dbeafe" />
                    <Badge label={`Statut: ${formatDemandStatusLabel(reservationDemand.status)}`} tone={statusUi.tone} background={statusUi.background} />
                  </div>
                  <div style={{ color: "#355846" }}>
                    Bien: <strong>{reservationDemand.bien_reference || reservationDemand.bien_id || "-"}</strong> - {reservationDemand.bien_titre || "-"}
                  </div>
                  <div style={{ color: "#355846" }}>
                    Sejour: {reservationDemand.start_date_fmt || reservationDemand.start_date || "-"} au {reservationDemand.end_date_fmt || reservationDemand.end_date || "-"} • {reservationDemand.guests || 0} voyageurs
                  </div>
                  <div style={{ color: "#355846" }}>
                    Montant: {formatMoney(reservationDemand.total_amount)} • A payer maintenant: {formatMoney(reservationDemand.amount_due_now)}
                  </div>
                  <div style={{ color: "#355846" }}>
                    Paiement ref: {reservationDemand.payment_id || "-"} • Recu: {reservationDemand.payment_receipt_uploaded_at_fmt || "-"}
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <a href={resolveAppUrl(`/mes-reservations/${encodeURIComponent(reservationDemand.id)}/paiement`)} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>
                      Ouvrir page paiement
                    </a>
                    {reservationDemand.contract_url ? (
                      <a href={resolveAppUrl(reservationDemand.contract_url)} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>
                        Ouvrir contrat client
                      </a>
                    ) : null}
                    {reservationDemand.payment_receipt_image_url ? (
                      <a href={resolveAppUrl(reservationDemand.payment_receipt_image_url)} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>
                        Ouvrir recu
                      </a>
                    ) : null}
                  </div>
                  {actionPayload?.checkout_url ? (
                    <div style={{ color: "#355846" }}>
                      Checkout cree:&nbsp;
                      <a href={resolveAppUrl(actionPayload.checkout_url)} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>
                        {actionPayload.checkout_url}
                      </a>
                    </div>
                  ) : null}
                </div>

                <div style={{ borderTop: "1px solid #d9efe1", paddingTop: 14, display: "grid", gap: 10 }}>
                  <div style={{ fontWeight: 800, color: "#143c2e" }}>Actions de labo</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={!!actionLoading || !canAdvanceOwner}
                      onClick={() => void handleDemandAction("owner_accept")}
                      style={{ border: "1px solid #bfdccb", background: "white", color: "#174c37", borderRadius: 12, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
                    >
                      {actionLoading === "owner_accept" ? "Traitement..." : "Accord proprietaire + contrat + message client"}
                    </button>
                    <button
                      type="button"
                      disabled={!!actionLoading || !canAdvanceContract}
                      onClick={() => void handleDemandAction("advance_to_payment")}
                      style={{ border: "1px solid #bfdccb", background: "white", color: "#174c37", borderRadius: 12, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
                    >
                      {actionLoading === "advance_to_payment" ? "Traitement..." : "Generer contrat + etape paiement"}
                    </button>
                  </div>

                  <div style={{ display: "grid", gap: 8, borderTop: "1px solid #edf7f1", paddingTop: 10 }}>
                    <div style={{ fontWeight: 700, color: "#143c2e" }}>Checkout / paiement</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <select value={paymentScope} onChange={(event) => setPaymentScope(event.target.value)} style={{ height: 38, borderRadius: 10, border: "1px solid #bfdccb", padding: "0 10px" }}>
                        <option value="reservation">reservation</option>
                        <option value="services">services</option>
                        <option value="combined">combined</option>
                      </select>
                      <select value={manualPaymentMethod} onChange={(event) => setManualPaymentMethod(event.target.value)} style={{ height: 38, borderRadius: 10, border: "1px solid #bfdccb", padding: "0 10px" }}>
                        <option value="virement">virement</option>
                        <option value="cash">cash</option>
                        <option value="clicktopay">clicktopay</option>
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        disabled={!!actionLoading || !canUsePaymentTools}
                        onClick={() => void handleDemandAction("create_clicktopay_checkout", { scope: paymentScope })}
                        style={{ border: "1px solid #bfdccb", background: "white", color: "#174c37", borderRadius: 12, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
                      >
                        {actionLoading === "create_clicktopay_checkout" ? "Traitement..." : "Creer lien ClickToPay"}
                      </button>
                      <button
                        type="button"
                        disabled={!!actionLoading || !canUsePaymentTools}
                        onClick={() => void handleDemandAction("mark_paid", { scope: paymentScope, method: manualPaymentMethod })}
                        style={{ background: "#0f9f6e", color: "white", border: "none", borderRadius: 12, padding: "10px 14px", fontWeight: 800, cursor: "pointer" }}
                      >
                        {actionLoading === "mark_paid" ? "Traitement..." : "Simuler paiement succes"}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 8, borderTop: "1px solid #edf7f1", paddingTop: 10 }}>
                    <div style={{ fontWeight: 700, color: "#143c2e" }}>Envoi reçu par lien</div>
                    <input value={receiptUrl} onChange={(event) => setReceiptUrl(event.target.value)} placeholder="https://..." style={{ width: "100%", height: 38, borderRadius: 10, border: "1px solid #bfdccb", padding: "0 10px" }} />
                    <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Reference virement / quittance" style={{ width: "100%", height: 38, borderRadius: 10, border: "1px solid #bfdccb", padding: "0 10px" }} />
                    <textarea value={receiptNote} onChange={(event) => setReceiptNote(event.target.value)} rows={3} placeholder="Note admin/client" style={{ width: "100%", borderRadius: 10, border: "1px solid #bfdccb", padding: 10, resize: "vertical" }} />
                    <button
                      type="button"
                      disabled={!!actionLoading || !canUsePaymentTools}
                      onClick={() => void handleDemandAction("upload_receipt_link", { receiptUrl, paymentReference, note: receiptNote })}
                      style={{ border: "1px solid #bfdccb", background: "white", color: "#174c37", borderRadius: 12, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}
                    >
                      {actionLoading === "upload_receipt_link" ? "Traitement..." : "Envoyer reçu"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ ...shellCard, padding: 18 }}>
            <h3 style={{ marginTop: 0, color: "#123728" }}>Diagnostics chatbot</h3>
            {!diagnostics ? (
              <div style={{ color: "#5a7668" }}>Aucun diagnostic calcule.</div>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <div style={{ fontWeight: 800, color: "#143c2e", marginBottom: 6 }}>Mode de reponse</div>
                  <Badge label={diagnostics.responseMode || "n/a"} tone="#7c3aed" background="#ede9fe" />
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: "#143c2e", marginBottom: 6 }}>Session effective</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Badge label={`Langue: ${formatChatLanguageLabel(effectiveLanguage)}`} tone="#0f766e" background="#d1fae5" />
                    <Badge label={`Mode: ${effectiveMode || "n/a"}`} tone="#92400e" background="#fef3c7" />
                    <Badge label={`Intent: ${effectiveIntent || "n/a"}`} tone="#1d4ed8" background="#dbeafe" />
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: "#143c2e", marginBottom: 6 }}>Zones detectees</div>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, color: "#15352a" }}>
                    {prettyJson(diagnostics.zoneSummary || [])}
                  </pre>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: "#143c2e", marginBottom: 6 }}>Resume prix</div>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, color: "#15352a" }}>
                    {prettyJson(diagnostics.pricingSummary || null)}
                  </pre>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: "#143c2e", marginBottom: 6 }}>Prix exact sejour</div>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, color: "#15352a" }}>
                    {prettyJson(diagnostics.exactStayPricing || null)}
                  </pre>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: "#143c2e", marginBottom: 6 }}>Regles sejour</div>
                  <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, color: "#15352a" }}>
                    {prettyJson(diagnostics.stayRules || null)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
