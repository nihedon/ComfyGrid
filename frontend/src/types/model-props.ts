import type { ComfyGraph, ComfyGroup, ComfyNode, ComfyWidget } from './comfy-model';
import type { ComfyNodeMode, ImageInfo } from './model-shared';

export interface GroupProps {
    comfyGroup: ComfyGroup | null;
    id: string;
    title: string;
    color: string | null;
    pos: { x: number; y: number };
}

export interface NodeProps {
    comfyNode: ComfyNode;
    id: string;
    parentNodeId: string | undefined;
    title: string;
    type: string | null;
    pos: {
        x: number;
        y: number;
    };
    collapsed: boolean;
    hasOutputNode: boolean | undefined;
    mode: ComfyNodeMode;
    bgcolor: string | null;
    inputs: { id: string; slot: string }[] | null;
    outputs: { id: string; slot: string }[][] | null;
    widgets: WidgetProps[];
    groups: GroupProps[];
    properties: unknown;
    comfyClass: string | undefined;
    constructorName: string | undefined;
    subgraph?: ComfyGraph;
}

export interface WidgetProps {
    comfyNode: ComfyNode;
    comfyWidget: ComfyWidget;
    id: string;
    index: number;
    slot: number;
    label: string | undefined;
    name: string;
    tooltip: string | null;
    type: string;
    value: unknown;
    image: ImageInfo;
    input: { id: string; slot: string } | null;
    element: HTMLElement;
    readonly: boolean;
    options: unknown;
    className: string;
    callback: (value?: unknown) => void;
}
