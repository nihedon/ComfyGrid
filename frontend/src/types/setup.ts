export type SetupConfig = {
    workspaces: WorkspaceInfo[];
    last_workspace: string;
    connect_host?: string | null;
    connect_port: number | null;
    last_profile_id?: string | null;
    active_profile_id?: string | null;
};

export type WorkspaceInfo = {
    id?: string;
    mode?: 'launch' | 'connect';
    name: string;
    script_path: string;
    python_path: string;
    comfyui_port: number;
    comfyui_args: string;
    connect_host?: string;
    connect_port?: number;
};
