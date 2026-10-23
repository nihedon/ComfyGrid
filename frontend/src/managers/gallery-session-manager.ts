/**
 * Tracks active jobs and execution requests waiting for translation or queue submission.
 * Gallery batch boundaries are decided when the user requests execution, not after translation.
 */
class GallerySession {
    private readonly activeJobIds = new Set<string>();
    private pendingExecutionRequests = 0;

    get activeCount(): number {
        return this.activeJobIds.size;
    }

    beginExecutionRequest(): boolean {
        const newBatch = this.activeJobIds.size === 0 && this.pendingExecutionRequests === 0;
        this.pendingExecutionRequests++;
        return newBatch;
    }

    finishExecutionRequest(): void {
        this.pendingExecutionRequests = Math.max(0, this.pendingExecutionRequests - 1);
    }

    /** Retain queue-time clearing for prompts submitted outside ComfyGrid. */
    beginQueuedPrompt(): boolean {
        return this.activeJobIds.size === 0 && this.pendingExecutionRequests === 0;
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
