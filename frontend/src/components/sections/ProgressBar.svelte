<script lang="ts">
  import { elasticInOut } from 'svelte/easing';
  import { Tween } from 'svelte/motion';
  import { appState } from '@/states/app-state.svelte';

  const executionState = appState.executionState;

  let totalProgressTween = new Tween(0, {
    duration: (from, to) => (to > from ? 100 : 0),
    easing: elasticInOut,
  });
  let jobProgressTween = new Tween(0, {
    duration: (from, to) => (to > from ? 100 : 0),
    easing: elasticInOut,
  });
  let nodeProgressTween = new Tween(0, {
    duration: (from, to) => (to > from ? 100 : 0),
    easing: elasticInOut,
  });

  const busy = $derived(
    executionState.queueJobIds.size > 0 &&
      executionState.queueJobIds.get(executionState.lastProcessedJobId) === 'external',
  );
  const hidden = $derived(
    !busy &&
      executionState.progress.status !== 'processing' &&
      executionState.progress.status !== 'interrupted',
  );

  const progressLabel = $derived.by(() => {
    if (busy) {
      return 'Processing in background...';
    }
    if (executionState.progress.status && executionState.progress.label) {
      return executionState.progress.label;
    }
    return '';
  });

  $effect(() => {
    if (busy) {
      totalProgressTween.target = 100;
      jobProgressTween.target = 100;
      nodeProgressTween.target = 100;
      return;
    }

    if (hidden) {
      totalProgressTween.target = 0;
      jobProgressTween.target = 0;
      nodeProgressTween.target = 0;
      return;
    }

    totalProgressTween.set(executionState.totalProgress);
    jobProgressTween.set(executionState.jobProgress);
    nodeProgressTween.set(executionState.nodeProgress);
  });
</script>

<svelte:head>
  {#if busy || hidden}
    <title>ComfyGrid</title>
  {:else}
    <title>ComfyGrid - {executionState.totalProgress.toFixed(0)}%</title>
  {/if}
</svelte:head>

<div class="position-relative">
  {#snippet progressbar(
    className: string | undefined,
    animated: boolean,
    tween: Tween<number>,
    color: string | undefined = undefined,
  )}
    <div class="progress {className}">
      <div
        class="progress-bar {color}"
        class:progress-bar-striped={animated}
        class:progress-bar-animated={animated}
        class:d-none={hidden}
        style:width="{tween.current}%"
      ></div>
    </div>
  {/snippet}
  {#if busy}
    {@render progressbar('', true, totalProgressTween, 'bg-info')}
  {:else}
    {@render progressbar('total-progress', busy, totalProgressTween)}
    {@render progressbar('job-progress', busy, jobProgressTween)}
    {@render progressbar('node-progress', true, nodeProgressTween)}
  {/if}
  <span
    class="progress-label position-absolute top-50 start-50 translate-middle text-white fw-bold"
  >
    {progressLabel}
  </span>
</div>

<style lang="scss">
  .progress {
    height: 14px;

    border-radius: initial;
    &.total-progress {
      height: 5px;
    }

    &.job-progress {
      height: 5px;
    }

    &.node-progress {
      height: 4px;
    }
  }

  .progress {
    border: none !important;
  }

  .progress-label {
    font-size: 10px;
    letter-spacing: 0.2em;
    -webkit-text-stroke: 2px black;
    paint-order: stroke;
  }
</style>
