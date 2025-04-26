import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const configPath = join(dirname(__dirname), 'config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

export default config; 