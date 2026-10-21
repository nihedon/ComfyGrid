<script lang="ts">
  import {
    ChevronDown,
    ChevronUp,
    CopyPlus,
    Info,
    Languages,
    Locate,
    Play,
    RedoDot,
    Settings,
    Trash2,
  } from '@lucide/svelte';
  import { NodeDuplicationError, getNodeDuplicationIssue } from '@/bridge/node-duplication';
  import AppMenu from '@/components/common/AppMenu.svelte';
  import { t } from '@/i18n/i18n';
  import { nodeDuplicationManager } from '@/managers/node-duplication-manager';
  import { nodeRemovalManager } from '@/managers/node-removal-manager';
  import {
    TEXT_CATEGORIES,
    type TextCategory,
    getTextCategory,
    setTextCategory,
  } from '@/services/text-widget-service';
  import { translationManager } from '@/services/translation-service.svelte';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridNode, ComfyGridWidget } from '@/states/model-state.svelte';
  import type { MenuEntry, MenuTrigger } from '@/types/menu';
  import { COMFY_NODE_MODE, type ComfyNodeMode } from '@/types/model-shared';
  import logger from '@/utils/logger';

  let {
    node,
    widget,
    trigger,
    extraItems = [],
    disabled = false,
  }: {
    node: ComfyGridNode;
    widget?: ComfyGridWidget;
    trigger: MenuTrigger;
    extraItems?: MenuEntry[];
    disabled?: boolean;
  } = $props();
  let isDuplicating = $state(false);
  let isDeleting = $state(false);
  let duplicationIssue = $state<ReturnType<typeof getNodeDuplicationIssue>>();
  const textWidget = $derived(
    widget?.type === 'customtext'
      ? widget
      : !widget && node.widgets.length === 1 && node.widgets[0].type === 'customtext'
        ? node.widgets[0]
        : undefined,
  );

  async function duplicate() {
    if (isDuplicating) return;
    isDuplicating = true;
    try {
      await nodeDuplicationManager.duplicateNode(node);
    } catch (error) {
      logger.error('Failed to duplicate node:', error);
      const issue = error instanceof NodeDuplicationError ? error.issue : 'failed';
      appState.toastState.addToast({ type: 'error', message: $t(`node.duplicate.error.${issue}`) });
    } finally {
      isDuplicating = false;
    }
  }

  function handleMenuOpen(open: boolean) {
    if (open && !widget) duplicationIssue = getNodeDuplicationIssue(node.comfyNode);
  }

  async function deleteNode() {
    if (isDeleting || !confirm($t('node.menu.delete_confirm'))) return;
    isDeleting = true;
    try {
      await nodeRemovalManager.deleteNode(node);
    } catch (error) {
      logger.error('Failed to delete node:', error);
      appState.toastState.addToast({ type: 'error', message: $t('node.menu.delete_failed') });
    } finally {
      isDeleting = false;
    }
  }

  function toggleCollapsed() {
    try {
      appState.bridge?.toggleNodeCollapsed({ nodeId: node.id });
    } catch (error) {
      logger.error('Failed to collapse node:', error);
      appState.toastState.addToast({ type: 'error', message: $t('node.menu.collapse_failed') });
    }
  }

  const items = $derived.by((): MenuEntry[] => {
    if (widget) return extraItems;
    const result: MenuEntry[] = [];
    if (!node.isNote) {
      result.push({
        id: 'mode',
        kind: 'radio',
        label: $t('node.menu.mode'),
        icon: RedoDot,
        value: String(node.mode),
        options: Object.values(COMFY_NODE_MODE).map((mode) => ({
          value: String(mode),
          label: $t(`node.mode.mode_type_${mode}`),
        })),
        onValueChange: (value) => {
          node.mode = Number(value) as ComfyNodeMode;
        },
      });
    }
    result.push({
      id: 'focus',
      kind: 'action',
      label: $t('node.focus'),
      icon: Locate,
      onSelect: () => {
        appState.comfyUiState.app?.canvas?.animateToBounds(node.comfyNode.boundingRect);
        appState.uiState.activePageId = 'comfyui';
        appState.uiState.needRefresh = true;
      },
    });
    if (!widget && node.hasOutputNode)
      result.push({
        id: 'execute',
        kind: 'action',
        label: $t('node.menu.execute'),
        icon: Play,
        onSelect: () => {
          appState.bridge?.nodeQueue({ nodeId: node.id });
        },
      });
    if (!widget && !node.isNote)
      result.push({
        id: 'duplicate',
        kind: 'action',
        label: $t('node.duplicate.title'),
        icon: CopyPlus,
        disabled: isDuplicating || Boolean(duplicationIssue),
        hint: duplicationIssue ? $t(`node.duplicate.error.${duplicationIssue}`) : undefined,
        onSelect: duplicate,
      });
    if (textWidget) {
      const target = textWidget;
      const category = getTextCategory(target);
      result.push({
        id: 'text-type',
        kind: 'radio',
        label: $t('node.menu.text_type'),
        icon: Languages,
        value: category,
        options: TEXT_CATEGORIES.map((value) => ({
          value,
          label: $t(`widget.select.${value}.title`),
        })),
        onValueChange: (value) => {
          void setTextCategory(target, value as TextCategory);
        },
      });
      result.push({
        id: 'ollama-settings',
        kind: 'action',
        label: $t('node.menu.ollama_settings'),
        icon: Settings,
        disabled: category !== 'translate',
        onSelect: () => {
          if (getTextCategory(target) === 'translate')
            appState.ollamaSettingModalState.show(target.id);
        },
      });
      if (category === 'translate' && target.isTranslating) {
        result.push({
          id: 'cancel-translation',
          kind: 'action',
          label: $t('widget.translate.cancel'),
          onSelect: () => translationManager.cancelAll(),
        });
      } else if (
        category === 'translate' &&
        target.isDirty &&
        appState.optionState.get('ComfyGrid.ollama.translate_timing') === 'manual'
      ) {
        result.push({
          id: 'translate',
          kind: 'action',
          label: $t('widget.translate.manual_button'),
          icon: Languages,
          onSelect: () => {
            void target.triggerTranslation?.();
          },
        });
      }
    }
    if (extraItems.length)
      result.push({ id: 'layout-separator', kind: 'separator' }, ...extraItems);
    if (!widget && appState.isDebugMode) {
      result.push({ id: 'info-separator', kind: 'separator' });
      result.push({
        id: 'info',
        kind: 'action',
        label: $t('node.menu.info'),
        icon: Info,
        onSelect: () => {
          const info = {
            id: node.id,
            type: node.type,
            constructorName: node.constructorName,
            comfyClass: node.comfyClass,
            widgets: node.widgets.map((w) => ({
              name: w.name,
              value: w.value,
              type: w.type,
              className: w.className,
            })),
          };
          logger.info(info);
          appState.dialogState.showDialog({
            type: 'TypeInfo',
            title: $t('node.menu.info'),
            message: JSON.stringify(info, null, 2),
          });
        },
      });
    }
    if (!widget) {
      result.push(
        { id: 'node-actions-separator', kind: 'separator' },
        {
          id: 'collapse',
          kind: 'action',
          label: $t(node.collapsed ? 'node.menu.expand' : 'node.menu.collapse'),
          icon: node.collapsed ? ChevronDown : ChevronUp,
          disabled: !appState.bridge,
          onSelect: toggleCollapsed,
        },
        {
          id: 'delete',
          kind: 'action',
          label: $t('node.menu.delete'),
          icon: Trash2,
          danger: true,
          disabled: isDeleting || !appState.bridge,
          onSelect: deleteNode,
        },
      );
    }
    return result;
  });
</script>

<AppMenu {trigger} {items} {disabled} context onOpenChange={handleMenuOpen} />
