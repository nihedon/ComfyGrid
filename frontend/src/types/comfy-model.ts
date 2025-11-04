import type { INodeInputSlot, LGraph, LGraphCanvas, LGraphGroup, LGraphNode } from 'litegraph.js';
import type { ComfyExtension, ComfyLink, ImageInfo, PromptData, QueuePromptResponse, WidgetContext } from './model-shared';

interface ComfyInputNodeSlot extends INodeInputSlot {
    widget?: ComfyWidget;
}

export interface ComfyApp {
    /** @deprecated use rootGraph instead */
    graph: ComfyGraph;
    rootGraph: ComfyGraph;
    canvas: LGraphCanvas;
    loadGraphData(
        json: unknown,
        arg1: boolean,
        arg2: boolean,
        filename: string,
        arg4: { showMissingNodesDialog: boolean; showMissingModelsDialog: boolean },
    ): unknown;
    queuePrompt: (number: number, batchCount?: number) => Promise<QueuePromptResponse>;
    registerExtension: (extension: ComfyExtension) => void;
}

export interface ComfyApi {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket: any;
    queuePrompt: (index: number, prompt: PromptData, ...args: unknown[]) => Promise<QueuePromptResponse>;
    addEventListener: (event: string, callback: (e: CustomEvent) => void) => void;
    fetchApi(route: string, options?: RequestInit): Promise<Response>;
}

export interface ComfyGraph extends LGraph {
    id: string;
    nodes: ComfyNode[];
    groups: ComfyGroup[];
    getNodeById: (id: string | number) => ComfyNode | undefined;
    getLink: (linkId: number) => ComfyLink | null;
}

export interface ComfyGroup extends LGraphGroup {
    id: string;
    boundingRect: [number, number, number, number];
}

export interface ComfyNode extends LGraphNode {
    collapsed: boolean;
    widgets: ComfyWidget[];
    inputs: ComfyInputNodeSlot[];
    // imgs?: HTMLImageElement[];
    images?: ImageInfo[];
    previewMediaType?: string;
    subgraph?: ComfyGraph;
    constructor: {
        name: string;
        nodeData?: { output_node?: boolean; inputs?: Record<string, { tooltip?: string }> };
        comfyClass?: string;
    };
    isSubgraphNode?: () => boolean;
    onDrawBackground?: () => void;
    pasteFiles?: (files: File[]) => void;
}

export interface ComfyWidget {
    name: string;
    type: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value?: any;
    label?: string;
    options?: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        values?: string[] | Function;
        [key: string]: unknown;
    };
    disabled: boolean;
    image?: ImageInfo;
    element?: HTMLElement & { disabled: boolean; readOnly: boolean };
    inputEl: HTMLElement & { disabled: boolean; readOnly: boolean };
    constructor: { name: string };
    setValue?: (value: unknown, ctx: WidgetContext) => void;
    callback?: (value: unknown) => void;
    hitAreas?: Record<string, unknown>;
}
