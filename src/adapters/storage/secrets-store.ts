import fs from 'node:fs/promises';
import path from 'node:path';
import { maskHint } from '../../domain/secret/mask.js';
import { paths } from './paths.js';
import { randomUUID } from 'node:crypto';

type SecretMap = Record<string, string>;

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readMap(): Promise<SecretMap> {
  try {
    const raw = await fs.readFile(paths.secretsFile, 'utf8');
    return JSON.parse(raw) as SecretMap;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return {};
  }
}

async function writeMap(map: SecretMap): Promise<void> {
  await ensureDir(paths.secretsDir);
  const temp = `${paths.secretsFile}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, `${JSON.stringify(map, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temp, paths.secretsFile);
  } finally {
    await fs.rm(temp, { force: true });
  }
}

let writes: Promise<unknown> = Promise.resolve();
function mutate(update: (map: SecretMap) => void): Promise<void> {
  const task = writes.then(async () => {
    const map = await readMap();
    update(map);
    await writeMap(map);
  });
  writes = task.catch(() => undefined);
  return task;
}

export async function getSecret(ref: string): Promise<string | undefined> {
  if (!ref) return undefined;
  if (ref.startsWith('env:')) {
    return process.env[ref.slice(4)];
  }
  if (ref.startsWith('store:')) {
    const map = await readMap();
    return map[ref.slice(6)];
  }
  return undefined;
}

export async function replaceSecret(id: string, value: string): Promise<{ ref: string; maskedHint: string }> {
  await mutate(map => { map[id] = value; });
  return { ref: `store:${id}`, maskedHint: maskHint(value) };
}

export async function clearSecret(id: string): Promise<void> {
  await mutate(map => { delete map[id]; });
}

export function secretFilePath(): string {
  return path.normalize(paths.secretsFile);
}
