<script lang="ts">
  import { type Component } from 'svelte';
  import { t } from '@/i18n/i18n';
  import { notifyNodeChanged } from '@/services/custom-node-service.svelte';
  import { updateBoardFloatingState } from '@/services/gridstack-service';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridNode, ComfyGridWidget } from '@/states/model-state.svelte';
  import type { BoardId } from '@/types/board';
  import { COMFY_NODE_MODE, type ComfyNodeMode } from '@/types/model-shared';
  import logger from '@/utils/logger';
  import NodeMode from './comfyui/features/NodeModeSelector.svelte';
  import TextareaCategory from './comfyui/features/TextareaCategory.svelte';
  import { getWidgetComponentWithMeta } from './comfyui/registry/widget-registry';

  let { node, widget }: { node: ComfyGridNode; widget?: ComfyGridWidget } = $props();

  const workspaceState = appState.workspaceState;
  const noControlNodes = $derived(workspaceState.layout.noControlNodes);
  const noCollapsedNodes = $derived(workspaceState.layout.noCollapsedNodes);

  const containsWidgets = $derived.by(() => {
    if (widget) {
      return [widget];
    }
    return node.widgets.filter((w) => !workspaceState.layout.floatingWidgets.get(w.id));
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

  const showNode = $derived.by(() => {
    if (isFloating || workspaceState.hasErrorNode(node.id)) {
      return true;
    }
    if (noControlNodes && containsWidgets.length === 0) {
      return false;
    }
    if (noCollapsedNodes && node.collapsed) {
      return false;
    }
    return true;
  });

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
    if (!isFloating) return '';
    return (
      [...workspaceState.gridStackBoards.keys()]
        .map((id) => id.split('-')[0])
        .find((id) => id !== currentBoardId) || ''
    );
  }) as BoardId;

  const isTextareaOnly = $derived.by(() => {
    if (node.widgets.length === 1 && node.widgets[0].type === 'customtext') {
      return node.widgets[0];
    }
    return null;
  });

  type RenderItem =
    | { type: 'single'; widget: ComfyGridWidget; component: Component }
    | { type: 'single-ce'; widget: ComfyGridWidget; customElement: string }
    | { type: 'grouped'; widgets: ComfyGridWidget[]; component: Component; groupKey: string }
    | { type: 'grouped-ce'; widgets: ComfyGridWidget[]; customElement: string; groupKey: string };

  const renderableWidgets = $derived.by((): RenderItem[] => {
    const items: RenderItem[] = [];
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const renderedGroups = new Set<string>();

    for (const w of containsWidgets) {
      // Skip if input is set or if floating conditions don't match
      if (w.input != null) continue;
      if (widget && w.id !== widget.id) continue;
      if (!widget && workspaceState.layout.floatingWidgets.get(w.id)) continue;

      const matchResult = getWidgetComponentWithMeta(node, w);
      if (!matchResult) continue;

      if (matchResult.groupBy) {
        let groupValue: string;
        if (matchResult.groupBy === 'widget_class_name') {
          groupValue = w.className;
        } else if (matchResult.groupBy === 'widget_name') {
          groupValue = w.name;
        } else {
          groupValue = w.type;
        }

        const groupKey = `${matchResult.groupBy}:${groupValue}`;

        if (!renderedGroups.has(groupKey)) {
          renderedGroups.add(groupKey);
          const groupedWidgets = containsWidgets.filter((gw) => {
            switch (matchResult.groupBy) {
              case 'widget_class_name':
                return gw.className === w.className;
              case 'widget_name':
                return gw.name === w.name;
              case 'widget_type':
                return gw.type === w.type;
              default:
                return false;
            }
          });
          if (matchResult.customElement) {
            items.push({
              type: 'grouped-ce',
              widgets: groupedWidgets,
              customElement: matchResult.customElement,
              groupKey,
            });
          } else if (matchResult.component) {
            items.push({
              type: 'grouped',
              widgets: groupedWidgets,
              component: matchResult.component,
              groupKey,
            });
          }
        }
      } else {
        if (matchResult.customElement) {
          items.push({
            type: 'single-ce',
            widget: w,
            customElement: matchResult.customElement,
          });
        } else if (matchResult.component) {
          items.push({
            type: 'single',
            widget: w,
            component: matchResult.component,
          });
        }
      }
    }

    return items;
  });

  const nodeColorOpts = $derived(
    appState.optionState.opts.get('node_color') ??
      appState.optionState.forms.get('node_color')?.default,
  );

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
    if (widget) {
      const current = workspaceState.layout.floatingWidgets.get(widget.id);
      workspaceState.layout.setFloatingWidgets(widget.id, current ? '' : 'Global');
    } else {
      const current = workspaceState.layout.floatingNodes.get(node.id);
      workspaceState.layout.setFloatingNodes(node.id, current ? '' : 'Global');
    }
    await updateBoardFloatingState();
  }

  async function moveToBoard(targetBoardId: BoardId) {
    if (widget) {
      workspaceState.layout.setFloatingWidgets(widget.id, targetBoardId);
    } else {
      workspaceState.layout.setFloatingNodes(node.id, targetBoardId);
    }
    await updateBoardFloatingState();
  }

  function handleStateChange(e: Event, mode: ComfyNodeMode) {
    node.mode = mode;
    node.setComfyUiProperty('mode', node.mode);
    e.stopPropagation();
  }

  function handleExecuteNode() {
    appState.bridge?.nodeQueue({ nodeId: node.id });
  }

  function handleChangeTitle() {
    node.title = node.title.trim();
    node.setComfyUiProperty('title', node.title);
  }

  function focusOnMount(e: HTMLInputElement) {
    e.focus();
  }

  function getNodeInfo() {
    return {
      id: node.id,
      type: node.type,
      constructorName: node.constructorName,
      comfyClass: node.comfyClass,
      widgets: containsWidgets.map((w) => ({
        name: w.name,
        value: w.value,
        type: w.type,
        className: w.className,
      })),
    };
  }

  $effect(() => {
    notifyNodeChanged(node.id, node);
  });
