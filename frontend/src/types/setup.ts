export type SetupConfig = {
    workspaces: WorkspaceInfo[];
    last_workspace: string;
    connect_port: number | null;
};

export type WorkspaceInfo = {
    name: string;
    script_path: string;
    python_path: string;
    comfyui_port: number;
    comfyui_args: string;
};
