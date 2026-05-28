import { Download, Smartphone } from "lucide-react";
import ComingSoonState from "../components/ComingSoonState";
import { PUBLIC_COMING_SOON } from "../config/publicAvailability";

type AppEntry = {
  key: string;
  title: string;
  subtitle: string;
  androidUrl: string;
  iosUrl: string;
};

const appEntries: AppEntry[] = [
  {
    key: "owner",
    title: "Application Proprietaire",
    subtitle: "Suivi des biens, calendrier, notifications et chat admin.",
    androidUrl: "/deploy-mobile/app-release.apk",
    iosUrl: "",
  },
];


function qrUrl(target: string) {
  const encoded = encodeURIComponent(target);
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encoded}`;
}

function toAbsoluteDownloadUrl(target: string) {
  if (!target) return "";
  if (/^https?:\/\//i.test(target)) return target;
  return `https://www.dwiraimmobilier.com${target.startsWith("/") ? target : `/${target}`}`;
}

function DownloadButton({ label, url }: { label: string; url: string }) {
  if (!url) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        {label}: lien non configure
      </div>
    );
  }

  return (
    <a
      href={url}
      download
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
    >
      <Download className="h-4 w-4" />
      {label}
    </a>
  );
}

export default function DeployAppsPage() {
  if (false) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 pt-32 md:px-6">
        <ComingSoonState
          title="Applications mobiles Dwira"
          description="La section Apps n'est pas encore stable cote client. Elle sera publiee des que les versions Android et iOS seront pretes."
          backTo="/"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
      <div className="rounded-3xl bg-gradient-to-r from-emerald-900 to-emerald-700 px-6 py-8 text-white shadow-xl">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-1 h-8 w-8" />
          <div>
            <h1 className="text-2xl font-bold md:text-3xl">Deploiement Mobile Dwira</h1>
            <p className="mt-2 max-w-3xl text-sm text-emerald-100 md:text-base">
              Page dediee au telechargement Android/iOS des applications mobile connectees a Firebase.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {appEntries.map((entry) => (
          <section key={entry.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold text-slate-900">{entry.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{entry.subtitle}</p>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_190px]">
              <div className="space-y-3">
                <DownloadButton label="Installer app proprietaire Android" url={entry.androidUrl} />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                {entry.androidUrl || entry.iosUrl ? (
                  <img
                    src={qrUrl(toAbsoluteDownloadUrl(entry.androidUrl || entry.iosUrl))}
                    alt={`QR ${entry.title}`}
                    className="h-[180px] w-[180px] rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-[180px] w-[180px] items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-500">
                    QR indisponible
                  </div>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>

      
    </div>
  );
}

