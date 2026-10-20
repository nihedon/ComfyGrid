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

export interface WorkflowSaveResult extends OpenWorkflowInfo {
    capture: WorkflowCapture | null;
}

export interface ComfyWorkflowApi {
    version: 1;
    listWorkflows(): OpenWorkflowInfo[];
    selectWorkflow(path: string): Promise<void>;
    saveWorkflow(promptName: (defaultName: string) => string | null): Promise<WorkflowSaveResult | null>;
    getWorkflows(paths?: string[]): Promise<OpenWorkflowSnapshot[]>;
    captureWorkflow(path?: string): WorkflowCapture | null;
    getWorkflowCapture(path: string): WorkflowCapture | null;
    dispose(): void;
}
