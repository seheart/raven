/**
 * RavenDB - SQLite database wrapper with full type safety
 *
 * Manages all database operations for Raven:
 * - File events (change tracking)
 * - Agent telemetry events
 * - System metrics (CPU, memory, network)
 * - Process metrics (per-agent)
 */
import Database from 'better-sqlite3';
/**
 * File change event stored in database
 */
export interface FileEvent {
    id: number;
    timestamp: string;
    filepath: string;
    change_type: string;
    diff?: string;
    cpu: number;
    mem: number;
    session_id?: string;
    file_hash?: string;
    event_size?: number;
    project_name?: string;
}
/**
 * Agent telemetry event
 */
export interface AgentEvent {
    id: number;
    timestamp: string;
    agent: string;
    event_type: string;
    file?: string;
    lines_changed?: number;
    duration_ms?: number;
    message: string;
    metadata?: string;
    session_id?: string;
}
/**
 * System metrics snapshot
 */
export interface SystemMetrics {
    id: number;
    timestamp: string;
    cpu_percent: number;
    memory_percent: number;
    memory_used_mb: number;
    memory_total_mb: number;
    network_rx_bytes?: number;
    network_tx_bytes?: number;
    session_id?: string;
}
/**
 * Process-level metrics
 */
export interface ProcessMetrics {
    id: number;
    timestamp: string;
    agent_name: string;
    pid: number;
    cpu_usage: number;
    memory_mb: number;
    virtual_memory_mb: number;
    disk_read_bytes?: number;
    disk_write_bytes?: number;
    status?: string;
    session_id?: string;
}
/**
 * Agent statistics aggregation
 */
export interface AgentStats {
    agent: string;
    event_count: number;
    avg_duration_ms: number | null;
    total_lines_changed: number | null;
}
/**
 * File modification statistics
 */
export interface FileStats {
    filepath: string;
    edit_count: number;
    total_lines_changed: number;
    last_modified: string;
}
/**
 * Metrics statistics over time range
 */
export interface MetricsStats {
    avg_cpu_percent: number;
    max_cpu_percent: number;
    avg_memory_percent: number;
    max_memory_percent: number;
    sample_count: number;
}
/**
 * Dashboard overview statistics
 */
export interface DashboardStats {
    total_events: number;
    total_files: number;
    total_agents: number;
    session_duration_seconds: number;
    active_files_today: number;
}
/**
 * Performance correlation data
 */
export interface PerformanceCorrelation {
    event_id: number;
    event_timestamp: string;
    agent: string;
    event_type: string;
    duration_ms: number | null;
    system_cpu_percent: number | null;
    system_memory_percent: number | null;
    process_cpu_percent: number | null;
    process_memory_mb: number | null;
}
/**
 * Syntax error detected in code
 */
export interface SyntaxErrorRecord {
    id: number;
    timestamp: string;
    filepath: string;
    line_number: number;
    column_number?: number;
    message: string;
    severity: string;
    language: string;
    resolved: number;
    session_id?: string;
}
export declare class RavenDB {
    db: Database.Database;
    constructor(dbPath: string);
    private initializeSchema;
    insertAgentEvent(timestamp: string, agent: string, event_type: string, file: string | null | undefined, lines_changed: number | null | undefined, duration_ms: number | null | undefined, message: string, metadata: Record<string, any> | null | undefined, session_id: string | null | undefined): number;
    getRecentAgentEvents(limit?: number): AgentEvent[];
    getEventsByAgent(agent: string, limit?: number): AgentEvent[];
    getAgentStats(): AgentStats[];
    insertEvent(timestamp: string, filepath: string, change_type: string, diff: string | null, cpu: number, mem: number, session_id: string | null | undefined, file_hash: string | null | undefined, event_size: number | null | undefined, project_name: string | null | undefined): number;
    getRecentFileEvents(limit?: number, includeDiff?: boolean): FileEvent[];
    getEventsBySession(session_id: string): FileEvent[];
    getAgentEventsBySession(session_id: string): any[];
    getTrackedFiles(): string[];
    insertSystemMetrics(timestamp: string, cpu_percent: number, memory_percent: number, memory_used_mb: number, memory_total_mb: number, network_rx_bytes: number | null | undefined, network_tx_bytes: number | null | undefined, session_id: string | null | undefined): number;
    getRecentSystemMetrics(limit?: number): SystemMetrics[];
    getMetricsStats(start_time: string, end_time: string): MetricsStats;
    insertProcessMetrics(timestamp: string, agent_name: string, pid: number, cpu_usage: number, memory_mb: number, virtual_memory_mb: number, disk_read_bytes: number | null | undefined, disk_write_bytes: number | null | undefined, status: string | null | undefined, session_id: string | null | undefined): number;
    getProcessMetricsByAgent(agent_name: string, limit?: number): ProcessMetrics[];
    correlateEventsWithMetrics(time_window_seconds?: number): PerformanceCorrelation[];
    getTopModifiedFiles(session_id: string, limit?: number): FileStats[];
    getLongestEdits(limit?: number): any[];
    getDashboardStats(session_id: string): DashboardStats;
    insertSyntaxError(timestamp: string, filepath: string, line_number: number, column_number: number | undefined, message: string, severity: string, language: string, session_id: string | undefined): number;
    getSyntaxErrors(limit?: number): SyntaxErrorRecord[];
    getSyntaxErrorsByFile(filepath: string): SyntaxErrorRecord[];
    resolveSyntaxError(id: number): void;
    resolveSyntaxErrorsByFile(filepath: string): void;
    getUnresolvedSyntaxErrorCount(): number;
    insertPatternWarning(timestamp: string, filepath: string, line_number: number, pattern_id: string, pattern_name: string, severity: string, category: string, match_text: string, context: string, session_id: string | undefined): number;
    getPatternWarnings(limit?: number): any[];
    getPatternWarningsByCategory(category: string): any[];
    resolvePatternWarning(id: number): void;
    resolvePatternWarningsByFile(filepath: string): void;
    insertTestResult(timestamp: string, framework: string, passed: boolean, totalTests: number, passedTests: number, failedTests: number, skippedTests: number, duration: number, output: string, failures: string, sessionId: string): number;
    getTestResults(limit?: number): any[];
    getLatestTestResult(): any | null;
    getTestResultsByFramework(framework: string, limit?: number): any[];
    getFailedTestsCount(): number;
    getUnresolvedPatternWarningCount(): number;
    close(): void;
}
//# sourceMappingURL=db.d.ts.map