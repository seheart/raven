const { createRequire } = require('module');
const path = require('path');
const req = createRequire(__filename);
const pkgPath = path.join(process.cwd(), 'node_modules', 'better-sqlite3');
module.exports = req(pkgPath);
