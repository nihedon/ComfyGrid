<script lang="ts">
  import { Check, Languages, Loader2, Settings, Tag, TriangleAlert, X } from '@lucide/svelte';
  import AppMenu from '@/components/common/AppMenu.svelte';
  import { t } from '@/i18n/i18n';
  import {
    TEXT_CATEGORIES,
    getTextCategory,
    setTextCategory,
    toggleTextTags,
  } from '@/services/text-widget-service';
  import { translationManager } from '@/services/translation-service.svelte';
  import { appState } from '@/states/app-state.svelte';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';
  import type { MenuEntry } from '@/types/menu';

  let { widget, onManualTranslate }: { widget: ComfyGridWidget; onManualTranslate?: () => void } =
    $props();

  const workspaceState = appState.workspaceState;
  const optionState = appState.optionState;

  const layout = $derived(workspaceState.layout);
  const isTranslate = $derived(layout.isTranslateWidget(widget.id));
  const isManual = $derived(
    (optionState.get('ComfyGrid.ollama.translate_timing') ?? 'on_generate') === 'manual',
  );

  const category = $derived(getTextCategory(widget));
  const textCategoryLabel = $derived($t(`widget.select.${category}.title`));
  const items = $derived(
    TEXT_CATEGORIES.map((value): MenuEntry => ({
      id: value,
      kind: 'action',
      label: $t(`widget.select.${value}.title`),
      selected: category === value,
      onSelect: () => setTextCategory(widget, value),
    })),
  );

  function openOllamaSettings(event: MouseEvent) {
    event.stopPropagation();
    appState.ollamaSettingModalState.show(widget.id);
  }
</script>

<div class="d-inline-flex align-items-center">
  <span
    class="category-selector d-inline-flex align-items-center me-2"
    class:has-settings={isTranslate}
  >
    <AppMenu {items} side="right">
      {#snippet trigger({ props })}
        <button
          {...props}
          type="button"
          class="nav-link dropdown-toggle text-capitalize border-0 bg-transparent p-0"
        >
          {textCategoryLabel}
        </button>
      {/snippet}
    </AppMenu>
    {#if category === 'prompt' || category === 'json'}
      <button
        type="button"
        class="btn btn-xs btn-icon tags-toggle ms-2"
        class:btn-secondary={!layout.isTagWidget(widget.id)}
        class:active={layout.isTagWidget(widget.id)}
        aria-pressed={layout.isTagWidget(widget.id)}
        title={$t('widget.tags.toggle')}
        aria-label={$t('widget.tags.toggle')}
        onpointerdown={(event) => event.stopPropagation()}
        onclick={(event) => {
          event.stopPropagation();
          void toggleTextTags(widget);
        }}><Tag size={12} /></button
      >
    {/if}
    {#if isTranslate}
      <button
        type="button"
        class="ollama-settings nav-link d-inline-flex align-items-center justify-content-center border-0 bg-transparent p-0"
        title={$t('node.menu.ollama_settings')}
        aria-label={$t('node.menu.ollama_settings')}
        onpointerdown={(event) => event.stopPropagation()}
        onclick={openOllamaSettings}
      >
        <Settings size={14} />
      </button>
    {/if}
  </span>
  {#if widget.isTranslating}
    <span class="badge text-bg-primary ms-2 fs-7 d-inline-flex align-items-center gap-1">
      <Loader2 size={14} class="spin" />
      {$t('widget.translate.indicator')}
      <button
        type="button"
        class="btn text-white p-0 border-0 d-inline-flex align-items-center justify-content-center"
        title={$t('widget.translate.cancel_hint')}
        aria-label={$t('widget.translate.cancel_hint')}
        onclick={() => translationManager.cancelAll()}
      >
        <X size={14} />
      </button>
    </span>
  {:else if isTranslate && isManual && widget.isDirty}
    <button
      class="badge btn btn-primary ms-2 px-2 d-inline-flex align-items-center gap-1"
      onclick={() => {
        if (onManualTranslate) {
          onManualTranslate();
        } else if (widget.triggerTranslation) {
          widget.triggerTranslation();
        }
      }}
    >
      <Languages size={14} />
      {$t('widget.translate.manual_button')}
    </button>
  {:else if isTranslate && widget.translationFailed}
    <span class="badge text-bg-danger ms-2 fs-7 d-inline-flex align-items-center gap-1">
      <TriangleAlert size={14} />
      {$t('widget.translate.failed')}
    </span>
  {:else if isTranslate && !widget.isDirty && widget.rawValue && widget.rawValue.trim() !== ''}
    <span class="badge text-bg-success ms-2 fs-7 d-inline-flex align-items-center gap-1">
      <Check size={14} />
      {$t('widget.translate.completed')}
    </span>
  {/if}
</div>

<style>
  .category-selector {
    position: relative;
  }

  .has-settings :global(.dropdown-toggle::after) {
    margin-left: calc(14px + 0.5em);
  }

  .ollama-settings {
    position: absolute;
    right: 0.85em;
    top: 50%;
    transform: translateY(-50%);
  }
</style>
