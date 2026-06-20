import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import { comfyUiApiClient } from '@/api/api-client';
import { appState } from './app-state.svelte';

type Status = 'processing' | 'error' | 'interrupted' | null;

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
    #processingJobId = $state('');
    #executingNodeId = $state<string | null>();
    #batchCount = $state<number>(1);
    readonly #queueJobIds = $state<SvelteMap<string, 'owned' | 'external'>>(new SvelteMap());

    readonly #sanitizedNodeId = $derived(this.#executingNodeId?.split('.')?.at(-1) ?? null);
    readonly runningNodeId = $derived(this.#sanitizedNodeId?.split(':')?.at(0) ?? null);
    readonly labelNodeId = $derived(this.#sanitizedNodeId?.split(':')?.at(-1) ?? null);

    readonly totalProgress = $derived.by(() => {
        if (!this.processingJobId) {
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
        const processingJobId = this.processingJobId;
        if (!processingJobId) {
            return 0;
        }
        const jobTotalCount = this.progress.nodeSet.get(processingJobId)?.size ?? 0;
        if (jobTotalCount === 0) return 0;

        let jobExecutedCount = this.progress.executedNodeSet.get(processingJobId)?.size ?? 0;
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
    get processingJobId(): Readonly<string> {
        return this.#processingJobId;
    }
    get executingNodeId(): Readonly<string | null> {
        return this.#executingNodeId;
    }
    get batchCount(): Readonly<number> {
        return this.#batchCount;
    }
    get queueJobIds(): ReadonlyMap<string, 'owned' | 'external'> {
        return this.#queueJobIds;
    }

    setProcessingJobId(jobId: string) {
        const processingJobId = this.#processingJobId;
        if (processingJobId !== jobId) {
            this.#processingJobId = jobId;
        }
    }
    set executingNodeId(id: string) {
        this.#executingNodeId = id;
    }
    set batchCount(batchCount: number) {
        this.#batchCount = batchCount;
    }
    addQueueJobId(jobId: string, owner: 'owned' | 'external') {
        this.#queueJobIds.set(jobId, owner);
    }
    deleteQueueJobId(jobId: string): boolean {
        return this.#queueJobIds.delete(jobId);
    }
    clearQueueJobIds() {
        this.#queueJobIds.clear();
        this.#progress.clear();
        this.#processingJobId = '';
    }

    execute() {
        appState.bridge?.queuePrompt(this.#batchCount);
    }

    interrupt() {
        comfyUiApiClient.interrupt();
    }

    deleteQueue(jobId: string) {
        this.#progress.deleteNodeSet(jobId);
        this.#progress.deleteExecutedNodeSet(jobId);
        comfyUiApiClient.deleteQueues([jobId]);
    }

    clearQueue() {
        if (this.#queueJobIds.size > 0) {
            const [jobId, owner] = this.#queueJobIds.entries().next().value;
            this.#queueJobIds.clear();
            this.#queueJobIds.set(jobId, owner);
            const jobIds = this.#progress.nodeSet.keys();
            for (const jobId of jobIds) {
                if (jobId === this.#processingJobId) {
                    continue;
                }
                this.#progress.deleteNodeSet(jobId);
                this.#progress.deleteExecutedNodeSet(jobId);
            }
        }
        comfyUiApiClient.clearQueues();
    }
}

export const executionState = new ExecutionState();
