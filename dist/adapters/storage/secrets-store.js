import fs from 'node:fs/promises';
import path from 'node:path';
import { maskHint } from '../../domain/secret/mask.js';
import { paths } from './paths.js';
import { randomUUID } from 'node:crypto';
async function ensureDir(dir) {
    await fs.mkdir(dir, { recursive: true });
}
async function readMap() {
    try {
        const raw = await fs.readFile(paths.secretsFile, 'utf8');
        return JSON.parse(raw);
    }
    catch (error) {
        if (error.code !== 'ENOENT')
            throw error;
        return {};
    }
}
async function writeMap(map) {
    await ensureDir(paths.secretsDir);
    const temp = `${paths.secretsFile}.${randomUUID()}.tmp`;
    try {
        await fs.writeFile(temp, `${JSON.stringify(map, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        await fs.rename(temp, paths.secretsFile);
    }
    finally {
        await fs.rm(temp, { force: true });
    }
}
let writes = Promise.resolve();
function mutate(update) {
    const task = writes.then(async () => {
        const map = await readMap();
        update(map);
        await writeMap(map);
    });
    writes = task.catch(() => undefined);
    return task;
}
export async function getSecret(ref) {
    if (!ref)
        return undefined;
    if (ref.startsWith('env:')) {
        return process.env[ref.slice(4)];
    }
    if (ref.startsWith('store:')) {
        const map = await readMap();
        return map[ref.slice(6)];
    }
    return undefined;
}
export async function replaceSecret(id, value) {
    await mutate(map => { map[id] = value; });
    return { ref: `store:${id}`, maskedHint: maskHint(value) };
}
export async function clearSecret(id) {
    await mutate(map => { delete map[id]; });
}
export function secretFilePath() {
    return path.normalize(paths.secretsFile);
}
//# sourceMappingURL=secrets-store.js.map