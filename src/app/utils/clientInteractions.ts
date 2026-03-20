import { fetchJsonWithApiFallback } from './api';

export type PublicClientInteractionType = 'visite' | 'like' | 'partage';
export type ExtendedClientInteractionType =
  | PublicClientInteractionType
  | 'site_open'
  | 'session_start'
  | 'reservation_attempt'
  | 'reservation_submitted';

export type PublicClientInteraction = {
  id: string;
  type: ExtendedClientInteractionType;
  bienId?: string;
  propertyTitle: string;
  clientUserId?: string;
  clientEmail: string;
  clientName?: string;
  source?: 'site_public' | 'admin';
  deviceId?: string;
  sessionId?: string;
  path?: string;
  metadata?: Record<string, unknown> | null;
  dateTime: string;
};

export type TrackableClientInteractionInput = {
  type: ExtendedClientInteractionType;
  bienId?: string;
  propertyTitle: string;
  clientUserId?: string;
  clientEmail?: string;
  clientName?: string;
  sessionId?: string;
  path?: string;
  metadata?: Record<string, unknown> | null;
};

export const trackPublicClientInteraction = async (
  interaction: TrackableClientInteractionInput
) => {
  return fetchJsonWithApiFallback<PublicClientInteraction>('/client-interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(interaction),
  });
};

export const fetchClientInteractions = async (): Promise<PublicClientInteraction[]> => {
  const rows = await fetchJsonWithApiFallback<PublicClientInteraction[]>('/client-interactions');
  return Array.isArray(rows) ? rows : [];
};
