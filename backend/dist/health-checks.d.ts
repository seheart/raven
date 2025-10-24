/**
 * Raven Health Check System
 *
 * Runs comprehensive health checks on startup to verify all components are working.
 * Generates notifications/alerts if any checks fail.
 */
export class HealthCheckSystem {
    constructor(db: any, io: any);
    db: any;
    io: any;
    checks: any[];
    results: any[];
    startTime: number;
    /**
     * Register a health check
     * @param {string} name - Check name
     * @param {string} category - Component category (database, api, websocket, etc)
     * @param {Function} checkFn - Async function that returns {passed, message}
     */
    registerCheck(name: string, category: string, checkFn: Function): void;
    /**
     * Run all health checks
     * @returns {Object} Results summary
     */
    runAllChecks(): Object;
    /**
     * Create notification for failed health check
     */
    createFailureNotification(checkName: any, message: any, category: any): void;
    /**
     * Get summary of health check results
     */
    getSummary(): {
        total: number;
        passed: number;
        failed: number;
        byCategory: {};
        allPassed: boolean;
        results: any[];
    };
    /**
     * Get latest health check results
     */
    getResults(): {
        summary: {
            total: number;
            passed: number;
            failed: number;
            byCategory: {};
            allPassed: boolean;
            results: any[];
        };
        checks: any[];
        startTime: number;
        duration: number;
    };
}
/**
 * Initialize default health checks
 */
export function createDefaultHealthChecks(db: any, io: any): HealthCheckSystem;
//# sourceMappingURL=health-checks.d.ts.map