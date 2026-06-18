import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Link, useNavigate } from "react-router";
import { CheckCircle2, FileText, LogOut, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { ReservationDemand, ReservationDemandStatus } from "../admin/types";
import { resolveMediaUrl } from "../utils/media";

const API_URL = import.meta.env.VITE_API_URL || "/api";

type PartnerAgencySession = {
  userId: string;
  username: string;
  displayName: string;
  partnerAgencyId: string;
  partnerAgencyName: string;
  partnerAgencySlug?: string;
  partnerAgencyLogoUrl?: string | null;
  marginMultiplier?: number | null;
};

type PartnerAgencyDemandRow = ReservationDemand & {
  partner_agency_name?: string | null;
  partner_agency_logo_url?: string | null;
};

type MediaApi = {
  bien_id?: string | null;
  type?: string | null;
  url?: string | null;
  motif_upload?: string | null;
  position?: number | null;
};

const statusLabels: Partial<Record<ReservationDemandStatus, string>> = {
  attente_validation_agence_partenaire: "Attente validation agence partenaire",
  en_attente_reponse_proprietaire: "En attente proprietaire",
  client_procede_vers_paiement_en_cours: "Paiement en cours",
  attente_envoi_coordonnees_contrat: "Coordonnees contrat a envoyer",
  demande_recu_paiement: "Recu paiement demande",
  recu_paiement_envoye: "Recu paiement envoye",
  contrat_realise: "Contrat realise",
  succes_paiement: "Succes paiement",
  rejete_par_agence_partenaire: "Rejetee par l'agence partenaire",
};

const statusToneClasses: Partial<Record<ReservationDemandStatus, string>> = {
  attente_validation_agence_partenaire: "bg-amber-100 text-amber-800 border-amber-200",
  en_attente_reponse_proprietaire: "bg-sky-100 text-sky-800 border-sky-200",
  client_procede_vers_paiement_en_cours: "bg-indigo-100 text-indigo-800 border-indigo-200",
  attente_envoi_coordonnees_contrat: "bg-cyan-100 text-cyan-800 border-cyan-200",
  demande_recu_paiement: "bg-violet-100 text-violet-800 border-violet-200",
  recu_paiement_envoye: "bg-violet-100 text-violet-800 border-violet-200",
  contrat_realise: "bg-emerald-100 text-emerald-800 border-emerald-200",
  succes_paiement: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejete_par_agence_partenaire: "bg-rose-100 text-rose-800 border-rose-200",
};

function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("fr-FR", { timeZone: "Africa/Tunis" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("fr-FR", { timeZone: "Africa/Tunis", hour12: false });
}

function formatCurrency(value?: number | string | null) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0 DT";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(num)} DT`;
}

function demandStatusLabel(status?: ReservationDemandStatus | null) {
  const value = String(status || "").trim() as ReservationDemandStatus;
  return statusLabels[value] || value || "-";
}

function demandStatusTone(status?: ReservationDemandStatus | null) {
  const value = String(status || "").trim() as ReservationDemandStatus;
  return statusToneClasses[value] || "bg-gray-100 text-gray-700 border-gray-200";
}

function buildPartnerPropertyPath(session: PartnerAgencySession | null, demand: ReservationDemand) {
  const agencySlug = String(session?.partnerAgencySlug || "").trim().replace(/^\/+|\/+$/g, "");
  const propertyToken = String(demand.bien_reference || demand.bien_id || "").trim();
  if (!agencySlug || !propertyToken) return "/logements";
  const params = new URLSearchParams();
  const bienMode = String((demand as any).bien_mode || "").trim();
  if (bienMode && bienMode !== "location_saisonniere") {
    params.set("mode", bienMode);
  }
  const query = params.toString();
  return query
    ? `/${agencySlug}/${encodeURIComponent(propertyToken)}?${query}`
    : `/${agencySlug}/${encodeURIComponent(propertyToken)}`;
}

function getDemandNights(demand: ReservationDemand) {
  const start = Date.parse(`${String(demand.start_date || "").trim()}T00:00:00`);
  const end = Date.parse(`${String(demand.end_date || "").trim()}T00:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(1, Math.round((end - start) / 86400000));
}

function getDemandFallbackImage() {
  return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520"%3E%3Crect width="800" height="520" fill="%23ecfdf5"/%3E%3Cpath d="M0 360L180 230l110 84 120-96 180 142H0z" fill="%23a7f3d0"/%3E%3Ccircle cx="620" cy="140" r="44" fill="%236ee7b7"/%3E%3C/svg%3E';
}

export default function PartnerAgencyDashboardPage() {
  const [session, setSession] = useState<PartnerAgencySession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [demandRows, setDemandRows] = useState<PartnerAgencyDemandRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [marginPercent, setMarginPercent] = useState("0");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [bienImageById, setBienImageById] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/partner-agency/reservation-demands`, { credentials: "include" });
      if (!response.ok) return;
      const data = await response.json().catch(() => []);
      const rows = (Array.isArray(data) ? data : []);
      setDemandRows(
        rows.sort((a, b) => {
          const da = new Date(String(a.updated_at || a.created_at || "")).getTime();
          const db = new Date(String(b.updated_at || b.created_at || "")).getTime();
          return db - da;
        })
      );
      const bienIds = rows.map((row) => String(row?.bien_id || "").trim()).filter(Boolean);
      if (bienIds.length === 0) {
        setBienImageById({});
        return;
      }
      const mediaResponse = await fetch(`${API_URL}/media-bulk?bien_ids=${encodeURIComponent(Array.from(new Set(bienIds)).join(","))}`, { credentials: "include" });
      if (!mediaResponse.ok) return;
      const mediaRows = await mediaResponse.json().catch(() => []);
      const grouped = new Map<string, MediaApi[]>();
      for (const media of (Array.isArray(mediaRows) ? mediaRows : []) as MediaApi[]) {
        const bienId = String(media?.bien_id || "").trim();
        if (!bienId) continue;
        const list = grouped.get(bienId) || [];
        list.push(media);
        grouped.set(bienId, list);
      }
      const nextImages: Record<string, string> = {};
      for (const bienId of bienIds) {
        const first = (grouped.get(bienId) || [])
          .filter((media) => String(media?.type || "image").toLowerCase() !== "video")
          .filter((media) => {
            const motif = String(media?.motif_upload || "");
            return !(motif === "preuve_type_rue" || motif === "preuve_type_papier" || motif.startsWith("preuve_type_rue|") || motif.startsWith("preuve_type_papier|"));
          })
          .sort((a, b) => Number(a?.position ?? 0) - Number(b?.position ?? 0))[0];
        const imageUrl = resolveMediaUrl(String(first?.url || "").trim());
        if (imageUrl) nextImages[bienId] = imageUrl;
      }
      setBienImageById(nextImages);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chargement impossible");
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_URL}/auth/partner-agency/me`, { credentials: "include" });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setSession(null);
          return;
        }
        setSession(data?.session || null);
        const nextMultiplier = Number(data?.session?.marginMultiplier || 1);
        setMarginPercent(String(Math.max(0, ((nextMultiplier - 1) * 100).toFixed(2))));
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadData();
    const intervalId = window.setInterval(() => {
      void loadData();
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [loadData, session]);

  const filteredDemandRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return demandRows;
    return demandRows.filter((row) => {
      const bag = [
        row.client_name,
        row.client_email,
        row.bien_reference,
        row.bien_titre,
        row.status,
      ].map((value) => String(value || "").toLowerCase());
      return bag.some((value) => value.includes(needle));
    });
  }, [demandRows, searchTerm]);

  const summary = useMemo(() => {
    const waiting = demandRows.filter((row) => row.status === "attente_validation_agence_partenaire").length;
    const approved = demandRows.filter((row) => !["attente_validation_agence_partenaire", "rejete_par_agence_partenaire"].includes(String(row.status || ""))).length;
    const rejected = demandRows.filter((row) => row.status === "rejete_par_agence_partenaire").length;
    const total = demandRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
    return { waiting, approved, rejected, total };
  }, [demandRows]);

  const handleDemandAction = async (demand: PartnerAgencyDemandRow, next: "validate" | "reject") => {
    setSavingId(demand.id);
    try {
      const endpoint = next === "validate"
        ? `${API_URL}/partner-agency/reservation-demands/${encodeURIComponent(demand.id)}/validate`
        : `${API_URL}/partner-agency/reservation-demands/${encodeURIComponent(demand.id)}/reject`;
      const response = await fetch(endpoint, { method: "POST", credentials: "include" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(data?.error || "Mise a jour impossible"));
      }
      toast.success(next === "validate" ? "Demande validee." : "Demande rejetee.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour impossible");
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveSettings = async () => {
    const numericMarginPercent = Number(marginPercent);
    if (!Number.isFinite(numericMarginPercent) || numericMarginPercent < 0) {
      toast.error("La marge ne peut pas etre inferieure a 0%.");
      return;
    }
    setIsSavingSettings(true);
    try {
      const response = await fetch(`${API_URL}/partner-agency/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          margin_percent: numericMarginPercent,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(String(data?.error || "Mise a jour impossible"));
      }
      setSession(data?.session || null);
      const nextMultiplier = Number(data?.session?.marginMultiplier || 1);
      setMarginPercent(String(Math.max(0, ((nextMultiplier - 1) * 100).toFixed(2))));
      toast.success("Parametres agence mis a jour.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour impossible");
    } finally {
      setIsSavingSettings(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!session) return <Navigate to="/partner-agency/login" replace />;

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="flex w-72 flex-col bg-emerald-950 text-white">
        <div className="border-b border-emerald-900 p-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-full border border-emerald-800 bg-white">
              {session.partnerAgencyLogoUrl ? (
                <img src={session.partnerAgencyLogoUrl} alt={session.partnerAgencyName} className="h-full w-full object-contain" />
              ) : null}
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">{session.partnerAgencyName}</h1>
              <p className="text-xs text-emerald-300">Dashboard agence partenaire</p>
            </div>
          </div>
        </div>
        <div className="flex-1 px-4 py-5">
          <div className="rounded-2xl border border-emerald-900 bg-emerald-900/60 p-4 text-sm">
            <p className="font-semibold text-white">Marge appliquee</p>
            <p className="mt-1 text-2xl font-bold text-emerald-100">{Math.max(0, (Number(session.marginMultiplier || 1) - 1) * 100).toFixed(2)}%</p>
            <p className="mt-1 text-xs text-emerald-300">Multiplicateur client x{Number(session.marginMultiplier || 1).toFixed(2)}</p>
          </div>
        </div>
        <div className="border-t border-emerald-900 p-4">
          <div className="mb-3">
            <p className="truncate text-sm font-medium">{session.displayName || session.username}</p>
            <p className="truncate text-xs text-emerald-300">{session.username}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await fetch(`${API_URL}/auth/partner-agency/logout`, { method: "POST", credentials: "include" });
              } finally {
                navigate("/partner-agency/login", { replace: true });
              }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-600 hover:text-white"
          >
            <LogOut size={16} />
            Deconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 sm:p-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Reservations agence partenaire</h2>
            <p className="text-sm text-gray-500">Validez les demandes avant le flux normal de reservation.</p>
          </div>
          <div className="flex gap-3">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Rechercher une demande..."
              className="w-full rounded-xl border border-gray-300 px-4 py-2 text-sm lg:w-80"
            />
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw size={16} />
              Actualiser
            </button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <StatCard label="En attente" value={summary.waiting} tone="amber" />
          <StatCard label="Approuvees" value={summary.approved} tone="emerald" />
          <StatCard label="Rejetees" value={summary.rejected} tone="rose" />
          <StatCard label="Montant total" value={formatCurrency(summary.total)} tone="sky" />
        </div>

        <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Parametres de l agence</h3>
              <p className="mt-1 text-sm text-gray-500">La marge est definie par l agence. Valeur minimale autorisee: 0%.</p>
            </div>
            <div className="grid w-full gap-4 md:grid-cols-[220px_minmax(0,1fr)] lg:max-w-2xl">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Marge agence (%)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={marginPercent}
                  onChange={(event) => setMarginPercent(event.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="space-y-2">
                <span className="block text-sm font-medium text-gray-700">Logo agence</span>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                    {session.partnerAgencyLogoUrl ? (
                      <img src={session.partnerAgencyLogoUrl} alt={session.partnerAgencyName} className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-xs text-gray-400">Aucun logo</span>
                    )}
                  </div>
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                    Le logo est gere par l admin.
                  </div>
                  <button
                    type="button"
                    disabled={isSavingSettings}
                    onClick={() => void handleSaveSettings()}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isSavingSettings ? "Enregistrement..." : "Enregistrer marge"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="space-y-4">
          {filteredDemandRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
              Aucune demande agence partenaire pour le moment.
            </div>
          ) : (
            filteredDemandRows.map((demand) => {
              const canDecide = demand.status === "attente_validation_agence_partenaire";
              const nights = getDemandNights(demand);
              const bienImageUrl = bienImageById[String(demand.bien_id || "").trim()] || getDemandFallbackImage();
              return (
                <article key={demand.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 flex-1 gap-4">
                      <div className="hidden h-36 w-52 shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 sm:block">
                        <img src={bienImageUrl} alt={demand.bien_titre || demand.bien_reference || demand.bien_id} className="h-full w-full object-cover" />
                      </div>
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${demandStatusTone(demand.status)}`}>
                          {demandStatusLabel(demand.status)}
                        </span>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                          {formatCurrency(demand.total_amount)}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{demand.bien_titre || demand.bien_reference || demand.bien_id}</h3>
                        <p className="mt-1 text-sm text-gray-500">Client: {demand.client_name || demand.client_email || "-"}</p>
                        <p className="mt-1 text-sm text-gray-500">Reference: {demand.bien_reference || demand.bien_id || "-"}</p>
                      </div>
                      <div className="grid gap-2 text-sm text-gray-600 md:grid-cols-2 xl:grid-cols-3">
                        <p><span className="font-semibold">Periode demandee:</span> {formatDateOnly(demand.start_date)} - {formatDateOnly(demand.end_date)}</p>
                        <p><span className="font-semibold">Duree:</span> {nights} nuit{nights > 1 ? "s" : ""}</p>
                        <p><span className="font-semibold">Voyageurs:</span> {demand.guests}</p>
                        <p><span className="font-semibold">A payer maintenant:</span> {formatCurrency(demand.amount_due_now)}</p>
                        <p><span className="font-semibold">Reservation creee le:</span> {formatDateTime(demand.created_at)}</p>
                        <p><span className="font-semibold">Validation agence:</span> {formatDateTime(demand.partner_agency_validation_at)}</p>
                        <p><span className="font-semibold">Derniere mise a jour:</span> {formatDateTime(demand.updated_at)}</p>
                      </div>
                    </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Link
                        to={buildPartnerPropertyPath(session, demand)}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <FileText size={16} />
                        Voir le bien
                      </Link>
                      {canDecide && (
                        <>
                          <button
                            type="button"
                            disabled={savingId === demand.id}
                            onClick={() => void handleDemandAction(demand, "validate")}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <CheckCircle2 size={16} />
                            Valider
                          </button>
                          <button
                            type="button"
                            disabled={savingId === demand.id}
                            onClick={() => void handleDemandAction(demand, "reject")}
                            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                          >
                            <XCircle size={16} />
                            Rejeter
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone: "amber" | "emerald" | "rose" | "sky" }) {
  const toneClasses = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    sky: "border-sky-200 bg-sky-50 text-sky-900",
  } as const;
  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
