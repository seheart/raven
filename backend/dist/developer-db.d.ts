export default DeveloperDB;
declare class DeveloperDB {
    constructor(dbPath: any);
    /** @type {import('better-sqlite3').Database} */
    db: import("better-sqlite3").Database;
    initializeTables(): void;
    /**
     * Log agent interaction (prompts, responses, edits)
     */
    logAgentInteraction(data: any): number | bigint;
    /**
     * Log code pattern (edits, style, structure)
     */
    logCodePattern(data: any): number | bigint;
    /**
     * Log workflow event (focus, breaks, context switches)
     */
    logWorkflowEvent(data: any): number | bigint;
    /**
     * Log error and recovery attempt
     */
    logErrorRecovery(data: any): number | bigint;
    /**
     * Update or insert developer preference
     */
    updatePreference(category: any, key: any, value: any, metadata?: {}): Database.RunResult;
    /**
     * Log context switch between projects
     */
    logContextSwitch(data: any): number | bigint;
    /**
     * Get recent agent interactions
     */
    getRecentInteractions(limit?: number, project?: null): unknown[];
    /**
     * Get coding patterns for a language
     */
    getCodingPatterns(language?: null, limit?: number): unknown[];
    /**
     * Get workflow statistics
     */
    getWorkflowStats(days?: number): unknown[];
    /**
     * Get all developer preferences
     */
    getAllPreferences(): unknown[];
    /**
     * Get context switch statistics
     */
    getContextSwitchStats(days?: number): unknown[];
    /**
     * Close database connection
     */
    close(): void;
}
import Database from 'better-sqlite3';
//# sourceMappingURL=developer-db.d.ts.map