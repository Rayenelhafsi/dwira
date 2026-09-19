import { useNavigate } from "react-router";
import { OwnerSaleRequestBox } from "./VentesListPage";

export default function OwnerSaleSubmissionPage() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6fafc,#ffffff)] px-4 py-24 text-slate-950 md:px-6 md:py-28">
      <div className="mx-auto mb-8 max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.26em] text-emerald-700">Dwira Immobilier</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">Soumettre un bien a vendre</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
          Completez les informations du bien. Votre demande arrive directement dans le dashboard admin ventes.
        </p>
      </div>
      <OwnerSaleRequestBox open onOpenChange={(next) => {
        if (!next) navigate("/ventes");
      }} />
    </main>
  );
}
