declare function randomChoice(arr: any): any;
declare function randomInt(min: any, max: any): any;
declare function sendTelemetry(data: any): Promise<boolean>;
declare function generateTestData(count?: number): Promise<void>;
/**
 * Test Telemetry Generator
 * Sends simulated AI agent events to Raven backend
 */
declare const API_BASE: "http://localhost:3030";
declare const agents: string[];
declare const files: string[];
declare const operations: string[];
declare const eventCount: number;
//# sourceMappingURL=test-telemetry.d.ts.map