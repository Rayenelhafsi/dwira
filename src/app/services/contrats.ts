import { getOne, getAll, execute } from '../../lib/db';
import { Contrat } from '../admin/types';
import { RowDataPacket } from 'mysql2/promise';

interface ContratRow extends RowDataPacket, Contrat {}

export interface CreateContratInput {
  id: string;
  bien_id: string;
  locataire_id: string;
  date_debut: string;
  date_fin: string;
  montant_recu: number;
  url_pdf?: string;
  statut?: 'actif' | 'termine' | 'resilie';
  created_at: string;
}

export interface UpdateContratInput {
  bien_id?: string;
  locataire_id?: string;
  date_debut?: string;
  date_fin?: string;
  montant_recu?: number;
  url_pdf?: string;
  statut?: 'actif' | 'termine' | 'resilie';
}

/**
 * Get all contrats
 */
export async function getAllContrats(): Promise<Contrat[]> {
  const sql = 'SELECT * FROM contrats ORDER BY created_at DESC';
  const rows = await getAll<ContratRow>(sql);
  return rows as unknown as Contrat[];
}

/**
 * Get contrat by ID
 */
export async function getContratById(id: string): Promise<Contrat | undefined> {
  const sql = 'SELECT * FROM contrats WHERE id = ?';
  const row = await getOne<ContratRow>(sql, [id]);
  return row as unknown as Contrat | undefined;
}

/**
 * Get contrats by bien
 */
export async function getContratsByBien(bienId: string): Promise<Contrat[]> {
  const sql = 'SELECT * FROM contrats WHERE bien_id = ? ORDER BY created_at DESC';
  const rows = await getAll<ContratRow>(sql, [bienId]);
  return rows as unknown as Contrat[];
}

/**
 * Get contrats by locataire
 */
export async function getContratsByLocataire(locataireId: string): Promise<Contrat[]> {
  const sql = 'SELECT * FROM contrats WHERE locataire_id = ? ORDER BY created_at DESC';
  const rows = await getAll<ContratRow>(sql, [locataireId]);
  return rows as unknown as Contrat[];
}

/**
 * Get contrat by statut
 */
export async function getContratsByStatut(statut: 'actif' | 'termine' | 'resilie'): Promise<Contrat[]> {
  const sql = 'SELECT * FROM contrats WHERE statut = ? ORDER BY created_at DESC';
  const rows = await getAll<ContratRow>(sql, [statut]);
  return rows as unknown as Contrat[];
}

/**
 * Get active contrat for a bien
 */
export async function getActiveContratByBien(bienId: string): Promise<Contrat | undefined> {
  const sql = "SELECT * FROM contrats WHERE bien_id = ? AND statut = 'actif' LIMIT 1";
  const row = await getOne<ContratRow>(sql, [bienId]);
  return row as unknown as Contrat | undefined;
}

/**
 * Create a new contrat
 */
export async function createContrat(data: CreateContratInput): Promise<number> {
  const sql = `
    INSERT INTO contrats (id, bien_id, locataire_id, date_debut, date_fin, montant_recu, url_pdf, statut, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const result = await execute(sql, [
    data.id,
    data.bien_id,
    data.locataire_id,
    data.date_debut,
    data.date_fin,
    data.montant_recu,
    data.url_pdf || null,
    data.statut || 'actif',
    data.created_at
  ]);
  return result.affectedRows;
}

/**
 * Update an existing contrat
 */
export async function updateContrat(id: string, data: UpdateContratInput): Promise<number> {
  const fields: string[] = [];
  const values: (string | number | undefined)[] = [];

  if (data.bien_id !== undefined) {
    fields.push('bien_id = ?');
    values.push(data.bien_id);
  }
  if (data.locataire_id !== undefined) {
    fields.push('locataire_id = ?');
    values.push(data.locataire_id);
  }
  if (data.date_debut !== undefined) {
    fields.push('date_debut = ?');
    values.push(data.date_debut);
  }
  if (data.date_fin !== undefined) {
    fields.push('date_fin = ?');
    values.push(data.date_fin);
  }
  if (data.montant_recu !== undefined) {
    fields.push('montant_recu = ?');
    values.push(data.montant_recu);
  }
  if (data.url_pdf !== undefined) {
    fields.push('url_pdf = ?');
    values.push(data.url_pdf);
  }
  if (data.statut !== undefined) {
    fields.push('statut = ?');
    values.push(data.statut);
  }

  if (fields.length === 0) return 0;

  values.push(id);
  const sql = `UPDATE contrats SET ${fields.join(', ')} WHERE id = ?`;
  const result = await execute(sql, values);
  return result.affectedRows;
}

/**
 * Delete a contrat
 */
export async function deleteContrat(id: string): Promise<number> {
  const sql = 'DELETE FROM contrats WHERE id = ?';
  const result = await execute(sql, [id]);
  return result.affectedRows;
}

/**
 * Terminate a contrat
 */
export async function terminateContrat(id: string): Promise<number> {
  const sql = "UPDATE contrats SET statut = 'termine' WHERE id = ?";
  const result = await execute(sql, [id]);
  return result.affectedRows;
}

/**
 * Resiliate a contrat
 */
export async function resiliateContrat(id: string): Promise<number> {
  const sql = "UPDATE contrats SET statut = 'resilie' WHERE id = ?";
  const result = await execute(sql, [id]);
  return result.affectedRows;
}
