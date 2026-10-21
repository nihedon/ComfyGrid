<script lang="ts">
  import { type Component } from 'svelte';
  import {
    ArrowBigDown,
    ArrowBigUp,
    LayoutDashboard,
    Locate,
    PictureInPicture,
  } from '@lucide/svelte';
  import AppMenu from '@/components/common/AppMenu.svelte';
  import { t } from '@/i18n/i18n';
  import { notifyNodeChanged } from '@/services/custom-node-service.svelte';
  import { updateBoardFloatingState } from '@/services/gridstack-service';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridNode, ComfyGridWidget } from '@/states/model-state.svelte';
  import type { BoardId } from '@/types/board';
  import type { MenuEntry } from '@/types/menu';
  import { COMFY_NODE_MODE, type ComfyNodeMode } from '@/types/model-shared';
  import logger from '@/utils/logger';
  import NodeHeaderMenu from './NodeHeaderMenu.svelte';
  import NodeModeSelector from './comfyui/features/NodeModeSelector.svelte';
  import TextareaCategory from './comfyui/features/TextareaCategory.svelte';
  import { getWidgetComponentWithMeta } from './comfyui/registry/widget-registry';
  import { createGridStackMoveMenu } from './node-layout-menu';

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

  const alwaysShowFocusButton = $derived(
    (appState.optionState.get('ComfyGrid.ui.always_show_node_focus_button') as boolean) ?? false,
  );

  let isTitleEditing = $state(false);
  let title = $derived.by(() => {
    if (widget) {
      return node.title + ' - ' + widget.name;
    } else {
      return node.title;
    }
  });

  const floatingButtonTitle = $derived(
    isFloating ? 'node.move_to_group.title' : 'node.move_to_grid.title',
  );

  const currentBoardId = $derived.by(() => {
    if (widget) return workspaceState.layout.floatingWidgets.get(widget.id) || '';
    return workspaceState.layout.floatingNodes.get(node.id) || '';
  });

  const otherBoardId = $derived.by(() => {
    if (!isFloating) return '' as BoardId;
    return (currentBoardId === 'Global' ? 'Tab' : 'Global') as BoardId;
  });

  const isTextareaOnly = $derived.by(() => {
    if (node.widgets.length === 1 && node.widgets[0].type === 'customtext') {
      return node.widgets[0];
    }
    return null;
  });

  type RenderItem =
    | { id: string; type: 'single'; widget: ComfyGridWidget; component: Component }
    | { id: string; type: 'single-ce'; widget: ComfyGridWidget; customElement: string };

  const renderableWidgets = $derived.by((): RenderItem[] => {
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

  async function toggleFloating() {
    const targetId = widget ? widget.id : node.id;
    if (widget) {
      const current = workspaceState.layout.floatingWidgets.get(widget.id);
      const next = current ? '' : 'Global';
      logger.trace(
        `[LAYOUT_LOG] toggleFloating Widget: widgetId=${widget.id}, from="${current}" to="${next}"`,
      );
      workspaceState.layout.setFloatingWidgets(widget.id, next);
    } else {
      const current = workspaceState.layout.floatingNodes.get(node.id);
      const next = current ? '' : 'Global';
      logger.trace(
        `[LAYOUT_LOG] toggleFloating Node: nodeId=${node.id}, from="${current}" to="${next}"`,
      );
      workspaceState.layout.setFloatingNodes(node.id, next);
    }
    await updateBoardFloatingState(targetId);
  }

  async function moveToBoard(targetBoardId: BoardId) {
    const targetId = widget ? widget.id : node.id;
    if (widget) {
      const current = workspaceState.layout.floatingWidgets.get(widget.id);
      logger.trace(
        `[LAYOUT_LOG] moveToBoard Widget: widgetId=${widget.id}, from="${current}" to="${targetBoardId}"`,
      );
      workspaceState.layout.setFloatingWidgets(widget.id, targetBoardId);
    } else {
      const current = workspaceState.layout.floatingNodes.get(node.id);
      logger.trace(
        `[LAYOUT_LOG] moveToBoard Node: nodeId=${node.id}, from="${current}" to="${targetBoardId}"`,
      );
      workspaceState.layout.setFloatingNodes(node.id, targetBoardId);
    }
    await updateBoardFloatingState(targetId);
  }

  function handleStateChange(e: Event, mode: ComfyNodeMode) {
    node.mode = mode;
    e.stopPropagation();
  }

  function handleChangeTitle() {
    node.title = node.title.trim();
  }

  function focusOnMount(e: HTMLInputElement) {
    e.focus();
  }

  function focusNodeInComfyUI() {
    appState.comfyUiState.app?.canvas?.animateToBounds(node.comfyNode.boundingRect);
    appState.uiState.activePageId = 'comfyui';
    appState.uiState.needRefresh = true;
  }

  const layoutMenuItems = $derived.by((): MenuEntry[] => {
    const items: MenuEntry[] = [
      isFloating
        ? {
            id: 'floating',
            kind: 'action',
            label: $t(floatingButtonTitle),
            icon: PictureInPicture,
            onSelect: toggleFloating,
          }
        : createGridStackMoveMenu($t, moveToBoard),
    ];
    if (isFloating && otherBoardId)
      items.push({
        id: 'board',
        kind: 'action',
        label: $t(
          currentBoardId === 'Global' ? 'node.move_to_other_board' : 'node.move_to_global_board',
        ),
        icon: currentBoardId === 'Global' ? ArrowBigDown : ArrowBigUp,
        onSelect: () => moveToBoard(otherBoardId),
      });
    return items;
  });

  const moveMenuItems = $derived(
    layoutMenuItems.flatMap((item) => (item.kind === 'submenu' ? item.items : [item])),
  );

  $effect(() => {
    notifyNodeChanged(node.id, node);
  });
</script>

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
  <NodeHeaderMenu {node} {widget} extraItems={layoutMenuItems} disabled={isTitleEditing}>
    {#snippet trigger({ props })}
      <div class="card-header" class:mute={node.mode === COMFY_NODE_MODE.MUTE}>
        {#if !isTitleEditing}
          <div class="card-header-left">
            {#if !widget}
              {#if !node.isNote}
                <NodeModeSelector
                  mode={new Set([node.mode])}
                  handleChange={(e, val) => handleStateChange(e, val)}
                />
              {/if}
              {#if alwaysShowFocusButton || isInvalid}
                <button
                  type="button"
                  class={`btn btn-xs btn-icon btn-${isInvalid ? 'danger' : 'secondary'}`}
                  title={$t('node.focus')}
                  onclick={focusNodeInComfyUI}
                >
                  <Locate size={12} />
                </button>
              {/if}
            {/if}
            {#if widget || (isTextareaOnly && !node.isNote)}
              <TextareaCategory widget={widget ?? node.widgets[0]} />
            {/if}
          </div>
        {/if}
        {#if !isTitleEditing}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span
            class="node-title"
            class:floating={isFloating}
            title="{title} ({node.id})"
            ondblclick={() => {
              if (!widget) {
                isTitleEditing = true;
              }
            }}><span {...props} class="node-title-text">{title}</span></span
          >
        {:else}
          <input
            type="text"
            class="form-control"
            bind:value={node.title}
            use:focusOnMount
            onblur={() => {
              isTitleEditing = false;
            }}
            onkeypress={(e) => {
              if (e.key === 'Enter') {
                isTitleEditing = false;
                handleChangeTitle();
              }
            }}
          />
        {/if}
        {#if !isTitleEditing}
          <div class="card-header-right">
            <AppMenu items={moveMenuItems} align="end">
              {#snippet trigger({ props })}
                <button
                  {...props}
                  type="button"
                  class="btn btn-xs btn-icon gridstack-move-button"
                  class:active={isFloating}
                  title={$t('node.menu.move')}
                  aria-label={$t('node.menu.move')}
                >
                  <LayoutDashboard size={12} />
                </button>
              {/snippet}
            </AppMenu>
          </div>
        {/if}
      </div>
    {/snippet}
  </NodeHeaderMenu>
  {#if !node.collapsed && containsWidgets.length > 0 && containsDrawableWidget}
    <div
      class="widget-stack {nodeStyle}"
      class:py-1={!widget && !isTextareaOnly}
      class:px-2={!widget && !isTextareaOnly}
      data-type={node.type}
    >
      {#each renderableWidgets as item (item.id)}
        {#if item.type === 'single'}
          <item.component widget={item.widget} options={{ isFloating, isTextareaOnly }} />
        {:else if item.type === 'single-ce'}
          <svelte:element
            this={item.customElement}
            use:bindCustomElementProps={{
              widget: item.widget,
              options: { isFloating, isTextareaOnly },
            }}
          />
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style lang="scss">
  .gridstack-move-button {
    --bs-btn-active-color: #fff;
    --bs-btn-active-bg: var(--bs-primary);
    --bs-btn-active-border-color: var(--bs-primary);
  }

  .btn-sm {
    padding: 0.25rem !important;
  }
  .card-header {
    padding: 0.15rem 0.25rem !important;
  }

  .node-title {
    width: 100%;
    text-align: center;
  }

  .node-title.floating {
    user-select: none;
    cursor: move;
  }
</style>
