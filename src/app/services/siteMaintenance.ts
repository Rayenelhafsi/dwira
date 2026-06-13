import { fetchJsonWithApiFallback } from "../utils/api";

export interface SiteMaintenanceStatus {
  enabled: boolean;
  isActive: boolean;
  message: string | null;
  resumeAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  secondsUntilResume: number;
}

export interface UpdateSiteMaintenanceInput {
  enabled: boolean;
  resumeAt?: string | null;
  message?: string | null;
  confirmationPassword?: string;
}

const SITE_MAINTENANCE_CACHE_KEY = "dwira_site_maintenance_cache_v1";

export function readCachedSiteMaintenanceStatus(): SiteMaintenanceStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SITE_MAINTENANCE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as SiteMaintenanceStatus;
  } catch {
    return null;
  }
}

function writeCachedSiteMaintenanceStatus(status: SiteMaintenanceStatus | null) {
  if (typeof window === "undefined") return;
  try {
    if (!status) {
      window.sessionStorage.removeItem(SITE_MAINTENANCE_CACHE_KEY);
      return;
    }
    window.sessionStorage.setItem(SITE_MAINTENANCE_CACHE_KEY, JSON.stringify(status));
  } catch {
    // Ignore storage errors.
  }
}

export async function getSiteMaintenanceStatus(): Promise<SiteMaintenanceStatus> {
  const status = await fetchJsonWithApiFallback<SiteMaintenanceStatus>("/system/site-maintenance");
  writeCachedSiteMaintenanceStatus(status);
  return status;
}

export async function updateSiteMaintenanceStatus(input: UpdateSiteMaintenanceInput): Promise<SiteMaintenanceStatus> {
  const status = await fetchJsonWithApiFallback<SiteMaintenanceStatus>("/system/site-maintenance", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      enabled: input.enabled,
      resume_at: input.resumeAt || null,
      message: input.message || null,
      confirmation_password: input.confirmationPassword || "",
    }),
  });
  writeCachedSiteMaintenanceStatus(status);
  return status;
}
