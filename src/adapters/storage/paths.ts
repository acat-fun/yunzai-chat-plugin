import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** dist/adapters/storage → 插件根 */
export const pluginRoot = path.resolve(here, '../../..');

export const paths = {
  root: pluginRoot,
  defaultsConfig: path.join(pluginRoot, 'config/defaults/plugin.yml'),
  dataDir: path.join(pluginRoot, 'data'),
  runtimeConfig: path.join(pluginRoot, 'data/config/plugin.yml'),
  secretsDir: path.join(pluginRoot, 'data/secrets'),
  secretsFile: path.join(pluginRoot, 'data/secrets/secrets.json'),
};
