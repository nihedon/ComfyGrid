import { SvelteMap } from 'svelte/reactivity';

/** Represents a single node's preview data while a job is in-progress. */
type NodeImageData = {
    nodeId: string;
    batchJobIndex: number;
    previewUrl?: string;
};

/** Represents a running job (prompt execution). Deleted from state on completion. */
export type JobInfo = {
    jobId: string;
    images: Record<string, NodeImageData[]>;
    createdAt: number;
    metadata?: Record<string, string>;
};

class JobState {
    readonly #jobs = new SvelteMap<string, JobInfo>();

    get jobs(): ReadonlyMap<string, JobInfo> {
        return this.#jobs;
    }

    setJob(id: string, jobInfo: JobInfo) {
        this.#jobs.set(id, jobInfo);
    }

    deleteJob(id: string) {
        this.#jobs.delete(id);
    }
}

export const jobState = new JobState();
