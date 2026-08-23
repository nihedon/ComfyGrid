import { tick } from 'svelte';
import { callLayoutChangedCallbacks } from '@/services/callback-service';
import { notifyNodeChanged } from '@/services/custom-node-service.svelte';
import { applyFloatingPositions, loadLayout, saveLayout } from '@/services/gridstack-service';
import { appState } from '@/states/app-state.svelte';
import { ComfyGridGroup, ComfyGridNode } from '@/states/model-state.svelte';
import type { BoardId } from '@/types/board';
import type { ComfyGroup, ComfyNode } from '@/types/comfy-model';
import type { FloatingPosition, LayoutType } from '@/types/layout';
import logger from '@/utils/logger';

function isGroupInGroup(child: ComfyGroup, parent: ComfyGroup): boolean {
    if (child.id === parent.id) return false;
    const [cx, cy, cw, ch] = child.boundingRect;
    const [px, py, pw, ph] = parent.boundingRect;
    const childArea = cw * ch;
    const parentArea = pw * ph;
    if (childArea <= 0 || parentArea <= childArea) return false;

    const overlapWidth = Math.max(0, Math.min(cx + cw, px + pw) - Math.max(cx, px));
    const overlapHeight = Math.max(0, Math.min(cy + ch, py + ph) - Math.max(cy, py));
    const overlapArea = overlapWidth * overlapHeight;

    return overlapArea >= childArea * 0.7;
}

function findParentGroup(child: ComfyGroup, allGroups: ComfyGroup[]): ComfyGroup | undefined {
    const candidates = allGroups
        .filter((parent) => parent.id !== child.id && isGroupInGroup(child, parent))
        .sort((a, b) => {
            const [, , aw, ah] = a.boundingRect;
            const [, , bw, bh] = b.boundingRect;
            return aw * ah - bw * bh;
        });
    return candidates[0];
}

class WorkflowManager {
    async loadCurrentWorkflow(layout?: LayoutType): Promise<void> {
        const payload = await appState.bridge?.getWorkflow();
        if (payload) {
            await this.handleWorkflow({ ...payload, layout });
        }
    }

    async handleWorkflow(payload: { graphId: string; name: string; nodes: ComfyNode[]; layout?: LayoutType }) {
        const { graphId, nodes: comfyNodes, name, layout: customLayout } = payload;

        const app = appState.comfyUiState.app;
        if (app?.rootGraph) {
            app.rootGraph.extra = app.rootGraph.extra || {};
            app.rootGraph.extra.comfygrid = app.rootGraph.extra.comfygrid || {};
            if (!app.rootGraph.extra.comfygrid.layout_id) {
                app.rootGraph.extra.comfygrid.layout_id = `test_layout_${Date.now()}`;
            }
            logger.log('Injected extra.comfygrid:', app.rootGraph.extra.comfygrid);
        }

        const nodes = ComfyGridNode.sortNodesByPosition(comfyNodes.map((n) => new ComfyGridNode(n, app)));

        const expandedMap = this.#collectExpandedState(appState.workspaceState.groups);

        const comfyGroupsMap = new Map<string, ComfyGroup>();
        for (const node of nodes) {
            for (const g of node.comfyGroups) {
                if (g.id != null) {
                    comfyGroupsMap.set(String(g.id), g);
                }
            }
        }
        const allComfyGroups = Array.from(comfyGroupsMap.values());

        const gridGroupsMap = new Map<string, ComfyGridGroup>();
        for (const g of allComfyGroups) {
            const groupId = String(g.id);
            gridGroupsMap.set(
                groupId,
                new ComfyGridGroup(g, {
                    expanded: !!expandedMap.get(groupId),
                }),
            );
        }

        const rootGroups: ComfyGridGroup[] = [];
        for (const g of allComfyGroups) {
            const gridGroup = gridGroupsMap.get(String(g.id))!;
            const parentComfyGroup = findParentGroup(g, allComfyGroups);
            if (parentComfyGroup) {
                const parentGridGroup = gridGroupsMap.get(String(parentComfyGroup.id));
                if (parentGridGroup) {
                    parentGridGroup.addChild(gridGroup);
                } else {
                    rootGroups.push(gridGroup);
                }
            } else {
                rootGroups.push(gridGroup);
            }
        }

        for (const node of nodes) {
            if (node.comfyGroups.length > 0) {
                gridGroupsMap.get(String(node.comfyGroups.at(-1).id))?.addNode(node);
                node.groups = node.comfyGroups.map((g) => gridGroupsMap.get(String(g.id))).filter(Boolean);
            } else {
                let ungrouped = gridGroupsMap.get('__ungrouped__');
                if (!ungrouped) {
                    ungrouped = new ComfyGridGroup(null, {
                        expanded: expandedMap.get(undefined) ?? false,
                    });
                    gridGroupsMap.set('__ungrouped__', ungrouped);
                    rootGroups.unshift(ungrouped);
                }
                ungrouped.addNode(node);
            }
        }

        const loadedLayout = customLayout ?? loadLayout(graphId);
        if (customLayout) {
            saveLayout(customLayout);
        }
        const { floatingPositions: orgFloatingPositions, floatingNodes: orgFloatingNodes, floatingWidgets: orgFloatingWidgets } = loadedLayout;

        const floatingNodes: Record<string, BoardId> = {};
        const floatingWidgets: Record<string, BoardId> = {};
        for (const node of nodes) {
            floatingNodes[node.id] = orgFloatingNodes?.[node.id] ?? '';
            node.widgets
                .filter((w) => w.type === 'customtext')
                .forEach((w) => {
                    floatingWidgets[w.id] = orgFloatingWidgets?.[w.id] ?? '';
                });
        }

        const layout: LayoutType = {
            ...loadedLayout,
            graphId: graphId,
            floatingNodes,
            floatingWidgets,
            sortOrder: loadedLayout.sortOrder ?? 'default',
        };

        appState.workspaceState.setGroups(rootGroups);
        appState.workspaceState.setNodes(nodes);
        appState.workspaceState.layout.import(layout);

        appState.name = name;

        await tick();
        applyFloatingPositions(undefined, this.#rearrangeFloatingPositions(orgFloatingPositions, nodes));
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
