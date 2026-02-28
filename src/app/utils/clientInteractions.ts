import { fetchJsonWithApiFallback } from './api';

export type PublicClientInteractionType = 'visite' | 'like' | 'partage';

export type PublicClientInteraction = {
  id: string;
  type: PublicClientInteractionType;
  bienId: string;
  propertyTitle: string;
  clientUserId?: string;
  clientEmail: string;
  clientName?: string;
  source?: 'site_public' | 'admin';
  dateTime: string;
};

export const trackPublicClientInteraction = async (
  interaction: Omit<PublicClientInteraction, 'id' | 'dateTime' | 'source'>
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
