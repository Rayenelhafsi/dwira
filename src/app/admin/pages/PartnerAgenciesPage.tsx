import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Building2, CheckCircle2, RefreshCw, Trash2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { createPartnerAgencyApi, deletePartnerAgencyApi, fetchPartnerAgenciesAdmin, updatePartnerAgencyApi, type PartnerAgencyItem } from "../../utils/partnerAgencies";
import type { ReservationDemand, ReservationDemandStatus } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "/api";

type PartnerDemandRow = ReservationDemand & {
  partner_agency_name?: string | null;
  partner_agency_logo_url?: string | null;
};

const statusLabels: Partial<Record<ReservationDemandStatus, string>> = {
  attente_validation_agence_partenaire: "Attente validation agence partenaire",
  rejete_par_agence_partenaire: "Rejetee par l'agence partenaire",
  en_attente_reponse_proprietaire: "En attente proprietaire",
  client_procede_vers_paiement_en_cours: "Paiement en cours",
  succes_paiement: "Succes paiement",
};

function formatCurrency(value?: number | string | null) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0 DT";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(num)} DT`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("fr-FR", { timeZone: "Africa/Tunis", hour12: false });
}

export default function PartnerAgenciesPage() {
  const [agencies, setAgencies] = useState<PartnerAgencyItem[]>([]);
  const [demandRows, setDemandRows] = useState<PartnerDemandRow[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [agenciesResult, demandsResult] = await Promise.allSettled([
        fetchPartnerAgenciesAdmin(),
        fetch(`${API_URL}/reservation-demands`, { credentials: "include" }),
      ]);

      if (agenciesResult.status === "fulfilled") {
        setAgencies(Array.isArray(agenciesResult.value) ? agenciesResult.value : []);
      } else {
        setAgencies([]);
        toast.error(agenciesResult.reason instanceof Error ? agenciesResult.reason.message : "Impossible de charger les agences partenaires");
      }

      const demandJson =
        demandsResult.status === "fulfilled" && demandsResult.value.ok
          ? await demandsResult.value.json().catch(() => [])
          : [];
      setDemandRows(
        (Array.isArray(demandJson) ? demandJson : [])
          .filter((row): row is PartnerDemandRow => Boolean(row && String(row.partner_agency_id || "").trim()))
          .sort((a, b) => {
            const da = new Date(String(a.updated_at || a.created_at || "")).getTime();
            const db = new Date(String(b.updated_at || b.created_at || "")).getTime();
            return db - da;
          })
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const counts = useMemo(() => {
    const waiting = demandRows.filter((row) => row.status === "attente_validation_agence_partenaire").length;
    const rejected = demandRows.filter((row) => row.status === "rejete_par_agence_partenaire").length;
    const active = demandRows.length - rejected;
    return { waiting, rejected, active };
  }, [demandRows]);

  const filteredDemands = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return demandRows;
    return demandRows.filter((row) => {
      const bag = [
        row.partner_agency_name,
        row.client_name,
        row.client_email,
        row.bien_reference,
        row.bien_titre,
        row.status,
      ].map((value) => String(value || "").toLowerCase());
      return bag.some((value) => value.includes(needle));
    });
  }, [demandRows, searchTerm]);

  const handleAdd = async () => {
    if (!name.trim()) {
      toast.error("Nom obligatoire.");
      return;
    }
    try {
      await createPartnerAgencyApi({
        name: name.trim(),
      });
      setName("");
      await loadData();
      toast.success("Agence partenaire ajoutee.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ajout impossible");
    }
  };

  const handleDelete = async (agencyId: string) => {
    setSavingId(agencyId);
    try {
      await deletePartnerAgencyApi(agencyId);
      await loadData();
      toast.success("Agence partenaire supprimee.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    } finally {
      setSavingId(null);
    }
  };

  const handleLogoUpload = async (agency: PartnerAgencyItem, file?: File | null) => {
    if (!file) return;
    setSavingId(agency.id);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const uploadResponse = await fetch(`${API_URL}/admin/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const uploadData = await uploadResponse.json().catch(() => null);
      if (!uploadResponse.ok) {
        throw new Error(String(uploadData?.error || "Upload logo impossible"));
      }
      const uploadedUrl = String(uploadData?.url || uploadData?.imageUrl || "").trim();
      if (!uploadedUrl) {
        throw new Error("URL logo manquante");
      }
      await updatePartnerAgencyApi(agency.id, {
        name: agency.name,
        slug: agency.slug,
        logoUrl: uploadedUrl,
      });
      await loadData();
      toast.success("Logo agence mis a jour.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour logo impossible");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agences partenaires</h1>
          <p className="mt-1 text-sm text-gray-500">Visualisation des agences partenaires, de leur marge configuree par le responsable, et suivi des reservations.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw size={16} />
          Actualiser
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Agences" value={agencies.length} tone="emerald" />
        <StatCard label="Demandes actives" value={counts.active} tone="sky" />
        <StatCard label="En attente validation" value={counts.waiting} tone="amber" />
        <StatCard label="Rejetees" value={counts.rejected} tone="rose" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Nouvelle agence partenaire</h2>
          <p className="mt-1 text-sm text-gray-500">L admin cree l agence. Le responsable agence configure ensuite sa marge et son logo depuis son dashboard.</p>
          <div className="mt-4 space-y-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nom agence"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void handleAdd()}
              className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Ajouter
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {agencies.length === 0 ? (
              <p className="text-sm text-gray-500">Aucune agence partenaire.</p>
            ) : (
              agencies.map((agency) => (
                <div key={agency.id} className="rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                        {agency.logoUrl ? (
                          <img src={agency.logoUrl} alt={agency.name} className="h-full w-full object-contain" />
                        ) : (
                          <Building2 size={20} className="text-gray-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{agency.name}</p>
                        <p className="text-xs text-gray-500">/{agency.slug}</p>
                        <p className="mt-1 text-sm text-emerald-700">Marge {(((Math.max(1, Number(agency.marginMultiplier || 1)) - 1) * 100)).toFixed(2)}%</p>
                        <p className="mt-1 text-xs text-gray-500">Logo gere par l admin.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        <Upload size={15} />
                        Logo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            void handleLogoUpload(agency, file);
                            event.target.value = "";
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleDelete(agency.id)}
                        disabled={savingId === agency.id}
                        className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Demandes agences partenaires</h2>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Rechercher une demande..."
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm lg:w-80"
            />
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-gray-500">Chargement...</div>
          ) : filteredDemands.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Aucune demande agence partenaire.</div>
          ) : (
            <div className="space-y-4">
              {filteredDemands.map((demand) => (
                <article key={demand.id} className="rounded-2xl border border-gray-200 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                          {statusLabels[demand.status] || demand.status}
                        </span>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          {demand.partner_agency_name || demand.partner_agency_id}
                        </span>
                      </div>
                      <h3 className="mt-3 text-base font-semibold text-gray-900">{demand.bien_titre || demand.bien_reference || demand.bien_id}</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Client: {demand.client_name || demand.client_email || "-"} | Total: {formatCurrency(demand.total_amount)}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        Validation partenaire: {formatDateTime(demand.partner_agency_validation_at)}
                      </p>
                    </div>
                    <Link
                      to={`/admin/notifications?demandId=${encodeURIComponent(demand.id)}`}
                      className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Voir dossier
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone: "emerald" | "sky" | "amber" | "rose" }) {
  const toneClasses = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    sky: "border-sky-200 bg-sky-50 text-sky-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
  } as const;
  return (
    <div className={`rounded-2xl border p-4 ${toneClasses[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
