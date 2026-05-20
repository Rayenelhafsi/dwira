import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, Link, useNavigate } from "react-router";
import { Calculator, FileText, LogOut, RefreshCw, Ticket, CheckCircle2, Eye } from "lucide-react";
import { toast } from "sonner";
import type { ReservationDemand, ReservationDemandStatus } from "../admin/types";

const API_URL = import.meta.env.VITE_API_URL || "/api";

type AgentSession = {
  userId: string;
  username: string;
  displayName: string;
  amicaleId: string;
  amicaleName: string;
  amicaleLogoUrl?: string | null;
};

type AgentTab = "demandes" | "vouchers" | "comptabilite";

type AgentDemandRow = ReservationDemand & {
  amicale_name?: string | null;
  amicale_logo_url?: string | null;
};

const statusLabels: Partial<Record<ReservationDemandStatus, string>> = {
  attente_validation_amicale: "Attente validation amicale",
  attente_validation_par_agence: "Attente validation par l agence",
  voucher_en_cours: "Voucher en cours",
  rejete_par_amicale: "Rejete par l amicale",
  rejete_par_agence: "Rejete par l agence",
};

const statusToneClasses: Partial<Record<ReservationDemandStatus, string>> = {
  attente_validation_amicale: "bg-emerald-100 text-emerald-800 border-emerald-200",
  attente_validation_par_agence: "bg-cyan-100 text-cyan-800 border-cyan-200",
  voucher_en_cours: "bg-indigo-100 text-indigo-800 border-indigo-200",
  rejete_par_amicale: "bg-slate-100 text-slate-700 border-slate-200",
  rejete_par_agence: "bg-rose-100 text-rose-800 border-rose-200",
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

function resolveAssetUrl(url?: string | null) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${window.location.origin}${value.startsWith("/") ? value : `/${value}`}`;
}

function demandStatusLabel(status?: ReservationDemandStatus | null) {
  const value = String(status || "").trim() as ReservationDemandStatus;
  return statusLabels[value] || value || "-";
}

function demandStatusTone(status?: ReservationDemandStatus | null) {
  const value = String(status || "").trim() as ReservationDemandStatus;
  return statusToneClasses[value] || "bg-gray-100 text-gray-700 border-gray-200";
}

function buildPropertyPath(demand: ReservationDemand) {
  const token = String(demand.bien_reference || demand.bien_id || "").trim();
  return token ? `/properties/${encodeURIComponent(token)}` : "/logements";
}

export default function AgentAmicaleDashboardPage() {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<AgentTab>("demandes");
  const [demandRows, setDemandRows] = useState<AgentDemandRow[]>([]);
  const [voucherRows, setVoucherRows] = useState<AgentDemandRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();

  const loadData = useCallback(async () => {
    try {
      const [demandsResponse, vouchersResponse] = await Promise.all([
        fetch(`${API_URL}/agent-amicale/reservation-demands`, { credentials: "include" }),
        fetch(`${API_URL}/agent-amicale/vouchers`, { credentials: "include" }),
      ]);
      if (demandsResponse.ok) {
        const demandsJson = await demandsResponse.json().catch(() => []);
        setDemandRows(
          (Array.isArray(demandsJson) ? demandsJson : [])
            .sort((a, b) => {
              const da = new Date(String(a.updated_at || a.created_at || "")).getTime();
              const db = new Date(String(b.updated_at || b.created_at || "")).getTime();
              return db - da;
            })
        );
      }
      if (vouchersResponse.ok) {
        const vouchersJson = await vouchersResponse.json().catch(() => []);
        setVoucherRows(
          (Array.isArray(vouchersJson) ? vouchersJson : [])
            .filter((row): row is AgentDemandRow => Boolean(row && row.voucher_url))
            .sort((a, b) => {
              const da = new Date(String(a.voucher_generated_at || a.updated_at || a.created_at || "")).getTime();
              const db = new Date(String(b.voucher_generated_at || b.updated_at || b.created_at || "")).getTime();
              return db - da;
            })
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chargement impossible");
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_URL}/auth/agent-amicale/me`, { credentials: "include" });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setSession(null);
          return;
        }
        setSession(data?.session || null);
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

  const summary = useMemo(() => {
    const waitingAmicale = demandRows.filter((row) => row.status === "attente_validation_amicale").length;
    const waitingAgency = demandRows.filter((row) => row.status === "attente_validation_par_agence").length;
    const vouchers = voucherRows.length;
    const totalHt = voucherRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
    return { waitingAmicale, waitingAgency, vouchers, totalHt };
  }, [demandRows, voucherRows]);

  const comptabiliteRows = useMemo(() => {
    return demandRows
      .filter((row) => !['rejete_par_agence', 'rejete_par_amicale', 'demande_rejetee_admin'].includes(String(row.status || '')))
      .map((row) => {
      const ht = Number(row.total_amount || 0);
      const tva = Math.round((ht * 0.1) * 100) / 100;
      const ttc = Math.round((ht + tva) * 100) / 100;
      return { row, ht, tva, ttc };
    });
  }, [demandRows]);

  const filteredVoucherRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return voucherRows;
    return voucherRows.filter((row) => {
      const bag = [
        row.client_name,
        row.amicale_matricule,
        row.amicale_phone,
        row.bien_reference,
        row.bien_titre,
        row.status,
        row.voucher_number,
      ].map((v) => String(v || "").toLowerCase());
      return bag.some((v) => v.includes(needle));
    });
  }, [searchTerm, voucherRows]);

  const filteredComptabiliteRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return comptabiliteRows;
    return comptabiliteRows.filter(({ row }) => {
      const bag = [
        row.client_name,
        row.amicale_matricule,
        row.amicale_phone,
        row.bien_reference,
        row.bien_titre,
        row.status,
      ].map((v) => String(v || "").toLowerCase());
      return bag.some((v) => v.includes(needle));
    });
  }, [comptabiliteRows, searchTerm]);

  const comptabiliteTotals = useMemo(() => {
    return comptabiliteRows.reduce(
      (acc, item) => {
        acc.ht += item.ht;
        acc.tva += item.tva;
        acc.ttc += item.ttc;
        return acc;
      },
      { ht: 0, tva: 0, ttc: 0 }
    );
  }, [comptabiliteRows]);

  const filteredDemandRows = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return demandRows;
    return demandRows.filter((row) => {
      const bag = [
        row.client_name,
        row.amicale_matricule,
        row.amicale_phone,
        row.bien_reference,
        row.bien_titre,
        row.status,
      ].map((v) => String(v || "").toLowerCase());
      return bag.some((v) => v.includes(needle));
    });
  }, [demandRows, searchTerm]);

  const handleDemandAction = async (demand: AgentDemandRow, next: "validate" | "reject") => {
    setSavingId(demand.id);
    try {
      const endpoint = next === "validate"
        ? `${API_URL}/agent-amicale/reservation-demands/${encodeURIComponent(demand.id)}/validate`
        : `${API_URL}/agent-amicale/reservation-demands/${encodeURIComponent(demand.id)}/reject`;
      const response = await fetch(endpoint, { method: "POST", credentials: "include" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(String(data?.error || "Mise a jour impossible"));
      }
      toast.success(next === "validate" ? "Demande transmise a l agence." : "Demande rejetee.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour impossible");
    } finally {
      setSavingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!session) return <Navigate to="/agent-amicale/login" replace />;

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="flex w-72 flex-col bg-emerald-950 text-white">
        <div className="border-b border-emerald-900 p-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-full border border-emerald-800 bg-white">
              {session.amicaleLogoUrl ? (
                <img src={session.amicaleLogoUrl} alt={session.amicaleName} className="h-full w-full object-contain" />
              ) : null}
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">{session.amicaleName}</h1>
              <p className="text-xs text-emerald-300">Dashboard agent amicale</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-2 px-3 py-5">
          <SidebarTab
            active={tab === "demandes"}
            label="Demande adherants"
            icon={<FileText size={18} />}
            onClick={() => setTab("demandes")}
          />
          <SidebarTab
            active={tab === "vouchers"}
            label="Vouchers"
            icon={<Ticket size={18} />}
            onClick={() => setTab("vouchers")}
          />
          <SidebarTab
            active={tab === "comptabilite"}
            label="Comptabilite"
            icon={<Calculator size={18} />}
            onClick={() => setTab("comptabilite")}
          />
        </nav>

        <div className="border-t border-emerald-900 p-4">
          <div className="mb-3">
            <p className="truncate text-sm font-medium">{session.displayName || session.username}</p>
            <p className="truncate text-xs text-emerald-300">{session.username}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await fetch(`${API_URL}/auth/agent-amicale/logout`, { method: "POST", credentials: "include" });
              } finally {
                navigate("/agent-amicale/login", { replace: true });
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
        <div className="mx-auto max-w-7xl rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Espace Agent Amicale</h2>
              <p className="mt-1 text-sm text-gray-500">{session.amicaleName}</p>
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

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Demandes amicale" value={summary.waitingAmicale + summary.waitingAgency} tone="emerald" />
            <StatCard label="Attente validation" value={summary.waitingAmicale} tone="amber" />
            <StatCard label="Transmis agence" value={summary.waitingAgency} tone="sky" />
            <StatCard label="Vouchers" value={summary.vouchers} tone="indigo" />
          </div>

          <div className="mt-6 inline-flex rounded-lg border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setTab("demandes")}
              className={`rounded-md px-3 py-2 text-sm font-medium ${tab === "demandes" ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
            >
              Demande adherants
            </button>
            <button
              type="button"
              onClick={() => setTab("vouchers")}
              className={`rounded-md px-3 py-2 text-sm font-medium ${tab === "vouchers" ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
            >
              Vouchers
            </button>
            <button
              type="button"
              onClick={() => setTab("comptabilite")}
              className={`rounded-md px-3 py-2 text-sm font-medium ${tab === "comptabilite" ? "bg-emerald-600 text-white" : "text-gray-700 hover:bg-gray-100"}`}
            >
              Comptabilite
            </button>
          </div>

          {tab === "demandes" && (
            <div className="mt-6 space-y-3">
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Filtrer: matricule, nom/prenom, tel, reference logement, statut..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              {filteredDemandRows.length === 0 ? (
                <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                  Aucune demande amicale pour cette amicale.
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredDemandRows.map((demand) => {
                    const consultPath = buildPropertyPath(demand);
                    const voucherUrl = demand.voucher_url ? resolveAssetUrl(demand.voucher_url) : "";
                    const canDecide = demand.status === "attente_validation_amicale";
                    return (
                      <article key={demand.id} className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="grid gap-3 lg:grid-cols-3">
                          <div className="space-y-1 text-sm">
                            <p><span className="font-semibold">Nom:</span> {String(demand.client_name || "-")}</p>
                            <p><span className="font-semibold">Matricule:</span> {String(demand.amicale_matricule || "-")}</p>
                            <p><span className="font-semibold">Telephone:</span> {String(demand.amicale_phone || "-")}</p>
                          </div>
                          <div className="space-y-1 text-sm">
                            <p className="font-semibold">{String(demand.bien_reference || demand.bien_id || "-")}</p>
                            <p className="text-gray-600">{String(demand.bien_titre || "-")}</p>
                            <p>
                              <span className="font-semibold">Periode:</span> {formatDateOnly(demand.start_date)} au {formatDateOnly(demand.end_date)}
                            </p>
                            <p><span className="font-semibold">Total TTC:</span> {formatCurrency(demand.total_amount)}</p>
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
                            {demand.amicale_validation_at ? (
                              <p className="text-xs text-gray-500">Validee amicale le {formatDateTime(demand.amicale_validation_at)}</p>
                            ) : null}
                            {demand.agency_validation_at ? (
                              <p className="text-xs text-gray-500">Validee agence le {formatDateTime(demand.agency_validation_at)}</p>
                            ) : null}
                            {voucherUrl ? (
                              <a
                                href={voucherUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-xs font-medium text-indigo-700 hover:underline"
                              >
                                Ouvrir voucher
                              </a>
                            ) : null}
                            <div className="flex flex-wrap gap-2 pt-1">
                              {canDecide ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={savingId === demand.id}
                                    onClick={() => void handleDemandAction(demand, "validate")}
                                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                    Valider
                                  </button>
                                  <button
                                    type="button"
                                    disabled={savingId === demand.id}
                                    onClick={() => void handleDemandAction(demand, "reject")}
                                    className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                                  >
                                    Rejeter
                                  </button>
                                </>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                                  Statut verrouille
                                </span>
                              )}
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

          {tab === "vouchers" && (
            <div className="mt-6 space-y-3">
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Filtrer: matricule, nom/prenom, tel, reference logement, statut, numero voucher..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              {filteredVoucherRows.length === 0 ? (
                <p className="text-sm text-gray-500">Aucun voucher genere pour cette amicale.</p>
              ) : (
                filteredVoucherRows.map((demand) => {
                  const voucherUrl = demand.voucher_url ? resolveAssetUrl(demand.voucher_url) : "";
                  return (
                    <div key={demand.id} className="rounded-xl border border-gray-200 bg-slate-50 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-indigo-200 bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800">
                              {String(demand.voucher_number || demand.id)}
                            </span>
                            <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600">
                              {formatDateTime(demand.voucher_generated_at || demand.agency_validation_at || demand.updated_at)}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-gray-900">{String(demand.client_name || "-")} - {String(demand.bien_reference || demand.bien_id || "-")}</p>
                          <p className="text-xs text-gray-500">{formatDateOnly(demand.start_date)} au {formatDateOnly(demand.end_date)} - {formatCurrency(demand.total_amount)}</p>
                        </div>
                        {voucherUrl ? (
                          <div className="flex flex-wrap gap-2">
                            <a
                              href={voucherUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
                            >
                              Consulter voucher
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                const popup = window.open(voucherUrl, "_blank", "noopener,noreferrer");
                                if (popup) {
                                  popup.addEventListener("load", () => popup.print(), { once: true });
                                }
                              }}
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Imprimer voucher
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === "comptabilite" && (
            <div className="mt-6 space-y-4">
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Filtrer: matricule, nom/prenom, tel, reference logement, statut..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Demandes totales" value={demandRows.length} tone="emerald" />
                <StatCard label="Total HT" value={Math.round(comptabiliteTotals.ht * 100) / 100} tone="sky" currency />
                <StatCard label="TVA 10%" value={Math.round(comptabiliteTotals.tva * 100) / 100} tone="amber" currency />
                <StatCard label="Total TTC" value={Math.round(comptabiliteTotals.ttc * 100) / 100} tone="indigo" currency />
              </div>

              {filteredComptabiliteRows.length === 0 ? (
                <p className="text-sm text-gray-500">Aucune demande pour la comptabilite.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[980px] w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-600">
                        <th className="px-3 py-2 font-semibold">Client</th>
                        <th className="px-3 py-2 font-semibold">Logement</th>
                        <th className="px-3 py-2 font-semibold">Periode</th>
                        <th className="px-3 py-2 font-semibold">Statut</th>
                        <th className="px-3 py-2 font-semibold">Prix HT</th>
                        <th className="px-3 py-2 font-semibold">+ 10%</th>
                        <th className="px-3 py-2 font-semibold">Prix TTC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredComptabiliteRows.map(({ row, ht, tva, ttc }) => (
                        <tr key={`compta-${row.id}`} className="border-b border-gray-100">
                          <td className="px-3 py-2 text-gray-900">{String(row.client_name || "-")}</td>
                          <td className="px-3 py-2 text-gray-900">{String(row.bien_reference || row.bien_id || "-")}</td>
                          <td className="px-3 py-2 text-gray-700">
                            {formatDateOnly(row.start_date)} au {formatDateOnly(row.end_date)}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${demandStatusTone(row.status)}`}>
                              {demandStatusLabel(row.status)}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-semibold text-gray-900">{formatCurrency(ht)}</td>
                          <td className="px-3 py-2 font-semibold text-amber-700">{formatCurrency(tva)}</td>
                          <td className="px-3 py-2 font-semibold text-emerald-700">{formatCurrency(ttc)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function SidebarTab({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
        active ? "bg-emerald-800 text-white shadow-sm" : "text-emerald-100/70 hover:bg-emerald-900 hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({
  label,
  value,
  tone,
  currency,
}: {
  label: string;
  value: number;
  tone: "emerald" | "sky" | "amber" | "indigo";
  currency?: boolean;
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
      <p className="mt-1 text-2xl font-bold">
        {currency ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} DT` : value}
      </p>
    </div>
  );
}
