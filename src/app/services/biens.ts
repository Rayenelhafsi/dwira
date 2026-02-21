import { getOne, getAll, execute } from '../../lib/db';
import { Bien, Media } from '../admin/types';
import { RowDataPacket } from 'mysql2/promise';

interface BienRow extends RowDataPacket, Bien {}
interface MediaRow extends RowDataPacket, Media {}

export interface CreateBienInput {
  id: string;
  reference: string;
  titre: string;
  description?: string;
  mode: 'vente' | 'location_annuelle' | 'location_saisonniere';
  type: 'appartement' | 'villa_maison' | 'studio' | 'immeuble' | 'terrain' | 'local_commercial' | 'bungalow' | 'S1' | 'S2' | 'S3' | 'S4' | 'villa' | 'local';
  nb_chambres: number;
  nb_salle_bain: number;
  prix_nuitee: number;
  avance: number;
  caution?: number;
  statut?: 'disponible' | 'loue' | 'reserve' | 'maintenance';
  menage_en_cours?: boolean;
  zone_id?: string;
  proprietaire_id?: string;
  caracteristique_ids?: string[];
  date_ajout: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateBienInput {
  reference?: string;
  titre?: string;
  description?: string;
  mode?: 'vente' | 'location_annuelle' | 'location_saisonniere';
  type?: 'appartement' | 'villa_maison' | 'studio' | 'immeuble' | 'terrain' | 'local_commercial' | 'bungalow' | 'S1' | 'S2' | 'S3' | 'S4' | 'villa' | 'local';
  nb_chambres?: number;
  nb_salle_bain?: number;
  prix_nuitee?: number;
  avance?: number;
  caution?: number;
  statut?: 'disponible' | 'loue' | 'reserve' | 'maintenance';
  menage_en_cours?: boolean;
  zone_id?: string;
  proprietaire_id?: string;
  caracteristique_ids?: string[];
}

/**
 * Get all biens
 */
export async function getAllBiens(): Promise<Bien[]> {
  const sql = 'SELECT * FROM biens ORDER BY date_ajout DESC';
  const rows = await getAll<BienRow>(sql);
  return rows as unknown as Bien[];
}

/**
 * Get bien by ID
 */
export async function getBienById(id: string): Promise<Bien | undefined> {
  const sql = 'SELECT * FROM biens WHERE id = ?';
  const row = await getOne<BienRow>(sql, [id]);
  return row as unknown as Bien | undefined;
}

/**
 * Get bien by reference
 */
export async function getBienByReference(reference: string): Promise<Bien | undefined> {
  const sql = 'SELECT * FROM biens WHERE reference = ?';
  const row = await getOne<BienRow>(sql, [reference]);
  return row as unknown as Bien | undefined;
}

/**
 * Get biens by zone
 */
export async function getBiensByZone(zoneId: string): Promise<Bien[]> {
  const sql = 'SELECT * FROM biens WHERE zone_id = ? ORDER BY date_ajout DESC';
  const rows = await getAll<BienRow>(sql, [zoneId]);
  return rows as unknown as Bien[];
}

/**
 * Get biens by proprietaire
 */
export async function getBiensByProprietaire(proprietaireId: string): Promise<Bien[]> {
  const sql = 'SELECT * FROM biens WHERE proprietaire_id = ? ORDER BY date_ajout DESC';
  const rows = await getAll<BienRow>(sql, [proprietaireId]);
  return rows as unknown as Bien[];
}

/**
 * Get biens by statut
 */
export async function getBiensByStatut(statut: 'disponible' | 'loue' | 'reserve' | 'maintenance'): Promise<Bien[]> {
  const sql = 'SELECT * FROM biens WHERE statut = ? ORDER BY date_ajout DESC';
  const rows = await getAll<BienRow>(sql, [statut]);
  return rows as unknown as Bien[];
}

/**
 * Get available biens (disponible)
 */
export async function getAvailableBiens(): Promise<Bien[]> {
  const sql = "SELECT * FROM biens WHERE statut = 'disponible' ORDER BY date_ajout DESC";
  const rows = await getAll<BienRow>(sql);
  return rows as unknown as Bien[];
}

/**
 * Create a new bien
 */
export async function createBien(data: CreateBienInput): Promise<number> {
  const sql = `
    INSERT INTO biens (id, reference, titre, description, mode, type, nb_chambres, nb_salle_bain, 
      prix_nuitee, avance, caution, statut, menage_en_cours, zone_id, proprietaire_id, date_ajout, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const result = await execute(sql, [
    data.id,
    data.reference,
    data.titre,
    data.description || null,
    data.mode,
    data.type,
    data.nb_chambres,
    data.nb_salle_bain,
    data.prix_nuitee,
    data.avance,
    data.caution || 0,
    data.statut || 'disponible',
    data.menage_en_cours || false,
    data.zone_id || null,
    data.proprietaire_id || null,
    data.date_ajout,
    data.created_at,
    data.updated_at
  ]);
  return result.affectedRows;
}

/**
 * Update an existing bien
 */
export async function updateBien(id: string, data: UpdateBienInput): Promise<number> {
  const fields: string[] = [];
  const values: (string | number | boolean | undefined)[] = [];

  if (data.reference !== undefined) {
    fields.push('reference = ?');
    values.push(data.reference);
  }
  if (data.titre !== undefined) {
    fields.push('titre = ?');
    values.push(data.titre);
  }
  if (data.description !== undefined) {
    fields.push('description = ?');
    values.push(data.description);
  }
  if (data.type !== undefined) {
    fields.push('type = ?');
    values.push(data.type);
  }
  if (data.mode !== undefined) {
    fields.push('mode = ?');
    values.push(data.mode);
  }
  if (data.nb_chambres !== undefined) {
    fields.push('nb_chambres = ?');
    values.push(data.nb_chambres);
  }
  if (data.nb_salle_bain !== undefined) {
    fields.push('nb_salle_bain = ?');
    values.push(data.nb_salle_bain);
  }
  if (data.prix_nuitee !== undefined) {
    fields.push('prix_nuitee = ?');
    values.push(data.prix_nuitee);
  }
  if (data.avance !== undefined) {
    fields.push('avance = ?');
    values.push(data.avance);
  }
  if (data.caution !== undefined) {
    fields.push('caution = ?');
    values.push(data.caution);
  }
  if (data.statut !== undefined) {
    fields.push('statut = ?');
    values.push(data.statut);
  }
  if (data.menage_en_cours !== undefined) {
    fields.push('menage_en_cours = ?');
    values.push(data.menage_en_cours);
  }
  if (data.zone_id !== undefined) {
    fields.push('zone_id = ?');
    values.push(data.zone_id);
  }
  if (data.proprietaire_id !== undefined) {
    fields.push('proprietaire_id = ?');
    values.push(data.proprietaire_id);
  }

  if (fields.length === 0) return 0;

  values.push(id);
  const sql = `UPDATE biens SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`;
  const result = await execute(sql, values);
  return result.affectedRows;
}

/**
 * Delete a bien
 */
export async function deleteBien(id: string): Promise<number> {
  const sql = 'DELETE FROM biens WHERE id = ?';
  const result = await execute(sql, [id]);
  return result.affectedRows;
}

// ============================================
// MEDIA OPERATIONS
// ============================================

/**
 * Get all media for a bien
 */
export async function getMediaByBien(bienId: string): Promise<Media[]> {
  const sql = 'SELECT * FROM media WHERE bien_id = ?';
  const rows = await getAll<MediaRow>(sql, [bienId]);
  return rows as unknown as Media[];
}

/**
 * Add media to a bien
 */
export async function addMedia(bienId: string, type: 'image' | 'video', url: string): Promise<number> {
  const id = `m${Date.now()}`;
  const sql = 'INSERT INTO media (id, bien_id, type, url) VALUES (?, ?, ?, ?)';
  const result = await execute(sql, [id, bienId, type, url]);
  return result.affectedRows;
}

/**
 * Delete media
 */
export async function deleteMedia(mediaId: string): Promise<number> {
  const sql = 'DELETE FROM media WHERE id = ?';
  const result = await execute(sql, [mediaId]);
  return result.affectedRows;
}
