import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, Bot, Database, Lock, ShieldCheck, User, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  getSiteMaintenanceStatus,
  updateSiteMaintenanceStatus,
  type SiteMaintenanceStatus,
} from "../../services/siteMaintenance";
import { createChatbotFeedback, listChatbotFeedback, type ChatbotFeedbackRow } from "../../services/chatbotFeedback";
import type { Proprietaire } from "../types";

function toDateTimeLocalValue(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const offsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatStatusDate(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export default function ParametresPage() {
  const [status, setStatus] = useState<SiteMaintenanceStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [resumeAt, setResumeAt] = useState("");
  const [message, setMessage] = useState("");
  const [confirmationPassword, setConfirmationPassword] = useState("");
  const [ownerAppUpdateUrl, setOwnerAppUpdateUrl] = useState(
    String(import.meta.env.VITE_OWNER_APP_PLAY_STORE_URL || "").trim()
  );
  const [owners, setOwners] = useState<Proprietaire[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingOwnerAppUpdate, setSendingOwnerAppUpdate] = useState(false);
  const [chatbotFeedbackRows, setChatbotFeedbackRows] = useState<ChatbotFeedbackRow[]>([]);
  const [chatbotQuestion, setChatbotQuestion] = useState("");
  const [chatbotBotAnswer, setChatbotBotAnswer] = useState("");
  const [chatbotCorrectedAnswer, setChatbotCorrectedAnswer] = useState("");
  const [chatbotReason, setChatbotReason] = useState("");
  const [loadingChatbotFeedback, setLoadingChatbotFeedback] = useState(true);
  const [savingChatbotFeedback, setSavingChatbotFeedback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await getSiteMaintenanceStatus();
        if (cancelled) return;
        setStatus(next);
        setEnabled(next.enabled);
        setResumeAt(toDateTimeLocalValue(next.resumeAt));
        setMessage(String(next.message || ""));
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Chargement maintenance impossible");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadFeedback = async () => {
      try {
        const rows = await listChatbotFeedback();
        if (!cancelled) {
          setChatbotFeedbackRows(Array.isArray(rows) ? rows : []);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Chargement recommandations chatbot impossible");
        }
      } finally {
        if (!cancelled) {
          setLoadingChatbotFeedback(false);
        }
      }
    };
    void loadFeedback();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadOwners = async () => {
      try {
        const response = await fetch("/api/proprietaires", { credentials: "include" });
        const payload = await response.json().catch(() => []);
        if (!response.ok) {
          throw new Error(String(payload?.error || "Chargement proprietaires impossible"));
        }
        if (!cancelled) {
          setOwners(Array.isArray(payload) ? payload : []);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Chargement proprietaires impossible");
        }
      }
    };
    void loadOwners();
    return () => {
      cancelled = true;
    };
  }, []);

  const statusBadge = useMemo(() => {
    if (!status) return { label: "Chargement", className: "bg-gray-100 text-gray-700 border-gray-200" };
    if (status.isActive) return { label: "Active", className: "bg-rose-100 text-rose-700 border-rose-200" };
    if (status.enabled) return { label: "Programmee terminee", className: "bg-amber-100 text-amber-700 border-amber-200" };
    return { label: "Inactive", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  }, [status]);

  const handleSave = async () => {
    if (enabled && !resumeAt) {
      toast.error("Ajoutez une date de reprise avant activation.");
      return;
    }

    setSaving(true);
    try {
      const next = await updateSiteMaintenanceStatus({
        enabled,
        resumeAt: enabled ? resumeAt : null,
        message,
        confirmationPassword: enabled ? confirmationPassword : "",
      });
      setStatus(next);
      setEnabled(next.enabled);
      setResumeAt(toDateTimeLocalValue(next.resumeAt));
      setMessage(String(next.message || ""));
      setConfirmationPassword("");
      toast.success(next.enabled ? "Mode maintenance active." : "Mode maintenance desactive.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement maintenance impossible");
    } finally {
      setSaving(false);
    }
  };

  const selectedOwnerLabel = useMemo(
    () => owners.find((owner) => String(owner.id) === String(selectedOwnerId))?.nom || "",
    [owners, selectedOwnerId]
  );

  const handleSendOwnerAppUpdateNotification = async (targetOwnerId?: string | null) => {
    const playStoreUrl = String(ownerAppUpdateUrl || "").trim();
    if (!playStoreUrl || !/^https?:\/\//i.test(playStoreUrl)) {
      toast.error("Ajoutez un lien Google Play Store valide.");
      return;
    }
    const normalizedOwnerId = String(targetOwnerId || "").trim();
    if (targetOwnerId !== undefined && !normalizedOwnerId) {
      toast.error("Selectionnez un proprietaire.");
      return;
    }

    setSendingOwnerAppUpdate(true);
    try {
      const response = await fetch("/api/mobile/admin/owner-app-update-notification", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Nouvelle mise a jour de l'application dans Google Play Store",
          playStoreUrl,
          ownerId: normalizedOwnerId || null,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(payload?.error || "Envoi notification mise a jour impossible"));
      }

      toast.success(
        normalizedOwnerId
          ? `Notification envoyee a ${selectedOwnerLabel || "ce proprietaire"}.`
          : `Notification diffusee a ${Number(payload?.ownersCount || 0)} proprietaire(s).`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Envoi notification mise a jour impossible");
    } finally {
      setSendingOwnerAppUpdate(false);
    }
  };

  const handleSaveChatbotFeedback = async () => {
    if (!chatbotQuestion.trim()) {
      toast.error("Ajoutez au moins le cas client.");
      return;
    }
    if (!chatbotCorrectedAnswer.trim() && !chatbotReason.trim()) {
      toast.error("Ajoutez une reponse recommandee ou une instruction metier.");
      return;
    }

    setSavingChatbotFeedback(true);
    try {
      const result = await createChatbotFeedback({
        question: chatbotQuestion,
        botAnswer: chatbotBotAnswer,
        correctedAnswer: chatbotCorrectedAnswer,
        reason: chatbotReason,
      });
      const rows = await listChatbotFeedback();
      setChatbotFeedbackRows(Array.isArray(rows) ? rows : []);
      setChatbotQuestion("");
      setChatbotBotAnswer("");
      setChatbotCorrectedAnswer("");
      setChatbotReason("");
      toast.success(result.message || "Recommandation chatbot enregistree.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement recommandation chatbot impossible");
    } finally {
      setSavingChatbotFeedback(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parametres</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configuration generale et maintenance globale du site public.
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${statusBadge.className}`}>
          <ShieldCheck className="h-4 w-4" />
          <span>{statusBadge.label}</span>
        </div>
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Coaching chatbot</h2>
                <p className="text-sm text-gray-500">
                  Enregistrez vos bonnes formulations et vos consignes metier. Le chatbot les reutilise ensuite pour mieux reformuler avec OpenAI.
                </p>
              </div>
            </div>
          </div>

          <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 lg:max-w-sm">
            <div className="flex items-start gap-3">
              <Bot className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Memoire de recommandations</p>
                <p className="mt-1">
                  Utilisez cette zone pour apprendre au chatbot le ton, la structure et les priorites commerciales a appliquer sur les prochains cas similaires.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <label className="rounded-2xl border border-gray-200 p-4">
            <span className="text-sm font-semibold text-gray-900">Cas client / besoin observe</span>
            <textarea
              value={chatbotQuestion}
              onChange={(event) => setChatbotQuestion(event.target.value)}
              rows={4}
              placeholder="Exemple: client parle tunisien et demande des appartements S+2 sans donner de date."
              className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <label className="rounded-2xl border border-gray-200 p-4">
            <span className="text-sm font-semibold text-gray-900">Reponse bot faible actuelle</span>
            <textarea
              value={chatbotBotAnswer}
              onChange={(event) => setChatbotBotAnswer(event.target.value)}
              rows={4}
              placeholder="Collez ici une mauvaise reponse du bot si vous voulez lui montrer quoi eviter."
              className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <label className="rounded-2xl border border-gray-200 p-4">
            <span className="text-sm font-semibold text-gray-900">Reponse recommandee</span>
            <textarea
              value={chatbotCorrectedAnswer}
              onChange={(event) => setChatbotCorrectedAnswer(event.target.value)}
              rows={5}
              placeholder="Exemple: Bennesba lel S+2, najem nwarik lien recherche mfiltri, wala 3 options direct ken t7eb..."
              className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <label className="rounded-2xl border border-gray-200 p-4">
            <span className="text-sm font-semibold text-gray-900">Instruction metier</span>
            <textarea
              value={chatbotReason}
              onChange={(event) => setChatbotReason(event.target.value)}
              rows={5}
              placeholder="Exemple: si la demande est large, proposer d'abord le lien filtre; si le client parle tounsi, repondre tounsi naturel et court."
              className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSaveChatbotFeedback()}
            disabled={savingChatbotFeedback}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {savingChatbotFeedback ? "Enregistrement..." : "Ajouter la recommandation"}
          </button>
          <button
            type="button"
            onClick={() => {
              setChatbotQuestion("");
              setChatbotBotAnswer("");
              setChatbotCorrectedAnswer("");
              setChatbotReason("");
            }}
            disabled={savingChatbotFeedback}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Vider le formulaire
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Recommandations recentes</h3>
              <p className="mt-1 text-xs text-gray-500">
                Les cas enregistres ici servent de coaching pour les prochains messages proches.
              </p>
            </div>
            <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
              {chatbotFeedbackRows.length} memo{chatbotFeedbackRows.length > 1 ? "s" : ""}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {loadingChatbotFeedback ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-500">
                Chargement des recommandations chatbot...
              </div>
            ) : chatbotFeedbackRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-500">
                Aucune recommandation enregistree pour le moment.
              </div>
            ) : (
              chatbotFeedbackRows.slice(0, 8).map((row) => (
                <div key={row.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Cas #{row.id}</p>
                    <p className="text-xs text-gray-400">{formatStatusDate(row.createdAt)}</p>
                  </div>
                  <div className="mt-3 space-y-3 text-sm">
                    <div>
                      <p className="font-semibold text-gray-900">Cas client</p>
                      <p className="mt-1 whitespace-pre-line text-gray-600">{row.question}</p>
                    </div>
                    {row.botAnswer ? (
                      <div>
                        <p className="font-semibold text-gray-900">Reponse a eviter</p>
                        <p className="mt-1 whitespace-pre-line text-gray-600">{row.botAnswer}</p>
                      </div>
                    ) : null}
                    {row.correctedAnswer ? (
                      <div>
                        <p className="font-semibold text-gray-900">Reponse recommandee</p>
                        <p className="mt-1 whitespace-pre-line text-gray-600">{row.correctedAnswer}</p>
                      </div>
                    ) : null}
                    {row.reason ? (
                      <div>
                        <p className="font-semibold text-gray-900">Instruction</p>
                        <p className="mt-1 whitespace-pre-line text-gray-600">{row.reason}</p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                <Wrench className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Maintenance du site</h2>
                <p className="text-sm text-gray-500">
                  Bloque tout le site public. L&apos;espace admin reste accessible pour desactiver ou reprogrammer.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Etat courant</p>
                <p className="mt-1 font-semibold text-gray-900">
                  {status?.isActive ? "Maintenance visible sur le site" : "Site public accessible"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Reprise prevue</p>
                <p className="mt-1 font-semibold text-gray-900">{formatStatusDate(status?.resumeAt)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Derniere mise a jour</p>
                <p className="mt-1 font-semibold text-gray-900">{formatStatusDate(status?.updatedAt)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Mis a jour par</p>
                <p className="mt-1 font-semibold text-gray-900">{status?.updatedBy || "-"}</p>
              </div>
            </div>
          </div>

          <div className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 lg:max-w-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Confirmation obligatoire</p>
                <p className="mt-1">
                  Pour activer la maintenance, l&apos;admin doit saisir le mot de passe de confirmation et une date de reprise future.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <label className="rounded-2xl border border-gray-200 p-4">
            <span className="text-sm font-semibold text-gray-900">Activer le mode maintenance</span>
            <div className="mt-3 flex items-center justify-between gap-4">
              <p className="text-sm text-gray-500">Si active, toutes les pages publiques affichent l&apos;ecran de maintenance.</p>
              <button
                type="button"
                onClick={() => setEnabled((prev) => !prev)}
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition ${
                  enabled ? "bg-emerald-600" : "bg-gray-300"
                }`}
                aria-pressed={enabled}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                    enabled ? "translate-x-8" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </label>

          <label className="rounded-2xl border border-gray-200 p-4">
            <span className="text-sm font-semibold text-gray-900">Date et heure de reprise</span>
            <input
              type="datetime-local"
              value={resumeAt}
              onChange={(event) => setResumeAt(event.target.value)}
              className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              disabled={!enabled}
            />
            <p className="mt-2 text-xs text-gray-500">
              Obligatoire lors de l&apos;activation.
            </p>
          </label>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <label className="rounded-2xl border border-gray-200 p-4">
            <span className="text-sm font-semibold text-gray-900">Message affiche sur la page</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              placeholder="Exemple: Mise a jour de l'infrastructure de reservation en cours."
              className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>

          <label className="rounded-2xl border border-gray-200 p-4">
            <span className="text-sm font-semibold text-gray-900">Mot de passe de confirmation</span>
            <input
              type="password"
              value={confirmationPassword}
              onChange={(event) => setConfirmationPassword(event.target.value)}
              placeholder="Saisir le mot de passe de confirmation"
              autoComplete="new-password"
              className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              disabled={!enabled}
            />
            <p className="mt-2 text-xs text-gray-500">
              Requis uniquement pour activer la maintenance.
            </p>
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={loading || saving}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Enregistrement..." : enabled ? "Activer la maintenance" : "Desactiver la maintenance"}
          </button>

          <button
            type="button"
            onClick={() => {
              setEnabled(Boolean(status?.enabled));
              setResumeAt(toDateTimeLocalValue(status?.resumeAt));
              setMessage(String(status?.message || ""));
              setConfirmationPassword("");
            }}
            disabled={loading || saving}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reinitialiser le formulaire
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                <Bell className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Mise a jour application proprietaires</h2>
                <p className="text-sm text-gray-500">
                  Diffuse une notification globale a tous les proprietaires pour annoncer une nouvelle mise a jour de l&apos;application.
                </p>
              </div>
            </div>
          </div>

          <div className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 lg:max-w-sm">
            <div className="flex items-start gap-3">
              <Bell className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Notification envoyee aux proprietaires</p>
                <p className="mt-1">
                  Au clic, l&apos;application mobile pourra ouvrir Google Play Store via le lien transmis dans la notification si ce comportement est pris en charge cote mobile.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <label className="rounded-2xl border border-gray-200 p-4">
            <span className="text-sm font-semibold text-gray-900">Lien Google Play Store</span>
            <input
              type="url"
              value={ownerAppUpdateUrl}
              onChange={(event) => setOwnerAppUpdateUrl(event.target.value)}
              placeholder="https://play.google.com/store/apps/details?id=..."
              className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <p className="mt-2 text-xs text-gray-500">
              Ce lien sera inclus dans la notification envoyee a tous les proprietaires.
            </p>
          </label>

          <div className="rounded-2xl border border-gray-200 p-4">
            <span className="text-sm font-semibold text-gray-900">Proprietaire cible</span>
            <select
              value={selectedOwnerId}
              onChange={(event) => setSelectedOwnerId(event.target.value)}
              className="mt-3 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">Choisir un proprietaire</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.nom}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-gray-500">
              Utilisez cette liste pour envoyer la mise a jour a un seul proprietaire.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-200 p-4">
          <span className="text-sm font-semibold text-gray-900">Message diffuse</span>
          <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-800">
            Nouvelle mise a jour de l&apos;application dans Google Play Store
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Message fixe pour garder une notification claire et uniforme.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSendOwnerAppUpdateNotification()}
            disabled={sendingOwnerAppUpdate}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sendingOwnerAppUpdate ? "Envoi en cours..." : "Envoyer a tous les proprietaires"}
          </button>
          <button
            type="button"
            onClick={() => void handleSendOwnerAppUpdateNotification(selectedOwnerId)}
            disabled={sendingOwnerAppUpdate || !selectedOwnerId}
            className="rounded-xl border border-emerald-300 bg-white px-5 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sendingOwnerAppUpdate ? "Envoi en cours..." : "Envoyer au proprietaire selectionne"}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            icon: User,
            title: "Profil",
            description: "Gestion des informations de compte administrateur.",
          },
          {
            icon: Lock,
            title: "Securite",
            description: "Acces, mots de passe et journalisation des actions.",
          },
          {
            icon: Bell,
            title: "Notifications",
            description: "Reglages des alertes et rappels envoyes.",
          },
          {
            icon: Database,
            title: "Donnees",
            description: "Exports et sauvegardes de l'administration.",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-gray-100 p-3 text-gray-700">
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">{item.title}</h3>
                <p className="text-sm text-gray-500">{item.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
