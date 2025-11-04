/**
 * Adapter utilities to map ComfyUI (LiteGraph) objects directly to Svelte ComfyGrid state instances
 */
import type { ComfyApp, ComfyGroup, ComfyNode, ComfyWidget } from '@/types/comfy-model';
import type { GroupProps, NodeProps, WidgetProps } from '@/types/model-props';
import type { ComfyNodeMode, ImageInfo } from '@/types/model-shared';

/**
 * Safely parse an object to JSON, handling circular references
 * @param obj - Object to parse
 * @returns Parsed object without circular references
 */
function safeParse<T>(obj: T): T {
    const seen = new WeakSet();
    return JSON.parse(
        JSON.stringify(obj, (_key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) return undefined;
                seen.add(value);
            }
            return value;
        }),
    );
}

/**
 * Check if a node is inside a group (at least 50% overlap)
 * @param node - Node to check
 * @param group - Group to check against
 * @returns True if node is considered inside the group
 */
function isNodeInGroup(node: ComfyNode, group: ComfyGroup): boolean {
    const [nx, ny, nw, nh] = node.getBounding();
    const [gx, gy, gw, gh] = group.boundingRect;
    const nodeArea = nw * nh;

    const overlapWidth = Math.max(0, Math.min(nx + nw, gx + gw) - Math.max(nx, gx));
    const overlapHeight = Math.max(0, Math.min(ny + nh, gy + gh) - Math.max(ny, gy));

    const overlapArea = overlapWidth * overlapHeight;
    return overlapArea >= nodeArea / 2;
}

class ComfyUiToComfyGridAdapter {
    /**
     * Map a LiteGraph node to plain NodeProps
     * @param app - ComfyApp instance
     * @param node - Node to convert
     * @returns NodeProps object
     */
    toNodeProps(app: ComfyApp, node: ComfyNode): NodeProps {
        const widgetPropsList = this.toWidgetPropsList(app, node);
        const hasOutputNode = node.constructor.nodeData?.output_node;

        const groups = app.rootGraph.groups
            .filter((g) => isNodeInGroup(node, g))
            .sort((a, b) => {
                const [, , aw, ah] = a.boundingRect;
                const [, , bw, bh] = b.boundingRect;
                const areaA = aw * ah;
                const areaB = bw * bh;
                return areaB - areaA;
            });

        const inputLinks = node.inputs
            ?.filter((i) => !i.widget && i.link)
            ?.map((i) => app.rootGraph.getLink(i.link))
            .filter((link) => link != null);

        let inputs: { id: string; slot: string }[] | null = null;
        if (inputLinks && inputLinks.length > 0) {
            inputs = inputLinks.map((link) => ({ id: String(link.origin_id), slot: String(link.origin_slot) }));
        }

        let outputs: { id: string; slot: string }[][] | null = null;
        const outputLinks = node.outputs?.filter((o) => o.links).map((o) => o.links?.map((l) => app.rootGraph.getLink(l)));

        if (outputLinks && outputLinks.length > 0) {
            outputs = outputLinks.map((links) =>
                (links ?? []).filter((link) => link != null).map((link) => ({ id: String(link.target_id), slot: String(link.target_slot) })),
            );
        }

        const groupProps = groups
            ? groups.map<GroupProps>((g) => ({
                  comfyGroup: g,
                  id: String(g.id),
                  title: g.title,
                  color: g.color,
                  pos: {
                      x: g.boundingRect[0],
                      y: g.boundingRect[1],
                  },
              }))
            : [];

        return {
            comfyNode: node,
            id: String(node.id),
            parentNodeId: undefined,
            title: node.title,
            type: node.type,
            pos: {
                x: node.pos[0],
                y: node.pos[1],
            },
            collapsed: node.collapsed,
            hasOutputNode: hasOutputNode,
            mode: node.mode as ComfyNodeMode,
            bgcolor: node.bgcolor,
            inputs: inputs,
            outputs: outputs,
            widgets: widgetPropsList,
            groups: groupProps,
            subgraph: node.subgraph,
            comfyClass: node.constructor.comfyClass,
            constructorName: node.constructor.name,
            properties: typeof node.properties === 'object' ? safeParse(node.properties) : node.properties,
        };
    }

