/**
 * Telemetry - System metrics collection
 *
 * Collects CPU, memory, and network metrics at regular intervals.
 * Emits telemetry events via EventBus for storage and real-time monitoring.
 */
export interface TelemetryConfig {
    intervalMs: number;
    enableNetworkMetrics: boolean;
}
export declare class TelemetryCollector {
    private intervalId;
    private config;
    private lastNetworkStats;
    constructor(config?: Partial<TelemetryConfig>);
    /**
     * Start collecting telemetry at configured interval
     */
    start(): void;
    /**
     * Stop collecting telemetry
     */
    stop(): void;
    /**
     * Collect current system metrics
     */
    private collect;
    /**
     * Get current telemetry snapshot (synchronous, less accurate)
     */
    getSnapshot(): {
        cpu: number;
        mem: number;
        ts: number;
    };
    /**
     * Check if collector is running
     */
    isRunning(): boolean;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<TelemetryConfig>): void;
}
/**
 * Create and export a singleton telemetry collector instance
 * Can be imported and started by the main server
 */
export declare const telemetryCollector: TelemetryCollector;
//# sourceMappingURL=telemetry.d.ts.map