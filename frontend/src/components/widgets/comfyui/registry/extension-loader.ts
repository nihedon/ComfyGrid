/**
 * Extension loader for dynamically registered widget extensions
 */
import type { Component } from 'svelte';
import { ComfyGridNode, ComfyGridWidget } from '@/states/model-state.svelte';
import type { ExtensionManifest, ManifestIgnoreCondition, ManifestMatchCondition } from '@/types/manifest';

export interface ExtensionMatchResult {
    component?: Component;
    customElement?: string;
}

export interface CustomElementTemplateInfo {
    extensionId: string;
    templateFile?: string;
    templateId?: string;
}

const registeredManifests: ExtensionManifest[] = [];
const ignoreConditions: ManifestIgnoreCondition[] = [];
const customElementMetaMap = new Map<string, CustomElementTemplateInfo>();

/**
 * Register an extension manifest
 */
export function registerExtension(manifest: ExtensionManifest): void {
    registeredManifests.push(manifest);

    const widgets = manifest.frontend?.widgets ?? manifest.widgets ?? [];
    for (const widgetDef of widgets) {
        if (widgetDef.custom_element) {
            let templateFile: string | undefined;
            let templateId: string | undefined = widgetDef.template_id;

            if (widgetDef.template) {
                if (widgetDef.template.includes('#')) {
                    const [file, id] = widgetDef.template.split('#');
                    templateFile = file || 'template.html';
                    templateId = id;
                } else {
                    templateFile = widgetDef.template;
                }
            }

            customElementMetaMap.set(widgetDef.custom_element.toLowerCase(), {
                extensionId: manifest.id,
                templateFile,
                templateId,
            });
        }
    }

    for (const cond of manifest.ignore ?? []) {
        ignoreConditions.push(cond);
    }
}

/**
 * Get template metadata for a custom element tag name
 */
export function getCustomElementTemplateInfo(tagName: string): CustomElementTemplateInfo | undefined {
    return customElementMetaMap.get(tagName.toLowerCase());
}

/**
 * Get extension ID that owns the specified custom element tag name
 */
export function getExtensionForCustomElement(tagName: string): string | undefined {
    return customElementMetaMap.get(tagName.toLowerCase())?.extensionId;
}

/**
 * Check if a node/widget should be ignored
 */
export function shouldIgnore(node: ComfyGridNode): boolean {
    return ignoreConditions.some((cond) => {
        if (cond.comfy_class && node.comfyClass === cond.comfy_class) return true;
        if (cond.constructor_name && node.constructorName === cond.constructor_name) return true;
        return false;
    });
}

/**
 * Find a matching extension with metadata
 */
export function matchExtensionWithMeta(node: ComfyGridNode, widget: ComfyGridWidget): ExtensionMatchResult | null {
    for (const manifest of registeredManifests) {
        const widgets = manifest.frontend?.widgets ?? manifest.widgets ?? [];
        for (const widgetDef of widgets) {
            if (matchesConditions(widgetDef.match, node, widget)) {
                return {
                    customElement: widgetDef.custom_element,
                };
            }
        }
    }
    return null;
}

function matchesConditions(
    match: ManifestMatchCondition | ManifestMatchCondition[],
    node: ComfyGridNode,
    widget: ComfyGridWidget,
): boolean {
    const conditions = Array.isArray(match) ? match : [match];
    return conditions.some((cond) => matchesCondition(cond, node, widget));
}

function matchesCondition(cond: ManifestMatchCondition, node: ComfyGridNode, widget: ComfyGridWidget): boolean {
    if (cond.widget_class_name && widget.className !== cond.widget_class_name) return false;
    if (cond.node_comfy_class && node.comfyClass !== cond.node_comfy_class) return false;
    if (cond.node_constructor_name && node.constructorName !== cond.node_constructor_name) return false;
    if (cond.widget_name && widget.name !== cond.widget_name) return false;
    if (cond.widget_type && widget.type !== cond.widget_type) return false;
    return true;
}
