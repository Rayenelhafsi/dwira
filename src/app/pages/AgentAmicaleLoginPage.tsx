import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const API_URL = import.meta.env.VITE_API_URL || "/api";

export default function AgentAmicaleLoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logos, setLogos] = useState<string[]>([]);

  useEffect(() => {
    const loadAmicaleLogos = async () => {
      try {
        const response = await fetch(`${API_URL}/public/amicales`);
        if (!response.ok) return;
        const data = await response.json().catch(() => []);
        const rows = Array.isArray(data) ? data : [];
        const urls = rows
          .map((row) => String(row?.logo_url || row?.logoUrl || "").trim())
          .filter(Boolean);
        setLogos(urls);
      } catch {
        setLogos([]);
      }
    };
    void loadAmicaleLogos();
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      toast.error("Utilisateur et motdepasse obligatoires.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/auth/agent-amicale/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(String(data?.error || "Connexion impossible"));
      toast.success("Connexion reussie");
      navigate("/agent-amicale/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connexion impossible");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-8 lg:py-12 flex items-center justify-center">
      <div className="relative w-full max-w-3xl">
        <div className="amicale-orbit-zone pointer-events-none" aria-hidden="true">
          {logos.map((logo, index) => (
            <span
              key={`${logo}-${index}`}
              className="amicale-orbit-item"
              style={{ animationDelay: `${index * -1.3}s` }}
            >
              <img src={logo} alt="" className="h-full w-full object-contain" />
            </span>
          ))}
        </div>

        <div className="mx-auto w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">Espace Agent Amicale</h1>
          <p className="mt-1 text-sm text-gray-500">Connectez-vous avec les identifiants crees par l'admin.</p>
          <div className="mt-5 space-y-3">
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Utilisateur"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Motdepasse"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void handleLogin()}
              disabled={isSubmitting}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmitting ? "Connexion..." : "Se connecter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
