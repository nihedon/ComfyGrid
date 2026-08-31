export type WorkflowItemType = 'folder' | 'file';

export interface WorkflowItem {
    type: WorkflowItemType;
    name: string;
    path: string;
    parent: string;
    size?: number;
    modified: number;
    node_count?: number;
    has_thumbnail?: boolean;
    is_favorite?: boolean;
}

export interface WorkflowListResponse {
    root: string;
    items: WorkflowItem[];
}
