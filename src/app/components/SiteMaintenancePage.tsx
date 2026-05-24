import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Wrench } from "lucide-react";
import type { SiteMaintenanceStatus } from "../services/siteMaintenance";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const WHATSAPP_CONTACTS = [
  { number: "29879227", link: "https://wa.me/21629879227" },
  { number: "52080695", link: "https://wa.me/21652080695" },
];

function getTargetTimestamp(status: SiteMaintenanceStatus) {
  const value = String(status.resumeAt || "").trim();
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function computeTimeLeft(status: SiteMaintenanceStatus): TimeLeft {
  const targetTimestamp = getTargetTimestamp(status);
  if (!targetTimestamp) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const difference = targetTimestamp - Date.now();
  if (difference <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / (1000 * 60)) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  };
}

function formatNumber(value: number) {
  return String(value).padStart(2, "0");
}

export function SiteMaintenancePage({ status }: { status: SiteMaintenanceStatus }) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => computeTimeLeft(status));

  useEffect(() => {
    setTimeLeft(computeTimeLeft(status));
    const timer = window.setInterval(() => {
      setTimeLeft(computeTimeLeft(status));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const resumeLabel = useMemo(() => {
    if (!status.resumeAt) return null;
    const parsed = new Date(status.resumeAt);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "full",
      timeStyle: "short",
    }).format(parsed);
  }, [status.resumeAt]);

  const message = String(status.message || "").trim() || "Nous revenons tres bientot avec un service encore plus fiable.";

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage:
            "url(https://images.unsplash.com/photo-1757840589823-5e074cc2bab6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1920)",
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.18),transparent_35%),linear-gradient(180deg,rgba(2,6,23,0.9),rgba(2,6,23,0.84),rgba(15,23,42,0.94))]" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-10 inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/8 px-5 py-2 text-sm font-medium text-white/80 backdrop-blur">
          <Wrench className="h-4 w-4 text-emerald-400" />
          <span>Dwira Immobilier</span>
        </div>

        <div className="max-w-3xl">
          <h1 className="text-4xl font-light tracking-tight text-white md:text-6xl">
            Le site est en cours de maintenance
          </h1>
          <p className="mt-4 text-sm leading-7 text-white/70 md:text-base">
            {message}
          </p>
          {resumeLabel ? (
            <p className="mt-4 text-xs uppercase tracking-[0.35em] text-emerald-300/80 md:text-sm">
              Reprise prevue: {resumeLabel}
            </p>
          ) : null}
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-4 md:gap-6">
          {[
            { label: "Jours", value: formatNumber(timeLeft.days) },
            { label: "Heures", value: formatNumber(timeLeft.hours) },
            { label: "Minutes", value: formatNumber(timeLeft.minutes) },
            { label: "Secondes", value: formatNumber(timeLeft.seconds), accent: true },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center">
              <div
                className={`min-w-[96px] rounded-2xl border px-6 py-5 backdrop-blur md:min-w-[112px] ${
                  item.accent
                    ? "border-emerald-400/30 bg-emerald-500/12"
                    : "border-white/12 bg-white/6"
                }`}
              >
                <div className={`font-mono text-5xl font-light tracking-tight md:text-6xl ${item.accent ? "text-emerald-300" : "text-white"}`}>
                  {item.value}
                </div>
              </div>
              <span className={`mt-3 text-xs uppercase tracking-[0.35em] ${item.accent ? "text-emerald-300/75" : "text-white/45"}`}>
                {item.label}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-14 w-full max-w-2xl rounded-3xl border border-white/12 bg-white/8 p-6 backdrop-blur">
          <p className="text-sm text-white/75 md:text-base">
            Pour toute urgence, contactez-nous sur WhatsApp
          </p>
          <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {WHATSAPP_CONTACTS.map((contact) => (
              <a
                key={contact.number}
                href={contact.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/6 px-5 py-3 text-white/90 transition hover:border-emerald-400/35 hover:bg-emerald-500/12 hover:text-emerald-200"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="font-mono text-sm tracking-wide">{contact.number}</span>
              </a>
            ))}
          </div>
        </div>

        <p className="mt-14 text-xs text-white/40">
          © {new Date().getFullYear()} Dwira Immobilier
        </p>
      </div>
    </div>
  );
}
