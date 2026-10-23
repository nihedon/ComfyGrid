<script lang="ts">
  import { ArrowBigDown, ArrowBigUp, Locate, PictureInPicture, Shrink } from '@lucide/svelte';
  import { t } from '@/i18n/i18n';
  import {
    activateTabForNode,
    saveLayoutObject,
    updateBoardFloatingState,
  } from '@/services/gridstack-service';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridNode, ComfyGridWidget } from '@/states/model-state.svelte';
  import type { BoardId } from '@/types/board';
  import type { MenuEntry } from '@/types/menu';
  import { COMFY_NODE_MODE, type ComfyNodeMode } from '@/types/model-shared';
  import logger from '@/utils/logger';
  import GridStackMoveButton from './GridStackMoveButton.svelte';
  import NodeHeaderMenu from './NodeHeaderMenu.svelte';
  import NodeModeSelector from './comfyui/features/NodeModeSelector.svelte';
  import TextareaCategory from './comfyui/features/TextareaCategory.svelte';
  import { createGridStackMoveMenu } from './node-layout-menu';

  let {
    node,
    widget,
    isFloating,
    isInvalid,
    isTextareaOnly,
    hasDomWidget = false,
  }: {
    node: ComfyGridNode;
    widget?: ComfyGridWidget;
    isFloating: boolean;
    isInvalid: boolean;
    isTextareaOnly: boolean;
    hasDomWidget?: boolean;
  } = $props();

  const workspaceState = appState.workspaceState;
  const alwaysShowFocusButton = $derived(
    (appState.optionState.get('ComfyGrid.ui.always_show_node_focus_button') as boolean) ?? false,
  );

  let isTitleEditing = $state(false);
  const title = $derived(widget ? node.title + ' - ' + widget.name : node.title);
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
    activateTabForNode(node.id, workspaceState.layout.floatingNodes.get(node.id) || '');
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
    if (targetBoardId === 'Tab') activateTabForNode(node.id, targetBoardId);
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
      items.unshift({
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
</script>

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
            {#if alwaysShowFocusButton}
              <button
                type="button"
                class="btn btn-xs btn-icon btn-secondary"
                title={$t('node.focus')}
                onclick={focusNodeInComfyUI}
              >
                <Locate size={12} />
              </button>
            {/if}
            <TextareaCategory widget={widget ?? node.widgets[0]} />
          {/if}
        </div>
      {/if}
      {#if !isTitleEditing}
        <span
          {...props}
          class="node-title"
          class:floating={isFloating}
          title="{title} ({node.id})"
          ondblclick={() => {
            if (!widget) {
              isTitleEditing = true;
            }
          }}><span class="node-title-text">{title}</span></span
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
          {#if isFloating && hasDomWidget}
            <button
              type="button"
              class="btn btn-xs btn-icon"
              class:active={workspaceState.layout.isDomFitNode(node.id)}
              aria-pressed={workspaceState.layout.isDomFitNode(node.id)}
              title={$t('node.fit_dom')}
              onclick={() => {
                workspaceState.layout.setDomFitNode(
                  node.id,
                  !workspaceState.layout.isDomFitNode(node.id),
                );
                saveLayoutObject(workspaceState.layout);
              }}><Shrink size={12} /></button
            >
          {/if}
          <GridStackMoveButton items={layoutMenuItems} {isFloating} />
        </div>
      {/if}
    </div>
  {/snippet}
</NodeHeaderMenu>

<style lang="scss">
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
