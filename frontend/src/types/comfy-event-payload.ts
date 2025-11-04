import type { DialogType } from '@/states/dialog-state.svelte';

export type ProgressStatePayload = {
    nodes: Record<
        string,
        {
            display_node_id: string;
            max: number;
            node_id: string;
            parent_node_id: string | null;
            prompt_id: string;
            real_node_id: string;
            state: 'pending' | 'running' | 'finished' | 'error';
            value: number;
        }
    >;
    prompt_id?: string;
};

export type ExecutionStartPayload = { prompt_id?: string; timestamp: number };

export type ExecutionErrorPayload = { node_id: string; exception_type: DialogType; node_type: string; exception_message: string; traceback: string[] };

export type ExecutingPayload = string;

export type ExecutedPayload = { display_node: string; output: Record<string, unknown>; prompt_id?: string };

export type ExecutedCachedPayload = { prompt_id?: string; nodes: string[]; timestamp: number };

export type ProgressPayload = { node: string; prompt_id: string; value: number; max: number };

export type StatusPayload = { exec_info?: { queue_remaining: number } };

export type BPreviewPayload = Blob;

export type NotificationPayload = string;
