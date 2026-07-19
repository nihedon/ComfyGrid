import { tick } from 'svelte';
import { callLayoutChangedCallbacks } from '@/services/callback-service';
import { notifyNodeChanged } from '@/services/custom-node-service.svelte';
import { applyFloatingPositions, loadLayout } from '@/services/gridstack-service';
import { appState } from '@/states/app-state.svelte';
import { ComfyGridGroup, ComfyGridNode } from '@/states/model-state.svelte';
import type { BoardId } from '@/types/board';
import type { FloatingPosition, LayoutType } from '@/types/layout';

class WorkflowManager {
    async handleWorkflow(payload: { graphId: string; name: string; nodes: ComfyGridNode[] }) {
        const { graphId, nodes, name } = payload;

        const sortedNodes = ComfyGridNode.sortNodesByPosition(nodes);

        const loadedLayout = loadLayout(graphId);
        const { floatingPositions: orgFloatingPositions, floatingNodes: orgFloatingNodes, floatingWidgets: orgFloatingWidgets } = loadedLayout;

        const expandedMap = this.#collectExpandedState(appState.workspaceState.groups);

        const floatingNodes: Record<string, BoardId> = {};
        const floatingWidgets: Record<string, BoardId> = {};
        const rootGroups: ComfyGridGroup[] = [];
        const groupMap = new Map<string, ComfyGridGroup>();

        for (const node of sortedNodes) {
            if (this.#isIgnoreNode(node)) {
                continue;
            }

            floatingNodes[node.id] = orgFloatingNodes?.[node.id] ?? '';
            node.widgets
                .filter((w) => w.type === 'customtext')
                .forEach((w) => {
                    floatingWidgets[w.id] = orgFloatingWidgets?.[w.id] ?? '';
                });

            if (!node.groups || node.groups.length === 0) {
                let ungrouped = groupMap.get('__ungrouped__');
                if (!ungrouped) {
                    ungrouped = new ComfyGridGroup(null, {
                        expanded: expandedMap.get(undefined) ?? false,
                    });
                    groupMap.set('__ungrouped__', ungrouped);
                    rootGroups.unshift(ungrouped);
                }
                ungrouped.addNode(node);
                continue;
            }

            let parentChildren = rootGroups;
            let currentGroup: ComfyGridGroup | undefined;
            const nodeGroups: ComfyGridGroup[] = [];

            for (let i = 0; i < node.comfyGroups.length; i++) {
                const g = node.comfyGroups[i];
                currentGroup = groupMap.get(g.id);

                if (!currentGroup) {
                    currentGroup = new ComfyGridGroup(g, {
                        expanded: expandedMap.get(g.id) ?? false,
                    });
                    groupMap.set(g.id, currentGroup);
                    parentChildren.push(currentGroup);
                }

                nodeGroups.push(currentGroup);

                if (i === node.comfyGroups.length - 1) {
                    currentGroup.addNode(node);
                }

                parentChildren = currentGroup.children as ComfyGridGroup[];
            }

            node.groups = nodeGroups;
        }

        const layout: LayoutType = {
            ...loadedLayout,
            graphId: graphId,
            floatingNodes,
            floatingWidgets,
            sortOrder: loadedLayout.sortOrder ?? 'default',
        };

        appState.workspaceState.setGroups(rootGroups);
        appState.workspaceState.setNodes(sortedNodes);
        appState.workspaceState.layout.import(layout);

        appState.name = name;

        await tick();
        applyFloatingPositions(undefined, this.#rearrangeFloatingPositions(orgFloatingPositions, sortedNodes));
        await tick();
        callLayoutChangedCallbacks();
    }

    async handleUpdateNode(payload: { nodeId: string }) {
        if (appState.uiState.activePageId !== 'grid') return;
        const { nodeId } = payload;

        const node = appState.workspaceState.getRealNode(nodeId);
        if (node) {
            node.updateWidgets(appState.comfyUiState.app);
            setTimeout(() => {
                notifyNodeChanged(node.id, node);
            }, 100);
        }
    }

    #rearrangeFloatingPositions(
        orgFloatingPositions: Record<string, Record<string, FloatingPosition>>,
        nodes: ComfyGridNode[],
    ): Record<string, Record<string, FloatingPosition>> {
        const validIds = new Set<string>();
        for (const node of nodes) {
            validIds.add(node.id);
            for (const widget of node.widgets) {
                validIds.add(String(widget.id));
            }
        }

        const floatingPositions: Record<string, Record<string, FloatingPosition>> = {};
        Object.entries(orgFloatingPositions).forEach(([position, gsws]) => {
            Object.entries(gsws)
                .filter(([id]) => validIds.has(id))
                .forEach(([id, gsw]) => {
                    if (!floatingPositions[position]) {
                        floatingPositions[position] = {};
                    }
                    floatingPositions[position][id] = gsw;
                });
        });
        return floatingPositions;
    }

    #isIgnoreNode(node: ComfyGridNode) {
        if (node.type.endsWith('Note')) {
            return true;
        }
        if (node.type === 'Reroute') {
            return true;
        }
        return false;
    }

    exportLayout() {
        if (appState.workspaceState.gridStackBoards.size === 0) return;
        if (!appState.workspaceState.layout) return;

        const layout = { comfygrid: appState.workspaceState.layout.export() };
        this.#download(layout, `[comfygrid]_${appState.name}(${appState.workspaceState.layout.graphId})_layout.json`);
    }

    exportWorkflow(workflow: Record<string, unknown>) {
        this.#download(workflow, `[comfygrid]_${appState.name}(${appState.workspaceState.layout.graphId})_workflow.json`);
    }

    exportAll(comfyUiWorkflow: Record<string, unknown>) {
        if (appState.workspaceState.gridStackBoards.size === 0) return;
        if (!appState.workspaceState.layout) return;

        const combined = {
            ...comfyUiWorkflow,
            comfygrid: appState.workspaceState.layout.export(),
        };
        this.#download(combined, `[comfygrid]_${appState.name}(${appState.workspaceState.layout.graphId}).json`);
    }

    #download(data: Record<string, unknown>, fileName: string) {
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute('href', dataStr);
        dlAnchorElem.setAttribute('download', fileName);
        dlAnchorElem.click();
        dlAnchorElem.remove();
    }

    #collectExpandedState(groups: readonly ComfyGridGroup[]): Map<string | undefined, boolean> {
        const map = new Map<string | undefined, boolean>();
        for (const group of groups) {
            map.set(group.id, group.expanded);
            if (group.children.length > 0) {
                for (const [key, value] of this.#collectExpandedState(group.children)) {
                    map.set(key, value);
                }
            }
        }
        return map;
    }
}

export const workflowManager = new WorkflowManager();
