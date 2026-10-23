import { saveLayout } from '@/services/gridstack-service';
import { appState } from '@/states/app-state.svelte';
import type { ComfyGridNode } from '@/states/model-state.svelte';
import { workflowManager } from './workflow-manager';

class NodeRemovalManager {
    #isRemoving = false;

    async deleteNode(node: ComfyGridNode): Promise<void> {
        if (this.#isRemoving || !appState.bridge) throw new Error('Node deletion is unavailable');
        this.#isRemoving = true;
        try {
            const layout = appState.workspaceState.layout.export();
            appState.bridge.deleteNode({ nodeId: node.id });
            const widgetIds = new Set(node.widgets.map((widget) => widget.id));
            const removedIds = new Set([node.id, ...widgetIds]);
            delete layout.floatingNodes[node.id];
            for (const id of widgetIds) {
                delete layout.floatingWidgets[id];
                if (layout.translateModels) delete layout.translateModels[id];
                if (layout.translateSystems) delete layout.translateSystems[id];
                if (layout.translateSeedModes) delete layout.translateSeedModes[id];
            }
            for (const positions of Object.values(layout.floatingPositions)) {
                for (const id of removedIds) delete positions[id];
            }
            layout.tagWidgetIds = layout.tagWidgetIds?.filter((id) => !widgetIds.has(id));
            layout.jsonWidgetIds = layout.jsonWidgetIds?.filter((id) => !widgetIds.has(id));
            layout.promptEditorWidgetIds = layout.promptEditorWidgetIds?.filter((id) => !widgetIds.has(id));
            layout.translateWidgetIds = layout.translateWidgetIds?.filter((id) => !widgetIds.has(id));
            saveLayout(layout);
            await workflowManager.loadCurrentWorkflow(layout);
        } finally {
            this.#isRemoving = false;
        }
    }
}

export const nodeRemovalManager = new NodeRemovalManager();
