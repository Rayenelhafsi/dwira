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

export async function getSiteMaintenanceStatus(): Promise<SiteMaintenanceStatus> {
  return fetchJsonWithApiFallback<SiteMaintenanceStatus>("/system/site-maintenance");
}

export async function updateSiteMaintenanceStatus(input: UpdateSiteMaintenanceInput): Promise<SiteMaintenanceStatus> {
  return fetchJsonWithApiFallback<SiteMaintenanceStatus>("/system/site-maintenance", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      enabled: input.enabled,
      resume_at: input.resumeAt || null,
      message: input.message || null,
      confirmation_password: input.confirmationPassword || "",
    }),
  });
}
