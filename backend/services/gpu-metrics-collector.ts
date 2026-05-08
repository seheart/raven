/**
 * GpuMetricsCollector — periodically samples `nvidia-smi` and persists rows
 * to the gpu_metrics table. Powers the "GPU history" panels (last N minutes
 * of VRAM / utilization / temp); /api/gpu remains the live spot-check.
 *
 * Quietly does nothing on hosts without nvidia-smi.
 */

import { spawn } from 'child_process';
import type { RavenDB } from '../db.js';
import { logger } from '../utils/logger.js';

interface GpuSample {
  name: string;
  vram_used_mib: number;
  vram_total_mib: number;
  vram_pct: number;
  gpu_util_pct: number;
  mem_util_pct: number;
  temp_c: number;
  power_draw_w: number;
  power_limit_w: number;
}

const FIELDS = [
  'name',
  'memory.total',
  'memory.used',
  'memory.free',
  'utilization.gpu',
  'utilization.memory',
  'temperature.gpu',
  'power.draw',
  'power.limit'
];

function querySmi(): Promise<GpuSample[]> {
  return new Promise(resolve => {
    let proc;
    try {
      proc = spawn('nvidia-smi', [
        `--query-gpu=${FIELDS.join(',')}`,
        '--format=csv,noheader,nounits'
      ]);
    } catch {
      resolve([]);
      return;
    }
    let stdout = '';
    proc.stdout.on('data', (b: Buffer) => (stdout += b.toString()));
    proc.on('error', () => resolve([]));
    proc.on('close', (code: number) => {
      if (code !== 0) {
        resolve([]);
        return;
      }
      const samples = stdout
        .trim()
        .split('\n')
        .map(line => {
          const v = line.split(',').map(s => s.trim());
          const total = parseFloat(v[1]) || 0;
          const used = parseFloat(v[2]) || 0;
          return {
            name: v[0],
            vram_total_mib: total,
            vram_used_mib: used,
            vram_pct: total > 0 ? +((used / total) * 100).toFixed(1) : 0,
            gpu_util_pct: parseFloat(v[4]) || 0,
            mem_util_pct: parseFloat(v[5]) || 0,
            temp_c: parseFloat(v[6]) || 0,
            power_draw_w: parseFloat(v[7]) || 0,
            power_limit_w: parseFloat(v[8]) || 0
          };
        });
      resolve(samples);
    });
  });
}

export class GpuMetricsCollector {
  private db: RavenDB;
  private sessionId: string;
  private interval: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;
  // better-sqlite3's `Statement.run` is variadic-but-typed; an unknown[]
  // signature doesn't slot in cleanly. `any` here is scoped to one field.
  private insertStmt: any = null;
  private supported = true;

  constructor(db: RavenDB, sessionId: string, intervalMs = 30000) {
    this.db = db;
    this.sessionId = sessionId;
    this.intervalMs = intervalMs;
  }

  async start(): Promise<void> {
    if (this.interval) return;
    // Quick probe — if nvidia-smi isn't available, skip the collector silently.
    const samples = await querySmi();
    if (samples.length === 0) {
      this.supported = false;
      logger.info('🎛️  GPU metrics collector: nvidia-smi unavailable, skipping');
      return;
    }
    this.insertStmt = this.db.db.prepare(
      `INSERT INTO gpu_metrics (timestamp, gpu_index, name, vram_used_mib, vram_total_mib,
        vram_pct, gpu_util_pct, mem_util_pct, temp_c, power_draw_w, power_limit_w, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.persist(samples);
    logger.info(`🎛️  GPU metrics collector running (${this.intervalMs / 1000}s interval)`);
    this.interval = setInterval(() => {
      querySmi().then(s => this.persist(s));
    }, this.intervalMs);
    this.interval.unref();
  }

  private persist(samples: GpuSample[]): void {
    if (!this.insertStmt || samples.length === 0) return;
    const ts = new Date().toISOString();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      try {
        this.insertStmt.run(
          ts,
          i,
          s.name,
          s.vram_used_mib,
          s.vram_total_mib,
          s.vram_pct,
          s.gpu_util_pct,
          s.mem_util_pct,
          s.temp_c,
          s.power_draw_w,
          s.power_limit_w,
          this.sessionId
        );
      } catch (err) {
        logger.debug(`GPU metric insert failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      if (this.supported) logger.info('🛑 GPU metrics collector stopped');
    }
  }
}
