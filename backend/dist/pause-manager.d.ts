import { EventEmitter } from 'events';
/**
 * Manages pausing/resuming file monitoring
 * Acts as an emergency brake for AI coding sessions
 */
export declare class PauseManager extends EventEmitter {
    private paused;
    private pauseReason;
    private pauseTime;
    private pauseCount;
    constructor();
    /**
     * Pause file monitoring
     */
    pause(reason?: string): void;
    /**
     * Resume file monitoring
     */
    resume(): void;
    /**
     * Check if currently paused
     */
    isPaused(): boolean;
    /**
     * Get current pause status
     */
    getStatus(): {
        paused: boolean;
        reason: string;
        pauseTime: Date | null;
        pauseCount: number;
        duration: number;
    };
    /**
     * Should events be processed?
     */
    shouldProcessEvent(): boolean;
}
export declare const pauseManager: PauseManager;
//# sourceMappingURL=pause-manager.d.ts.map