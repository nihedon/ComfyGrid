export type Job = {
    id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'canceled' | 'failed';
    priority: number;
    create_time: number;
    outputs_count: number;
    workflow_id: string;
};
