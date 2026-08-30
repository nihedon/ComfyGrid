import { comfyGridApiClient } from '@/api/api-client';
import type { ExtensionManifestJson, ManifestMatchCondition } from '@/types/manifest';
import logger from '@/utils/logger';
import { registerExtension, registerIgnore } from './extension-loader';
import type { MatchCondition } from './extension-loader';

function toMatchCondition(raw: ManifestMatchCondition): MatchCondition {
    return {
        nodeComfyClass: raw.node_comfy_class,
        nodeConstructorName: raw.node_constructor_name,
        widgetClassName: raw.widget_class_name,
        widgetName: raw.widget_name,
        widgetType: raw.widget_type,
    };
}

async function attachScripts(extensionId: string, manifest: ExtensionManifestJson) {
    const scripts = manifest.frontend?.scripts ?? [];
    for (const script of scripts) {
        try {
            if (script) {
                await loadScript(`/comfygrid/api/extensions/${extensionId}/assets/${script}`);
            }
        } catch (e) {
            logger.error(`Failed to load ${script} for "${extensionId}":`, e);
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

async function attachStyles(extensionId: string, manifest: ExtensionManifestJson) {
    const styles = manifest.frontend?.styles ?? [];
    for (const style of styles) {
        try {
            if (style) {
                await loadStyle(`/comfygrid/api/extensions/${extensionId}/assets/${style}`);
            }
        } catch (e) {
            logger.error(`Failed to load ${style} for "${extensionId}":`, e);
        }
    }
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

    for (const extension of res.json) {
        try {
            const extensionId = Object.keys(extension)[0];
            const manifest = Object.values(extension)[0];
            await attachScripts(manifest.id ?? extensionId, manifest);
            await attachStyles(manifest.id ?? extensionId, manifest);

            if (manifest.widgets && manifest.widgets.length > 0) {
                registerExtension({
                    name: manifest.name,
                    widgets: manifest.widgets.map((def) => ({
                        match: Array.isArray(def.match) ? def.match.map(toMatchCondition) : toMatchCondition(def.match),
                        customElement: def.custom_element,
                    })),
                });
            }

            for (const cond of manifest.ignore ?? []) {
                registerIgnore({
                    comfyClass: cond.comfy_class,
                    constructorName: cond.constructor_name,
                });
            }
        } catch (e) {
            logger.error(`Failed to load extension:`, extension, e);
        }
    }
}
