<script lang="ts">
  import { onDestroy } from 'svelte';
  import { comfyGridApiClient } from '@/api/api-client';
  import JsonViewer from '@/components/common/JsonViewer.svelte';
  import { t } from '@/i18n/i18n';
  import { workflowManager } from '@/managers/workflow-manager';
  import { appState } from '@/states/app-state.svelte';
  import logger from '@/utils/logger';

  const uiState = appState.uiState;
  const toastState = appState.toastState;

  $effect(() => {
    if (uiState.fileToOpenInImageInfo) {
      openFile(uiState.fileToOpenInImageInfo, uiState.metadataToOpenInImageInfo);
      uiState.fileToOpenInImageInfo = null; // Reset after reading
      uiState.metadataToOpenInImageInfo = null;
    }
  });

  onDestroy(() => {
    if (imageSrc) {
      URL.revokeObjectURL(imageSrc);
    }
  });

  let imageFileInput = $state<HTMLInputElement>()!;

  let metadataJson = $state({});
  let imageSrc: string | null = $state(null);
  let currentFileName = $state<string | null>(null);
  let currentWorkflowJson = $state<{ [key: string]: unknown } | null>(null);

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer!.files[0];
    openFile(file);
  }

  async function openFile(file: File, extraMetadata?: Record<string, string> | null) {
    currentFileName = file.name.toLowerCase();
    currentWorkflowJson = null;

    const formData = new FormData();
    formData.append('file', file);

    const res = await comfyGridApiClient.postImageInfo(file);
    let json: { [key: string]: unknown } = {};

    if (res.ok) {
      if (res.json.metadata) {
        // Not a ComfyUI format
        let [positivePrompt, tmp] = res.json.metadata.split('\nNegative prompt:');
        let [negativePrompt, options] = tmp?.split('\nSteps:') || ['', ''];
        if (options) {
          options = 'Steps:' + options;
          metadataJson = {
            positive: positivePrompt?.trim(),
            negative: negativePrompt?.trim(),
            options: parseCustomString(options?.trim()),
          };
        } else {
          metadataJson = { positive: positivePrompt?.trim(), negative: negativePrompt?.trim() };
        }
      } else {
        if (res.json.prompt) {
          try {
            json.prompt = JSON.parse(res.json.prompt);
          } catch (e) {
            logger.error('Failed to parse prompt JSON', e);
          }
        }
        if (res.json.workflow) {
          try {
            currentWorkflowJson = JSON.parse(res.json.workflow);
            json.workflow = currentWorkflowJson;
          } catch (e) {
            logger.error('Failed to parse workflow JSON', e);
          }
        }
        if (res.json.comfygrid) {
          try {
            json.comfygrid = JSON.parse(res.json.comfygrid);
          } catch (e) {
            logger.error('Failed to parse comfygrid JSON', e);
          }
        }
        metadataJson = json;
      }
    }

    if (extraMetadata) {
      if (extraMetadata.prompt) {
        try {
          json.prompt = JSON.parse(extraMetadata.prompt);
        } catch (e) {
          logger.error('Failed to parse extra prompt metadata', e);
        }
      }
      if (extraMetadata.workflow) {
        try {
          currentWorkflowJson = JSON.parse(extraMetadata.workflow);
          json.workflow = currentWorkflowJson;
        } catch (e) {
          logger.error('Failed to parse extra workflow metadata', e);
        }
      }
      if (extraMetadata.comfygrid) {
        try {
          json.comfygrid = JSON.parse(extraMetadata.comfygrid);
        } catch (e) {
          logger.error('Failed to parse extra comfygrid metadata', e);
        }
      }
      metadataJson = json;
    }

    if (!res.ok && !extraMetadata) {
      metadataJson = { error: 'No recognizable prompt metadata found.' };
    }

    if (imageSrc) {
      URL.revokeObjectURL(imageSrc);
    }
    imageSrc = URL.createObjectURL(file);
  }

  function parseCustomString(input: string) {
    const result: Record<string, string | number> = {};
    const regex =
      /(?<key>[^,:]+):\s*(?:"(?<quotedValue>(?:[^"\\]|\\.)*)"|(?<unquotedValue>[^,]+))/g;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(input)) !== null) {
      const matchGroups = match.groups!;
      let key = matchGroups.key.trim();
      let value =
        matchGroups.quotedValue !== undefined
          ? matchGroups.quotedValue.replace(/\\(.)/g, '$1')
          : matchGroups.unquotedValue.trim();

      if (!isNaN(Number(value)) && value.trim() !== '') {
        result[key] = Number(value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  function unescape(obj: unknown): unknown {
    if (obj === null || typeof obj === 'undefined') return null;
    if (Array.isArray(obj)) {
      return obj.map((item) => unescape(item));
    }
    if (typeof obj === 'object') {
      const datas: Record<string, unknown> = {};
      Object.entries(obj as Record<string, unknown>).reduce((acc, [k, v]) => {
        acc[k] = unescape(v);
        return acc;
      }, datas);
      return datas;
    }
    if (typeof obj === 'string') {
      return String(obj).replaceAll('\\\\', '\\').replaceAll('\\n', '\n').replaceAll('\\t', '\t');
    }
    return obj;
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
  }

  function handleImageSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files![0];
    openFile(file);
    imageFileInput.value = '';
  }

  async function handleTransferToComfyUI(e: Event) {
    e.stopPropagation();

    if (!currentFileName || !currentWorkflowJson) {
      toastState.addToast({ type: 'warning', message: $t('toast.no_workflow_found') });
      return;
    }

    const comfygridData = (metadataJson as Record<string, unknown>).comfygrid;
    const layout = comfygridData
      ? typeof comfygridData === 'string'
        ? JSON.parse(comfygridData)
        : comfygridData
      : undefined;

    const ret = await appState.bridge?.loadWorkflow({
      filename: currentFileName,
      json: currentWorkflowJson,
    });

    if (ret?.success) {
      toastState.addToast({ type: 'success', message: $t('toast.workflow_applied') });
      await workflowManager.loadCurrentWorkflow(layout);

      if (layout) {
        toastState.addToast({ type: 'success', message: $t('toast.layout_applied') });
      } else {
        toastState.addToast({ type: 'info', message: $t('toast.no_layout_found') });
      }
      uiState.activePageId = 'grid';
    } else {
      logger.error('Failed to apply workflow:', ret?.error);
      toastState.addToast({ type: 'error', message: $t('toast.workflow_apply_failed') });
    }
  }
</script>

<div class="h-100" style:display={uiState.activePageId === 'image-info' ? '' : 'none'}>
  <div class="d-flex h-100 w-100">
    <input
      type="file"
      accept="image/*"
      style:display="none"
      bind:this={imageFileInput}
      onchange={handleImageSelected}
    />
    <div class="p-2 h-100">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="d-flex align-items-center justify-content-center"
        style="height: 480px; width: 480px;"
        aria-label="Image Drop Zone"
        role="button"
        tabindex="0"
        ondragover={handleDragOver}
        ondrop={handleDrop}
        onclick={() => {
          imageFileInput.click();
        }}
      >
        {#if imageSrc}
          <img
            class="h-100 w-100 overflow-hidden object-fit-contain"
            src={imageSrc}
            alt={imageSrc}
          />
        {:else}
          <div
            class="vstack h-100 w-100 align-items-center justify-content-center p-2 rounded-3 border border-2 border-secondary-subtle fw-bold text-body-tertiary"
          >
            <span class="fs-1" aria-label="Image placeholder"><i class="pi pi-image"></i></span>
            <span class="fs-2">Drag and drop an image here</span>
          </div>
        {/if}
      </div>
      {#if currentWorkflowJson}
        <div class="mt-3 w-100 px-3">
          <button
            class="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
            onclick={(e) => handleTransferToComfyUI(e)}
          >
            <i class="pi pi-send"></i>{$t('imageinfo.send_to_comfyui')}
          </button>
        </div>
      {/if}
    </div>
    <div class="flex-grow-1 h-100 p-2 overflow-hidden">
      <JsonViewer value={unescape(metadataJson)} />
    </div>
  </div>
</div>
