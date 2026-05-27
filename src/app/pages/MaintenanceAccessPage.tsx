import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, Lock, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import logo from "../../../logo dwira.jpg";
import { useAuth } from "../context/AuthContext";
import { loginAdmin } from "../services/auth";

export default function MaintenanceAccessPage() {
  const navigate = useNavigate();
  const { user, login, isLoading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (user?.role === "admin") {
      navigate("/", { replace: true });
    }
  }, [authLoading, navigate, user]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const adminUser = await loginAdmin(email, password);
      login({
        id: adminUser.id,
        email: adminUser.email,
        name: adminUser.name,
        avatar: adminUser.avatar || undefined,
        profileCompleted: true,
        role: "admin",
      });
      toast.success("Acces maintenance autorise.");
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connexion impossible");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.2),transparent_35%),linear-gradient(180deg,rgba(2,6,23,0.96),rgba(15,23,42,0.98))]" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-white/8 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/90 shadow-sm">
                <img src={logo} alt="Dwira" className="h-full w-full object-cover" />
              </span>
              <div>
                <p className="text-sm uppercase tracking-[0.32em] text-emerald-300/75">Acces prive</p>
                <h1 className="text-xl font-semibold text-white">Bypass maintenance</h1>
              </div>
            </div>
            <ShieldCheck className="h-6 w-6 text-emerald-300" />
          </div>

          <p className="mb-6 text-sm leading-6 text-white/70">
            Ce lien permet un acces restreint au site pendant la maintenance. Connectez-vous avec votre compte administrateur.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-medium text-white/85">
                <Mail className="h-4 w-4 text-emerald-300" />
                Adresse email
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/15"
                placeholder="admin@exemple.com"
                autoComplete="username"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-medium text-white/85">
                <Lock className="h-4 w-4 text-emerald-300" />
                Mot de passe
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/15"
                placeholder="Saisir votre mot de passe"
                autoComplete="current-password"
                required
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Connexion..." : "Acceder au site"}
            </button>
          </form>

          <div className="mt-6">
            <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Retour admin
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
