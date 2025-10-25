import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import { readFile } from 'fs/promises';
const execAsync = promisify(exec);
/**
 * Test runner service - Detects and runs tests automatically
 */
export class TestRunner {
    projectPath;
    detectedFrameworks = [];
    // Supported test frameworks
    static frameworks = [
        {
            name: 'Jest',
            command: 'npm test',
            configFiles: ['jest.config.js', 'jest.config.ts', 'jest.config.json'],
            packageJsonScripts: ['test', 'test:unit']
        },
        {
            name: 'Pytest',
            command: 'pytest --tb=short',
            configFiles: ['pytest.ini', 'pyproject.toml', 'setup.cfg'],
            packageJsonScripts: []
        },
        {
            name: 'Mocha',
            command: 'npm test',
            configFiles: ['.mocharc.json', '.mocharc.js', '.mocharc.yaml'],
            packageJsonScripts: ['test', 'test:mocha']
        },
        {
            name: 'Vitest',
            command: 'npm test',
            configFiles: ['vitest.config.ts', 'vitest.config.js'],
            packageJsonScripts: ['test', 'test:unit']
        },
        {
            name: 'Go Test',
            command: 'go test ./...',
            configFiles: ['go.mod'],
            packageJsonScripts: []
        }
    ];
    constructor(projectPath) {
        this.projectPath = projectPath;
    }
    /**
     * Detect available test frameworks
     */
    async detectFrameworks() {
        const detected = [];
        for (const framework of TestRunner.frameworks) {
            // Check for config files
            const hasConfig = framework.configFiles.some(file => existsSync(join(this.projectPath, file)));
            // Check package.json scripts if applicable
            let hasScript = false;
            if (framework.packageJsonScripts && framework.packageJsonScripts.length > 0) {
                try {
                    const packageJsonPath = join(this.projectPath, 'package.json');
                    if (existsSync(packageJsonPath)) {
                        const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
                        hasScript = framework.packageJsonScripts.some(script => packageJson.scripts && packageJson.scripts[script]);
                    }
                }
                catch (error) {
                    // Ignore errors reading package.json
                }
            }
            if (hasConfig || hasScript) {
                detected.push(framework);
            }
        }
        this.detectedFrameworks = detected;
        return detected;
    }
    /**
     * Run tests for detected frameworks
     */
    async runTests(framework) {
        // If no framework specified, use first detected
        let targetFramework;
        if (framework) {
            targetFramework = this.detectedFrameworks.find(f => f.name === framework);
        }
        else if (this.detectedFrameworks.length > 0) {
            targetFramework = this.detectedFrameworks[0];
        }
        if (!targetFramework) {
            return {
                framework: 'none',
                passed: false,
                totalTests: 0,
                passedTests: 0,
                failedTests: 0,
                skippedTests: 0,
                duration: 0,
                output: 'No test framework detected',
                failures: []
            };
        }
        const startTime = Date.now();
        try {
            const { stdout, stderr } = await execAsync(targetFramework.command, {
                cwd: this.projectPath,
                timeout: 60000, // 60 second timeout
                env: { ...process.env, CI: 'true' } // Set CI mode for cleaner output
            });
            const duration = Date.now() - startTime;
            const output = stdout + '\n' + stderr;
            return this.parseTestOutput(targetFramework.name, output, duration, true);
        }
        catch (error) {
            const duration = Date.now() - startTime;
            const output = (error.stdout || '') + '\n' + (error.stderr || '');
            // Tests failed (exit code 1 usually means test failures, not errors)
            return this.parseTestOutput(targetFramework.name, output, duration, false);
        }
    }
    /**
     * Parse test output based on framework
     */
    parseTestOutput(framework, output, duration, passed) {
        switch (framework) {
            case 'Jest':
            case 'Vitest':
                return this.parseJestOutput(framework, output, duration, passed);
            case 'Pytest':
                return this.parsePytestOutput(output, duration, passed);
            case 'Mocha':
                return this.parseMochaOutput(output, duration, passed);
            case 'Go Test':
                return this.parseGoTestOutput(output, duration, passed);
            default:
                return {
                    framework,
                    passed,
                    totalTests: 0,
                    passedTests: 0,
                    failedTests: 0,
                    skippedTests: 0,
                    duration,
                    output,
                    failures: []
                };
        }
    }
    /**
     * Parse Jest/Vitest output
     */
    parseJestOutput(framework, output, duration, passed) {
        const result = {
            framework,
            passed,
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            skippedTests: 0,
            duration,
            output,
            failures: []
        };
        // Extract test counts: "Tests:       2 passed, 2 total"
        const testsMatch = output.match(/Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+skipped,\s*)?(\d+)\s+passed,\s+(\d+)\s+total/);
        if (testsMatch) {
            result.failedTests = parseInt(testsMatch[1] || '0');
            result.skippedTests = parseInt(testsMatch[2] || '0');
            result.passedTests = parseInt(testsMatch[3] || '0');
            result.totalTests = parseInt(testsMatch[4] || '0');
        }
        // Extract failures
        const failureRegex = /●\s+(.+?)\n\n\s+(.*?)(?=\n\n|\n●|$)/gs;
        let match;
        while ((match = failureRegex.exec(output)) !== null) {
            result.failures.push({
                testName: match[1].trim(),
                error: match[2].trim()
            });
        }
        return result;
    }
    /**
     * Parse Pytest output
     */
    parsePytestOutput(output, duration, passed) {
        const result = {
            framework: 'Pytest',
            passed,
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            skippedTests: 0,
            duration,
            output,
            failures: []
        };
        // Extract counts: "= 2 failed, 3 passed in 0.52s ="
        const countsMatch = output.match(/=+\s*(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+passed,?\s*)?(?:(\d+)\s+skipped,?\s*)?in\s+([\d.]+)s\s*=+/);
        if (countsMatch) {
            result.failedTests = parseInt(countsMatch[1] || '0');
            result.passedTests = parseInt(countsMatch[2] || '0');
            result.skippedTests = parseInt(countsMatch[3] || '0');
            result.totalTests = result.failedTests + result.passedTests + result.skippedTests;
        }
        // Extract failures
        const failureRegex = /FAILED\s+(.*?)\s+-\s+(.*?)(?=\n[A-Z]|$)/gs;
        let match;
        while ((match = failureRegex.exec(output)) !== null) {
            result.failures.push({
                testName: match[1].trim(),
                error: match[2].trim()
            });
        }
        return result;
    }
    /**
     * Parse Mocha output
     */
    parseMochaOutput(output, duration, passed) {
        const result = {
            framework: 'Mocha',
            passed,
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            skippedTests: 0,
            duration,
            output,
            failures: []
        };
        // Extract counts: "2 passing", "1 failing"
        const passingMatch = output.match(/(\d+)\s+passing/);
        const failingMatch = output.match(/(\d+)\s+failing/);
        const pendingMatch = output.match(/(\d+)\s+pending/);
        if (passingMatch)
            result.passedTests = parseInt(passingMatch[1]);
        if (failingMatch)
            result.failedTests = parseInt(failingMatch[1]);
        if (pendingMatch)
            result.skippedTests = parseInt(pendingMatch[1]);
        result.totalTests = result.passedTests + result.failedTests + result.skippedTests;
        return result;
    }
    /**
     * Parse Go test output
     */
    parseGoTestOutput(output, duration, passed) {
        const result = {
            framework: 'Go Test',
            passed,
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            skippedTests: 0,
            duration,
            output,
            failures: []
        };
        // Count PASS and FAIL lines
        const passMatches = output.match(/^ok\s+/gm);
        const failMatches = output.match(/^FAIL\s+/gm);
        result.passedTests = passMatches ? passMatches.length : 0;
        result.failedTests = failMatches ? failMatches.length : 0;
        result.totalTests = result.passedTests + result.failedTests;
        return result;
    }
    /**
     * Get detected frameworks
     */
    getDetectedFrameworks() {
        return this.detectedFrameworks;
    }
}
// Export singleton instance
let testRunner = null;
export function getTestRunner(projectPath) {
    if (!testRunner) {
        testRunner = new TestRunner(projectPath);
    }
    return testRunner;
}
//# sourceMappingURL=test-runner.js.map