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

  const systemMonitor = $derived(optionState.get('ComfyGrid.ui.system_monitor'));

  const showCpu = $derived((optionState.get('ComfyGrid.system_monitor.cpu') as boolean) ?? true);
  const showRam = $derived((optionState.get('ComfyGrid.system_monitor.ram') as boolean) ?? true);
  const showGpu = $derived((optionState.get('ComfyGrid.system_monitor.gpu') as boolean) ?? true);
  const showVram = $derived((optionState.get('ComfyGrid.system_monitor.vram') as boolean) ?? true);
  const showTemp = $derived((optionState.get('ComfyGrid.system_monitor.temp') as boolean) ?? true);

  function changePosition() {
    if (systemMonitor === 'top') {
      optionState.set('ComfyGrid.ui.system_monitor', 'left');
    } else if (systemMonitor === 'left') {
      optionState.set('ComfyGrid.ui.system_monitor', 'top');
    }
    saveOptsWithCallback();
  }

  let cardEl: HTMLDivElement | null = $state(null);
  let menuEl: HTMLDivElement | null = $state(null);

  function setMonitorPosition(position: 'top' | 'left' | 'none') {
    if (position === systemMonitor) {
      return;
    }
    optionState.set('ComfyGrid.ui.system_monitor', position);
    saveOptsWithCallback();
  }

  function toggleMonitorItem(itemKey: 'cpu' | 'ram' | 'gpu' | 'vram' | 'temp') {
    const fullKey = `ComfyGrid.monitor.${itemKey}`;
    const current = (optionState.get(fullKey) as boolean) ?? true;
    optionState.set(fullKey, !current);
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
          } else if (
            action === 'cpu' ||
            action === 'ram' ||
            action === 'gpu' ||
            action === 'vram' ||
            action === 'temp'
          ) {
            toggleMonitorItem(action);
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
  {#if showCpu}
    <SystemMonitor monitorType="cpu" {simple} {showCores} />
  {/if}
  {#if showRam}
    <SystemMonitor monitorType="ram" {simple} />
  {/if}
  {#if showGpu}
    <SystemMonitor monitorType="gpu" {simple} />
  {/if}
  {#if showVram}
    <SystemMonitor monitorType="vram" {simple} />
  {/if}
  {#if showTemp}
    <SystemMonitor monitorType="temp" {simple} />
  {/if}
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
