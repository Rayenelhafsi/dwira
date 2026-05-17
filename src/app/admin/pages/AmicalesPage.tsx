import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, Code2, Eye, FileText, Printer, RefreshCw, Ticket, Trash2, Users } from "lucide-react";
import { createAmicaleApi, deleteAmicaleApi, fetchAmicalesAdmin, type AmicaleItem } from "../../utils/amicales";
import type { ReservationDemand, ReservationDemandStatus } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "/api";

type AdminAmicaleTab = "amicales" | "demandes";

type AmicaleDemandRow = ReservationDemand & {
  amicale_name?: string | null;
  amicale_logo_url?: string | null;
};

const statusLabels: Partial<Record<ReservationDemandStatus, string>> = {
  attente_validation_amicale: "Attente validation amicale",
  attente_validation_par_agence: "Attente validation par l agence",
  voucher_en_cours: "Voucher en cours",
  rejete_par_amicale: "Rejete par l amicale",
  rejete_par_agence: "Rejete par l agence",
  demande_rejetee_admin: "Demande rejetee par admin",
  demande_annulee_client: "Demande annulee par client",
  en_attente_reponse_proprietaire: "En attente proprietaire",
  pas_de_reponse_proprietaire: "Pas de reponse proprietaire",
  reponse_positive_attente_confirmation_client: "Attente confirmation client",
  client_procede_vers_paiement_en_cours: "Client procede vers le paiement en cours",
  reponse_negative_autre_proposition_meme_bien: "Autre proposition meme bien",
  reponse_negative_autre_proposition_bien_similaire: "Autre proposition bien similaire",
  attente_envoi_coordonnees_contrat: "Attente coordonnees contrat",
  demande_recu_paiement: "Demande recu paiement",
  recu_paiement_envoye: "Recu paiement envoye",
  contrat_realise: "Contrat realise",
  succes_paiement: "Succes paiement",
};

const statusToneClasses: Partial<Record<ReservationDemandStatus, string>> = {
  attente_validation_amicale: "bg-emerald-100 text-emerald-800 border-emerald-200",
  attente_validation_par_agence: "bg-cyan-100 text-cyan-800 border-cyan-200",
  voucher_en_cours: "bg-indigo-100 text-indigo-800 border-indigo-200",
  rejete_par_amicale: "bg-slate-100 text-slate-700 border-slate-200",
  rejete_par_agence: "bg-rose-100 text-rose-800 border-rose-200",
  demande_rejetee_admin: "bg-rose-100 text-rose-800 border-rose-200",
  demande_annulee_client: "bg-slate-100 text-slate-800 border-slate-200",
  en_attente_reponse_proprietaire: "bg-sky-100 text-sky-800 border-sky-200",
  pas_de_reponse_proprietaire: "bg-orange-100 text-orange-800 border-orange-200",
  reponse_positive_attente_confirmation_client: "bg-amber-100 text-amber-800 border-amber-200",
  client_procede_vers_paiement_en_cours: "bg-yellow-100 text-yellow-800 border-yellow-200",
  reponse_negative_autre_proposition_meme_bien: "bg-violet-100 text-violet-800 border-violet-200",
  reponse_negative_autre_proposition_bien_similaire: "bg-violet-100 text-violet-800 border-violet-200",
  attente_envoi_coordonnees_contrat: "bg-cyan-100 text-cyan-800 border-cyan-200",
  demande_recu_paiement: "bg-indigo-100 text-indigo-800 border-indigo-200",
  recu_paiement_envoye: "bg-indigo-100 text-indigo-800 border-indigo-200",
  contrat_realise: "bg-emerald-100 text-emerald-800 border-emerald-200",
  succes_paiement: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("fr-FR", { timeZone: "Africa/Tunis", hour12: false });
}

function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("fr-FR", { timeZone: "Africa/Tunis" });
}

function formatCurrency(value?: number | string | null) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0 DT";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(num)} DT`;
}

