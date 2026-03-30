import ComingSoonState from "../components/ComingSoonState";

export default function VentesComingSoonPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 pt-32 md:px-6">
      <ComingSoonState
        title="Section Ventes"
        description="La section Ventes est en phase de stabilisation cote client. Nous finalisons l'experience avant ouverture publique."
        backTo="/"
      />
    </div>
  );
}

