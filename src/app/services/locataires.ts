import { getOne, getAll, execute } from '../../lib/db';
import { Locataire } from '../admin/types';
import { RowDataPacket } from 'mysql2/promise';

interface LocataireRow extends RowDataPacket, Locataire {}

export interface CreateLocataireInput {
  id: string;
  nom: string;
  telephone: string;
  email: string;
  cin: string;
  score_fiabilite?: number;
  created_at: string;
}

export interface UpdateLocataireInput {
  nom?: string;
  telephone?: string;
  email?: string;
  cin?: string;
  score_fiabilite?: number;
}

/**
 * Get all locataires
 */
export async function getAllLocataires(): Promise<Locataire[]> {
  const sql = 'SELECT * FROM locataires ORDER BY created_at DESC';
  const rows = await getAll<LocataireRow>(sql);
  return rows as unknown as Locataire[];
}

/**
 * Get locataire by ID
 */
export async function getLocataireById(id: string): Promise<Locataire | undefined> {
  const sql = 'SELECT * FROM locataireS WHERE id = ?';
  const row = await getOne<LocataireRow>(sql, [id]);
  return row as unknown as Locataire | undefined;
}

/**
 * Get locataire by email
 */
export async function getLocataireByEmail(email: string): Promise<Locataire | undefined> {
  const sql = 'SELECT * FROM locataires WHERE email = ?';
  const row = await getOne<LocataireRow>(sql, [email]);
  return row as unknown as Locataire | undefined;
}

/**
 * Get locataire by CIN
 */
export async function getLocataireByCin(cin: string): Promise<Locataire | undefined> {
  const sql = 'SELECT * FROM locataireS WHERE cin = ?';
  const row = await getOne<LocataireRow>(sql, [cin]);
  return row as unknown as Locataire | undefined;
}

/**
 * Create a new locataire
 */
export async function createLocataire(data: CreateLocataireInput): Promise<number> {
  const sql = 'INSERT INTO locataireS (id, nom, telephone, email, cin, score_fiabilite, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)';
  const result = await execute(sql, [
    data.id,
    data.nom,
    data.telephone,
    data.email,
    data.cin,
    data.score_fiabilite || 5,
    data.created_at
  ]);
  return result.affectedRows;
}

/**
 * Update an existing locataire
 */
export async function updateLocataire(id: string, data: UpdateLocataireInput): Promise<number> {
  const fields: string[] = [];
  const values: (string | number | undefined)[] = [];

  if (data.nom !== undefined) {
    fields.push('nom = ?');
    values.push(data.nom);
  }
  if (data.telephone !== undefined) {
    fields.push('telephone = ?');
    values.push(data.telephone);
  }
  if (data.email !== undefined) {
    fields.push('email = ?');
    values.push(data.email);
  }
  if (data.cin !== undefined) {
    fields.push('cin = ?');
    values.push(data.cin);
  }
  if (data.score_fiabilite !== undefined) {
    fields.push('score_fiabilite = ?');
    values.push(data.score_fiabilite);
  }

  if (fields.length === 0) return 0;

  values.push(id);
  const sql = `UPDATE locataireS SET ${fields.join(', ')} WHERE id = ?`;
  const result = await execute(sql, values);
  return result.affectedRows;
}

/**
 * Delete a locataire
 */
export async function deleteLocataire(id: string): Promise<number> {
  const sql = 'DELETE FROM locataireS WHERE id = ?';
  const result = await execute(sql, [id]);
  return result.affectedRows;
}
