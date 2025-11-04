<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import logger from '@/utils/logger';

  let logs = $state<string[]>([]);
  let logContainer: HTMLDivElement;
  let ws: WebSocket | null = null;
  let reconnectTimeout: number;
  let pingInterval: number;
  let isUnmounting = false;
  let progressState = $state<{
    desc: string;
    current: number;
    total: number;
    percent: number;
  } | null>(null);

  function connect() {
    if (isUnmounting) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/comfygrid/ws/startup-logs`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      pingInterval = window.setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'comfygrid.startup_log') {
          const isNearBottom = logContainer
            ? logContainer.scrollHeight - logContainer.scrollTop - logContainer.clientHeight < 50
            : false;

          logs.push(data.message);

          if (isNearBottom) {
            setTimeout(() => {
              if (logContainer) {
                logContainer.scrollTop = logContainer.scrollHeight;
              }
            }, 10);
          }
        } else if (data.type === 'comfygrid.download_progress') {
          progressState = {
            desc: data.desc,
            current: data.current,
            total: data.total,
            percent: data.percent,
          };
          if (data.current >= data.total) {
            setTimeout(() => {
              progressState = null;
            }, 1000);
          }
        }
      } catch (e) {
        logger.error('[StartupLogs] Failed to parse message:', e);
      }
    };

    ws.onerror = (error) => {
      logger.error('[StartupLogs] WebSocket error:', error);
      ws?.close();
    };

    ws.onclose = () => {
      clearInterval(pingInterval);
      if (!isUnmounting) {
        reconnectTimeout = window.setTimeout(connect, 3000);
      }
    };
  }

  onMount(() => {
    connect();
  });

  onDestroy(() => {
    isUnmounting = true;
    clearTimeout(reconnectTimeout);
    clearInterval(pingInterval);
    if (ws) {
      ws.close();
      ws = null;
    }
  });
</script>

<div class="startup-logs-container">
  {#if progressState}
    <div class="progress-container mb-2 p-2 rounded shadow-sm bg-body-tertiary">
      <div class="d-flex justify-content-between align-items-center mb-1">
        <span class="fw-bold fs-6">Downloading {progressState.desc}...</span>
        <span class="text-muted small">
          {Math.round(progressState.current / 1024 / 1024)}MB / {Math.round(
            progressState.total / 1024 / 1024,
          )}MB
        </span>
      </div>
      <div class="progress" style="height: 10px;">
        <div
          class="progress-bar progress-bar-striped progress-bar-animated"
          style="width: {progressState.percent}%"
        ></div>
      </div>
    </div>
  {/if}

  <div class="logs-content" bind:this={logContainer}>
    {#if logs.length > 0}
      {#each logs as log, index (index)}
        <div class="log-line">{log}</div>
      {/each}
    {/if}
  </div>
</div>

<style lang="scss">
  .startup-logs-container {
    position: absolute;
    top: calc(100% / 2 + 3rem);
    width: 80%;
    min-width: 800px;
    overflow: hidden;

    .logs-content {
      max-height: 200px;
      overflow-y: auto;
      font-family: 'Courier New', monospace;
      font-size: 0.875rem;
      line-height: 1;

      .log-line {
        white-space: pre-wrap;
        word-break: break-word;
        color: var(--bs-body-color);

        &:hover {
          background-color: var(--bs-secondary-bg);
        }
      }

      /* Custom scrollbar */
      &::-webkit-scrollbar {
        width: 8px;
      }

      &::-webkit-scrollbar-track {
        background: var(--bs-tertiary-bg);
      }

      &::-webkit-scrollbar-thumb {
        background: var(--bs-secondary);
        border-radius: 4px;

        &:hover {
          background: var(--bs-secondary-color);
        }
      }
    }
  }
</style>