    /**
     * Map all widgets of a node to plain WidgetProps
     * @param app - ComfyApp instance
     * @param node - Node containing widgets
     * @returns Array of WidgetProps objects
     */
    toWidgetPropsList(app: ComfyApp, node: ComfyNode): WidgetProps[] {
        const images = node.images || [];
        const result: WidgetProps[] = [];

        const skipIndexSet = new Set<number>();

        let index = 0;
        let imgIdx = 0;
        for (const [i, w] of Object.entries(node.widgets ?? [])) {
            const idx = Number.parseInt(i);
            if (skipIndexSet.has(idx)) {
                continue;
            }

            // Skip widgets that are linked to an input
            if (node.inputs?.find((inp) => inp.name == w.name)?.link != null) {
                continue;
            }

            // Skip disabled widgets
            if (w.disabled || w.element?.disabled) {
                continue;
            }

            const isUploadButton = (w: ComfyWidget) => {
                return w.name === 'upload' || (w.type === 'button' && w.name.toLowerCase().includes('upload'));
            };

            if (w.type === 'combo' && (w.name === 'file' || w.name === 'image' || w.name === 'video' || w.name === 'audio')) {
                const [findIdx, uploadButtonWidget] = Object.entries(node.widgets).find(([, w]) => isUploadButton(w)) ?? ['', undefined];
                if (uploadButtonWidget) {
                    skipIndexSet.add(Number.parseInt(findIdx));

                    // File upload widget set
                    const widgetProp = this.#toWidgetProps(app, node, w, index++, images[imgIdx]);
                    widgetProp.type = 'upload';
                    widgetProp.callback = uploadButtonWidget.callback;
                    result.push(widgetProp);

                    const [pIdx, previewWidget] = Object.entries(node.widgets).find(
                        ([, w]) => w.constructor.name === 'ImagePreviewWidget' || w.type === 'preview' || w.name === 'video-preview' || w.type === 'audioUI',
                    ) ?? ['', undefined];
                    if (w.name === 'audio' || node.previewMediaType === 'audio') {
                        if (previewWidget) {
                            const previewIndex = Number.parseInt(pIdx);
                            skipIndexSet.add(previewIndex);
                        }
                        const audioProp = this.#toWidgetProps(app, node, w, index++);
                        audioProp.type = 'audio';
                        audioProp.callback = node.pasteFiles;
                        result.push(audioProp);
                    } else if (node.images?.length > 0) {
                        if (previewWidget) {
                            const previewIndex = Number.parseInt(pIdx);
                            skipIndexSet.add(previewIndex);
                        }
                        const previewProp = this.#toWidgetProps(app, node, w, index++, images[imgIdx]);
                        if (w.name === 'image' || node.previewMediaType === 'image') {
                            previewProp.type = 'image';
                        } else if (w.name === 'video' || node.previewMediaType === 'video') {
                            previewProp.type = 'video';
                        }
                        previewProp.callback = node.pasteFiles;
                        result.push(previewProp);
                        imgIdx++;
                    }
                } else {
                    result.push(this.#toWidgetProps(app, node, w, index++));
                }
            } else if (w.constructor.name === 'ImagePreviewWidget') {
                if (node.widgets.length === 1 && node.outputs.length === 0) {
                    // previewer
                    result.push(this.#toWidgetProps(app, node, w, index++, images[imgIdx]));
                }
                imgIdx++;
            } else {
                result.push(this.#toWidgetProps(app, node, w, index++));
            }
        }

        // Map widget names to slot links for widgets with input slots
        const linkMap: Record<string, number | null | undefined> = {};
        node.inputs
            ?.filter((slot) => slot.widget != null)
            .forEach((slot) => {
                if (slot.widget) {
                    linkMap[slot.widget.name] = slot.link;
                }
            });

        return result.filter((w) => linkMap[w.name] == null);
    }

    /**
     * Map a single widget to plain WidgetProps
     * @param app - ComfyApp instance
     * @param node - Parent node
     * @param widget - Widget to convert
     * @param idx - Widget index
     * @param images - Array of images from node
     * @param imgIdx - Current image index
     * @param options - Additional options
     * @returns WidgetProps object
     */
    #toWidgetProps(app: ComfyApp, node: ComfyNode, widget: ComfyWidget, idx: number, image?: ImageInfo, options: Record<string, unknown> = {}): WidgetProps {
        const widgetInput = node.inputs?.find((i) => i.widget?.name === widget?.name);
        let input: { id: string; slot: string } | null = null;

        if (widgetInput) {
            const link = app.rootGraph.getLink(widgetInput.link);
            if (link) {
                input = {
                    id: String(link.origin_id),
                    slot: String(link.origin_slot),
                };
            }
        }

        const widgetProps: WidgetProps = {
            comfyNode: node,
            comfyWidget: widget,
            id: `${node.id}_${idx}`,
            index: idx,
            slot: node.inputs?.map((i) => i.name)?.indexOf(widget.name) ?? -1,
            label: widget.label,
            name: widget.name,
            tooltip: node.constructor.nodeData?.inputs?.[widget.name]?.tooltip,
            type: widget.type,
            value: typeof widget.value === 'object' ? safeParse(widget.value) : widget.value,
            image,
            input,
            element: widget.inputEl || widget.element || null,
            readonly: widget.inputEl?.readOnly || widget.element?.readOnly || false,
            options: { ...safeParse(widget.options), ...options },
            className: widget.constructor.name,
            callback: widget.callback,
        };

        // Parse combo box values that may return values not in the selection items
        if (widget.type === 'combo') {
            const opts = widgetProps.options as Record<string, unknown>;
            opts['values'] = [...((typeof widget.options?.values === 'function' ? widget.options.values() : widget.options?.values) ?? [])];
            opts['fixed_values'] = this.#computeFixedValues(widget);
        }

        return widgetProps;
    }

    #computeFixedValues(widget: ComfyWidget) {
        const descriptor = Object.getOwnPropertyDescriptor(widget, 'value');
        const valGetter = descriptor?.get;
        const results: string[] = [];

        if (valGetter) {
            const strValGetter = valGetter.toString();
            const match = strValGetter.match(/return\s+(?:'([^']+?)'|"([^"]*?)"|`([^`]*?)`)\s*;/);
            if (match) {
                for (let i = 1; i < match.length; i++) {
                    if (match[i] !== undefined) {
                        results.push(match[i]);
                    }
                }
            }
        }
        return results;
    }

    /**
     * Yield NodeProps instances for packed subgraph nodes recursively
     * @param app - ComfyApp instance
     * @param parent - Parent NodeProps
     */
    *toPackedNodePropsList(app: ComfyApp, parent: NodeProps | null): Generator<NodeProps> {
        if (parent?.subgraph && parent.id != null) {
            for (const node of parent.subgraph.nodes) {
                if (node.id) {
                    const nodeProps = this.toNodeProps(app, node);
                    nodeProps.parentNodeId = parent.id;
                    yield nodeProps;
                    yield* this.toPackedNodePropsList(app, nodeProps);
                }
            }
        }
    }
}

export const comfyUiToComfyGridAdapter = new ComfyUiToComfyGridAdapter();
