import { getOne, getAll, execute } from '../../lib/db';
import { Zone } from '../admin/types';
import { RowDataPacket } from 'mysql2/promise';

interface ZoneRow extends RowDataPacket, Zone {}

export interface CreateZoneInput {
  id: string;
  nom: string;
  description?: string;
  pays?: string;
  gouvernerat?: string;
  region?: string;
  quartier?: string;
  google_maps_url?: string;
  image_url?: string;
  pays_image_url?: string;
  gouvernerat_image_url?: string;
  region_image_url?: string;
  quartier_image_url?: string;
}

export interface UpdateZoneInput {
  nom?: string;
  description?: string;
  pays?: string;
  gouvernerat?: string;
  region?: string;
  quartier?: string;
  google_maps_url?: string;
  image_url?: string;
  pays_image_url?: string;
  gouvernerat_image_url?: string;
  region_image_url?: string;
  quartier_image_url?: string;
}

/**
 * Get all zones
 */
export async function getAllZones(): Promise<Zone[]> {
  const sql = 'SELECT * FROM zones ORDER BY nom ASC';
  const rows = await getAll<ZoneRow>(sql);
  return rows as unknown as Zone[];
}

/**
 * Get zone by ID
 */
export async function getZoneById(id: string): Promise<Zone | undefined> {
  const sql = 'SELECT * FROM zones WHERE id = ?';
  const row = await getOne<ZoneRow>(sql, [id]);
  return row as unknown as Zone | undefined;
}

/**
 * Create a new zone
 */
export async function createZone(data: CreateZoneInput): Promise<number> {
  const sql = 'INSERT INTO zones (id, nom, description, pays, gouvernerat, region, quartier, google_maps_url, image_url, pays_image_url, gouvernerat_image_url, region_image_url, quartier_image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  const result = await execute(sql, [
    data.id,
    data.nom,
    data.description || null,
    data.pays || null,
    data.gouvernerat || null,
    data.region || null,
    data.quartier || null,
    data.google_maps_url || null,
    data.image_url || null,
    data.pays_image_url || null,
    data.gouvernerat_image_url || null,
    data.region_image_url || null,
    data.quartier_image_url || null,
  ]);
  return result.affectedRows;
}

/**
 * Update an existing zone
 */
export async function updateZone(id: string, data: UpdateZoneInput): Promise<number> {
  const fields: string[] = [];
  const values: (string | undefined)[] = [];

  if (data.nom !== undefined) {
    fields.push('nom = ?');
    values.push(data.nom);
  }
  if (data.description !== undefined) {
    fields.push('description = ?');
    values.push(data.description);
  }
  if (data.google_maps_url !== undefined) {
    fields.push('google_maps_url = ?');
    values.push(data.google_maps_url);
  }
  if (data.pays !== undefined) {
    fields.push('pays = ?');
    values.push(data.pays);
  }
  if (data.gouvernerat !== undefined) {
    fields.push('gouvernerat = ?');
    values.push(data.gouvernerat);
  }
  if (data.region !== undefined) {
    fields.push('region = ?');
    values.push(data.region);
  }
  if (data.quartier !== undefined) {
    fields.push('quartier = ?');
    values.push(data.quartier);
  }
  if (data.image_url !== undefined) {
    fields.push('image_url = ?');
    values.push(data.image_url);
  }
  if (data.pays_image_url !== undefined) {
    fields.push('pays_image_url = ?');
    values.push(data.pays_image_url);
  }
  if (data.gouvernerat_image_url !== undefined) {
    fields.push('gouvernerat_image_url = ?');
    values.push(data.gouvernerat_image_url);
  }
  if (data.region_image_url !== undefined) {
    fields.push('region_image_url = ?');
    values.push(data.region_image_url);
  }
  if (data.quartier_image_url !== undefined) {
    fields.push('quartier_image_url = ?');
    values.push(data.quartier_image_url);
  }

  if (fields.length === 0) return 0;

  values.push(id);
  const sql = `UPDATE zones SET ${fields.join(', ')} WHERE id = ?`;
  const result = await execute(sql, values);
  return result.affectedRows;
}

/**
 * Delete a zone
 */
export async function deleteZone(id: string): Promise<number> {
  const sql = 'DELETE FROM zones WHERE id = ?';
  const result = await execute(sql, [id]);
  return result.affectedRows;
}
