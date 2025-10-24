declare namespace _default {
    let testEnvironment: string;
    let transform: {};
    let moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': string;
    };
    let testMatch: string[];
    let testPathIgnorePatterns: string[];
    let collectCoverageFrom: string[];
    namespace coverageThreshold {
        namespace global {
            let branches: number;
            let functions: number;
            let lines: number;
            let statements: number;
        }
    }
    let testTimeout: number;
}
export default _default;
//# sourceMappingURL=jest.config.d.ts.map