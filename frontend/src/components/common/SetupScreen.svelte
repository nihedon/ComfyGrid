<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Check,
    Copy,
    FolderOpen,
    Link,
    Loader2,
    MoreHorizontal,
    Pencil,
    Play,
    Plus,
    Save,
    Square,
    Trash2,
  } from '@lucide/svelte';
  import { comfyGridApiClient } from '@/api/api-client';
  import { t } from '@/i18n/i18n';
  import { SetupProfiles } from '@/states/setup-profiles.svelte';
  import type { MenuEntry } from '@/types/menu';
  import AppLogo from './AppLogo.svelte';
  import AppMenu from './AppMenu.svelte';

  let { onLaunched }: { onLaunched: () => void } = $props();
  const editor = new SetupProfiles();
  let loading = $state(true);
  let nameInput = $state<HTMLInputElement>()!;
  let confirmation = $state<HTMLDialogElement>()!;
  let renameTimer: ReturnType<typeof setTimeout>;
  let updateAvailable = $state('');
  const connectMode = $derived(editor.draft.mode === 'connect');
  const busy = $derived(editor.pending !== null);
  const actionLabel = $derived(
    editor.isRunning && !editor.dirty
      ? 'setup.open'
      : editor.dirty || editor.isNew
        ? connectMode
          ? 'setup.save_connect'
          : 'setup.save_launch'
        : connectMode
          ? 'setup.connect'
          : 'setup.launch',
  );
  const menuItems = $derived<MenuEntry[]>([
    {
      id: 'rename',
      kind: 'action',
      icon: Pencil,
      label: $t('setup.rename'),
      onSelect: () => {
        renameTimer = setTimeout(() => {
          nameInput.focus();
          nameInput.select();
        }, 0);
      },
    },
    {
      id: 'duplicate',
      kind: 'action',
      icon: Copy,
      label: $t('setup.duplicate'),
      onSelect: () => editor.request({ kind: 'duplicate' }),
    },
    { id: 'separator', kind: 'separator' },
    {
      id: 'delete',
      kind: 'action',
      icon: Trash2,
      label: $t('setup.delete'),
      danger: true,
      disabled: editor.isRunning,
      hint: editor.isRunning ? $t('setup.stop_before_delete') : undefined,
      onSelect: () => editor.requestDelete(),
    },
  ]);

  onMount(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      while (!controller.signal.aborted) {
        try {
          const response = await comfyGridApiClient.getSetupConfig(controller.signal);
          if (controller.signal.aborted) return;
          if (response.ok) {
            editor.initialize(response.json);
            loading = false;
            try {
              const update = await comfyGridApiClient.getUpdateCheck();
              if (!controller.signal.aborted && update.ok && update.json.has_update)
                updateAvailable = update.json.latest_version;
            } catch {
              /* Update checks must not reload an edited profile. */
            }
            return;
          }
        } catch {
          if (controller.signal.aborted) return;
        }
        await new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 1000);
        });
      }
    }
    void load();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (editor.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(renameTimer);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  });

  $effect(() => {
    if (!confirmation) return;
    if (editor.intent || editor.confirmingDelete) {
      if (!confirmation.open) confirmation.showModal();
    } else if (confirmation.open) confirmation.close();
  });

  async function pickFile(kind: 'script_path' | 'python_path') {
    const response = await comfyGridApiClient.postDialogFile(
      kind === 'script_path' ? 'Select ComfyUI main.py' : 'Select Python executable',
      kind === 'script_path'
        ? [['ComfyUI main.py', 'main.py']]
        : [
            ['Python', '*.exe'],
            ['All files', '*'],
          ],
      editor.draft[kind],
    );
    if (response.ok && response.json.path) editor.draft[kind] = response.json.path;
  }

  async function launch(event: SubmitEvent) {
    event.preventDefault();
    if (connectMode) return;
    if (await editor.launch()) onLaunched();
  }
</script>

