import { comfyGridApiClient } from '@/api/api-client';
import { workflowManager } from '@/managers/workflow-manager';
import { appState } from '@/states/app-state.svelte';
import type { WorkflowItem } from '@/types/workflow';

export class WorkflowState {
    items = $state<WorkflowItem[]>([]);
    selectedFolder = $state<string>('');
    selectedPath = $state<string | null>(null);
    isFavoriteView = $state<boolean>(false);
    searchQuery = $state<string>('');
    viewMode = $state<'grid' | 'list'>('grid');
    isLoading = $state<boolean>(false);
    renamingPath = $state<string | null>(null);
    renamingInput = $state<string>('');
    renamingPane = $state<'tree' | 'main' | null>(null);

    folders = $derived.by(() => {
        const folderPaths: string[] = [''];
        for (const item of this.items) {
            if (item.type === 'folder' && !folderPaths.includes(item.path)) {
                folderPaths.push(item.path);
            }
        }
        return folderPaths.sort((a, b) => a.localeCompare(b));
    });

    favoriteCount = $derived.by(() => {
        return this.items.filter((item) => item.type === 'file' && item.is_favorite).length;
    });

    currentFolderItems = $derived.by(() => {
        const query = this.searchQuery.trim().toLowerCase();
        return this.items.filter((item) => {
            if (query && !item.name.toLowerCase().includes(query)) {
                return false;
            }
            if (this.isFavoriteView) {
                return item.type === 'file' && item.is_favorite;
            }
            return item.parent === this.selectedFolder;
        });
    });

    async fetchWorkflows() {
        this.isLoading = true;
        try {
            const res = await comfyGridApiClient.getWorkflows();
            if (res.ok && res.json) {
                this.items = res.json.items;
            }
        } finally {
            this.isLoading = false;
        }
    }

    startRename(item: { name: string; path: string }, pane: 'tree' | 'main' = 'main') {
        this.renamingPath = item.path;
        this.renamingInput = item.name;
        this.renamingPane = pane;
    }

    cancelRename() {
        this.renamingPath = null;
        this.renamingInput = '';
        this.renamingPane = null;
    }

    async toggleFavorite(item: WorkflowItem) {
        if (item.type !== 'file') return;
        const nextState = !item.is_favorite;
        item.is_favorite = nextState;
        const res = await comfyGridApiClient.toggleWorkflowFavorite(item.path, nextState);
        if (res.ok && res.json) {
            item.is_favorite = res.json.is_favorite;
        }
    }

    async createFolder(folderName: string, parentFolder: string = this.selectedFolder) {
        if (!folderName.trim()) return;
        const targetPath = parentFolder ? `${parentFolder}/${folderName.trim()}` : folderName.trim();
        const res = await comfyGridApiClient.createWorkflowFolder(targetPath);
        if (res.ok) {
            await this.fetchWorkflows();
        }
    }

    async rename(oldPath: string, newName: string) {
        let finalName = newName.trim();
        if (!finalName) {
            this.cancelRename();
            return;
        }

        const item = this.items.find((i) => i.path === oldPath);
        if (item?.type === 'file' && !finalName.toLowerCase().endsWith('.json')) {
            finalName += '.json';
        }

        if (item?.name === finalName) {
            this.cancelRename();
            return;
        }

        const res = await comfyGridApiClient.renameWorkflow(oldPath, finalName);
        this.cancelRename();
        if (res.ok) {
            if (this.selectedFolder === oldPath && res.json?.new_path) {
                this.selectedFolder = res.json.new_path;
            }
            await this.fetchWorkflows();
        }
    }

    async move(sourcePath: string, targetDirPath: string) {
        const res = await comfyGridApiClient.moveWorkflow(sourcePath, targetDirPath);
        if (res.ok) {
            await this.fetchWorkflows();
        }
    }

    async delete(path: string) {
        const res = await comfyGridApiClient.deleteWorkflow(path);
        if (res.ok) {
            if (this.selectedPath === path) {
                this.selectedPath = null;
            }
            if (this.selectedFolder === path) {
                this.selectedFolder = '';
            }
            await this.fetchWorkflows();
        }
    }

    async loadWorkflowToComfyUI(item: WorkflowItem) {
        if (item.type !== 'file') return;
        const res = await comfyGridApiClient.getWorkflowContent(item.path);
        if (res.ok && res.json) {
            const app = appState.comfyUiState.app;
            if (app) {
                await app.loadGraphData(res.json, true, true, item.name, {
                    showMissingNodesDialog: true,
                    showMissingModelsDialog: true,
                });
                appState.uiState.activePageId = 'grid';
                appState.uiState.needRefresh = false;
                await workflowManager.loadCurrentWorkflow();
            }
        }
    }
}

export const workflowState = new WorkflowState();
