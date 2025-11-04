/**
 * Extension loader for dynamically registered widget extensions
 */
import type { Component } from 'svelte';
import { ComfyGridNode, ComfyGridWidget } from '@/states/model-state.svelte';

export type GroupByKey = 'widget_class_name' | 'widget_name' | 'widget_type';

/**
 * Match condition for extension widgets
 */
export interface MatchCondition {
    /** Match by node.comfyClass */
    nodeComfyClass?: string;
    /** Match by node.constructorName */
    nodeConstructorName?: string;
    /** Match by widget.className */
    widgetClassName?: string;
    /** Match by widget.name */
    widgetName?: string;
    /** Match by widget.type */
    widgetType?: string;
}

/**
 * Widget definition with match condition and component
 */
interface WidgetDefinition {
    /** Match condition(s) for this widget */
    match: MatchCondition | MatchCondition[];
    /** Svelte component to render (for built-in extensions) */
    component?: Component;
    /** Custom Element tag name to render (for external extensions) */
    customElement?: string;
    /**
     * Group widgets by this field and render once with all matching widgets.
     * When set, the component receives `widgets: Widget[]` instead of `widget: Widget`.
     */
    groupBy?: GroupByKey;
}

/**
 * Extension manifest
 */
export interface ExtensionManifest {
    name: string;
    version?: string;
    description?: string;
    /** Multiple widget definitions for this extension */
    widgets: WidgetDefinition[];
}

/**
 * Loaded extension
 */
interface LoadedExtension {
    manifest: ExtensionManifest;
}

/**
 * Ignore condition for nodes/widgets that should be skipped
 */
interface IgnoreCondition {
    comfyClass?: string;
    constructorName?: string;
}

/**
 * Result of matching an extension
 */
export interface ExtensionMatchResult {
    component?: Component;
    customElement?: string;
    groupBy?: GroupByKey;
}

const loadedExtensions: LoadedExtension[] = [];
const ignoreConditions: IgnoreCondition[] = [];

/**
 * Register an extension with multiple widgets
 * @param manifest - Extension manifest with widget definitions
 */
export function registerExtension(manifest: ExtensionManifest): void {
    loadedExtensions.push({ manifest });
}

/**
 * Register a condition to ignore certain nodes/widgets
 * @param condition - Ignore condition
 */
export function registerIgnore(condition: IgnoreCondition): void {
    ignoreConditions.push(condition);
}

/**
 * Check if a node/widget should be ignored
 * @param node - Node to check
 * @returns true if the node should be ignored
 */
export function shouldIgnore(node: ComfyGridNode): boolean {
    return ignoreConditions.some((cond) => {
        if (cond.comfyClass && node.comfyClass === cond.comfyClass) return true;
        if (cond.constructorName && node.constructorName === cond.constructorName) return true;
        return false;
    });
}

/**
 * Find a matching extension with metadata (including groupBy)
 * @param node - Node containing the widget
 * @param widget - Widget to find component for
 * @returns Match result with component and groupBy info
 */
export function matchExtensionWithMeta(node: ComfyGridNode, widget: ComfyGridWidget): ExtensionMatchResult | null {
    for (const ext of loadedExtensions) {
        for (const widgetDef of ext.manifest.widgets) {
            if (matchesConditions(widgetDef.match, node, widget)) {
                return {
                    component: widgetDef.component,
                    customElement: widgetDef.customElement,
                    groupBy: widgetDef.groupBy,
                };
            }
        }
    }
    return null;
}

/**
 * Check if any of the conditions match
 */
function matchesConditions(match: MatchCondition | MatchCondition[], node: ComfyGridNode, widget: ComfyGridWidget): boolean {
    const conditions = Array.isArray(match) ? match : [match];
    return conditions.some((cond) => matchesCondition(cond, node, widget));
}

/**
 * Check if a single condition matches
 */
function matchesCondition(cond: MatchCondition, node: ComfyGridNode, widget: ComfyGridWidget): boolean {
    if (cond.widgetClassName && widget.className !== cond.widgetClassName) return false;
    if (cond.nodeComfyClass && node.comfyClass !== cond.nodeComfyClass) return false;
    if (cond.nodeConstructorName && node.constructorName !== cond.nodeConstructorName) return false;
    if (cond.widgetName && widget.name !== cond.widgetName) return false;
    if (cond.widgetType && widget.type !== cond.widgetType) return false;
    return true;
}
