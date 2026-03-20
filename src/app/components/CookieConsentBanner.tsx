import { useMemo, useState } from "react";
import { getCookieConsentStatus, setCookieConsentStatus, type CookieConsentStatus } from "../utils/consent";

export function CookieConsentBanner() {
  const initialStatus = useMemo<CookieConsentStatus>(() => getCookieConsentStatus(), []);
  const [status, setStatus] = useState<CookieConsentStatus>(initialStatus);

  if (status !== "pending") return null;

  const accept = () => {
    setCookieConsentStatus("accepted");
    setStatus("accepted");
  };

  const reject = () => {
    setCookieConsentStatus("rejected");
    setStatus("rejected");
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-[120] rounded-2xl border border-emerald-200 bg-white/95 p-4 shadow-[0_20px_40px_rgba(15,23,42,0.18)] backdrop-blur md:inset-x-auto md:bottom-5 md:right-5 md:max-w-xl">
      <p className="text-sm font-semibold text-emerald-900">Gestion des cookies</p>
      <p className="mt-1 text-xs leading-relaxed text-gray-600">
        Nous utilisons des cookies essentiels pour la connexion et, avec votre accord, des cookies d'analyse pour suivre les interactions client
        (avant et apres connexion) afin d'ameliorer le suivi des reservations.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={accept}
          className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
        >
          Accepter
        </button>
        <button
          type="button"
          onClick={reject}
          className="rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          Refuser analytics
        </button>
      </div>
    </div>
  );
}

