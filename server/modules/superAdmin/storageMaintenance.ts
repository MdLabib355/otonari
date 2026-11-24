// Storage hygiene: reports S3 mode when S3_BUCKET is configured, or measures/cleans local server/uploads/.

import fs from 'node:fs';
import path from 'node:path';
import type { StorageCleanupResult, StorageHealth } from '../../../shared/types.ts';
import { query } from '../../core/database.ts';
import { usesS3 } from '../../core/s3.ts';

const UPLOADS_DIR = path.join(import.meta.dirname, '..', '..', 'uploads');
const SOFT_QUOTA_BYTES = 50 * 1024 * 1024; // 50 MB default soft quota

async function getReferencedPhotos(): Promise<{ localBasenames: Set<string>; s3Keys: Set<string> }> {
  const rows = await query<{ handover_photo: string | null; return_photo: string | null }>(
    'SELECT handover_photo, return_photo FROM loans WHERE handover_photo IS NOT NULL OR return_photo IS NOT NULL'
  );
  const localBasenames = new Set<string>();
  const s3Keys = new Set<string>();

  for (const row of rows) {
    for (const value of [row.handover_photo, row.return_photo]) {
      if (!value) continue;
      if (value.startsWith('s3:')) {
        s3Keys.add(value.slice(3));
      } else {
        localBasenames.add(path.basename(value));
      }
    }
  }
  return { localBasenames, s3Keys };
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
  const { localBasenames, s3Keys } = await getReferencedPhotos();

  if (usesS3) {
    return {
      mode: 's3',
      used_bytes: 0,
      quota_bytes: 0,
      total_files: s3Keys.size,
      orphan_files: 0,
    };
  }

  const entries = listUploadEntries();
  let usedBytes = 0;
  let orphanCount = 0;
  for (const entry of entries) {
    usedBytes += entry.size;
    if (!localBasenames.has(entry.name)) orphanCount += 1;
  }

  return {
    mode: 'local',
    used_bytes: usedBytes,
    quota_bytes: SOFT_QUOTA_BYTES,
    total_files: entries.length,
    orphan_files: orphanCount,
  };
}

export async function cleanupOrphanUploads(dryRun: boolean): Promise<StorageCleanupResult> {
  if (usesS3) {
    // Never delete from S3 automatically: multiple environments may share a bucket.
    return {
      dry_run: dryRun,
      mode: 's3',
      orphan_files: [],
      deleted_count: 0,
      reclaimed_bytes: 0,
    };
  }

  const [{ localBasenames }, entries] = await Promise.all([
    getReferencedPhotos(),
    Promise.resolve(listUploadEntries()),
  ]);

  const orphans = entries.filter((entry) => !localBasenames.has(entry.name));
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
    mode: 'local',
    orphan_files: orphans.map((o) => o.name),
    deleted_count: deletedCount,
    reclaimed_bytes: reclaimedBytes,
  };
}