</script>

<div
  class="node-widget card grid-stack-item-content overflow-hidden shadow-sm"
  class:executing={appState.executionState.runningNodeId == node.id}
  class:normal={node.mode === COMFY_NODE_MODE.NORMAL}
  class:mute={node.mode === COMFY_NODE_MODE.MUTE}
  class:bypass={node.mode === COMFY_NODE_MODE.BYPASS}
  class:is-invalid={workspaceState.hasErrorNode(node.id)}
  style:background-color={bgColor}
  style:display={showNode ? '' : 'none'}
  data-id={node.id}
  data-name={node.title}
>
  <div class="card-header" class:mute={node.mode === 2}>
    {#if !isTitleEditing}
      <div class="d-flex align-items-center gap-2">
        {#if !widget}
          <NodeMode
            mode={new Set([node.mode])}
            handleChange={(e, val) => handleStateChange(e, val)}
          />
          {#if node.hasOutputNode}
            <!-- svelte-ignore a11y_consider_explicit_label -->
            <button
              type="button"
              class="d-flex align-items-center btn btn-sm btn-primary"
              onclick={handleExecuteNode}
            >
              <i class="pi pi-caret-right"></i>
            </button>
          {/if}
          {#if appState.isDebugMode}
            <button
              type="button"
              class="btn btn-xs"
              title={node.id}
              onclick={(e) => {
                e.stopPropagation();
                const nodeInfo = getNodeInfo();
                logger.info(nodeInfo);
                appState.dialogState.showDialog({
                  type: 'TypeInfo',
                  title: 'Node Information',
                  message: JSON.stringify(nodeInfo, null, 2),
                });
              }}
            >
              <i class="pi pi-info-circle"></i>
            </button>
          {/if}
        {/if}
        {#if widget || isTextareaOnly}
          <TextareaCategory widget={widget ?? node.widgets[0]} />
        {/if}
      </div>
    {/if}
    {#if !isTitleEditing}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span
        class="node-title text-truncate fs-6"
        class:floating={isFloating}
        title="{title} ({node.id})"
        ondblclick={() => {
          if (!widget) {
            isTitleEditing = true;
          }
        }}>{title}</span
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
      <div class="d-flex align-items-center">
        {#if isFloating && otherBoardId}
          <button
            type="button"
            class="btn btn-xs"
            title={$t('node.move_to_other_board')}
            onclick={() => moveToBoard(otherBoardId)}
          >
            <i class="pi pi-arrow-right-arrow-left"></i>
          </button>
        {/if}
        <div>
          <button
            type="button"
            class="btn btn-xs"
            title={$t(floatingButtonTitle)}
            onclick={toggleFloating}
          >
            {#if isFloating}
              <i class="pi pi-window-minimize"></i>
            {:else}
              <i class="pi pi-objects-column"></i>
            {/if}
          </button>
        </div>
      </div>
    {/if}
  </div>
  {#if workspaceState.hasErrorNode(node.id) || (!node.collapsed && containsWidgets.length > 0)}
    <div
      class="widget-stack {node.type} {nodeStyle}"
      class:py-1={!widget && !isTextareaOnly}
      class:px-2={!widget && !isTextareaOnly}
    >
      {#each renderableWidgets as item, index (index)}
        {#if item.type === 'grouped'}
          <item.component {node} widgets={item.widgets} options={{ isFloating, isTextareaOnly }} />
        {:else if item.type === 'single'}
          <item.component widget={item.widget} options={{ isFloating, isTextareaOnly }} />
        {:else if item.type === 'grouped-ce'}
          <svelte:element
            this={item.customElement}
            {...{
              node: node,
              widgets: item.widgets,
              options: { isFloating, isTextareaOnly },
            }}
          />
        {:else if item.type === 'single-ce'}
          <svelte:element
            this={item.customElement}
            {...{
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
