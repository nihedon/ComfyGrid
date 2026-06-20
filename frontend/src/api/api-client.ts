import type { Model } from '@/states/storage-state.svelte';
import type { Job } from '@/types/job';
import type { ExtensionManifestJson } from '@/types/manifest';
import type { ImageInfo } from '@/types/model-shared';
import type { SetupConfig } from '@/types/setup';
import type { Version } from '@/types/verion';
import logger from '@/utils/logger';

type ApiResult = {
    ok: boolean;
    status: number;
};

type ApiResultJson<T = unknown> = ApiResult & {
    json: T;
};

type ApiResultText = ApiResult & {
    text: string;
};

type ApiResultBlob = ApiResult & {
    blob: Blob;
};

async function fetchApiJson<T = unknown>(url: string, options: RequestInit = {}): Promise<ApiResultJson<T>> {
    try {
        const res = await fetch(url, options);
        if (res.ok) {
            const json = await res.json().catch(() => ({}) as T);
            return { ok: true, status: res.status, json };
        }
        return { ok: false, status: res.status, json: {} as T };
    } catch (e) {
        logger.error(url, e);
        return { ok: false, status: 500, json: {} as T };
    }
}

async function fetchApiText(url: string, options: RequestInit = {}): Promise<ApiResultText> {
    try {
        const res = await fetch(url, options);
        if (res.ok) {
            return { ok: true, status: res.status, text: await res.text() };
        }
        return { ok: false, status: res.status, text: '' };
    } catch (e) {
        logger.error(url, e);
        return { ok: false, status: 500, text: '' };
    }
}

async function fetchApiBlob(url: string, options: RequestInit = {}): Promise<ApiResultBlob> {
    try {
        const res = await fetch(url, options);
        if (res.ok) {
            return { ok: true, status: res.status, blob: await res.blob() };
        }
        return { ok: false, status: res.status, blob: new Blob() };
    } catch (e) {
        logger.error(url, e);
        return { ok: false, status: 500, blob: new Blob() };
    }
}

class ComfyGridApiClient {
    async postRestart<T = unknown>(): Promise<ApiResultJson<T>> {
        return await fetchApiJson('/comfygrid/api/restart', { method: 'POST' });
    }

    async getSetupStatus(): Promise<ApiResultJson<{ mode: string }>> {
        return await fetchApiJson('/comfygrid/api/setup/status');
    }

    async getVersionInfo(): Promise<ApiResultJson<Version>> {
        return await fetchApiJson('/comfygrid/api/version_info');
    }

    async postImageInfo(file: File): Promise<ApiResultJson<{ metadata?: string; prompt?: string; workflow?: string }>> {
        const formData = new FormData();
        formData.append('file', file);
        return await fetchApiJson('/comfygrid/api/image_info', {
            method: 'POST',
            body: formData,
        });
    }

    async getModelInfo(modelInfo: string): Promise<
        ApiResultJson<{
            description?: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            metadata?: Record<string, any>;
        }>
    > {
        return await fetchApiJson(`/comfygrid/api/model_info=${modelInfo}`);
    }

    async deleteImage<T = unknown>(payload: ImageInfo): Promise<ApiResultJson<T>> {
        const query = new URLSearchParams({
            type: payload.type,
            filename: payload.filename,
            subfolder: payload.subfolder,
        });
        return await fetchApiJson(`/comfygrid/api/delete_image?${query}`, {
            method: 'DELETE',
        });
    }

    async getSetupConfig(): Promise<ApiResultJson<SetupConfig>> {
        return await fetchApiJson('/comfygrid/api/setup/config');
    }

    async postSetupLaunch(body: string): Promise<ApiResultJson<{ error: string }>> {
        return await fetchApiJson('/comfygrid/api/setup/launch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });
    }

    async postDialogFile(title: string, filetypes: string[][], initialDir?: string): Promise<ApiResultJson<{ path: string }>> {
        return await fetchApiJson('/comfygrid/api/dialog/file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, filetypes, initial_dir: initialDir || '' }),
        });
    }

    async getJobs(jobId: string): Promise<
        ApiResultJson<{
            jobId: string;
            nodeIds: string[];
            prompt: string;
            workflow: string;
            ckpt_name: string;
        }>
    > {
        return await fetchApiJson(`/comfygrid/api/jobs/${jobId}`);
    }

