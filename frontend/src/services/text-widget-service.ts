import { tick } from 'svelte';
import { callLayoutChangedCallbacks } from '@/services/callback-service';
import { saveLayoutObject } from '@/services/gridstack-service';
import { appState } from '@/states/app-state.svelte';
import type { ComfyGridWidget } from '@/states/model-state.svelte';

export const TEXT_CATEGORIES = ['text', 'codemirror', 'json', 'tags', 'translate'] as const;
export type TextCategory = (typeof TEXT_CATEGORIES)[number];

export function getTextCategory(widget: ComfyGridWidget): TextCategory {
    const layout = appState.workspaceState.layout;
    if (layout.isJsonWidget(widget.id)) return 'json';
    if (layout.isCodeMirrorWidget(widget.id)) return 'codemirror';
    if (layout.isTranslateWidget(widget.id)) return 'translate';
    if (layout.isTagWidget(widget.id)) return 'tags';
    return 'text';
}

export async function setTextCategory(widget: ComfyGridWidget, category: TextCategory) {
    if (getTextCategory(widget) === category) return;
    const layout = appState.workspaceState.layout;
    layout.deleteTagWidgetId(widget.id);
    layout.deleteTranslateWidgetId(widget.id);
    layout.setJsonWidget(widget.id, category === 'json');
    layout.setCodeMirrorWidget(widget.id, category === 'codemirror');
    if (category === 'tags') layout.addTagWidgetId(widget.id);
    else if (category === 'translate') {
        layout.addTranslateWidgetId(widget.id);
        widget.initializeRawValue();
    }
    saveLayoutObject(layout);
    await tick();
    callLayoutChangedCallbacks();
}
