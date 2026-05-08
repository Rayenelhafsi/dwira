import { useMemo, useState } from "react";
import { toast } from "sonner";
import { addAmicale, readAmicales, removeAmicale } from "../../utils/amicales";

export default function AmicalesPage() {
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const amicales = useMemo(() => readAmicales(), [refreshIndex]);

  const handleAdd = () => {
    const result = addAmicale(name, code);
    if (!result.ok) {
      if (result.reason === "duplicate_name") {
        toast.error("Une amicale avec ce nom existe deja.");
        return;
      }
      toast.error("Nom et code obligatoires.");
      return;
    }
    setName("");
    setCode("");
    setRefreshIndex((prev) => prev + 1);
    toast.success("Amicale ajoutee.");
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
                  <th className="px-3 py-2 font-semibold">Code</th>
                  <th className="px-3 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {amicales.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-3 py-2 text-gray-900">{item.name}</td>
                    <td className="px-3 py-2 text-gray-700">{item.code}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          removeAmicale(item.id);
                          setRefreshIndex((prev) => prev + 1);
                          toast.success("Amicale supprimee.");
                        }}
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
