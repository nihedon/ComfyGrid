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

async function attachScripts(manifest: ExtensionManifestJson) {
    const scripts = manifest.assets?.scripts ?? [];
    for (const script of scripts) {
        try {
            if (script) {
                await loadScript(`/comfygrid/api/custom_nodes/${manifest.name}/assets/${script}`);
            }
        } catch (e) {
            logger.error(`Failed to load ${script} for "${manifest.name}":`, e);
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

async function attachStyles(manifest: ExtensionManifestJson) {
    const styles = manifest.assets?.styles ?? [];
    for (const style of styles) {
        try {
            if (style) {
                await loadStyle(`/comfygrid/api/custom_nodes/${manifest.name}/assets/${style}`);
            }
        } catch (e) {
            logger.error(`Failed to load ${style} for "${manifest.name}":`, e);
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
    const res = await comfyGridApiClient.getCustomNodes();
    if (!res.ok) return;

    for (const extension of res.json) {
        try {
            const manifest = Object.values(extension)[0];
            await attachScripts(manifest);
            await attachStyles(manifest);

            registerExtension({
                name: manifest.name,
                widgets: manifest.widgets.map((def) => ({
                    match: Array.isArray(def.match) ? def.match.map(toMatchCondition) : toMatchCondition(def.match),
                    customElement: def.custom_element,
                    groupBy: def.group_by ?? undefined,
                })),
            });

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
