<script lang="ts">
  import { onMount } from 'svelte';
  import { comfyGridApiClient } from '@/api/api-client';
  import type { SetupConfig, WorkspaceInfo } from '@/types/setup';
  import logger from '@/utils/logger';

  const DEFAULT_COMFYUI_PORT = 8188;

  type LaunchMode = 'launch' | 'connect';

  let { onLaunched: handleLaunched }: { onLaunched: () => void } = $props();

  let mode = $state<LaunchMode>('launch');
  let config = $state<SetupConfig>({
    workspaces: [],
    last_workspace: '',
    connect_port: DEFAULT_COMFYUI_PORT,
  });
  let selectedWorkspaceName = $state('');
  let editingWorkspace = $state<WorkspaceInfo>({
    name: '',
    script_path: '',
    python_path: '',
    comfyui_port: DEFAULT_COMFYUI_PORT,
    comfyui_args: '',
  });
  let connectPort = $state<number | null>(DEFAULT_COMFYUI_PORT);
  let isSubmitting = $state(false);
  let errorMessage = $state('');
  let isNewWorkspace = $state(false);

  let isConnectingToBackend = $state(true);

  let updateInfo = $state<{
    has_update: boolean;
    latest_version: string;
    download_url: string | null;
    release_notes: string;
  } | null>(null);

  onMount(() => {
    let unmounted = false;

    async function pollConfig() {
      while (!unmounted) {
        const res = await comfyGridApiClient.getSetupConfig();
        if (res.ok) {
          config = res.json;
          connectPort = config.connect_port;

          if (config.workspaces.length > 0) {
            const lastWs = config.workspaces.find((w) => w.name === config.last_workspace);
            selectedWorkspaceName = lastWs?.name ?? config.workspaces[0].name;
            syncEditingWorkspace(selectedWorkspaceName);
          } else {
            isNewWorkspace = true;
          }
          isConnectingToBackend = false;
          errorMessage = '';

          try {
            const updateRes = await comfyGridApiClient.getUpdateCheck();
            if (updateRes.ok) {
              updateInfo = updateRes.json;
            }
          } catch (e) {
            logger.error('Failed to check for updates:', e);
          }
          break;
        } else {
          logger.debug('Waiting for backend...');
        }

        // Wait 1 second before retrying
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    pollConfig();

    return () => {
      unmounted = true;
    };
  });

  function syncEditingWorkspace(name: string) {
    const ws = config.workspaces.find((w) => w.name === name);
    if (ws) {
      editingWorkspace = { ...ws };
    }
  }

  function handleWorkspaceSelect(name: string) {
    selectedWorkspaceName = name;
    isNewWorkspace = false;
    syncEditingWorkspace(name);
  }

  function handleAddWorkspace() {
    isNewWorkspace = true;
    selectedWorkspaceName = '';
    editingWorkspace = {
      name: '',
      script_path: '',
      python_path: '',
      comfyui_port: DEFAULT_COMFYUI_PORT,
      comfyui_args: '',
    };
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();

    const form = e.currentTarget as HTMLFormElement;
    if (!form.checkValidity()) {
      e.stopPropagation();
      form.classList.add('was-validated');
      return;
    }
    form.classList.add('was-validated');

    errorMessage = '';
    isSubmitting = true;

    try {
      const body =
        mode === 'launch'
          ? { mode: 'launch', workspace: { ...editingWorkspace } }
          : { mode: 'connect', connect_port: connectPort };

      const res = await comfyGridApiClient.postSetupLaunch(JSON.stringify(body));

      if (!res.ok) {
        if (res.status === 409) {
          handleLaunched();
          return;
        }
        errorMessage = res.json.error ?? 'Unknown error';
        return;
      }

      handleLaunched();
    } catch (e) {
      errorMessage = 'Failed to connect to backend.';
      logger.error('Failed to connect to backend.', e);
    } finally {
      isSubmitting = false;
    }
  }

  async function pickMainScriptFile() {
    const filetypes = [['ComfyUI main.py', 'main.py']];
    const data = await comfyGridApiClient.postDialogFile(
      'Select ComfyUI main.py',
      filetypes,
      editingWorkspace.script_path,
    );
    if (data.ok) {
      editingWorkspace.script_path = data.json.path;
    }
  }

  async function pickPythonFile() {
    const filetypes = [
      ['Python', 'python.exe'],
      ['Python3', 'python3.exe'],
    ];
    const data = await comfyGridApiClient.postDialogFile(
      'Select ComfyUI python.exe',
      filetypes,
      editingWorkspace.python_path,
    );
    if (data.ok) {
      editingWorkspace.python_path = data.json.path;
    }
  }

</script>

<form
  class="setup-overlay d-flex align-items-center justify-content-center needs-validation"
  novalidate
  onsubmit={submit}
>
  <div class="setup-card card shadow-lg">
    <div class="card-header d-flex align-items-center gap-2 py-3">
      <i class="bi bi-grid-3x3-gap-fill text-primary fs-5"></i>
      <span class="fw-bold fs-5">ComfyGrid Setup</span>
    </div>

    <div class="card-body p-4">
      {#if isConnectingToBackend}
        <div class="text-center py-5">
          <div class="spinner-border text-primary mb-3" role="status"></div>
          <h5 class="fw-bold">Connecting to ComfyGrid Server...</h5>
          <p class="text-muted small">Please wait while the backend starts up.</p>
        </div>
      {:else}
        {#if updateInfo?.has_update && updateInfo.download_url}
          <div class="alert alert-info mb-4 shadow-sm border-0 bg-info-subtle">
            <h6 class="mb-1">
              <i class="bi bi-stars me-1 text-primary"></i>New Update Available:
              <strong>{updateInfo.latest_version}</strong>
            </h6>
            <p class="mb-0 small opacity-75">
              A newer version of ComfyGrid is ready to download.
            </p>
          </div>
        {/if}

        <!-- Mode selector -->
        <div class="mb-4">
          <div class="btn-group w-100" role="group">
            <input
              type="radio"
              class="btn-check"
              name="mode"
              id="mode-launch"
              value="launch"
              bind:group={mode}
            />
            <label class="btn btn-outline-primary" for="mode-launch">
              <i class="bi bi-play-circle me-1"></i>Launch ComfyUI
            </label>
            <input
              type="radio"
              class="btn-check"
              name="mode"
              id="mode-connect"
              value="connect"
              disabled
              bind:group={mode}
            />
            <label class="btn btn-outline-primary" for="mode-connect">
              <i class="bi bi-link-45deg me-1"></i>Attach to existing (WIP)
            </label>
          </div>
        </div>

        {#if mode === 'launch'}
          <!-- Workspace list -->
          <div class="mb-3">
            <!-- svelte-ignore a11y_label_has_associated_control -->
            <label class="form-label fw-semibold">Workspace</label>
            <div class="workspace-list vstack gap-1">
              {#each config.workspaces as ws, index (index)}
                <button
                  type="button"
                  class="workspace-item btn btn-sm text-start w-100"
                  class:active={selectedWorkspaceName === ws.name && !isNewWorkspace}
                  onclick={() => handleWorkspaceSelect(ws.name)}
                >
                  <i class="bi bi-person-workspace me-2"></i>{ws.name}
                </button>
              {/each}
              <button
                type="button"
                class="workspace-item btn btn-sm btn-outline-secondary text-start w-100"
                class:active={isNewWorkspace}
                onclick={handleAddWorkspace}
              >
                <i class="bi bi-plus-circle me-2"></i>New workspace
              </button>
            </div>
          </div>

          <!-- Workspace editor -->
          <div class="mb-3">
            <div class="settings-form row g-3 rounded mt-0 mb-3 pb-3">
              <div class="col-md-12">
                <label for="ws-name" class="form-label">Name</label>
                <input
                  id="ws-name"
                  type="text"
                  class="form-control"
                  bind:value={editingWorkspace.name}
                  placeholder="e.g. default"
                />
              </div>
              <div class="col-md-12">
                <label for="ws-script-path" class="form-label">ComfyUI main script path</label>
                <div class="input-group">
                  <input
                    id="ws-script-path"
                    type="text"
                    class="form-control font-monospace"
                    bind:value={editingWorkspace.script_path}
                    placeholder="e.g. D:\ComfyUI_windows\ComfyUI\main.py"
                    required
                  />
                  <!-- svelte-ignore a11y_consider_explicit_label -->
                  <button class="btn btn-primary" type="button" onclick={pickMainScriptFile}
                    ><i class="pi pi-folder-open"></i></button
                  >
                </div>
                <div class="invalid-feedback">Please specify the ComfyUI main script path.</div>
              </div>
              <div class="col-md-12">
                <label for="ws-python-path" class="form-label">Python exe path</label>
                <div class="input-group">
                  <input
                    id="ws-python-path"
                    type="text"
                    class="form-control font-monospace"
                    bind:value={editingWorkspace.python_path}
                    placeholder="e.g. D:\ComfyUI_windows\python_embeded\python.exe"
                    required
                  />
                  <!-- svelte-ignore a11y_consider_explicit_label -->
                  <button class="btn btn-primary" type="button" onclick={pickPythonFile}
                    ><i class="pi pi-folder-open"></i></button
                  >
                </div>
                <div class="invalid-feedback">Please specify the Python executable path.</div>
              </div>
              <div class="col-md-9">
                <label for="ws-host" class="form-label">ComfyUI Host</label>
                <input
                  id="ws-host"
                  type="text"
                  class="form-control font-monospace readonly"
                  value="127.0.0.1"
                  disabled
                />
              </div>
              <div class="col-md-3">
                <label for="ws-comfyui-port" class="form-label">Port</label>
                <input
                  id="ws-comfyui-port"
                  type="text"
                  class="form-control font-monospace"
                  bind:value={editingWorkspace.comfyui_port}
                  placeholder={String(DEFAULT_COMFYUI_PORT)}
                  required
                />
                <div class="invalid-feedback">Please specify the ComfyUI port.</div>
              </div>
              <div class="col-md-12">
                <label for="ws-extra-args" class="form-label">ComfyUI Arguments</label>
                <textarea
                  id="ws-extra-args"
                  class="form-control font-monospace"
                  rows="3"
                  bind:value={editingWorkspace.comfyui_args}
                  placeholder="e.g. --disable-dynamic-vram --enable-manager"
                ></textarea>
                <div class="form-text">Command-line arguments passed to ComfyUI on launch.</div>
              </div>
            </div>
          </div>
        {:else}
          <!-- Connect URL -->
          <div class="mb-3">
            <div class="settings-form row g-3 rounded mt-0 mb-3 pb-3">
              <div class="col-md-9">
                <label for="connect-host" class="form-label">ComfyUI Host</label>
                <input
                  id="connect-host"
                  type="text"
                  class="form-control font-monospace readonly"
                  value="127.0.0.1"
                  disabled
                />
              </div>
              <div class="col-md-3">
                <label for="connect-port" class="form-label">Port</label>
                <input
                  id="connect-port"
                  type="text"
                  class="form-control font-monospace"
                  bind:value={connectPort}
                  placeholder={String(DEFAULT_COMFYUI_PORT)}
                />
              </div>
            </div>
          </div>
        {/if}

        {#if errorMessage}
          <div class="alert alert-danger py-2 mb-3">{errorMessage}</div>
        {/if}

        <button type="submit" class="btn btn-primary w-100" disabled={isSubmitting}>
          {#if isSubmitting}
            <span class="spinner-border spinner-border-sm me-2" role="status"></span>
          {/if}
          {mode === 'launch' ? 'Launch' : 'Connect'}
        </button>
      {/if}
    </div>
  </div>
</form>

<style lang="scss">
  .setup-overlay {
    position: fixed;
    inset: 0;
    background: rgba(var(--bs-body-bg-rgb, 0, 0, 0), 0.6);
    backdrop-filter: blur(6px);
    z-index: 9999;
  }

  .setup-card {
    width: 100%;
    max-width: 600px;
    border: 1px solid var(--bs-border-color);
  }

  .workspace-list {
    max-height: 140px;
    overflow-y: auto;
  }

  .workspace-item {
    border: 1px solid var(--bs-border-color);
    background: var(--bs-tertiary-bg);
    color: var(--bs-body-color);
    transition: background 0.15s;

    &.active {
      background: var(--bs-primary);
      border-color: var(--bs-primary);
      color: #fff;
    }

    &:not(.active):hover {
      background: var(--bs-secondary-bg);
    }
  }

  .settings-form {
    background: var(--bs-tertiary-bg);
    border: 1px solid var(--bs-border-color);
  }
</style>