    async postJobs(jobId: string, nodeIds: string[], prompt: string, workflow: string, ckpt_name: string) {
        return await fetchApiJson(`/comfygrid/api/jobs/${jobId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId, nodeIds, prompt, workflow, ckpt_name, viewed: false }),
        });
    }

    async getAllJobs(): Promise<
        ApiResultJson<Record<string, { jobId: string; nodeIds: string[]; prompt: string; workflow: string; ckpt_name: string; viewed?: boolean }>>
    > {
        return await fetchApiJson('/comfygrid/api/jobs');
    }

    async patchJobViewed(jobId: string): Promise<ApiResultJson> {
        return await fetchApiJson(`/comfygrid/api/jobs/${jobId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ viewed: true }),
        });
    }

    async getCustomNodes(): Promise<ApiResultJson<Record<string, ExtensionManifestJson>[]>> {
        return await fetchApiJson('/comfygrid/api/custom_nodes');
    }

    async postUploadToInput(url: string, filename: string): Promise<ApiResultJson<{ message: string }>> {
        return await fetchApiJson('/comfygrid/api/upload_to_input', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, filename }),
        });
    }

    async getResize(url: string, size: number): Promise<ApiResultBlob> {
        return await fetchApiBlob(`/comfygrid/api/resize?url=${encodeURIComponent(url)}&size=${size}`);
    }

    async getVideoThumbnail(url: string, size: number = 120): Promise<ApiResultBlob> {
        return await fetchApiBlob(`/comfygrid/api/video_thumbnail?url=${encodeURIComponent(url)}&size=${size}`);
    }

    async postSaveImage(url: string, imageInfo: unknown): Promise<ApiResultText> {
        return await fetchApiText('/comfygrid/api/save_image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, image_info: imageInfo }),
        });
    }

    async postApplyMask(payload: {
        file: { blob: Blob; filename: string };
        mask: { blob: Blob; filename: string };
        filename: string;
        subfolder: string;
    }): Promise<ApiResultJson<{ message: string }>> {
        // Create FormData
        const { file, mask, filename, subfolder } = payload;
        const formData = new FormData();
        formData.append('file', file.blob, file.filename);
        formData.append('mask', mask.blob, mask.filename);
        formData.append('filename', filename);
        formData.append('subfolder', subfolder);

        return await fetchApiJson('/comfygrid/api/apply_mask', {
            method: 'POST',
            body: formData,
        });
    }

    async getExtensionResources(): Promise<ApiResultJson<Array<string>>> {
        return await fetchApiJson('/comfygrid/api/extension/resources');
    }

    async getList(dirName: string, extensions: string[]): Promise<ApiResultJson<Model[]>> {
        const params = new URLSearchParams({
            dir_name: dirName,
            ext: extensions.join(','),
        });
        return await fetchApiJson(`/comfygrid/api/list?${params.toString()}`);
    }

    async getOpts(): Promise<
        ApiResultJson<{
            opts: Record<string, string>;
            forms: Record<string, string>;
            ext_forms: Record<string, string>;
        }>
    > {
        return await fetchApiJson('/comfygrid/api/opts');
    }

    async postOpts(opts: ReadonlyMap<string, string>): Promise<ApiResultJson> {
        return await fetchApiJson('/comfygrid/api/opts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.fromEntries(opts)),
        });
    }

    async getPages(): Promise<ApiResultJson<Array<{ id: string; title: string }>>> {
        return await fetchApiJson('/comfygrid/api/pages');
    }
}

class ComfyUiApiClient {
    async history(): Promise<ApiResultJson<Record<string, { outputs: Record<string, { images: ImageInfo[] }> }>>> {
        return await fetchApiJson('/api/history');
    }

    async queue(): Promise<ApiResultJson<{ queue_running: Array<Array<string>>; queue_pending: Array<Array<string>> }>> {
        return await fetchApiJson('/api/queue');
    }

    async jobs(params?: Record<string, string>): Promise<ApiResultJson<{ jobs: Job[] }>> {
        let query = '';
        if (params) {
            query = new URLSearchParams(params).toString();
        }
        return await fetchApiJson(`/api/jobs?${query}`);
    }

    async deleteQueues(jobIds: string[]): Promise<ApiResultJson> {
        return await fetchApiJson('/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delete: jobIds }),
        });
    }

    async clearQueues(): Promise<ApiResultJson> {
        return await fetchApiJson('/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clear: true }),
        });
    }

    async interrupt(): Promise<ApiResultJson> {
        return await fetchApiJson('/interrupt', { method: 'POST' });
    }
}

export const comfyGridApiClient = new ComfyGridApiClient();
export const comfyUiApiClient = new ComfyUiApiClient();
