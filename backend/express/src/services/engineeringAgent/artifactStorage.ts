import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { env } from '../../config/env';

export function taskArtifactsDir(taskId: string): string {
  const base =
    process.env.ENGINEERING_VERIFY_ARTIFACTS_DIR ||
    join(env.ENGINEERING_DEPLOY_API_DIR || process.cwd(), 'artifacts', 'engineering-agent');
  const dir = join(base, taskId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function artifactFilePath(taskId: string, filename: string): string {
  return join(taskArtifactsDir(taskId), filename);
}

export function writeArtifactFile(taskId: string, filename: string, data: Buffer | string): string {
  const path = artifactFilePath(taskId, filename);
  writeFileSync(path, data);
  return path;
}
