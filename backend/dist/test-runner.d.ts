export interface TestFramework {
    name: string;
    command: string;
    configFiles: string[];
    packageJsonScripts?: string[];
}
export interface TestResult {
    framework: string;
    passed: boolean;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    duration: number;
    output: string;
    failures: TestFailure[];
}
export interface TestFailure {
    testName: string;
    error: string;
    file?: string;
    line?: number;
}
/**
 * Test runner service - Detects and runs tests automatically
 */
export declare class TestRunner {
    private projectPath;
    private detectedFrameworks;
    private static frameworks;
    constructor(projectPath: string);
    /**
     * Detect available test frameworks
     */
    detectFrameworks(): Promise<TestFramework[]>;
    /**
     * Run tests for detected frameworks
     */
    runTests(framework?: string): Promise<TestResult>;
    /**
     * Parse test output based on framework
     */
    private parseTestOutput;
    /**
     * Parse Jest/Vitest output
     */
    private parseJestOutput;
    /**
     * Parse Pytest output
     */
    private parsePytestOutput;
    /**
     * Parse Mocha output
     */
    private parseMochaOutput;
    /**
     * Parse Go test output
     */
    private parseGoTestOutput;
    /**
     * Get detected frameworks
     */
    getDetectedFrameworks(): TestFramework[];
}
export declare function getTestRunner(projectPath: string): TestRunner;
//# sourceMappingURL=test-runner.d.ts.map