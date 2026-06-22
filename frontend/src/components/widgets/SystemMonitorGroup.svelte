<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import jQuery from 'jquery';
  import { comfyUiApiClient } from '@/api/api-client';
  import { t } from '@/i18n/i18n';
  import { saveOptsWithCallback } from '@/services/options-service';
  import { appState } from '@/states/app-state.svelte';
  import { toastState } from '@/states/toast-state.svelte';
  import SystemMonitor from './SystemMonitor.svelte';

  let {
    simple = false,
    showCores = true,
    className,
    style,
  } = $props<{
    simple?: boolean;
    showCores?: boolean;
    className?: string;
    style?: string;
  }>();

  let systemState = appState.systemState;
  let optionState = appState.optionState;

  const systemMonitor = $derived(
    optionState.opts.get('system_monitor') ?? optionState.forms.get('system_monitor')?.default,
  );

  function changePosition() {
    if (systemMonitor === 'top') {
      optionState.setOptionValue('system_monitor', 'left');
    } else if (systemMonitor === 'left') {
      optionState.setOptionValue('system_monitor', 'top');
    }
    saveOptsWithCallback();
  }

  let cardEl: HTMLDivElement | null = $state(null);
  let menuEl: HTMLDivElement | null = $state(null);

  function setMonitorPosition(position: 'top' | 'left' | 'none') {
    optionState.setOptionValue('system_monitor', position);
    saveOptsWithCallback();
  }

  onMount(() => {
    systemState.startMonitoring();

    if (menuEl) {
      document.body.appendChild(menuEl);
    }

    // eslint-disable-next-line no-unsafe-optional-chaining
    if (cardEl && jQuery?.fn && 'contextmenu' in jQuery?.fn) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (jQuery(cardEl) as any).contextmenu({
        target: '#system-monitor-context-menu',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onItem: (_context: any, e: Event) => {
          const action = (e.target as HTMLElement).dataset.action;
          if (action === 'top' || action === 'left' || action === 'none') {
            setMonitorPosition(action);
          }
        },
      });
    }
  });

  onDestroy(() => {
    systemState.stopMonitoring();
    if (menuEl && menuEl.parentNode) {
      menuEl.parentNode.removeChild(menuEl);
    }
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class={className} {style} bind:this={cardEl} ondblclick={changePosition}>
  <SystemMonitor monitorType="cpu" {simple} {showCores} />
  <SystemMonitor monitorType="ram" {simple} />
  <SystemMonitor monitorType="gpu" {simple} />
  <SystemMonitor monitorType="vram" {simple} />
  <SystemMonitor monitorType="temp" {simple} />
</div>

<div id="system-monitor-context-menu" bind:this={menuEl}>
  <ul class="dropdown-menu" role="menu">
    <li>
      <button
        type="button"
        class="dropdown-item d-flex align-items-center justify-content-between"
        onclick={() => {
          comfyUiApiClient.free({ unload_models: false }).then(() => {
            toastState.addToast({ type: 'success', message: $t('toast.free_memory.completed') });
          });
        }}
      >
        <span>{$t('contextmenu.free_memory')}</span>
      </button>
    </li>
    <li>
      <button
        type="button"
        class="dropdown-item d-flex align-items-center justify-content-between"
        onclick={() => {
          comfyUiApiClient.free({ unload_models: true }).then(() => {
            toastState.addToast({
              type: 'success',
              message: $t('toast.free_memory_and_unload_models.completed'),
            });
          });
        }}
      >
        <span>{$t('contextmenu.free_memory_and_unload_models')}</span>
      </button>
    </li>
  </ul>
</div>

<style>
  :global(#system-monitor-context-menu) {
    position: absolute;
    display: none;
    z-index: 9999;
  }
  :global(#system-monitor-context-menu.open) {
    display: block !important;
  }
  :global(#system-monitor-context-menu.open .dropdown-menu) {
    display: block !important;
  }
</style>
