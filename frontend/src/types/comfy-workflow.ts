export interface OpenWorkflowInfo {
    path: string;
    name: string;
    selected: boolean;
    isModified: boolean;
    isLoaded: boolean;
}

export interface OpenWorkflowSnapshot extends OpenWorkflowInfo {
    json: Record<string, unknown> | null;
    revision: string | null;
    error?: string;
}

export interface WorkflowCapture {
    path: string;
    graphId: string | null;
    revision: string;
    capturedAt: number;
    dataUrl: string;
    stale: boolean;
}

export interface ComfyWorkflowApi {
    version: 1;
    listWorkflows(): OpenWorkflowInfo[];
    selectWorkflow(path: string): Promise<void>;
    getWorkflows(paths?: string[]): Promise<OpenWorkflowSnapshot[]>;
    captureWorkflow(path?: string): WorkflowCapture | null;
    getWorkflowCapture(path: string): WorkflowCapture | null;
    dispose(): void;
}
