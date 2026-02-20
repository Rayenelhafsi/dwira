import { getOne, getAll, execute } from '../../lib/db';
import { Notification } from '../admin/types';
import { RowDataPacket } from 'mysql2/promise';

interface NotificationRow extends RowDataPacket, Notification {}

export interface CreateNotificationInput {
  id: string;
  utilisateur_id: string;
  type: 'info' | 'warning' | 'success' | 'error';
  message: string;
  lu?: boolean;
  created_at: string;
}

export interface UpdateNotificationInput {
  type?: 'info' | 'warning' | 'success' | 'error';
  message?: string;
  lu?: boolean;
}

/**
 * Get all notifications
 */
export async function getAllNotifications(): Promise<Notification[]> {
  const sql = 'SELECT * FROM notifications ORDER BY created_at DESC';
  const rows = await getAll<NotificationRow>(sql);
  return rows as unknown as Notification[];
}

/**
 * Get notification by ID
 */
export async function getNotificationById(id: string): Promise<Notification | undefined> {
  const sql = 'SELECT * FROM notifications WHERE id = ?';
  const row = await getOne<NotificationRow>(sql, [id]);
  return row as unknown as Notification | undefined;
}

/**
 * Get notifications by utilisateur
 */
export async function getNotificationsByUtilisateur(utilisateurId: string): Promise<Notification[]> {
  const sql = 'SELECT * FROM notifications WHERE utilisateur_id = ? ORDER BY created_at DESC';
  const rows = await getAll<NotificationRow>(sql, [utilisateurId]);
  return rows as unknown as Notification[];
}

/**
 * Get unread notifications
 */
export async function getUnreadNotifications(utilisateurId: string): Promise<Notification[]> {
  const sql = 'SELECT * FROM notifications WHERE utilisateur_id = ? AND lu = FALSE ORDER BY created_at DESC';
  const rows = await getAll<NotificationRow>(sql, [utilisateurId]);
  return rows as unknown as Notification[];
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(utilisateurId: string): Promise<number> {
  const sql = 'SELECT COUNT(*) as count FROM notifications WHERE utilisateur_id = ? AND lu = FALSE';
  const row = await getOne<{ count: number } & RowDataPacket>(sql, [utilisateurId]);
  return row?.count || 0;
}

/**
 * Create a new notification
 */
export async function createNotification(data: CreateNotificationInput): Promise<number> {
  const sql = 'INSERT INTO notifications (id, utilisateur_id, type, message, lu, created_at) VALUES (?, ?, ?, ?, ?, ?)';
  const result = await execute(sql, [
    data.id,
    data.utilisateur_id,
    data.type,
    data.message,
    data.lu || false,
    data.created_at
  ]);
  return result.affectedRows;
}

/**
 * Update an existing notification
 */
export async function updateNotification(id: string, data: UpdateNotificationInput): Promise<number> {
  const fields: string[] = [];
  const values: (string | boolean | undefined)[] = [];

  if (data.type !== undefined) {
    fields.push('type = ?');
    values.push(data.type);
  }
  if (data.message !== undefined) {
    fields.push('message = ?');
    values.push(data.message);
  }
  if (data.lu !== undefined) {
    fields.push('lu = ?');
    values.push(data.lu);
  }

  if (fields.length === 0) return 0;

  values.push(id);
  const sql = `UPDATE notifications SET ${fields.join(', ')} WHERE id = ?`;
  const result = await execute(sql, values);
  return result.affectedRows;
}

/**
 * Delete a notification
 */
export async function deleteNotification(id: string): Promise<number> {
  const sql = 'DELETE FROM notifications WHERE id = ?';
  const result = await execute(sql, [id]);
  return result.affectedRows;
}

/**
 * Mark notification as read
 */
export async function markAsRead(id: string): Promise<number> {
  const sql = 'UPDATE notifications SET lu = TRUE WHERE id = ?';
  const result = await execute(sql, [id]);
  return result.affectedRows;
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(utilisateurId: string): Promise<number> {
  const sql = 'UPDATE notifications SET lu = TRUE WHERE utilisateur_id = ? AND lu = FALSE';
  const result = await execute(sql, [utilisateurId]);
  return result.affectedRows;
}

/**
 * Delete all notifications for a user
 */
export async function deleteAllNotifications(utilisateurId: string): Promise<number> {
  const sql = 'DELETE FROM notifications WHERE utilisateur_id = ?';
  const result = await execute(sql, [utilisateurId]);
  return result.affectedRows;
}
