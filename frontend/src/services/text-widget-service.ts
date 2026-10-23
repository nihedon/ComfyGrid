import { tick } from 'svelte';
import { callLayoutChangedCallbacks } from '@/services/callback-service';
import { saveLayoutObject } from '@/services/gridstack-service';
import { appState } from '@/states/app-state.svelte';
import type { ComfyGridWidget } from '@/states/model-state.svelte';

export const TEXT_CATEGORIES = ['text', 'prompt', 'json', 'translate'] as const;
export type TextCategory = (typeof TEXT_CATEGORIES)[number];

export function getTextCategory(widget: ComfyGridWidget): TextCategory {
    const layout = appState.workspaceState.layout;
    if (layout.isJsonWidget(widget.id)) return 'json';
    if (layout.isPromptEditorWidget(widget.id)) return 'prompt';
    if (layout.isTranslateWidget(widget.id)) return 'translate';
    return 'text';
}

export async function setTextCategory(widget: ComfyGridWidget, category: TextCategory) {
    if (getTextCategory(widget) === category) return;
    const layout = appState.workspaceState.layout;
    layout.deleteTagWidgetId(widget.id);
    layout.deleteTranslateWidgetId(widget.id);
    layout.setJsonWidget(widget.id, category === 'json');
    layout.setPromptEditorWidget(widget.id, category === 'prompt');
    if (category === 'prompt') layout.addTagWidgetId(widget.id);
    else if (category === 'translate') {
        layout.addTranslateWidgetId(widget.id);
        widget.initializeRawValue();
    }
    saveLayoutObject(layout);
    await tick();
    callLayoutChangedCallbacks();
}

export async function toggleTextTags(widget: ComfyGridWidget) {
    const category = getTextCategory(widget);
    if (category !== 'prompt' && category !== 'json') return;
    const layout = appState.workspaceState.layout;
    if (layout.isTagWidget(widget.id)) layout.deleteTagWidgetId(widget.id);
    else layout.addTagWidgetId(widget.id);
    saveLayoutObject(layout);
    await tick();
    callLayoutChangedCallbacks();
}
