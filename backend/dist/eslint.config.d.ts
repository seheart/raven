declare const _default: ({
    ignores: string[];
    languageOptions?: undefined;
    rules?: undefined;
} | {
    languageOptions: {
        ecmaVersion: string;
        sourceType: string;
        globals: {
            console: string;
            process: string;
            __dirname: string;
            __filename: string;
            Buffer: string;
            setTimeout: string;
            setInterval: string;
            clearTimeout: string;
            clearInterval: string;
        };
    };
    rules: {
        'no-unused-vars': (string | {
            argsIgnorePattern: string;
        })[];
        'no-console': string;
        semi: string[];
        quotes: (string | {
            avoidEscape: boolean;
        })[];
        indent: (string | number)[];
        'comma-dangle': string[];
        'eol-last': string[];
    };
    ignores?: undefined;
})[];
export default _default;
//# sourceMappingURL=eslint.config.d.ts.map