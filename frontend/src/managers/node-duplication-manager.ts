import { NodeDuplicationError } from '@/bridge/node-duplication';
import { saveLayout } from '@/services/gridstack-service';
import { appState } from '@/states/app-state.svelte';
import type { ComfyGridNode } from '@/states/model-state.svelte';
import { workflowManager } from './workflow-manager';

class NodeDuplicationManager {
    #isDuplicating = false;

    async duplicateNode(source: ComfyGridNode): Promise<void> {
        if (this.#isDuplicating || !appState.bridge) throw new NodeDuplicationError('unavailable');
        this.#isDuplicating = true;
        try {
            const layout = appState.workspaceState.layout.export();
            const clone = appState.bridge.duplicateNode({ nodeId: source.id });
            const cloneId = String(clone.id);
            if (layout.floatingNodes[source.id]) layout.floatingNodes[cloneId] = layout.floatingNodes[source.id];
            for (const widget of source.widgets) {
                const copiedId = `${cloneId}_${widget.index}`;
                if (layout.floatingWidgets[widget.id]) layout.floatingWidgets[copiedId] = layout.floatingWidgets[widget.id];
                if (layout.tagWidgetIds?.includes(widget.id)) layout.tagWidgetIds.push(copiedId);
                if (layout.translateWidgetIds?.includes(widget.id)) layout.translateWidgetIds.push(copiedId);
                if (layout.jsonWidgetIds?.includes(widget.id)) layout.jsonWidgetIds.push(copiedId);
                if (layout.codeMirrorWidgetIds?.includes(widget.id)) layout.codeMirrorWidgetIds.push(copiedId);
                if (layout.translateModels?.[widget.id]) layout.translateModels[copiedId] = layout.translateModels[widget.id];
                if (layout.translateSystems?.[widget.id]) layout.translateSystems[copiedId] = layout.translateSystems[widget.id];
                if (layout.translateSeedModes?.[widget.id]) layout.translateSeedModes[copiedId] = layout.translateSeedModes[widget.id];
            }
            saveLayout(layout);
            await workflowManager.loadCurrentWorkflow();
        } finally {
            this.#isDuplicating = false;
        }
    }
}

export const nodeDuplicationManager = new NodeDuplicationManager();
