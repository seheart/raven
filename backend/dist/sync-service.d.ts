/**
 * Check if rsync is installed
 */
export function checkRsyncInstalled(): Promise<{
    installed: boolean;
    message?: undefined;
} | {
    installed: boolean;
    message: string;
}>;
/**
 * Load sync configuration from disk
 */
export function loadConfig(): Promise<{
    config: any;
    lastSync: any;
    history: any;
}>;
/**
 * Save sync configuration to disk
 */
export function saveConfig(config: any): Promise<{
    success: boolean;
    error?: undefined;
} | {
    success: boolean;
    error: any;
}>;
/**
 * Test SSH connection to server
 */
export function testConnection(config: any): Promise<{
    success: boolean;
    error: any;
} | {
    success: boolean;
    message: string;
}>;
/**
 * Perform sync to server
 */
export function performSync(config: any, projectPath: any): Promise<{
    success: boolean;
    error: any;
    size?: undefined;
    files?: undefined;
    duration?: undefined;
    stats?: undefined;
} | {
    success: boolean;
    size: number;
    files: number;
    duration: number;
    stats: {
        filesTransferred: number;
        totalSize: number;
    };
    error?: undefined;
}>;
/**
 * Cancel ongoing sync operation
 */
export function cancelSync(): Promise<{
    success: boolean;
    error: string;
    message?: undefined;
} | {
    success: boolean;
    message: string;
    error?: undefined;
}>;
/**
 * Get SSH key path (looks for common key locations)
 */
export function getSSHKeyPath(): string | null;
/**
 * Check if SSH is configured properly
 */
export function checkSSHSetup(): Promise<{
    configured: boolean;
    message: string;
    keyPath?: undefined;
} | {
    configured: boolean;
    keyPath: string;
    message: string;
}>;
/**
 * Get remote storage statistics (OPTIMIZED: single SSH call instead of N+3)
 */
export function getRemoteStorageStats(config: any): Promise<{
    success: boolean;
    error: any;
    totalSize?: undefined;
    projects?: undefined;
    remotePath?: undefined;
    timestamp?: undefined;
} | {
    success: boolean;
    totalSize: number;
    projects: {
        name: any;
        size: number;
        files: number;
        lastModified: string | null;
    }[];
    remotePath: any;
    timestamp: string;
    error?: undefined;
}>;
//# sourceMappingURL=sync-service.d.ts.map