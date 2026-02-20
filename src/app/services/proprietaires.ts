import { getOne, getAll, execute } from '../../lib/db';
import { Proprietaire } from '../admin/types';
import { RowDataPacket } from 'mysql2/promise';

interface ProprietaireRow extends RowDataPacket, Proprietaire {}

export interface CreateProprietaireInput {
  id: string;
  nom: string;
  telephone: string;
  email: string;
  cin: string;
}

export interface UpdateProprietaireInput {
  nom?: string;
  telephone?: string;
  email?: string;
  cin?: string;
}

/**
 * Get all proprietaires
 */
export async function getAllProprietaires(): Promise<Proprietaire[]> {
  const sql = 'SELECT * FROM proprietaires ORDER BY nom ASC';
  const rows = await getAll<ProprietaireRow>(sql);
  return rows as unknown as Proprietaire[];
}

/**
 * Get proprietaire by ID
 */
export async function getProprietaireById(id: string): Promise<Proprietaire | undefined> {
  const sql = 'SELECT * FROM proprietaires WHERE id = ?';
  const row = await getOne<ProprietaireRow>(sql, [id]);
  return row as unknown as Proprietaire | undefined;
}

/**
 * Get proprietaire by email
 */
export async function getProprietaireByEmail(email: string): Promise<Proprietaire | undefined> {
  const sql = 'SELECT * FROM proprietaires WHERE email = ?';
  const row = await getOne<ProprietaireRow>(sql, [email]);
  return row as unknown as Proprietaire | undefined;
}

/**
 * Get proprietaire by CIN
 */
export async function getProprietaireByCin(cin: string): Promise<Proprietaire | undefined> {
  const sql = 'SELECT * FROM proprietaires WHERE cin = ?';
  const row = await getOne<ProprietaireRow>(sql, [cin]);
  return row as unknown as Proprietaire | undefined;
}

/**
 * Create a new proprietaire
 */
export async function createProprietaire(data: CreateProprietaireInput): Promise<number> {
  const sql = 'INSERT INTO proprietaires (id, nom, telephone, email, cin) VALUES (?, ?, ?, ?, ?)';
  const result = await execute(sql, [data.id, data.nom, data.telephone, data.email, data.cin]);
  return result.affectedRows;
}

/**
 * Update an existing proprietaire
 */
export async function updateProprietaire(id: string, data: UpdateProprietaireInput): Promise<number> {
  const fields: string[] = [];
  const values: (string | undefined)[] = [];

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

  if (fields.length === 0) return 0;

  values.push(id);
  const sql = `UPDATE proprietaires SET ${fields.join(', ')} WHERE id = ?`;
  const result = await execute(sql, values);
  return result.affectedRows;
}

/**
 * Delete a proprietaire
 */
export async function deleteProprietaire(id: string): Promise<number> {
  const sql = 'DELETE FROM proprietaires WHERE id = ?';
  const result = await execute(sql, [id]);
  return result.affectedRows;
}