function resolveAssetUrl(url?: string | null) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${window.location.origin}${value.startsWith("/") ? value : `/${value}`}`;
}

function printVoucherUrl(voucherUrl: string) {
  const popup = window.open("", "_blank");
  if (!popup) {
    window.location.href = voucherUrl;
    toast.info("Popup bloquee. Voucher ouvert dans l onglet courant pour impression.");
    return;
  }
  popup.addEventListener("load", () => {
    popup.focus();
    popup.print();
  }, { once: true });
  popup.location.href = voucherUrl;
}

function isAmicaleDemand(demand: ReservationDemand) {
  return String(demand.payment_mode || "").trim() === "amicale" || Boolean(String(demand.pricing_amicale_id || "").trim());
}

function buildPropertyPath(demand: ReservationDemand) {
  const token = String(demand.bien_reference || demand.bien_id || "").trim();
  return token ? `/properties/${encodeURIComponent(token)}` : "/logements";
}

function demandStatusLabel(status?: ReservationDemandStatus | null) {
  const value = String(status || "").trim() as ReservationDemandStatus;
  return statusLabels[value] || value || "-";
}

function demandStatusTone(status?: ReservationDemandStatus | null) {
  const value = String(status || "").trim() as ReservationDemandStatus;
  return statusToneClasses[value] || "bg-gray-100 text-gray-700 border-gray-200";
}

export default function AmicalesPage() {
  const [amicales, setAmicales] = useState<AmicaleItem[]>([]);
  const [demandRows, setDemandRows] = useState<AmicaleDemandRow[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminAmicaleTab>("amicales");
  const [activeAmicaleFilter, setActiveAmicaleFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [amicalesResponse, demandsResponse] = await Promise.all([
        fetchAmicalesAdmin(),
        fetch(`${API_URL}/reservation-demands`, { credentials: "include" }),
      ]);
      const demandJson = demandsResponse.ok ? await demandsResponse.json().catch(() => []) : [];
      setAmicales(Array.isArray(amicalesResponse) ? amicalesResponse : []);
      setDemandRows(
        (Array.isArray(demandJson) ? demandJson : [])
          .filter((row): row is AmicaleDemandRow => Boolean(row && isAmicaleDemand(row)))
          .sort((a, b) => {
            const da = new Date(String(a.updated_at || a.created_at || "")).getTime();
            const db = new Date(String(b.updated_at || b.created_at || "")).getTime();
            return db - da;
          })
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    const intervalId = window.setInterval(() => {
      void loadData();
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [loadData]);

  const amicaleCounts = useMemo(() => {
    const waitingAmicale = demandRows.filter((row) => row.status === "attente_validation_amicale").length;
    const waitingAgency = demandRows.filter((row) => row.status === "attente_validation_par_agence").length;
    const voucherCount = demandRows.filter((row) => row.status === "voucher_en_cours" && Boolean(row.voucher_url)).length;
    return { waitingAmicale, waitingAgency, voucherCount };
  }, [demandRows]);

  const amicaleNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of amicales) {
      map.set(String(item.id || "").trim(), String(item.name || "").trim());
    }
    return map;
  }, [amicales]);

  const amicaleTabs = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; count: number }>();
    for (const row of demandRows) {
      const id = String(row.pricing_amicale_id || "").trim();
      if (!id) continue;
      const current = byId.get(id);
      const name = String(row.amicale_name || amicaleNameById.get(id) || id).trim();
      byId.set(id, { id, name, count: (current?.count || 0) + 1 });
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [demandRows, amicaleNameById]);

  const filteredDemands = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return demandRows.filter((row) => {
      const amicaleId = String(row.pricing_amicale_id || "").trim();
      if (activeAmicaleFilter !== "all" && amicaleId !== activeAmicaleFilter) return false;
      if (!needle) return true;
      const bag = [
        row.client_name,
        row.amicale_matricule,
        row.amicale_phone,
        row.bien_reference,
        row.bien_titre,
        row.amicale_name,
        row.pricing_amicale_id,
        row.status,
      ].map((v) => String(v || "").toLowerCase());
      return bag.some((v) => v.includes(needle));
    });
  }, [activeAmicaleFilter, demandRows, searchTerm]);

  const handleAdd = async () => {
    if (!name.trim() || !code.trim()) {
      toast.error("Nom et code obligatoires.");
      return;
    }
    try {
      await createAmicaleApi({ name, code, logoUrl: logoUrl || undefined });
      setName("");
      setCode("");
      setLogoUrl("");
      await loadData();
      toast.success("Amicale ajoutee.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ajout impossible");
    }
  };

  const handleLogoUpload = async (file?: File | null) => {
    if (!file) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("upload_scope", "amicale");
      formData.append("amicale_name", name.trim());
      formData.append("amicale_code", code.trim());
      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const payload = await response.json().catch(() => null);
          throw new Error(String(payload?.error || "Upload logo impossible"));
        }
        throw new Error((await response.text().catch(() => "")) || "Upload logo impossible");
      }
      const data = await response.json().catch(() => null);
      const uploadedUrl = String(data?.url || data?.imageUrl || "").trim();
      if (!uploadedUrl) throw new Error("URL logo manquante apres upload");
      setLogoUrl(uploadedUrl);
      toast.success("Logo uploadé.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload logo impossible");
    } finally {
      setLogoUploading(false);
    }
  };

  const handleDemandAction = async (demand: AmicaleDemandRow, nextStatus: "voucher_en_cours" | "rejete_par_agence") => {
    setSavingId(demand.id);
    try {
      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          status: nextStatus,
          actor_type: "admin",
          actor_id: "admin",
          history_note:
            nextStatus === "voucher_en_cours"
              ? "Agence valide la demande amicale et genere le voucher"
              : "Agence rejette la demande amicale",
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(String(data?.error || "Mise a jour impossible"));
      }
      toast.success(nextStatus === "voucher_en_cours" ? "Voucher genere." : "Demande rejetee.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour impossible");
    } finally {
      setSavingId(null);
    }
  };

  const handleRegenerateVoucher = async (demand: AmicaleDemandRow) => {
    setSavingId(demand.id);
    try {
      const response = await fetch(`${API_URL}/reservation-demands/${encodeURIComponent(demand.id)}/regenerate-voucher`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(String(data?.error || "Regeneration impossible"));
      }
      toast.success("Voucher regenere.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Regeneration impossible");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  const amicaleDemandCount = demandRows.length;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Amicales</h1>
          <p className="mt-1 text-sm text-gray-500">Ajoutez les amicales, puis suivez ici les demandes amicale et leur statut.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Recharger
        </button>
      </div>

      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setActiveTab("amicales")}
          className={`rounded-md px-3 py-2 text-sm font-medium ${activeTab === "amicales" ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
        >
          Amicales
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("demandes")}
          className={`rounded-md px-3 py-2 text-sm font-medium ${activeTab === "demandes" ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
        >
          Demandes adherants
        </button>
      </div>

      {activeTab === "amicales" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Amicales" value={amicales.length} tone="emerald" />
            <StatCard label="Demandes amicale" value={amicaleDemandCount} tone="sky" />
            <StatCard label="En attente amicale" value={amicaleCounts.waitingAmicale} tone="amber" />
            <StatCard label="En attente agence" value={amicaleCounts.waitingAgency} tone="indigo" />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
            <p className="text-sm font-semibold text-gray-900">Nouvelle amicale</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nom amicale"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Code amicale"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <div className="rounded-lg border border-gray-200 p-3 md:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Logo amicale (upload)</p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    void handleLogoUpload(event.target.files?.[0] || null);
                    event.currentTarget.value = "";
                  }}
                  className="w-full text-sm"
                />
                {logoUploading ? (
                  <p className="mt-2 text-xs text-emerald-700">Upload du logo en cours...</p>
                ) : null}
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo amicale" className="mt-3 h-16 w-16 rounded-lg border border-gray-200 object-cover" />
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              className="mt-4 inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Ajouter
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
            <p className="text-sm font-semibold text-gray-900">Liste des amicales</p>
            {amicales.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">Aucune amicale ajoutee.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-600">
                      <th className="px-3 py-2 font-semibold">Nom</th>
                      <th className="px-3 py-2 font-semibold">Logo</th>
                      <th className="px-3 py-2 font-semibold">Code</th>
                      <th className="px-3 py-2 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {amicales.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-900">{item.name}</td>
                        <td className="px-3 py-2">
                          {item.logoUrl ? (
                            <img src={item.logoUrl} alt={item.name} className="h-10 w-10 rounded-lg border border-gray-200 object-cover" />
                          ) : (
                            <span className="text-xs text-gray-400">Sans logo</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{item.code}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => void (async () => {
                              try {
                                await deleteAmicaleApi(item.id);
                                await loadData();
                                toast.success("Amicale supprimee.");
                              } catch (error) {
                                toast.error(error instanceof Error ? error.message : "Suppression impossible");
                              }
                            })()}
                            className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "demandes" && (
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Total</p>
              <p className="text-xl font-bold text-emerald-900">{amicaleDemandCount}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">En attente amicale</p>
              <p className="text-xl font-bold text-amber-900">{amicaleCounts.waitingAmicale}</p>
            </div>
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">En attente agence</p>
              <p className="text-xl font-bold text-cyan-900">{amicaleCounts.waitingAgency}</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Vouchers</p>
              <p className="text-xl font-bold text-indigo-900">{amicaleCounts.voucherCount}</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveAmicaleFilter("all")}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${activeAmicaleFilter === "all" ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
              >
                Toutes ({demandRows.length})
              </button>
              {amicaleTabs.map((tabItem) => (
                <button
                  key={tabItem.id}
                  type="button"
                  onClick={() => setActiveAmicaleFilter(tabItem.id)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold ${activeAmicaleFilter === tabItem.id ? "border-emerald-600 bg-emerald-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
                >
                  {tabItem.name} ({tabItem.count})
                </button>
              ))}
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Filtrer: matricule, nom/prenom, tel, reference logement, statut..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {filteredDemands.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune demande amicale pour le moment.</p>
          ) : (
            <div className="space-y-3">
              {filteredDemands.map((demand) => {
                const consultPath = buildPropertyPath(demand);
                const voucherUrl = demand.voucher_url ? resolveAssetUrl(demand.voucher_url) : "";
                return (
                  <article key={demand.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="grid gap-3 lg:grid-cols-3">
                      <div className="space-y-1 text-sm">
                        <p><span className="font-semibold">Amicale:</span> {String(demand.amicale_name || amicaleNameById.get(String(demand.pricing_amicale_id || "").trim()) || "-")}</p>
                        <p><span className="font-semibold">Nom:</span> {String(demand.client_name || "-")}</p>
                        <p><span className="font-semibold">Matricule:</span> {String(demand.amicale_matricule || "-")}</p>
                        <p><span className="font-semibold">Telephone:</span> {String(demand.amicale_phone || "-")}</p>
                      </div>
                      <div className="space-y-1 text-sm">
                        <p className="font-semibold">{String(demand.bien_reference || demand.bien_id || "-")}</p>
                        <p className="text-gray-600">{String(demand.bien_titre || "-")}</p>
                        <p><span className="font-semibold">Periode:</span> {formatDateOnly(demand.start_date)} au {formatDateOnly(demand.end_date)}</p>
                        <p><span className="font-semibold">Total HT:</span> {formatCurrency(demand.total_amount)}</p>
                        <p><span className="font-semibold">Validation agence:</span> {demand.agency_validation_at ? formatDateTime(demand.agency_validation_at) : "-"}</p>
                        <Link
                          to={consultPath}
                          className="mt-1 inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Consulter
                        </Link>
                      </div>
                      <div className="space-y-2">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${demandStatusTone(demand.status)}`}>
                          {demandStatusLabel(demand.status)}
                        </span>
                        {voucherUrl ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <a
                              href={voucherUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-medium text-indigo-700 hover:underline"
                            >
                              Ouvrir voucher
                            </a>
                            <button
                              type="button"
                              onClick={() => printVoucherUrl(voucherUrl)}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              <Printer className="h-3.5 w-3.5" />
                              Imprimer voucher
                            </button>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button
                            type="button"
                            disabled={savingId === demand.id}
                            onClick={() => void handleDemandAction(demand, "voucher_en_cours")}
                            className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Valider
                          </button>
                          <button
                            type="button"
                            disabled={savingId === demand.id}
                            onClick={() => void handleDemandAction(demand, "rejete_par_agence")}
                            className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                          >
                            Rejeter
                          </button>
                          {String(demand.status || "") === "voucher_en_cours" ? (
                            <button
                              type="button"
                              disabled={savingId === demand.id}
                              onClick={() => void handleRegenerateVoucher(demand)}
                              className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60"
                            >
                              Regenerer voucher
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "sky" | "amber" | "indigo";
}) {
  const tones: Record<typeof tone, string> = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    sky: "border-sky-200 bg-sky-50 text-sky-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-900",
  } as const;
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
