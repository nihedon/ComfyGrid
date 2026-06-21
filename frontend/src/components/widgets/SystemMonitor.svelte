<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { appState } from '@/states/app-state.svelte';

  let {
    monitorType,
    simple = false,
    showCores = true,
  } = $props<{
    monitorType: 'cpu' | 'ram' | 'gpu' | 'vram' | 'temp';
    simple?: boolean;
    showCores?: boolean;
  }>();

  let systemState = appState.systemState;

  const isGpuGroup = $derived(
    monitorType === 'gpu' || monitorType === 'vram' || monitorType === 'temp',
  );

  // 温度用のmax（120℃想定）
  let tempMax = $state(120);

  const cpu = $derived(systemState.cpu);
  const ram = $derived(systemState.ram);
  const gpu = $derived(systemState.gpu);
  const cpuHistory = $derived(systemState.cpuHistory);
  const ramHistory = $derived(systemState.ramHistory);
  const gpuHistory = $derived(systemState.gpuHistory);
  const vramHistory = $derived(systemState.vramHistory);
  const tempHistory = $derived(systemState.tempHistory);

  function color(v: number, warn = 50, crit = 80): string {
    if (v >= crit) return '#e24b4a';
    if (v >= warn) return '#ef9f27';
    return '#1d9e75';
  }
  function tempColor(t: number) {
    if (t >= 85) return '#e24b4a';
    if (t >= 70) return '#ef9f27';
    return '#1d9e75';
  }

  // SVGパス
  const WIDTH = $derived(simple ? 300 : 600);
  const HEIGHT = 100;

  function linePath(vals: number[], max = 100): string {
    const step = WIDTH / (vals.length - 1);
    return vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${i * step},${HEIGHT - (v / max) * HEIGHT}`)
      .join(' ');
  }

  function areaPath(vals: number[], max = 100): string {
    return `${linePath(vals, max)} L ${WIDTH},${HEIGHT} L 0,${HEIGHT} Z`;
  }

  onMount(() => {
    systemState.startMonitoring();
  });

  onDestroy(() => {
    systemState.stopMonitoring();
  });
</script>

{#snippet sparkbox(ariaLabel: string, history: number[], max: number = 100, color: string)}
  <div class="sparkbox">
    <svg
      viewBox="0 0 {WIDTH} {HEIGHT}"
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel}
    >
      <path d={areaPath(history, max)} fill={color} fill-opacity="0.15" />
      <path
        d={linePath(history, max)}
        fill="none"
        stroke={color}
        stroke-width="1.5"
        stroke-linejoin="round"
      />
    </svg>
  </div>
{/snippet}

<div class="card" class:simple class:unavailable={isGpuGroup && !gpu.available}>
  <!-- CPU -->
  {#if monitorType === 'cpu'}
    <div class="card-head w-100">
      <span>
        <span class="label">CPU</span>
        {#if !simple && cpu.freq_mhz}
          <span class="label chip">{cpu.freq_mhz} MHz</span>
        {/if}
      </span>
      <span class="val" style:color={color(cpu.total)}
        >{cpu.total.toFixed(1)}<span class="sup">%</span></span
      >
    </div>
    {@render sparkbox('CPU Usage Graph', cpuHistory, 100, color(cpu.total ?? 0))}
    <!-- Core -->
    {#if !simple && showCores && cpu.per_core.length}
      <div class="core-row">
        {#each cpu.per_core as c, i (i)}
          <div class="core-cell">
            <div class="core-bg">
              <div class="core-fill" style:height={c + '%'} style:background={color(c)}></div>
            </div>
            <span class="core-lbl" style:color={color(c)}>{Math.round(c)}%</span>
            <span class="core-name">C{i}</span>
          </div>
        {/each}
      </div>
    {/if}
  {:else if monitorType === 'ram'}
    <!-- RAM -->
    <div class="card-head w-100">
      <span class="label">RAM</span>
      <span class="val" style:color={color(ram.pct)}
        >{ram.pct.toFixed(1)}<span class="sup">%</span></span
      >
    </div>
    {@render sparkbox('RAM Usage Graph', ramHistory, 100, color(ram.pct ?? 0))}
    {#if !simple}
      <div class="sub-info">
        <span>{ram.used_gb.toFixed(1)} GB</span>
        <span class="muted">/ {ram.total_gb.toFixed(1)} GB</span>
      </div>
      <div class="progress-track">
        <div
          class="progress-fill"
          style:width={ram.pct + '%'}
          style:background={color(ram.pct)}
        ></div>
      </div>
    {/if}
  {:else if monitorType === 'gpu'}
    <!-- GPU -->
    <div class="card-head w-100">
      <span>
        <span class="label">GPU</span>
        {#if gpu.available && !simple && gpu.name}<span class="label chip">{gpu.name}</span>{/if}
      </span>
      {#if gpu.available}
        <span class="val" style:color={color(gpu.gpu_pct ?? 0)}
          >{(gpu.gpu_pct ?? 0).toFixed(1)}<span class="sup">%</span></span
        >
      {:else}
        <span class="no-gpu">N/A</span>
      {/if}
    </div>
    {#if gpu.available}
      {@render sparkbox('GPU Usage Graph', gpuHistory, 100, color(gpu.gpu_pct ?? 0))}
      {#if !simple}
        <div class="progress-track">
          <div
            class="progress-fill"
            style:width={(gpu.gpu_pct ?? 0) + '%'}
            style:background={color(gpu.gpu_pct ?? 0)}
          ></div>
        </div>
      {/if}
    {:else}
      <p class="no-gpu-msg">Not Found</p>
    {/if}
  {:else if monitorType === 'vram'}
    <!-- VRAM -->
    <div class="card-head w-100">
      <span class="label">VRAM</span>
      {#if gpu.available}
        <span class="val" style:color={color(gpu.vram_pct ?? 0)}
          >{(gpu.vram_pct ?? 0).toFixed(1)}<span class="sup">%</span></span
        >
      {:else}
        <span class="no-gpu">N/A</span>
      {/if}
    </div>
    {#if gpu.available}
      {@render sparkbox('VRAM Usage Graph', vramHistory, 100, color(gpu.vram_pct ?? 0))}
      {#if !simple}
        <div class="sub-info">
          <span>{(gpu.vram_used ?? 0).toFixed(1)} GB</span>
          <span class="muted">/ {(gpu.vram_total ?? 0).toFixed(1)} GB</span>
        </div>
        <div class="progress-track">
          <div
            class="progress-fill"
            style:width={(gpu.vram_pct ?? 0) + '%'}
            style:background={color(gpu.vram_pct ?? 0)}
          ></div>
        </div>
      {/if}
    {:else}
      <p class="no-gpu-msg">Not Found</p>
    {/if}
  {:else if monitorType === 'temp'}
    <!-- TEMP -->
    <div class="card-head w-100">
      <span class="label">TEMP</span>
      {#if gpu.available}
        <span class="val" style:color={tempColor(gpu.temp_c ?? 0)}
          >{gpu.temp_c ?? 0}<span class="sup">°C</span></span
        >
      {:else}
        <span class="no-gpu">N/A</span>
      {/if}
    </div>
    {#if gpu.available}
      {@render sparkbox('GPU Temperature Graph', tempHistory, tempMax, tempColor(gpu.temp_c ?? 0))}
      {#if !simple}
        <!-- Temperature Gauge -->
        <div class="temp-gauge">
          {#each [40, 60, 80, 100, 120] as mark, i (i)}
            <span class="temp-mark" style:left={(mark / tempMax) * 100 + '%'}>{mark}</span>
          {/each}
          <div class="progress-track">
            <div
              class="progress-fill"
              style:width={((gpu.temp_c ?? 0) / tempMax) * 100 + '%'}
              style:background={tempColor(gpu.temp_c ?? 0)}
            ></div>
          </div>
        </div>
      {/if}
    {:else}
      <p class="no-gpu-msg">Not Found</p>
    {/if}
  {/if}
</div>

<style>
  .card {
    font-family: 'Courier New', monospace;
    user-select: none;
    position: relative;

    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }

    .no-gpu-msg {
      width: 100%;
      font-size: 0.9rem;
      color: #3a3f52;
      margin: 0;
      text-align: center;
    }

    &:not(.simple) {
      padding: 0.5rem;
      gap: 0.5rem;
    }

    &.simple {
      min-width: 95px;

      .card-head {
        position: absolute;
        padding: 0 0.5rem;
      }

      .no-gpu-msg {
        position: absolute;
        bottom: 0;
      }
    }

    &.unavailable {
      opacity: 0.45;
    }
  }

  .label {
    font-size: 0.9rem;
    letter-spacing: 0.1em;
  }
  .val {
    display: flex;
    align-items: flex-start;
    font-weight: 700;
    line-height: 1;
    transition: color 0.4s;
    letter-spacing: -1px;
    .sup {
      font-size: 0.9rem;
    }
  }
  .no-gpu {
    font-size: 0.9rem;
    color: #3a3f52;
  }

  .sparkbox {
    height: 100%;
    border-radius: 4px;
    overflow: hidden;
    svg {
      width: 100%;
      height: 100%;
      display: block;
    }
  }

  .progress-track {
    height: 5px;
    border-radius: 2px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    border-radius: 2px;
    transition:
      width 0.6s ease,
      background 0.4s;
    min-width: 2px;
  }

  .sub-info {
    font-size: 12px;
    display: flex;
    gap: 4px;
    align-items: baseline;
  }
  .muted {
    color: #555d78;
    font-size: 11px;
  }

  .core-row {
    display: flex;
    flex-wrap: wrap;
  }
  .core-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 28px;
  }
  .core-bg {
    width: 16px;
    height: 20px;
    border-radius: 3px;
    display: flex;
    align-items: flex-end;
    overflow: hidden;
  }
  .core-fill {
    width: 100%;
    border-radius: 3px 3px 0 0;
    transition:
      height 0.6s ease,
      background 0.4s;
    min-height: 2px;
  }
  .core-lbl {
    font-size: 8px;
    font-weight: 600;
    transition: color 0.4s;
  }
  .core-name {
    font-size: 8px;
  }

  .temp-gauge {
    position: relative;
    padding-top: 14px;
  }
  .temp-mark {
    position: absolute;
    top: 0;
    font-size: 8px;
    transform: translateX(-50%);
  }

  :global(.system-monitor-popover) {
    --bs-popover-body-padding-x: 0;
    --bs-popover-body-padding-y: 0;
    border: 1px solid var(--bs-border-color);
  }
</style>
