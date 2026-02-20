import { getOne, getAll, execute } from '../../lib/db';
import { Paiement } from '../admin/types';
import { RowDataPacket } from 'mysql2/promise';

interface PaiementRow extends RowDataPacket, Paiement {}

export interface CreatePaiementInput {
  id: string;
  contrat_id: string;
  montant: number;
  date_paiement: string;
  statut?: 'paye' | 'en_attente' | 'retard';
  methode: 'virement' | 'especes' | 'cheque';
}

export interface UpdatePaiementInput {
  montant?: number;
  date_paiement?: string;
  statut?: 'paye' | 'en_attente' | 'retard';
  methode?: 'virement' | 'especes' | 'cheque';
}

/**
 * Get all paiements
 */
export async function getAllPaiements(): Promise<Paiement[]> {
  const sql = 'SELECT * FROM paiements ORDER BY date_paiement DESC';
  const rows = await getAll<PaiementRow>(sql);
  return rows as unknown as Paiement[];
}

/**
 * Get paiement by ID
 */
export async function getPaiementById(id: string): Promise<Paiement | undefined> {
  const sql = 'SELECT * FROM paiements WHERE id = ?';
  const row = await getOne<PaiementRow>(sql, [id]);
  return row as unknown as Paiement | undefined;
}

/**
 * Get paiements by contrat
 */
export async function getPaiementsByContrat(contratId: string): Promise<Paiement[]> {
  const sql = 'SELECT * FROM paiements WHERE contrat_id = ? ORDER BY date_paiement DESC';
  const rows = await getAll<PaiementRow>(sql, [contratId]);
  return rows as unknown as Paiement[];
}

/**
 * Get paiements by statut
 */
export async function getPaiementsByStatut(statut: 'paye' | 'en_attente' | 'retard'): Promise<Paiement[]> {
  const sql = 'SELECT * FROM paiements WHERE statut = ? ORDER BY date_paiement DESC';
  const rows = await getAll<PaiementRow>(sql, [statut]);
  return rows as unknown as Paiement[];
}

/**
 * Get pending paiements
 */
export async function getPendingPaiements(): Promise<Paiement[]> {
  const sql = "SELECT * FROM paiements WHERE statut = 'en_attente' ORDER BY date_paiement ASC";
  const rows = await getAll<PaiementRow>(sql);
  return rows as unknown as Paiement[];
}

/**
 * Create a new paiement
 */
export async function createPaiement(data: CreatePaiementInput): Promise<number> {
  const sql = 'INSERT INTO paiements (id, contrat_id, montant, date_paiement, statut, methode) VALUES (?, ?, ?, ?, ?, ?)';
  const result = await execute(sql, [
    data.id,
    data.contrat_id,
    data.montant,
    data.date_paiement,
    data.statut || 'en_attente',
    data.methode
  ]);
  return result.affectedRows;
}

/**
 * Update an existing paiement
 */
export async function updatePaiement(id: string, data: UpdatePaiementInput): Promise<number> {
  const fields: string[] = [];
  const values: (string | number | undefined)[] = [];

  if (data.montant !== undefined) {
    fields.push('montant = ?');
    values.push(data.montant);
  }
  if (data.date_paiement !== undefined) {
    fields.push('date_paiement = ?');
    values.push(data.date_paiement);
  }
  if (data.statut !== undefined) {
    fields.push('statut = ?');
    values.push(data.statut);
  }
  if (data.methode !== undefined) {
    fields.push('methode = ?');
    values.push(data.methode);
  }

  if (fields.length === 0) return 0;

  values.push(id);
  const sql = `UPDATE paiements SET ${fields.join(', ')} WHERE id = ?`;
  const result = await execute(sql, values);
  return result.affectedRows;
}

/**
 * Delete a paiement
 */
export async function deletePaiement(id: string): Promise<number> {
  const sql = 'DELETE FROM paiements WHERE id = ?';
  const result = await execute(sql, [id]);
  return result.affectedRows;
}

/**
 * Mark paiement as paid
 */
export async function markAsPaid(id: string): Promise<number> {
  const sql = "UPDATE paiements SET statut = 'paye' WHERE id = ?";
  const result = await execute(sql, [id]);
  return result.affectedRows;
}

/**
 * Mark paiement as late (retard)
 */
export async function markAsLate(id: string): Promise<number> {
  const sql = "UPDATE paiements SET statut = 'retard' WHERE id = ?";
  const result = await execute(sql, [id]);
  return result.affectedRows;
}
