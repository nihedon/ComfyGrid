import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { appState } from './app-state.svelte';

type Status = 'processing' | 'error' | 'interrupted' | 'busy' | null;

class Progress {
    #status = $state<Status>(null);
    #label = $state<string | null>(null);
    #value = $state(0);
    #maxValue = $state(0);
    readonly #nodeSet = new SvelteMap<string, SvelteSet<string>>();
    readonly #executedNodeSet = new SvelteMap<string, SvelteSet<string>>();

    readonly totalCount = $derived.by(() => {
        let totalCount = 0;
        for (const nodeSet of this.nodeSet.values()) {
            totalCount += nodeSet.size;
        }
        return totalCount;
    });

    readonly executedCount = $derived.by(() => {
        let executedCount = 0;
        for (const nodeSet of this.executedNodeSet.values()) {
            executedCount += nodeSet.size;
        }
        return executedCount;
    });

    get status() {
        return this.#status;
    }
    get label() {
        return this.#label;
    }
    get value() {
        return this.#value;
    }
    get maxValue() {
        return this.#maxValue;
    }
    get nodeSet(): ReadonlyMap<string, ReadonlySet<string>> {
        return this.#nodeSet;
    }
    get executedNodeSet(): ReadonlyMap<string, ReadonlySet<string>> {
        return this.#executedNodeSet;
    }

    set status(status: Status) {
        this.#status = status;
    }
    set label(label: string | null) {
        this.#label = label;
    }
    set value(value: number) {
        this.#value = value;
    }
    set maxValue(maxValue: number) {
        this.#maxValue = maxValue;
    }

    setNodeSet(jobId: string, nodeIds: string[]) {
        this.#nodeSet.set(jobId, new SvelteSet(nodeIds));
    }
    addNodeSet(jobId: string, nodeIds: string[]) {
        if (!this.#nodeSet.has(jobId)) {
            this.#nodeSet.set(jobId, new SvelteSet<string>());
        }
        nodeIds.forEach((nodeId) => {
            this.#nodeSet.get(jobId)?.add(nodeId);
        });
    }
    deleteNodeSet(jobId: string) {
        this.#nodeSet.delete(jobId);
    }
    setExecutedNodeSet(jobId: string, nodeIds: string[]) {
        this.#executedNodeSet.set(jobId, new SvelteSet(nodeIds));
    }
    addExecutedNode(jobId: string, nodeId: string) {
        if (!this.#executedNodeSet.has(jobId)) {
            this.#executedNodeSet.set(jobId, new SvelteSet<string>());
        }
        this.#executedNodeSet.get(jobId)?.add(nodeId);
    }
    addExecutedNodeSet(jobId: string, nodeIds: string[]) {
        if (!this.#executedNodeSet.has(jobId)) {
            this.#executedNodeSet.set(jobId, new SvelteSet<string>());
        }
        nodeIds.forEach((nodeId) => {
            this.#executedNodeSet.get(jobId)?.add(nodeId);
        });
    }
    deleteExecutedNodeSet(jobId: string) {
        this.#executedNodeSet.delete(jobId);
    }
    toExecuted(jobId: string) {
        this.#nodeSet.get(jobId)?.forEach((nodeId) => {
            this.#executedNodeSet.get(jobId)?.add(nodeId);
        });
    }

    clear() {
        this.#status = null;
        this.#label = null;
        this.#value = 0;
        this.#maxValue = 0;
        this.#nodeSet.clear();
        this.#executedNodeSet.clear();
    }
}

class ExecutionState {
    readonly #progress = $state(new Progress());
    #lastProcessedJobId = $state('');
    #executingNodeId = $state<string | null>();
    #batchCount = $state<number>(1);
    #queueCount = $state<number>(0);

    readonly #sanitizedNodeId = $derived(this.#executingNodeId?.split('.')?.at(-1) ?? null);
    readonly runningNodeId = $derived(this.#sanitizedNodeId?.split(':')?.at(0) ?? null);
    readonly labelNodeId = $derived(this.#sanitizedNodeId?.split(':')?.at(-1) ?? null);

    readonly totalProgress = $derived.by(() => {
        if (!this.lastProcessedJobId) {
            return 0;
        }
        const totalCount = this.progress.totalCount;
        if (totalCount === 0) return 0;

        let executedCount = this.progress.executedCount;
        if (this.executingNodeId) {
            executedCount += 0.2;
        }
        return (executedCount * 100) / totalCount;
    });

    readonly jobProgress = $derived.by(() => {
        const lastProcessedJobId = this.lastProcessedJobId;
        if (!lastProcessedJobId) {
            return 0;
        }
        const jobTotalCount = this.progress.nodeSet.get(lastProcessedJobId)?.size ?? 0;
        if (jobTotalCount === 0) return 0;

        let jobExecutedCount = this.progress.executedNodeSet.get(lastProcessedJobId)?.size ?? 0;
        if (this.executingNodeId) {
            jobExecutedCount += 0.2;
        }
        return (jobExecutedCount * 100) / jobTotalCount;
    });

    readonly nodeProgress = $derived.by(() => {
        if (this.progress.maxValue == 0) {
            return 0;
        }
        return (this.progress.value * 100) / this.progress.maxValue;
    });

    get progress(): Progress {
        return this.#progress;
    }
    get lastProcessedJobId(): Readonly<string> {
        return this.#lastProcessedJobId;
    }
    get executingNodeId(): Readonly<string | null> {
        return this.#executingNodeId;
    }
    get batchCount(): Readonly<number> {
        return this.#batchCount;
    }
    get queueCount(): Readonly<number> {
        return this.#queueCount;
    }

    set lastProcessedJobId(id: string) {
        this.#lastProcessedJobId = id;
    }
    set executingNodeId(id: string) {
        this.#executingNodeId = id;
    }
    set batchCount(batchCount: number) {
        this.#batchCount = batchCount;
    }
    set queueCount(queueCount: number) {
        this.#queueCount = queueCount;
    }

    clear() {
        this.#queueCount = 0;
        this.#progress.clear();
        this.#lastProcessedJobId = '';
    }

    execute() {
        appState.bridge?.queuePrompt(this.#batchCount);
    }

    interrupt() {
        appState.bridge?.interrupt();
    }

    clearQueue() {
        if (this.#queueCount > 0) {
            this.#queueCount = 1;
            const jobIds = this.#progress.nodeSet.keys();
            for (const jobId of jobIds) {
                if (jobId === this.#lastProcessedJobId) {
                    continue;
                }
                this.#progress.deleteNodeSet(jobId);
                this.#progress.deleteExecutedNodeSet(jobId);
            }
        }
        appState.bridge?.clearQueue();
    }
}

export const executionState = new ExecutionState();
