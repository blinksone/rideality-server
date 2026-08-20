/**
 * @deprecated Use `npm run postman:generate` instead.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
spawnSync(process.execPath, [path.join(dir, 'generate-postman-collection.mjs')], { stdio: 'inherit' });
