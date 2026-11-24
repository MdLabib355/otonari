// Storage hygiene for server/uploads/: measures quota utilization and identifies/cleans orphan files.

import fs from 'node:fs';
import path from 'node:path';
import type { StorageCleanupResult, StorageHealth } from '../../../shared/types.ts';
import { query } from '../../core/database.ts';

const UPLOADS_DIR = path.join(import.meta.dirname, '..', '..', 'uploads');
const SOFT_QUOTA_BYTES = 50 * 1024 * 1024; // 50 MB default soft quota

async function getReferencedUploadBasenames(): Promise<Set<string>> {
  const rows = await query<{ handover_photo: string | null; return_photo: string | null }>(
    'SELECT handover_photo, return_photo FROM loans WHERE handover_photo IS NOT NULL OR return_photo IS NOT NULL'
  );
  const referenced = new Set<string>();
  for (const row of rows) {
    if (row.handover_photo) referenced.add(path.basename(row.handover_photo));
    if (row.return_photo) referenced.add(path.basename(row.return_photo));
  }
  return referenced;
}

function listUploadEntries(): { name: string; fullPath: string; size: number }[] {
  if (!fs.existsSync(UPLOADS_DIR)) return [];
  const entries: { name: string; fullPath: string; size: number }[] = [];
  for (const name of fs.readdirSync(UPLOADS_DIR)) {
    if (name === '.gitkeep' || name.startsWith('.')) continue;
    const fullPath = path.join(UPLOADS_DIR, name);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) entries.push({ name, fullPath, size: stat.size });
    } catch {
      // Ignore vanished files
    }
  }
  return entries;
}

export async function getStorageHealth(): Promise<StorageHealth> {
  const [entries, referenced] = await Promise.all([
    Promise.resolve(listUploadEntries()),
    getReferencedUploadBasenames(),
  ]);

  let usedBytes = 0;
  let orphanCount = 0;
  for (const entry of entries) {
    usedBytes += entry.size;
    if (!referenced.has(entry.name)) orphanCount += 1;
  }

  return {
    used_bytes: usedBytes,
    quota_bytes: SOFT_QUOTA_BYTES,
    total_files: entries.length,
    orphan_files: orphanCount,
  };
}

export async function cleanupOrphanUploads(dryRun: boolean): Promise<StorageCleanupResult> {
  const [entries, referenced] = await Promise.all([
    Promise.resolve(listUploadEntries()),
    getReferencedUploadBasenames(),
  ]);

  const orphans = entries.filter((entry) => !referenced.has(entry.name));
  let deletedCount = 0;
  let reclaimedBytes = 0;

  if (!dryRun) {
    for (const orphan of orphans) {
      try {
        fs.unlinkSync(orphan.fullPath);
        deletedCount += 1;
        reclaimedBytes += orphan.size;
      } catch {
        // Ignore already-deleted files
      }
    }
  } else {
    reclaimedBytes = orphans.reduce((sum, f) => sum + f.size, 0);
  }

  return {
    dry_run: dryRun,
    orphan_files: orphans.map((o) => o.name),
    deleted_count: deletedCount,
    reclaimed_bytes: reclaimedBytes,
  };
}
