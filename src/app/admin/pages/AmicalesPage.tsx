import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createAmicaleApi, deleteAmicaleApi, fetchAmicalesAdmin, type AmicaleItem } from "../../utils/amicales";

export default function AmicalesPage() {
  const [amicales, setAmicales] = useState<AmicaleItem[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setAmicales(await fetchAmicalesAdmin());
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Chargement amicales impossible");
      }
    };
    void load();
  }, []);

  const handleAdd = async () => {
    if (!name.trim() || !code.trim()) {
      toast.error("Nom et code obligatoires.");
      return;
    }
    try {
      await createAmicaleApi({ name, code, logoUrl: logoUrl || undefined });
      setAmicales(await fetchAmicalesAdmin());
      setName("");
      setCode("");
      setLogoUrl("");
      toast.success("Amicale ajoutee.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ajout impossible");
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Amicales</h1>
        <p className="mt-1 text-sm text-gray-500">Ajoutez les amicales et leurs codes pour les reservations mode Amicale.</p>
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
          <div className="md:col-span-2 rounded-lg border border-gray-200 p-3">
            <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Logo amicale (upload)</p>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setLogoUrl(String(reader.result || ""));
                reader.readAsDataURL(file);
              }}
              className="w-full text-sm"
            />
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
                            setAmicales(await fetchAmicalesAdmin());
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
    </div>
  );
}
