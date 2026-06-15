import ComingSoonState from "../components/ComingSoonState";

export default function PacksComingSoonPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 pt-32 md:px-6">
      <ComingSoonState
        title="Section Packs"
        description="Les packs sont encore en phase de finalisation cote client. L'administration reste disponible pour preparer les combinaisons avant ouverture publique."
        backTo="/"
      />
    </div>
  );
}
