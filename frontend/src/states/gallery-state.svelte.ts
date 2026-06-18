import { SvelteMap } from 'svelte/reactivity';
import { comfyGridApiClient } from '@/api/api-client';
import { appState } from './app-state.svelte';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeneratedAssets = {
    originalSingle?: string;
    originalCompare?: string[];
    mediumSingle?: string; // blob URL, runtime only
    mediumCompare?: string[]; // blob URLs, runtime only
    videoSingle?: string;
    isVideo?: boolean;
    thumbnail: string;
};

/** Internal storage node (held in memory). */
type GalleryNodeRecord = {
    nodeId: string;
    batchJobIndex: number;
    nodeName: string;
    assets?: GeneratedAssets;
    saved: boolean;
    downloaded: boolean;
    previewUrl?: string;
};

/** Internal storage job (held in memory). */
type GalleryJobRecord = {
    jobId: string;
    completed: boolean;
    createdAt: number;
    duration?: number;
    metadata?: Record<string, string>;
    viewed: boolean;
    nodes: GalleryNodeRecord[];
};

// ---------------------------------------------------------------------------
// Display types – exported and consumed by Gallery.svelte / GalleryManager
// ---------------------------------------------------------------------------

/** Represents a job entry in the gallery thumbnail strip. */
export type GalleryJob = {
    jobId: string;
    thumbnail: string;
    isPreview: boolean;
    hasPreviewNode: boolean;
    hasSaved: boolean;
    completed: boolean;
    viewed: boolean;
    metadata?: Record<string, string>;
};

/** Represents a node entry in the node thumbnail strip and main viewer. */
export type GalleryNode = {
    jobId: string;
    nodeId: string;
    nodeIndex: number;
    batchJobIndex: number;
    thumbnail: string;
    isPreview: boolean;
    saved: boolean;
    nodeName: string;
    assets?: GeneratedAssets;
    previewUrl?: string;
};

// ---------------------------------------------------------------------------
// GalleryState – pure in-memory state, no persistence
// ---------------------------------------------------------------------------

class GalleryState {
    readonly #jobs = new SvelteMap<string, GalleryJobRecord>();

    #selectedJobIndex = $state<number>(0);
    #selectedNodeIndex = $state<number | undefined>();
    #selectedCompareIndex = $state<number>(0);

    #makeGalleryJob(record: GalleryJobRecord): GalleryJob | undefined {
        const visibleNodes = record.nodes.filter((n) => n.assets?.thumbnail || n.previewUrl);
        if (visibleNodes.length === 0) return undefined;

        const selected = this.#selectedNodeIndex >= 0 ? (visibleNodes[this.#selectedNodeIndex] ?? visibleNodes.at(-1)) : visibleNodes.at(-1);
        if (!selected) return undefined;

        const thumbnail = selected.previewUrl ?? selected.assets?.thumbnail ?? '';
        const isPreview = Boolean(selected.previewUrl && !selected.assets);
        const hasPreviewNode = record.nodes.some((n) => n.previewUrl && !n.assets);
        const hasSaved = record.nodes.some((n) => n.saved);
        const isExternal = record.metadata?.owner === 'external';

