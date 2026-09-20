import { useNavigate } from "react-router";
import { OwnerSaleRequestBox } from "./VentesListPage";

export default function OwnerSaleSubmissionPage() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6fafc,#ffffff)] px-4 py-24 text-slate-950 md:px-6 md:py-28">
      <OwnerSaleRequestBox open onOpenChange={(next) => {
        if (!next) navigate("/ventes");
      }} />
    </main>
  );
}
