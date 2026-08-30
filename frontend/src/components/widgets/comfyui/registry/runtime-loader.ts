import { comfyGridApiClient } from '@/api/api-client';
import type { ExtensionManifest } from '@/types/manifest';
import logger from '@/utils/logger';
import { registerExtension } from './extension-loader';

async function attachAssets(manifest: ExtensionManifest): Promise<void> {
    const scripts = manifest.frontend?.scripts ?? [];
    for (const script of scripts) {
        if (!script) continue;
        try {
            await loadScript(`/comfygrid/api/extensions/${manifest.id}/assets/${script}`);
        } catch (e) {
            logger.error(`Failed to load script "${script}" for "${manifest.id}":`, e);
        }
    }

    const styles = manifest.frontend?.styles ?? [];
    for (const style of styles) {
        if (!style) continue;
        try {
            await loadStyle(`/comfygrid/api/extensions/${manifest.id}/assets/${style}`);
        } catch (e) {
            logger.error(`Failed to load style "${style}" for "${manifest.id}":`, e);
        }
    }
}

function loadScript(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
        document.head.appendChild(script);
    });
}

function loadStyle(url: string): Promise<void> {
    return new Promise((resolve) => {
        const style = document.createElement('link');
        style.rel = 'stylesheet';
        style.type = 'text/css';
        style.href = url;
        document.head.appendChild(style);
        resolve();
    });
}

export async function loadRuntimeExtensions(): Promise<void> {
    let res = await comfyGridApiClient.getCustomNodes();

    while (!res.ok) {
        await new Promise<void>((r) => setTimeout(r, 1000));
        res = await comfyGridApiClient.getCustomNodes();
    }

    for (const manifest of res.json ?? []) {
        try {
            await attachAssets(manifest);
            registerExtension(manifest);
        } catch (e) {
            logger.error(`Failed to load extension "${manifest?.id}":`, e);
        }
    }
}
