/**
 * Tracks prompt jobs that are still active (queued or running). Defines the batch boundary for
 * gallery storage: when {@link GallerySession.activeCount} is zero and a new prompt is queued,
 * {@link ExecutionManager} treats the prior batch as finished — it resets run progress and calls
 * {@link JobManager.cleanupAllJobs}.
 *
 * This isolates “when we wipe the gallery between batches” from WebSocket handling and from
 * {@link JobManager}, which only performs the actual teardown of stored outputs.
 */
class GallerySession {
    private readonly activeJobIds = new Set<string>();

    get activeCount(): number {
        return this.activeJobIds.size;
    }

    /** True when no jobs are in-flight; caller should clear gallery storage before registering the new prompt. */
    beginQueuedPrompt(): boolean {
        return this.activeJobIds.size === 0;
    }

    trackQueued(jobId: string): void {
        this.activeJobIds.add(jobId);
    }

    trackFinished(jobId: string): void {
        this.activeJobIds.delete(jobId);
    }

    /** Clears active tracking when run progress / queue UI is reset (see ExecutionManager.onTaskFinished). */
    clearTrackedJobs(): void {
        this.activeJobIds.clear();
    }
}

export const gallerySession = new GallerySession();
