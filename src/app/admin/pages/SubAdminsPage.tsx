import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router";
import { KeyRound, RefreshCw, Shield, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext";
import { buildApiUrl } from "../../utils/api";
import SubAdminOperationsPanel from "../components/SubAdminOperationsPanel";

type AdminAccount = {
  id: string;
  nom: string;
  email: string;
  admin_type: "superadmin" | "subadmin";
  actif: boolean | number;
  created_by_admin_id?: string | null;
  last_login_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

async function getApiErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return String(data?.error || fallback);
  } catch {
    return fallback;
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("fr-FR", { timeZone: "Africa/Tunis", hour12: false });
}

const initialForm = {
  nom: "",
  email: "",
  password: "",
};

export default function SubAdminsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(buildApiUrl("/admin/accounts"), { credentials: "include" });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Impossible de charger les comptes admin"));
      }
      const data = await response.json().catch(() => []);
      setAccounts(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de charger les comptes admin");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.adminType === "superadmin") {
      void loadAccounts();
    }
  }, [loadAccounts, user?.adminType]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const subadmins = useMemo(
    () => accounts.filter((account) => String(account.admin_type || "").trim() === "subadmin"),
    [accounts]
  );
  const superadmins = useMemo(
    () => accounts.filter((account) => String(account.admin_type || "").trim() === "superadmin"),
    [accounts]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        nom: form.nom.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password.trim(),
        actif: true,
      };
      const response = await fetch(
        buildApiUrl(editingId ? `/admin/accounts/${encodeURIComponent(editingId)}` : "/admin/accounts"),
        {
          method: editingId ? "PUT" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, editingId ? "Mise a jour impossible" : "Creation impossible"));
      }
      resetForm();
      await loadAccounts();
      toast.success(editingId ? "Sous-admin mis a jour." : "Sous-admin cree.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (account: AdminAccount) => {
    setEditingId(account.id);
    setForm({
      nom: String(account.nom || ""),
      email: String(account.email || ""),
      password: "",
    });
  };

  const handleToggleActive = async (account: AdminAccount) => {
    setSaving(true);
    try {
      const response = await fetch(buildApiUrl(`/admin/accounts/${encodeURIComponent(account.id)}`), {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: account.nom,
          email: account.email,
          actif: !Boolean(account.actif),
        }),
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Mise a jour du statut impossible"));
      }
      await loadAccounts();
      toast.success(Boolean(account.actif) ? "Sous-admin desactive." : "Sous-admin active.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mise a jour impossible");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (account: AdminAccount) => {
    const confirmed = window.confirm(`Supprimer le sous-admin ${account.email} ?`);
    if (!confirmed) return;
    setSaving(true);
    try {
      const response = await fetch(buildApiUrl(`/admin/accounts/${encodeURIComponent(account.id)}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Suppression impossible"));
      }
      if (editingId === account.id) {
        resetForm();
      }
      await loadAccounts();
      toast.success("Sous-admin supprime.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    } finally {
      setSaving(false);
    }
  };

  if (user?.role !== "admin") {
    return <Navigate to="/connexion-admin-interne" replace />;
  }

  if (user?.adminType !== "superadmin") {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Sous-admins</h1>
          <p className="mt-1 text-sm leading-6 text-gray-500">Creation et gestion des comptes sous-administrateurs qui se connectent dans la zone connexion admin.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadAccounts()}
          className="inline-flex w-full items-center justify-center gap-2 self-start rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
        >
          <RefreshCw size={16} />
          Actualiser
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
              <UserPlus size={22} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{editingId ? "Modifier un sous-admin" : "Creer un sous-admin"}</h2>
              <p className="text-sm leading-6 text-gray-500">Ces comptes seront marques `subadmin` et reutilisables dans l application mobile.</p>
            </div>
          </div>

          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nom</label>
              <input
                value={form.nom}
                onChange={(event) => setForm((prev) => ({ ...prev, nom: event.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                placeholder="Nom complet"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                placeholder="sousadmin@dwiraimmobilier.com"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Mot de passe {editingId ? <span className="text-gray-400">(laisser vide pour garder l actuel)</span> : null}
              </label>
              <input
                type="text"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                placeholder="Minimum 8 caracteres"
                required={!editingId}
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 sm:w-auto"
              >
                <KeyRound size={16} />
                {editingId ? "Enregistrer" : "Creer le compte"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
                >
                  Annuler
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Superadmin</p>
              <p className="mt-2 text-2xl font-bold text-emerald-900">{superadmins.length}</p>
              <p className="mt-1 text-sm text-emerald-800">Compte principal seed: `admin@dwiraimmobilier.com`.</p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Sous-admins</p>
              <p className="mt-2 text-2xl font-bold text-sky-900">{subadmins.length}</p>
              <p className="mt-1 text-sm text-sky-800">Connexion via la meme zone admin avec dashboard dedie.</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {loading ? (
              <div className="py-10 text-center text-sm text-gray-500">Chargement...</div>
            ) : accounts.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">Aucun compte administrateur.</div>
            ) : (
              accounts.map((account) => {
                const isSuperadmin = account.admin_type === "superadmin";
                return (
                  <article key={account.id} className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-gray-900">{account.nom}</h3>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isSuperadmin ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"}`}>
                            {isSuperadmin ? "Superadmin" : "Sous-admin"}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${Boolean(account.actif) ? "bg-emerald-50 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                            {Boolean(account.actif) ? "Actif" : "Desactive"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{account.email}</p>
                        <div className="mt-3 grid gap-2 text-sm text-gray-500 md:grid-cols-2">
                          <p>Derniere connexion: {formatDateTime(account.last_login_at)}</p>
                          <p>Creation: {formatDateTime(account.created_at)}</p>
                        </div>
                      </div>

                      {!isSuperadmin && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleEdit(account)}
                            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:w-auto"
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleActive(account)}
                            disabled={saving}
                            className={`w-full rounded-xl px-3 py-2 text-sm font-medium ${Boolean(account.actif) ? "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" : "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"} disabled:opacity-60 sm:w-auto`}
                          >
                            {Boolean(account.actif) ? "Desactiver" : "Activer"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(account)}
                            disabled={saving}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-60 sm:w-auto"
                          >
                            <Trash2 size={15} />
                            Supprimer
                          </button>
                        </div>
                      )}

                      {isSuperadmin && (
                        <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                          <Shield size={16} />
                          Compte principal protege
                        </div>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>

      <SubAdminOperationsPanel subadmins={subadmins} />
    </div>
  );
}
