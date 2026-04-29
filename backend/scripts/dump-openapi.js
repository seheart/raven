#!/usr/bin/env node
/**
 * Dumps the OpenAPI 3.0 spec defined in config/openapi.js to a JSON file.
 * Used by the frontend codegen pipeline to generate typed API client types.
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { openApiSpec } from '../config/openapi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '..', 'config', 'openapi.json');

writeFileSync(out, JSON.stringify(openApiSpec, null, 2));
console.log(`Wrote ${out}`);
