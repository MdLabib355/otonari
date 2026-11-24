// Append-only audit log shared by Group Admins, Super Admins, and system jobs.
// Intentionally exposes INSERT and SELECT only — never UPDATE or DELETE.

import type { AuditCategory, AuditLogEntry } from '../../shared/types.ts';
import { found, query, queryOne } from './database.ts';

export interface NewAuditLogEntry {
  actorId?: number | null;
  actorLabel: string;
  actorRole: 'super_admin' | 'group_admin' | 'co_admin' | 'system';
  scopeGroupId?: number | null;
  category: AuditCategory;
  action: string;
  targetType: string;
  targetId: string | number;
  reason?: string | null;
  detail: string;
  ipAddress?: string | null;
}

export async function writeAuditLog(entry: NewAuditLogEntry): Promise<AuditLogEntry> {
  const row = await queryOne<AuditLogEntry>(
    `INSERT INTO audit_logs (
       actor_id, actor_label, actor_role, scope_group_id,
       category, action, target_type, target_id, reason, detail, ip_address
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, actor_id, actor_label, actor_role, scope_group_id,
               category, action, target_type, target_id, reason, detail, created_at`,
    [
      entry.actorId ?? null,
      entry.actorLabel,
      entry.actorRole,
      entry.scopeGroupId ?? null,
      entry.category,
      entry.action,
      entry.targetType,
      String(entry.targetId),
      entry.reason ?? null,
      entry.detail,
      entry.ipAddress ?? null,
    ]
  );
  return found(row);
}

export interface AuditLogFilter {
  scopeGroupId?: number;
  category?: AuditCategory;
  limit?: number;
  offset?: number;
}

export async function listAuditLogs(filter: AuditLogFilter = {}): Promise<AuditLogEntry[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.scopeGroupId !== undefined) {
    params.push(filter.scopeGroupId);
    clauses.push(`scope_group_id = $${params.length}`);
  }
  if (filter.category !== undefined) {
    params.push(filter.category);
    clauses.push(`category = $${params.length}`);
  }

  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  const offset = Math.max(filter.offset ?? 0, 0);
  params.push(limit, offset);

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  return query<AuditLogEntry>(
    `SELECT id, actor_id, actor_label, actor_role, scope_group_id,
            category, action, target_type, target_id, reason, detail, created_at
     FROM audit_logs
     ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
}
