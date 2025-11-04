import type { Component } from 'svelte';
import { ComfyGridNode, ComfyGridWidget } from '@/states/model-state.svelte';
import AudioPlayerWidget from '../AudioPlayerWidget.svelte';
import ButtonWidget from '../ButtonWidget.svelte';
import ComboWidget from '../ComboWidget.svelte';
import CustomtextWidget from '../CustomtextWidget.svelte';
import DOMWidget from '../DOMWidget.svelte';
import ImageEditorWidget from '../ImageEditorWidget.svelte';
import ImagePreviewWidget from '../ImagePreviewWidget.svelte';
import NumberWidget from '../NumberWidget.svelte';
import RangeWidget from '../RangeWidget.svelte';
import TextWidget from '../TextWidget.svelte';
import ToggleWidget from '../ToggleWidget.svelte';
import UploadWidget from '../UploadWidget.svelte';
import VideoPreviewWidget from '../VideoPreviewWidget.svelte';
import type { ExtensionMatchResult } from './extension-loader';
import { matchExtensionWithMeta, shouldIgnore } from './extension-loader';

const widgetRegistry: Record<string, Component> = {
    number: NumberWidget,
    combo: ComboWidget,
    toggle: ToggleWidget,
    slider: RangeWidget,
    button: ButtonWidget,
    customtext: CustomtextWidget,
    text: TextWidget,
    upload: UploadWidget,
    image: ImageEditorWidget,
    video: VideoPreviewWidget,
    audio: AudioPlayerWidget,
    ImagePreviewWidget: ImagePreviewWidget,
    DOMWidget: DOMWidget,
};

/**
 * Get the appropriate widget component with metadata for a node/widget pair.
 * Returns component (Svelte) or customElement (Custom Element tag name), or null.
 */
export const getWidgetComponentWithMeta = (node: ComfyGridNode, widget: ComfyGridWidget): ExtensionMatchResult | null => {
    if (shouldIgnore(node)) {
        return null;
    }

    const extensionMatch = matchExtensionWithMeta(node, widget);
    if (extensionMatch) {
        return extensionMatch;
    }

    const coreComponent = widgetRegistry[widget.type];
    if (coreComponent) {
        return { component: coreComponent };
    }

    if (widget.className === 'ImagePreviewWidget') {
        return { component: widgetRegistry['ImagePreviewWidget'] };
    }

    if (widget.className === 'DOMWidgetImpl') {
        return { component: widgetRegistry['DOMWidget'] };
    }

    return null;
};