        return {
            jobId: record.jobId,
            thumbnail,
            isPreview,
            hasPreviewNode,
            hasSaved,
            viewed: record.viewed,
            completed: isExternal ? !hasPreviewNode : record.completed,
            metadata: record.metadata,
        };
    }

    #makeGalleryNodes(record: GalleryJobRecord): GalleryNode[] {
        return record.nodes
            .filter((n) => n.assets?.thumbnail || n.previewUrl)
            .map((n, index) => ({
                jobId: record.jobId,
                nodeId: n.nodeId,
                nodeIndex: index,
                batchJobIndex: n.batchJobIndex,
                thumbnail: n.previewUrl ?? n.assets?.thumbnail ?? '',
                isPreview: Boolean(n.previewUrl && !n.assets),
                saved: n.saved,
                nodeName: n.nodeName || appState.workspaceState.getRealNode(n.nodeId)?.title || n.nodeId,
                assets: n.assets,
                previewUrl: n.previewUrl,
            }));
    }

    readonly galleryJobs = $derived.by<GalleryJob[]>(() => {
        const result: GalleryJob[] = [];
        for (const record of this.#jobs.values()) {
            const view = this.#makeGalleryJob(record);
            if (view) result.push(view);
        }
        return result;
    });

    readonly currentJobIndex = $derived.by(() => {
        if (this.galleryJobs.length === 0) return 0;
        return Math.max(0, Math.min(this.#selectedJobIndex, this.galleryJobs.length - 1));
    });

    readonly currentGalleryJob = $derived<GalleryJob | undefined>(this.galleryJobs[this.currentJobIndex]);

    readonly currentGalleryNodes = $derived.by<GalleryNode[]>(() => {
        const record = this.#jobs.get(this.currentGalleryJob?.jobId ?? '');
        if (!record) return [];
        return this.#makeGalleryNodes(record);
    });

    readonly currentGalleryNode = $derived<GalleryNode | undefined>(this.currentGalleryNodes[this.#selectedNodeIndex] ?? this.currentGalleryNodes.at(-1));

    // -----------------------------------------------------------------------
    // Selectors
    // -----------------------------------------------------------------------

    get selectedJobIndex() {
        return this.#selectedJobIndex;
    }
    get selectedNodeIndex() {
        return this.#selectedNodeIndex;
    }
    get selectedCompareIndex() {
        return this.#selectedCompareIndex;
    }

    set selectedJobIndex(value: number) {
        this.#selectedJobIndex = value;
    }
    set selectedNodeIndex(value: number | undefined) {
        this.#selectedNodeIndex = value;
    }
    set selectedCompareIndex(value: number) {
        this.#selectedCompareIndex = value;
    }

    hasJob(jobId: string): boolean {
        return this.#jobs.has(jobId);
    }

    isJobCompleted(jobId: string): boolean | undefined {
        return this.#jobs.get(jobId)?.completed;
    }

    getIncompleteJobIds(): string[] {
        return [...this.#jobs.values()].filter((r) => !r.completed).map((r) => r.jobId);
    }

    upsertJob(jobId: string, partial: Partial<Omit<GalleryJobRecord, 'nodes'>>): void {
        const existing = this.#jobs.get(jobId);
        if (existing) {
            Object.assign(existing, partial);
        } else {
            const stateJob = $state({
                jobId,
                completed: false,
                createdAt: Date.now(),
                viewed: false,
                nodes: [],
                ...partial,
            });
            this.#jobs.set(jobId, stateJob);
        }
    }

    upsertNode(jobId: string, node: GalleryNodeRecord): void {
        const record = this.#jobs.get(jobId);
        if (!record) return;
        const idx = record.nodes.findIndex((n) => n.nodeId === node.nodeId && n.batchJobIndex === node.batchJobIndex);
        if (idx >= 0) {
            record.nodes[idx] = node;
        } else {
            record.nodes.push(node);
        }
    }

    markCompleted(jobId: string, duration: number): void {
        const record = this.#jobs.get(jobId);
        if (!record) return;
        record.completed = true;
        record.duration = duration;
    }

    /** Removes preview-only nodes (e.g. KSampler) that have no final assets yet. Called after onImageGenerated. */
    removePreviewOnlyNodes(jobId: string): void {
        const record = this.#jobs.get(jobId);
        if (!record) return;
        record.nodes = record.nodes.filter((n) => !(n.previewUrl && !n.assets));
    }

    // -----------------------------------------------------------------------
    // User action methods
    // -----------------------------------------------------------------------

    markViewed(jobId: string): void {
        const record = this.#jobs.get(jobId);
        if (!record || record.viewed) return;
        record.viewed = true;
        comfyGridApiClient.patchJobViewed(jobId);
    }

    markSaved(jobId: string, nodeId: string, batchJobIndex: number): void {
        const node = this.#findNode(jobId, nodeId, batchJobIndex);
        if (!node) return;
        node.saved = true;
    }

    markDownloaded(jobId: string, nodeId: string, batchJobIndex: number): void {
        const node = this.#findNode(jobId, nodeId, batchJobIndex);
        if (!node) return;
        node.downloaded = true;
    }

    deleteJob(jobId: string): void {
        this.#revokeAndDelete(jobId);
    }

    clearSavedJobs(): void {
        const toDelete = [...this.#jobs.values()]
            .filter((r) => {
                const view = this.#makeGalleryJob(r);
                return view && view.completed && r.nodes.some((n) => n.saved);
            })
            .map((r) => r.jobId);
        toDelete.forEach((id) => this.#revokeAndDelete(id));
    }

    clearViewedJobs(): void {
        const toDelete = [...this.#jobs.values()]
            .filter((r) => {
                const view = this.#makeGalleryJob(r);
                return view && view.completed && view.viewed;
            })
            .map((r) => r.jobId);
        toDelete.forEach((id) => this.#revokeAndDelete(id));
    }

    clearAllJobs(): void {
        const toDelete = [...this.#jobs.values()]
            .filter((r) => {
                const view = this.#makeGalleryJob(r);
                return view && view.completed;
            })
            .map((r) => r.jobId);
        toDelete.forEach((id) => this.#revokeAndDelete(id));
    }

    // -----------------------------------------------------------------------
    // Lazy medium URL restoration
    // -----------------------------------------------------------------------

    async ensureMediumUrls(jobId: string, nodeId: string, batchJobIndex: number): Promise<void> {
        const node = this.#findNode(jobId, nodeId, batchJobIndex);
        if (!node?.assets) return;
        if (node.assets.mediumSingle || node.assets.mediumCompare || node.assets.isVideo) return;

        if (node.assets.originalSingle) {
            const res = await comfyGridApiClient.getResize(node.assets.originalSingle, 1024);
            if (res.ok) {
                node.assets.mediumSingle = URL.createObjectURL(res.blob);
            }
        } else if (node.assets.originalCompare) {
            const blobs = await Promise.all(
                node.assets.originalCompare.map(async (url) => {
                    const res = await comfyGridApiClient.getResize(url, 1024);
                    if (res.ok) return res.blob;
                }),
            );
            node.assets.mediumCompare = blobs.map((b) => URL.createObjectURL(b));
        }
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    #findNode(jobId: string, nodeId: string, batchJobIndex: number): GalleryNodeRecord | undefined {
        return this.#jobs.get(jobId)?.nodes.find((n) => n.nodeId === nodeId && n.batchJobIndex === batchJobIndex);
    }

    #revokeAndDelete(jobId: string): void {
        const record = this.#jobs.get(jobId);
        if (!record) return;
        for (const node of record.nodes) {
            if (!node.assets || node.assets.isVideo) continue;
            if (node.assets.mediumSingle) URL.revokeObjectURL(node.assets.mediumSingle);
            node.assets.mediumCompare?.forEach((u) => URL.revokeObjectURL(u));
        }
        this.#jobs.delete(jobId);
    }
}

export const galleryState = new GalleryState();
