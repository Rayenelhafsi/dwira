import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { LoaderCircle, AlertCircle } from "lucide-react";
import HomePage from "./HomePage";
import { normalizeAmicaleSlug } from "../utils/amicales";
import { resolvePublicPartnerBySlug, type PublicPartnerResolution } from "../utils/publicPartnerResolver";

export default function AmicaleLandingPage() {
  const { amicaleSlug = "" } = useParams();
  const [, setSearchParams] = useSearchParams();
  const normalizedSlug = useMemo(() => normalizeAmicaleSlug(amicaleSlug), [amicaleSlug]);
  const [loading, setLoading] = useState(true);
  const [resolution, setResolution] = useState<PublicPartnerResolution>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const match = await resolvePublicPartnerBySlug(normalizedSlug);
        if (!cancelled) {
          setResolution(match);
          if (match) {
            const next = new URLSearchParams(window.location.search);
            next.delete("amicale");
            next.delete("partner");
            next.delete("partnerMargin");
            if (next.get("mode") === "location_saisonniere") {
              next.delete("mode");
            }
            if (next.toString() !== window.location.search.replace(/^\?/, "")) {
              setSearchParams(next, { replace: true });
            }
          }
        }
      } catch {
        if (!cancelled) {
          setResolution(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [normalizedSlug, setSearchParams]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-5 py-4 text-sm text-gray-700 shadow-sm">
          <LoaderCircle className="h-5 w-5 animate-spin text-emerald-600" />
          Chargement de l'espace amicale...
        </div>
      </div>
    );
  }

  if (!resolution) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="max-w-md rounded-3xl border border-red-100 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Partenaire introuvable</h1>
          <p className="mt-2 text-sm text-gray-600">
            Le lien saisi ne correspond a aucun partenaire actif.
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Retour a l'accueil
          </Link>
        </div>
      </div>
    );
  }

  if (resolution.kind === "amicale") {
    return <HomePage forcedAmicaleId={resolution.item.id} publicPartnerSlug={normalizedSlug} />;
  }

  return (
    <HomePage
      forcedPartnerAgencyId={resolution.item.id}
      forcedPartnerAgencyMarginMultiplier={resolution.item.marginMultiplier}
      publicPartnerSlug={normalizedSlug}
    />
  );
}
