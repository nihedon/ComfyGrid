<script lang="ts">
  import { untrack } from 'svelte';
  import { onDestroy, onMount } from 'svelte';
  import LoadingScreen from '@/components/common/LoadingScreen.svelte';
  import SetupScreen from '@/components/common/SetupScreen.svelte';
  import SharedThumbnailPopover from '@/components/common/SharedThumbnailPopover.svelte';
  import ToastContainer from '@/components/common/ToastContainer.svelte';
  import DescriptionModal from '@/components/modals/DescriptionModal.svelte';
  import Dialog from '@/components/modals/Dialog.svelte';
  import ModelsModal from '@/components/modals/ModelsModal.svelte';
  import PaintModal from '@/components/modals/PaintModal.svelte';
  import { loadTranslations, setLanguage } from '@/i18n/i18n';
  import { BOOTSWATCH_THEME_OPT_KEY, applyBootswatchTheme } from '@/services/bootswatch-service';
  import { setupCallbacks } from '@/services/callback-service';
  import { loadExtensions } from '@/services/extension-service';
  import { ensureAllModels } from '@/services/models-service';
  import { loadOpts } from '@/services/options-service';
  import { appState } from '@/states/app-state.svelte';
  import type { DropdownFormInfo } from '@/states/option-state.svelte';
  import logger from '@/utils/logger';
  import Body from './Body.svelte';
  import Header from './Header.svelte';
  import { bindKeyboardShortcuts } from './helpers/keybind.svelte';

  let initialized = false;

  let initializing = $state(true);
  let launched = $state(false);
  let showScreen = $state(false);

  const comfyUiState = appState.comfyUiState;
  const optionState = appState.optionState;
  const uiState = appState.uiState;

  function handleSetupLaunched() {
    launched = true;
  }

  async function checkSetupStatus() {
    try {
      const res = await fetch('/comfygrid/api/setup/status');
      if (res.ok) {
        const status = await res.json();
        launched = status.mode === 'launch';
      }
    } catch (e) {
      logger.error(e);
    }
  }

  // Re-check setup status when backend reconnects
  $effect(() => {
    if (comfyUiState.isBackendConnected) {
      untrack(() => checkSetupStatus());
    }
  });

  // ComfyUI initialization: triggered once when ComfyUI becomes available
  $effect(() => {
    if (!comfyUiState.started) {
      logger.log('ComfyUI not available');
      return;
    }
    if (!initialized) {
      initialized = true;
      untrack(async () => {
        setupCallbacks();

        await loadOpts();
        await loadExtensions();

        await ensureAllModels();

        bindKeyboardShortcuts();

        const versionInfo = await fetch('/comfygrid/api/version_info');
        if (versionInfo.ok) {
          const data = await versionInfo.json();
          logger.log('Version Info:', data);
          appState.version = data;
        } else {
          logger.error('Error fetching version info');
          appState.version = {
            branch: 'unknown',
            commit: 'unknown',
            tag: 'unknown',
            date: 'unknown',
            comitter: 'unknown',
          };
        }

        initializing = false;
      });
    }
  });

  // Initial language load: triggered once on startup to load available translations
  $effect(() => {
    if (!optionState.forms.has('language')) {
      return;
    }
    const choices = (optionState.forms.get('language') as DropdownFormInfo).choices;
    loadTranslations(choices.filter((c: string) => c !== 'auto')).then(() => {
      setLanguage(optionState.opts.get('language'));
    });
  });

  // Language change: triggered when the language setting of options changes
  $effect(() => {
    const selectedLang = optionState.opts.get('language');
    setLanguage(selectedLang);
  });

  // Theme change: triggered when the color theme setting of options changes
  $effect(() => {
    const theme = optionState.opts.get('color_theme');
    if (!theme) {
      return;
    }

    const root = document.documentElement;
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.setAttribute('data-bs-theme', 'dark');
      } else {
        root.removeAttribute('data-bs-theme');
      }
    } else if (theme !== '') {
      root.setAttribute('data-bs-theme', theme);
    } else {
      root.removeAttribute('data-bs-theme');
    }
  });

  // Bootswatch theme: apply saved CSS on startup and when changed
  $effect(() => {
    const themeUrl = optionState.opts.get(BOOTSWATCH_THEME_OPT_KEY) as string | undefined;
    applyBootswatchTheme(themeUrl || null);
  });

  function isValidDragData(e: DragEvent): boolean {
    const types = e.dataTransfer?.types || [];
    return types.includes('Files');
  }

  function handleDragEnter(e: DragEvent) {
    if (!isValidDragData(e)) {
      return;
    }
    e.preventDefault();
    uiState.isDragging = true;
  }

  function handleDragOver(e: DragEvent) {
    if (!isValidDragData(e)) {
      return;
    }
    e.preventDefault();
  }

  function handleDragLeave(e: DragEvent) {
    // Only reset when cursor leaves the window (relatedTarget is null)
    if (e.relatedTarget != null) {
      return;
    }
    e.preventDefault();
    uiState.isDragging = false;
  }

  function handleDropFallback(e: DragEvent) {
    if (!isValidDragData(e)) {
      return;
    }
    e.preventDefault();
    uiState.isDragging = false;
  }

  onMount(async () => {
    launched = false;
    await checkSetupStatus();
    showScreen = true;
    document.documentElement.addEventListener('dragenter', handleDragEnter);
    document.documentElement.addEventListener('dragover', handleDragOver);
    document.documentElement.addEventListener('dragleave', handleDragLeave);
    document.documentElement.addEventListener('drop', handleDropFallback);
  });

  onDestroy(() => {
    document.documentElement.removeEventListener('dragenter', handleDragEnter);
    document.documentElement.removeEventListener('dragover', handleDragOver);
    document.documentElement.removeEventListener('dragleave', handleDragLeave);
    document.documentElement.removeEventListener('drop', handleDropFallback);
  });
</script>

<main class="vstack h-100 w-100">
  {#if showScreen}
    {#if !launched}
      <SetupScreen onLaunched={handleSetupLaunched} />
    {:else}
      {#if comfyUiState.graphReady && !initializing}
        <Header />
      {:else}
        <LoadingScreen {initializing} />
      {/if}
      <Body {initializing} />
    {/if}
  {/if}
</main>

<ModelsModal />
<PaintModal />
<DescriptionModal />
<ToastContainer />
<Dialog />
<SharedThumbnailPopover />