<div class="setup-overlay">
  <section class="setup-shell" aria-label={$t('setup.title')}>
    <header class="setup-header">
      <div class="d-flex align-items-center gap-2">
        <AppLogo size={23} />
        <h1>ComfyGrid</h1>
        <span class="text-body-secondary">{$t('setup.title')}</span>
      </div>
      {#if updateAvailable}<span class="small text-info"
          >{$t('setup.update', { version: updateAvailable })}</span
        >{/if}
    </header>
    {#if loading}
      <div class="loading-state">
        <Loader2 size={24} class="spin" /><span>{$t('setup.loading')}</span>
      </div>
    {:else}
      <div class="setup-body">
        <aside class="profile-sidebar" aria-label={$t('setup.profiles')}>
          <div class="sidebar-heading">
            <h2>{$t('setup.profiles')}</h2>
            <button
              class="btn btn-sm btn-outline-secondary icon-button"
              type="button"
              title={$t('setup.new')}
              aria-label={$t('setup.new')}
              disabled={busy}
              onclick={() => editor.request({ kind: 'new' })}><Plus size={17} /></button
            >
          </div>
          <div class="profile-list">
            {#each editor.config.workspaces as profile (profile.id)}
              <div class="profile-row" class:active={editor.selectedId === profile.id}>
                <button
                  type="button"
                  class="profile-select"
                  disabled={busy}
                  aria-current={editor.selectedId === profile.id ? 'true' : undefined}
                  onclick={() => editor.request({ kind: 'select', id: profile.id! })}
                >
                  {#if profile.mode === 'connect'}<Link size={16} />{:else}<Play size={16} />{/if}
                  <span class="profile-name">{profile.name}</span>
                  {#if editor.config.active_profile_id === profile.id}<span
                      class="running-dot"
                      title={$t('setup.running')}
                    ></span>{/if}
                </button>
                {#if editor.selectedId === profile.id}
                  <AppMenu items={menuItems} disabled={busy} align="start">
                    {#snippet trigger({ props })}<button
                        {...props}
                        type="button"
                        class="btn btn-sm icon-button profile-menu"
                        title={$t('setup.actions')}
                        aria-label={$t('setup.actions')}><MoreHorizontal size={18} /></button
                      >{/snippet}
                  </AppMenu>
                {/if}
              </div>
            {/each}
            {#if editor.isNew}<div class="new-profile-label active" aria-current="true">
                <Plus size={16} /><span>{$t('setup.new')}</span>
              </div>{/if}
          </div>
        </aside>
        <form id="setup-profile-form" class="profile-editor" onsubmit={launch}>
          <div class="editor-heading">
            <h2>{editor.isNew ? $t('setup.new') : editor.draft.name}</h2>
            {#if editor.dirty}<span class="badge text-bg-warning">{$t('setup.unsaved')}</span>
            {:else if editor.saved}<span
                class="small text-success d-inline-flex align-items-center gap-1"
                ><Check size={14} />{$t('setup.saved')}</span
              >{/if}
          </div>
          <fieldset disabled={busy}>
            <div class="mb-3">
              <label class="form-label" for="profile-name">{$t('setup.name')}</label><input
                id="profile-name"
                class="form-control"
                bind:this={nameInput}
                bind:value={editor.draft.name}
                autocomplete="off"
                required
              />
            </div>
            <div class="mb-4 d-none">
              <span class="form-label d-block" id="profile-mode-label">{$t('setup.mode')}</span>
              <div class="mode-options" role="group" aria-labelledby="profile-mode-label">
                <input
                  class="btn-check"
                  id="profile-mode-launch"
                  name="profile-mode"
                  type="radio"
                  value="launch"
                  bind:group={editor.draft.mode}
                /><label class="btn btn-outline-secondary" for="profile-mode-launch"
                  ><Play size={15} /> {$t('setup.local')}</label
                >
                <input
                  class="btn-check"
                  id="profile-mode-connect"
                  name="profile-mode"
                  type="radio"
                  value="connect"
                  disabled
                  bind:group={editor.draft.mode}
                /><label class="mode-unavailable" for="profile-mode-connect" title={$t('setup.wip')}
                  ><Link size={15} />
                  {$t('setup.existing')}<small>WIP</small></label
                >
              </div>
            </div>
            {#if connectMode}
              <div class="connection-fields">
                <div>
                  <label class="form-label" for="profile-host">{$t('setup.host')}</label><input
                    id="profile-host"
                    class="form-control font-monospace"
                    bind:value={editor.draft.connect_host}
                    required
                  />
                </div>
                <div>
                  <label class="form-label" for="profile-connect-port">{$t('setup.port')}</label
                  ><input
                    id="profile-connect-port"
                    class="form-control font-monospace"
                    type="number"
                    min="1"
                    max="65535"
                    bind:value={editor.draft.connect_port}
                    required
                  />
                </div>
              </div>
            {:else}
              <div class="mb-3">
                <label class="form-label" for="profile-script">{$t('setup.script')}</label>
                <div class="input-group">
                  <input
                    id="profile-script"
                    class="form-control font-monospace"
                    bind:value={editor.draft.script_path}
                    required
                  /><button
                    class="btn btn-outline-secondary icon-button"
                    type="button"
                    title={$t('setup.browse_script')}
                    aria-label={$t('setup.browse_script')}
                    onclick={() => pickFile('script_path')}><FolderOpen size={17} /></button
                  >
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label" for="profile-python">{$t('setup.python')}</label>
                <div class="input-group">
                  <input
                    id="profile-python"
                    class="form-control font-monospace"
                    bind:value={editor.draft.python_path}
                    required
                  /><button
                    class="btn btn-outline-secondary icon-button"
                    type="button"
                    title={$t('setup.browse_python')}
                    aria-label={$t('setup.browse_python')}
                    onclick={() => pickFile('python_path')}><FolderOpen size={17} /></button
                  >
                </div>
              </div>
              <div class="connection-fields mb-4">
                <div>
                  <label class="form-label" for="profile-local-host">{$t('setup.host')}</label
                  ><input
                    id="profile-local-host"
                    class="form-control font-monospace"
                    value="127.0.0.1"
                    disabled
                  />
                </div>
                <div>
                  <label class="form-label" for="profile-port">{$t('setup.port')}</label><input
                    id="profile-port"
                    class="form-control font-monospace"
                    type="number"
                    min="1"
                    max="65535"
                    bind:value={editor.draft.comfyui_port}
                    required
                  />
                </div>
              </div>
              <details open={Boolean(editor.draft.comfyui_args)}>
                <summary>{$t('setup.advanced')}</summary>
                <div class="pt-3">
                  <label class="form-label" for="profile-args">{$t('setup.args')}</label><textarea
                    id="profile-args"
                    class="form-control font-monospace"
                    rows="3"
                    bind:value={editor.draft.comfyui_args}></textarea>
                </div>
              </details>
            {/if}
          </fieldset>
          {#if editor.error}<div class="alert alert-danger mt-3 mb-0" role="alert">
              {$t(editor.error) ?? editor.error}
            </div>{/if}
        </form>
      </div>
      <footer class="setup-footer">
        <div class="footer-status">
          {#if editor.config.active_profile_id}<span class="small text-success"
              >{$t('setup.running')}</span
            ><button
              type="button"
              class="btn btn-sm btn-outline-secondary icon-button"
              disabled={busy}
              title={$t('setup.stop')}
              aria-label={$t('setup.stop')}
              onclick={() => editor.stop()}><Square size={14} /></button
            >{/if}
        </div>
        <div class="footer-actions">
          {#if editor.isNew}<button
              type="button"
              class="btn btn-outline-secondary"
              disabled={busy || editor.config.workspaces.length === 0}
              onclick={() => editor.cancelNew()}>{$t('setup.cancel_create')}</button
            >
          {/if}
          <button
            type="button"
            class="btn btn-outline-secondary d-flex align-items-center gap-2"
            disabled={busy || (!editor.isNew && !editor.dirty)}
            onclick={() => editor.save()}
            >{#if editor.pending === 'save'}<Loader2 size={16} class="spin" />{:else}<Save
                size={16}
              />{/if}{$t('setup.save')}</button
          >
          <button
            type="submit"
            form="setup-profile-form"
            class="btn btn-primary d-flex align-items-center gap-2"
            disabled={busy || connectMode}
            >{#if editor.pending === 'launch'}<Loader2
                size={16}
                class="spin"
              />{:else if connectMode}<Link size={16} />{:else}<Play size={16} />{/if}{$t(
              actionLabel,
            )}</button
          >
        </div>
      </footer>
    {/if}
  </section>
</div>

<dialog
  bind:this={confirmation}
  oncancel={(event) => {
    if (busy) event.preventDefault();
    else {
      editor.intent = null;
      editor.confirmingDelete = false;
    }
  }}
  aria-labelledby="setup-confirm-title"
>
  <h2 id="setup-confirm-title">
    {$t(editor.confirmingDelete ? 'setup.delete_title' : 'setup.unsaved_title')}
  </h2>
  <p>
    {editor.confirmingDelete
      ? $t('setup.delete_message', {
          name: editor.config.workspaces.find((p) => p.id === editor.selectedId)?.name ?? '',
        })
      : $t('setup.unsaved_message')}
  </p>
  {#if editor.confirmingDelete}<p class="small text-body-secondary">
      {$t('setup.delete_scope')}
    </p>{/if}
  {#if editor.error}<div class="alert alert-danger" role="alert">
      {$t(editor.error) ?? editor.error}
    </div>{/if}
  <div class="confirmation-actions">
    <button
      type="button"
      class="btn btn-outline-secondary"
      disabled={busy}
      onclick={() => {
        editor.intent = null;
        editor.confirmingDelete = false;
      }}>{$t('setup.cancel')}</button
    >
    {#if editor.confirmingDelete}<button
        type="button"
        class="btn btn-danger"
        disabled={busy}
        onclick={() => editor.delete()}><Trash2 size={16} /> {$t('setup.delete')}</button
      >
    {:else}<button
        type="button"
        class="btn btn-outline-secondary"
        disabled={busy}
        onclick={() => editor.discardAndContinue()}>{$t('setup.discard')}</button
      ><button
        type="button"
        class="btn btn-primary"
        disabled={busy}
        onclick={() => editor.saveAndContinue()}>{$t('setup.save')}</button
      >{/if}
  </div>
</dialog>

<style lang="scss">
  .setup-overlay {
    position: fixed;
    inset: 0;
    z-index: 9000;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--bs-tertiary-bg);
  }
  .setup-shell {
    width: 100%;
    max-width: 960px;
    height: min(760px, calc(100dvh - 48px));
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    background: var(--bs-body-bg);
    border: 1px solid var(--bs-border-color);
    border-radius: 8px;
    overflow: hidden;
  }
  .setup-header,
  .setup-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 24px;
  }
  .setup-header {
    border-bottom: 1px solid var(--bs-border-color);
    flex-wrap: wrap;
  }
  h1 {
    font-size: 20px;
    margin: 0;
  }
  h2 {
    font-size: 16px;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .setup-body {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    min-height: 0;
  }
  .profile-sidebar {
    padding: 18px 12px;
    border-right: 1px solid var(--bs-border-color);
    overflow-y: auto;
    background: var(--bs-tertiary-bg);
  }
  .sidebar-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 0 4px 14px;
  }
  .profile-row {
    display: flex;
    align-items: center;
    min-height: 44px;
    border-radius: 4px;
    margin-bottom: 4px;
  }
  .profile-row.active,
  .new-profile-label.active {
    background: var(--bs-primary-bg-subtle);
    box-shadow: inset 3px 0 var(--bs-primary);
  }
  .profile-select {
    display: flex;
    align-items: center;
    gap: 9px;
    flex: 1;
    min-width: 0;
    background: none;
    border: 0;
    text-align: left;
    color: var(--bs-body-color);
    padding: 10px 12px;
  }
  .profile-row:not(.active):hover {
    background: var(--bs-secondary-bg);
  }
  .profile-select :global(svg) {
    flex-shrink: 0;
  }
  .profile-name {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 14px;
  }
  .running-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--bs-success);
    flex-shrink: 0;
  }
  .new-profile-label {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 44px;
    border-radius: 4px;
    padding: 10px 12px;
    font-size: 14px;
    color: var(--bs-body-color);
  }
  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 34px;
    min-height: 34px;
    padding: 6px;
  }
  .profile-menu {
    margin-right: 4px;
    flex-shrink: 0;
  }
  .profile-editor {
    padding: 22px 28px;
    overflow-y: auto;
    min-width: 0;
  }
  .editor-heading {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 22px;
    min-height: 24px;
  }
  fieldset {
    min-width: 0;
  }
  .form-label {
    font-size: 14px;
    font-weight: 500;
  }
  .mode-options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .mode-options label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 38px;
    padding: 6px 12px;
    font-size: 14px;
  }
  .mode-unavailable {
    color: var(--bs-secondary-color);
    opacity: 0.65;
    cursor: not-allowed;
  }
  .mode-unavailable small {
    font-size: 11px;
  }
  .connection-fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 110px;
    gap: 16px;
  }
  summary {
    font-size: 14px;
    color: var(--bs-secondary-color);
    cursor: pointer;
  }
  .setup-footer {
    border-top: 1px solid var(--bs-border-color);
  }
  .footer-actions,
  .footer-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    grid-row: 2 / -1;
  }
  dialog {
    width: min(480px, calc(100% - 32px));
    padding: 24px;
    border: 1px solid var(--bs-border-color);
    border-radius: 8px;
    background: var(--bs-body-bg);
    color: var(--bs-body-color);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 45%);
  }
  dialog h2 {
    margin-bottom: 16px;
  }
  .confirmation-actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 24px;
  }
  @media (max-width: 680px) {
    .setup-overlay {
      padding: 8px;
    }
    .setup-shell {
      height: calc(100dvh - 16px);
    }
    .setup-header,
    .setup-footer {
      padding: 12px 16px;
    }
    .setup-body {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }
    .profile-sidebar {
      border-right: 0;
      border-bottom: 1px solid var(--bs-border-color);
      padding: 10px 12px;
      max-height: 175px;
    }
    .sidebar-heading {
      margin-bottom: 6px;
    }
    .profile-editor {
      padding: 16px;
    }
    .setup-footer {
      flex-wrap: wrap;
    }
    .footer-actions {
      margin-left: auto;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
  }
</style>
