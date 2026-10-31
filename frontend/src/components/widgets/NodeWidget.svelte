<script lang="ts">
  import { type Component } from 'svelte';
  import { ChevronDown, ChevronUp } from '@lucide/svelte';
  import { t } from '@/i18n/i18n';
  import { notifyNodeChanged } from '@/services/custom-node-service.svelte';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridNode, ComfyGridWidget } from '@/states/model-state.svelte';
  import { COMFY_NODE_MODE } from '@/types/model-shared';
  import NodeWidgetHeader from './NodeWidgetHeader.svelte';
  import BoundingBoxesWidget from './comfyui/BoundingBoxesWidget.svelte';
  import DOMWidget from './comfyui/DOMWidget.svelte';
  import DimensionPairWidget from './comfyui/DimensionPairWidget.svelte';
  import { getWidgetComponentWithMeta } from './comfyui/registry/widget-registry';

  let { node, widget }: { node: ComfyGridNode; widget?: ComfyGridWidget } = $props();

  const workspaceState = appState.workspaceState;
  const containsWidgets = $derived.by(() => {
    if (widget) {
      return [widget];
    }
    return node.widgets.filter((w) => !workspaceState.layout.floatingWidgets.get(w.id));
  });
  const containsDrawableWidget = $derived.by(() => {
    return containsWidgets.some((w) => getWidgetComponentWithMeta(node, w));
  });

  const nodeStyle = $derived.by(() => {
    if (node.mode === COMFY_NODE_MODE.BYPASS) {
      return 'bypass';
    } else if (node.mode === COMFY_NODE_MODE.MUTE) {
      return 'mute';
    } else {
      return '';
    }
  });

  const isFloating = $derived.by(() => {
    if (widget) {
      return Boolean(workspaceState.layout.floatingWidgets.get(widget.id));
    }
    return Boolean(workspaceState.layout.floatingNodes.get(node.id));
  });

  const isInvalid = $derived(
    widget
      ? workspaceState.hasErrorWidget(node.id, widget.id)
      : workspaceState.hasErrorNode(node.id),
  );

  const isTextareaOnly = $derived.by(() => {
    if (node.widgets.length === 1 && node.widgets[0].type === 'customtext') {
      return node.widgets[0];
    }
    return null;
  });

  type RenderItem =
    | { id: string; type: 'single'; widget: ComfyGridWidget; component: Component }
    | { id: string; type: 'single-ce'; widget: ComfyGridWidget; customElement: string };

  const availableWidgets = $derived.by((): RenderItem[] => {
    const items: RenderItem[] = [];

    for (const w of containsWidgets) {
      // Skip if input is set or if floating conditions don't match
      if (w.input != null) continue;
      if (widget && w.id !== widget.id) continue;
      if (!widget && workspaceState.layout.floatingWidgets.get(w.id)) continue;

      const matchResult = getWidgetComponentWithMeta(node, w);
      if (!matchResult) continue;

      if (matchResult.customElement) {
        items.push({
          id: w.id,
          type: 'single-ce',
          widget: w,
          customElement: matchResult.customElement,
        });
      } else if (matchResult.component) {
        items.push({
          id: w.id,
          type: 'single',
          widget: w,
          component: matchResult.component,
        });
      }
    }
    return items;
  });

  const hasAdvancedWidgets = $derived(availableWidgets.some((item) => item.widget.advanced));
  const hasDomWidget = $derived(
    availableWidgets.some(
      (item) =>
        item.type === 'single' &&
        (item.component === DOMWidget || item.component === BoundingBoxesWidget),
    ),
  );
  const fitDomToNode = $derived(workspaceState.layout.isDomFitNode(node.id));
  const renderableWidgets = $derived(
    availableWidgets.filter((item) => widget || node.showAdvanced || !item.widget.advanced),
  );

  const groupedWidgets = $derived.by(() => {
    const items: (
      RenderItem | { id: string; type: 'dimensions'; first: RenderItem; second: RenderItem }
    )[] = [];
    const nativeWidgets = node.comfyNode.widgets;
    for (let index = 0; index < renderableWidgets.length; index++) {
      const first = renderableWidgets[index];
      const second = renderableWidgets[index + 1];
      if (
        second &&
        first.widget.type === 'number' &&
        second.widget.type === 'number' &&
        ((first.widget.name === 'width' && second.widget.name === 'height') ||
          (first.widget.name === 'height' && second.widget.name === 'width')) &&
        nativeWidgets[nativeWidgets.indexOf(first.widget.comfyWidget) + 1] ===
          second.widget.comfyWidget
      ) {
        items.push({
          id: `dimensions-${first.id}-${second.id}`,
          type: 'dimensions',
          first,
          second,
        });
        index++;
      } else {
        items.push(first);
      }
    }
    return items;
  });

  function bindCustomElementProps(el: HTMLElement, props: Record<string, unknown>) {
    Object.assign(el, props);
    return {
      update(newProps: Record<string, unknown>) {
        Object.assign(el, newProps);
      },
    };
  }

  const nodeColorOpts = $derived(appState.optionState.get('ComfyGrid.ui.node_color'));

  function findGroupColor(groupId: string | undefined): string | null {
    if (!groupId) return null;
    function search(groups: typeof workspaceState.groups): string | null {
      for (const g of groups) {
        if (g.id === groupId) {
          return g.color;
        }
        const found = search(g.children);
        if (found) {
          return found;
        }
      }
      return null;
    }
    return search(workspaceState.groups);
  }

  const lastGroupColor = $derived(findGroupColor(node.groups?.at(-1)?.id));

  const bgColor = $derived.by(() => {
    if (nodeColorOpts === 'none') {
      return null;
    }

    let fullColorCode: string | undefined;
    if (nodeColorOpts === 'node') {
      if (node.bgcolor == null) {
        return null;
      }
      fullColorCode = node.bgcolor.substring(1);
    } else if (nodeColorOpts === 'group') {
      const groupColor = lastGroupColor;
      if (groupColor == null) {
        return null;
      }
      fullColorCode = groupColor.substring(1);
    } else if (nodeColorOpts === 'node_priority') {
      const groupColor = lastGroupColor;
      if (node.bgcolor == null && groupColor == null) {
        return null;
      }
      fullColorCode = node.bgcolor != null ? node.bgcolor : groupColor!;
      fullColorCode = fullColorCode.substring(1);
    }

    if (!fullColorCode) {
      return null;
    }

    if (fullColorCode.length === 3) {
      fullColorCode = fullColorCode.replace(/(.)/g, '$1$1');
    }

    return '#' + fullColorCode + '30';
  });

  $effect(() => {
    notifyNodeChanged(node.id, node);
  });
