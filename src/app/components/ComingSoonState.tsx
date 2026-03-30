import { Link } from "react-router";
import { ArrowLeft, Clock3 } from "lucide-react";

type ComingSoonStateProps = {
  title: string;
  description: string;
  backTo?: string;
  backLabel?: string;
};

export default function ComingSoonState({
  title,
  description,
  backTo = "/",
  backLabel = "Retour a l'accueil",
}: ComingSoonStateProps) {
  return (
    <section className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.10)] md:p-10">
      <div className="overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_20%_20%,#34d399_0%,#047857_52%,#022c22_100%)] p-8 text-white md:p-12">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-white/10">
            <Clock3 size={26} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100">Coming Soon</p>
          <h2 className="mt-2 text-3xl font-extrabold md:text-4xl">{title}</h2>
          <p className="mt-3 text-xl font-semibold text-emerald-100">Bientot disponible</p>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-emerald-50 md:text-base">{description}</p>

          <div className="mt-7">
            <Link
              to={backTo}
              className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/15 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/25"
            >
              <ArrowLeft size={16} />
              {backLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

