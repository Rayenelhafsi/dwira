import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bell, Database, Lock, ShieldCheck, User, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  getSiteMaintenanceStatus,
  updateSiteMaintenanceStatus,
  type SiteMaintenanceStatus,
} from "../../services/siteMaintenance";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
              placeholder="D90087579c"
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