</script>

{#snippet renderWidget(item: RenderItem)}
  {#if item.type === 'single'}
    <item.component widget={item.widget} options={{ isFloating, isTextareaOnly, fitDomToNode }} />
  {:else}
    <svelte:element
      this={item.customElement}
      use:bindCustomElementProps={{ widget: item.widget, options: { isFloating, isTextareaOnly } }}
    />
  {/if}
{/snippet}

<div
  class="node-widget"
  class:executing={appState.executionState.runningNodeId == node.id}
  class:normal={node.mode === COMFY_NODE_MODE.NORMAL}
  class:mute={node.mode === COMFY_NODE_MODE.MUTE}
  class:bypass={node.mode === COMFY_NODE_MODE.BYPASS}
  class:is-invalid={isInvalid}
  style:background-color={bgColor}
  data-id={node.id}
  data-name={node.title}
>
  <NodeWidgetHeader
    {node}
    {widget}
    {isFloating}
    {isInvalid}
    {hasDomWidget}
    isTextareaOnly={Boolean(isTextareaOnly)}
  />
  {#if !node.collapsed && containsWidgets.length > 0 && containsDrawableWidget}
    <div
      class="widget-stack {nodeStyle}"
      class:py-1={!widget && !isTextareaOnly}
      class:px-2={!widget && !isTextareaOnly}
      data-type={node.type}
    >
      {#each groupedWidgets as item (item.id)}
        {#if item.type === 'dimensions'}
          <DimensionPairWidget first={item.first.widget} second={item.second.widget}>
            {@render renderWidget(item.first)}
            {@render renderWidget(item.second)}
          </DimensionPairWidget>
        {:else}
          {@render renderWidget(item)}
        {/if}
      {/each}
    </div>
  {/if}
  {#if !widget && !node.collapsed && hasAdvancedWidgets && !node.alwaysShowAdvanced}
    <div class="card-footer p-0">
      <button
        type="button"
        class="btn btn-sm w-100 d-flex align-items-center justify-content-center gap-2"
        aria-expanded={node.showAdvanced}
        onclick={() => (node.showAdvanced = !node.showAdvanced)}
      >
        {$t(node.showAdvanced ? 'node.hide_advanced' : 'node.show_advanced')}
        {#if node.showAdvanced}<ChevronUp size={16} />{:else}<ChevronDown size={16} />{/if}
      </button>
    </div>
  {/if}
</div>
