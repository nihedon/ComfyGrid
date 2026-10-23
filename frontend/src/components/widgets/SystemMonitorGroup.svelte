<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { comfyUiApiClient } from '@/api/api-client';
  import AppMenu from '@/components/common/AppMenu.svelte';
  import { t } from '@/i18n/i18n';
  import { saveOptsWithCallback } from '@/services/options-service';
  import { appState } from '@/states/app-state.svelte';
  import { toastState } from '@/states/toast-state.svelte';
  import type { MenuEntry } from '@/types/menu';
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

  const menuItems = $derived<MenuEntry[]>([
    {
      id: 'free',
      kind: 'action',
      label: $t('contextmenu.free_memory'),
      onSelect: async () => {
        await comfyUiApiClient.free({ unload_models: false });
        toastState.addToast({ type: 'success', message: $t('toast.free_memory.completed') });
      },
    },
    {
      id: 'unload',
      kind: 'action',
      label: $t('contextmenu.free_memory_and_unload'),
      onSelect: async () => {
        await comfyUiApiClient.free({ unload_models: true });
        toastState.addToast({
          type: 'success',
          message: $t('toast.free_memory_and_unload_models.completed'),
        });
      },
    },
  ]);

  onMount(() => {
    systemState.startMonitoring();
  });

  onDestroy(() => {
    systemState.stopMonitoring();
  });
</script>

<AppMenu items={menuItems} context>
  {#snippet trigger({ props })}
    <div {...props} class={className} {style} ondblclick={changePosition}>
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
  {/snippet}
</AppMenu>
