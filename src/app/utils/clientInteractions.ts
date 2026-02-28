const API_BASE = import.meta.env.VITE_API_URL || '/api';

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
  const response = await fetch(`${API_BASE}/client-interactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(interaction),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || 'Impossible de sauvegarder l interaction client');
  }
  return response.json();
};

export const fetchClientInteractions = async (): Promise<PublicClientInteraction[]> => {
  const response = await fetch(`${API_BASE}/client-interactions`);
  if (!response.ok) {
    throw new Error('Impossible de charger les interactions clients');
  }
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
};
