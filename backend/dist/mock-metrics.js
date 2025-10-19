// Simple script to generate mock performance metrics for testing
import { RavenDB } from './db.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, '..', '.raven', 'db', 'raven.db');
const db = new RavenDB(DB_PATH);
console.log('📊 Generating mock performance metrics...\n');
// Generate 20 system metrics (last 20 minutes, one per minute)
for (let i = 20; i >= 0; i--) {
    const timestamp = new Date(Date.now() - i * 60 * 1000).toISOString();
    const cpu = 20 + Math.random() * 60; // 20-80%
    const memory = 30 + Math.random() * 50; // 30-80%
    const total_mb = 16384; // 16GB
    const used_mb = Math.floor(total_mb * (memory / 100));
    db.db
        .prepare(`
    INSERT INTO raven_metrics (timestamp, cpu_percent, memory_percent, memory_used_mb, memory_total_mb, network_rx_bytes, network_tx_bytes, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
        .run(timestamp, cpu, memory, used_mb, total_mb, Math.floor(Math.random() * 1000000), Math.floor(Math.random() * 500000), '577b645c-9010-4984-b2f3-986338ffc2bd');
}
console.log('✅ Generated 21 system metrics');
// Generate 20 process metrics for claude
for (let i = 20; i >= 0; i--) {
    const timestamp = new Date(Date.now() - i * 60 * 1000).toISOString();
    const cpu = 15 + Math.random() * 40; // 15-55%
    const memory = 200 + Math.floor(Math.random() * 300); // 200-500 MB
    db.db
        .prepare(`
    INSERT INTO process_metrics (timestamp, agent_name, pid, cpu_usage, memory_mb, virtual_memory_mb, disk_read_bytes, disk_write_bytes, status, session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
        .run(timestamp, 'claude-sonnet-3.5', 12345, cpu, memory, memory * 2, Math.floor(Math.random() * 100000), Math.floor(Math.random() * 50000), 'running', '577b645c-9010-4984-b2f3-986338ffc2bd');
}
console.log('✅ Generated 21 process metrics for claude-sonnet-3.5');
console.log('\n🎉 Mock data generation complete!');
console.log('📈 You can now view the Performance panel in the dashboard');
process.exit(0);
//# sourceMappingURL=mock-metrics.js.map