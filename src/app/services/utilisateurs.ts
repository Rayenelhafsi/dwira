import { getOne, getAll, execute } from '../../lib/db';
import { Utilisateur } from '../admin/types';
import { RowDataPacket } from 'mysql2/promise';

// ============================================
// DB TYPES (extend RowDataPacket for MySQL results)
// ============================================

interface UtilisateurRow extends RowDataPacket, Utilisateur {}

// ============================================
// TYPES
// ============================================

export interface CreateUtilisateurInput {
  id: string;
  nom: string;
  email: string;
  role?: 'admin' | 'user';
  avatar?: string;
  created_at: string;
}

export interface UpdateUtilisateurInput {
  nom?: string;
  email?: string;
  role?: 'admin' | 'user';
  avatar?: string;
}

// ============================================
// CRUD OPERATIONS
// ============================================

/**
 * Get all users
 */
export async function getAllUtilisateurs(): Promise<Utilisateur[]> {
  const sql = 'SELECT * FROM utilisateurs ORDER BY created_at DESC';
  const rows = await getAll<UtilisateurRow>(sql);
  return rows as unknown as Utilisateur[];
}

/**
 * Get user by ID
 */
export async function getUtilisateurById(id: string): Promise<Utilisateur | undefined> {
  const sql = 'SELECT * FROM utilisateurs WHERE id = ?';
  const row = await getOne<UtilisateurRow>(sql, [id]);
  return row as unknown as Utilisateur | undefined;
}

/**
 * Get user by email
 */
export async function getUtilisateurByEmail(email: string): Promise<Utilisateur | undefined> {
  const sql = 'SELECT * FROM utilisateurs WHERE email = ?';
  const row = await getOne<UtilisateurRow>(sql, [email]);
  return row as unknown as Utilisateur | undefined;
}

/**
 * Create a new user
 */
export async function createUtilisateur(data: CreateUtilisateurInput): Promise<number> {
  const sql = `
    INSERT INTO utilisateurs (id, nom, email, role, avatar, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  const result = await execute(sql, [
    data.id,
    data.nom,
    data.email,
    data.role || 'user',
    data.avatar || null,
    data.created_at
  ]);
  return result.affectedRows;
}

/**
 * Update an existing user
 */
export async function updateUtilisateur(id: string, data: UpdateUtilisateurInput): Promise<number> {
  const fields: string[] = [];
  const values: (string | undefined)[] = [];

  if (data.nom !== undefined) {
    fields.push('nom = ?');
    values.push(data.nom);
  }
  if (data.email !== undefined) {
    fields.push('email = ?');
    values.push(data.email);
  }
  if (data.role !== undefined) {
    fields.push('role = ?');
    values.push(data.role);
  }
  if (data.avatar !== undefined) {
    fields.push('avatar = ?');
    values.push(data.avatar);
  }

  if (fields.length === 0) return 0;

  values.push(id);
  const sql = `UPDATE utilisateurs SET ${fields.join(', ')} WHERE id = ?`;
  const result = await execute(sql, values);
  return result.affectedRows;
}

/**
 * Delete a user
 */
export async function deleteUtilisateur(id: string): Promise<number> {
  const sql = 'DELETE FROM utilisateurs WHERE id = ?';
  const result = await execute(sql, [id]);
  return result.affectedRows;
}

/**
 * Authenticate user by email and check role
 */
export async function authenticateUser(email: string): Promise<Utilisateur | undefined> {
  const sql = 'SELECT * FROM utilisateurs WHERE email = ?';
  const row = await getOne<UtilisateurRow>(sql, [email]);
  return row as unknown as Utilisateur | undefined;
}
