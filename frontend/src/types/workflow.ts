export type WorkflowItemType = 'folder' | 'file';
export type WorkflowSortType = 'name' | 'created';

export interface WorkflowItem {
    type: WorkflowItemType;
    name: string;
    path: string;
    parent: string;
    size?: number;
    created?: number;
    modified: number;
    node_count?: number;
    has_thumbnail?: boolean;
    is_favorite?: boolean;
}

export interface WorkflowListResponse {
    root: string;
    items: WorkflowItem[];
}
