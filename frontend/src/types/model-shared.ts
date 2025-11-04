import type { LGraphCanvas } from 'litegraph.js';
import type { ComfyNode, ComfyWidget } from './comfy-model';

export type WidgetContext = {
    node: ComfyNode;
    widget: ComfyWidget;
    canvas: LGraphCanvas;
};

export const COMFY_NODE_MODE = {
    NORMAL: 0,
    MUTE: 4,
    BYPASS: 2,
} as const;

export type ComfyNodeMode = (typeof COMFY_NODE_MODE)[keyof typeof COMFY_NODE_MODE];

export type ImageInfo = {
    type: string;
    filename: string;
    subfolder: string;
};

export interface ComfyLink {
    origin_id: number;
    origin_slot: number;
    target_id: number;
    target_slot: number;
}

export type ComfyExtension = {
    name: string;
    setup?: () => void;
    afterConfigureGraph?: () => Promise<void> | void;
};

export type PromptData = {
    output: Record<number, unknown>;
    workflow?: unknown;
};

export type QueuePromptResponse = {
    prompt_id: string;
    number: number;
    node_errors?: Record<string, unknown>;
};
