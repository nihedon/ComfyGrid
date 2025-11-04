<script lang="ts">
  import { JSONEditor } from 'svelte-jsoneditor';
  import { appState } from '@/states/app-state.svelte';

  const uiState = appState.uiState;

  let metadataJson = $state({});
  let imageSrc: string | null = $state(null);
  let jsonEditor: JSONEditor;

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer!.files[0];

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/comfygrid/api/image_info', {
      method: 'POST',
      body: formData,
    });
    const json = await res.json();

    if ('metadata' in json) {
      const metadata = json['metadata'];
      // Not a ComfyUI format
      let [positivePrompt, tmp] = metadata.split('\nNegative prompt:');
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
    } else if ('prompt' in json) {
      // ComfyUI format
      metadataJson = JSON.parse(json['prompt']);
    } else {
      metadataJson = { error: 'No recognizable prompt metadata found.' };
    }

    imageSrc = URL.createObjectURL(file);
    jsonEditor.set({ text: undefined, json: unescape(metadataJson) });
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

  function unescape(obj: object): object | string | null {
    if (obj === null) return null;
    if (typeof obj === 'undefined') return null;
    if (Array.isArray(obj)) {
      return obj.map((item) => unescape(item));
    }
    if (typeof obj === 'object') {
      const datas: Record<string, unknown> = {};
      Object.entries(obj).reduce((acc, [k, v]) => {
        acc[k] = unescape(v);
        return acc;
      }, datas);
      return datas;
    }
    if (typeof obj === 'string') {
      return String(obj).replaceAll('\\\\', '\\').replaceAll('\\n', '\n').replaceAll('\\t', '\t');
    }
    return obj as object;
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleRenderMenu(items: any[]) {
    return items.filter((item) => {
      return item?.text !== 'table';
    });
  }
</script>

<div class="h-100" style:display={uiState.activePageId === 'image-info' ? '' : 'none'}>
  <div class="d-flex h-100 w-100">
    <div
      class="p-2 h-100"
      aria-label="Image Drop Zone"
      role="button"
      tabindex="0"
      ondragover={handleDragOver}
      ondrop={handleDrop}
    >
      <div
        class="d-flex align-items-center justify-content-center"
        style="height: 480px; width: 480px;"
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
    </div>
    <div id="json-editor" class="flex-grow-1 h-100">
      <JSONEditor bind:this={jsonEditor} readOnly={true} onRenderMenu={handleRenderMenu} />
    </div>
  </div>
</div>

<style>
  #json-editor {
    --jse-theme-color: #aebbc5;
  }
</style>
