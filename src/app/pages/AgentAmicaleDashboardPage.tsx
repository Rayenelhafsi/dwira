import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { FileText, Ticket, Calculator, LogOut } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "/api";

type AgentSession = {
  userId: string;
  username: string;
  displayName: string;
  amicaleId: string;
  amicaleName: string;
  amicaleLogoUrl?: string | null;
};

type AgentTab = "demandes" | "vouchers" | "comptabilite";

export default function AgentAmicaleDashboardPage() {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<AgentTab>("demandes");
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_URL}/auth/agent-amicale/me`, { credentials: "include" });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setSession(null);
          return;
        }
        setSession(data?.session || null);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!session) return <Navigate to="/agent-amicale/login" replace />;

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="w-72 bg-emerald-950 text-white flex flex-col">
        <div className="p-5 border-b border-emerald-900">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-full border border-emerald-800 bg-white">
              {session.amicaleLogoUrl ? (
                <img src={session.amicaleLogoUrl} alt={session.amicaleName} className="h-full w-full object-fill" />
              ) : null}
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">{session.amicaleName}</h1>
              <p className="text-xs text-emerald-300">Dashboard agent amicale</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-2">
          <SidebarTab
            active={tab === "demandes"}
            label="Demande adherants"
            icon={<FileText size={18} />}
            onClick={() => setTab("demandes")}
          />
          <SidebarTab
            active={tab === "vouchers"}
            label="Vouchers"
            icon={<Ticket size={18} />}
            onClick={() => setTab("vouchers")}
          />
          <SidebarTab
            active={tab === "comptabilite"}
            label="Comptabilite"
            icon={<Calculator size={18} />}
            onClick={() => setTab("comptabilite")}
          />
        </nav>

        <div className="p-4 border-t border-emerald-900">
          <div className="mb-3">
            <p className="font-medium text-sm truncate">{session.displayName || session.username}</p>
            <p className="text-xs text-emerald-300 truncate">{session.username}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await fetch(`${API_URL}/auth/agent-amicale/logout`, { method: "POST", credentials: "include" });
              } finally {
                navigate("/agent-amicale/login", { replace: true });
              }
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 text-red-300 hover:bg-red-600 hover:text-white rounded-lg transition-colors text-sm font-medium"
          >
            <LogOut size={16} />
            Deconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-6xl rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-2xl font-bold text-gray-900">Espace Agent Amicale</h2>
          <p className="mt-1 text-sm text-gray-500">{session.amicaleName}</p>

          <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            {tab === "demandes" && <p>Zone Demande adherants.</p>}
            {tab === "vouchers" && <p>Zone Vouchers.</p>}
            {tab === "comptabilite" && <p>Zone Comptabilite.</p>}
          </div>
        </div>
      </main>
    </div>
  );
}

function SidebarTab({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
        active ? "bg-emerald-800 text-white shadow-sm" : "text-emerald-100/70 hover:bg-emerald-900 hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}