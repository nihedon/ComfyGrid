<script lang="ts">
  import { t } from '@/i18n/i18n';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';
  import { type Model, type ModelTypes } from '@/states/storage-state.svelte';
  import AutoCompleteForm from './features/AutoCompleteForm.svelte';
  import ModalComboWidget from './features/ModalComboWidget.svelte';

  type ComboWidget = ComfyGridWidget<
    string | number,
    {
      values: (string | number)[];
      fixed_values: (string | number)[];
    }
  >;

  let { widget }: { widget: ComboWidget } = $props();

  const modelDirInfo = $derived.by(() => {
    const name = widget.name.toLowerCase();
    if (name.includes('unet_name') || name.includes('ckpt_name')) {
      return { dir: 'models', subdirs: ['checkpoints', 'diffusion_models'] };
    } else if (name.includes('vae_name')) {
      return { dir: 'models', subdirs: ['vae'] };
    } else if (name.includes('clip_name')) {
      if (widget.node.type!.toLowerCase().indexOf('clipvision') >= 0) {
        return { dir: 'models', subdirs: ['clip_vision'] };
      } else {
        return { dir: 'models', subdirs: ['clip', 'text_encoders'] };
      }
    } else if (name.includes('hypernetwork_name')) {
      return { dir: 'models', subdirs: ['hypernetworks'] };
    } else if (name.startsWith('lora_') || name.includes('lora_name')) {
      return { dir: 'models', subdirs: ['loras'] };
    } else if (name.includes('control_net_name') || name.includes('controlnet')) {
      return { dir: 'models', subdirs: ['controlnet'] };
    } else if (name.includes('yolo_model') || name.includes('vitpose_model')) {
      return { dir: 'models', subdirs: ['detection'] };
    } else if (name.includes('video') || name.includes('movie') || name.includes('anim')) {
      return { dir: 'videos', subdirs: [] };
    } else if (name.includes('image') || name === 'file') {
      return { dir: 'images', subdirs: [] };
    }
    return null;
  }) as { dir: ModelTypes; subdirs: string[] } | null;

  function parseValue(rawValue: string | number): string | number {
    if (typeof rawValue === 'number') return rawValue;
    const strVal = String(rawValue);
    const allValues = [...(widget.options?.values ?? []), ...(widget.options?.fixed_values ?? [])];
    const matchedNumber = allValues.find((v) => typeof v === 'number' && String(v) === strVal);
    if (matchedNumber !== undefined) {
      return matchedNumber as number;
    }
    return strVal;
  }

  function handleInput(
    e: Event,
    widget: ComfyGridWidget<string | number, unknown>,
    model?: Model,
    doUpdate?: boolean,
  ) {
    if (model) {
      widget.value = model.path;
    } else if (e.type === 'autocompleteChange') {
      widget.value = parseValue((e as CustomEvent).detail.value);
    } else {
      widget.value = parseValue((e.currentTarget as HTMLSelectElement).value);
    }

    widget.updateValue();
    if (doUpdate) {
      widget.onDrawBackground();
    }
  }
</script>

<div title={widget.tooltip ?? ''} data-id={widget.id} data-name={widget.name}>
  <label
    class="p-0 flex-nowrap text-truncate"
    class:col-4={modelDirInfo === null}
    class:col-2={modelDirInfo !== null}
    for={widget.id}
  >
    {$t(`comfyui.widget.${widget.name}`, {}, widget.label) ?? widget.name}
  </label>
  <div
    class="p-0"
    class:col-8={modelDirInfo === null}
    class:col-10={modelDirInfo !== null}
    style="min-width: 0;"
  >
    {#if modelDirInfo}
      <ModalComboWidget
        {widget}
        modelDir={modelDirInfo?.dir}
        modelSubdirs={modelDirInfo?.subdirs}
        handleInput={(e, w, m) => handleInput(e, w, m, false)}
      />
    {:else}
      <AutoCompleteForm
        {widget}
        select={widget.options?.values ?? []}
        handleInput={(e, w, m) => handleInput(e, w, m, true)}
      />
    {/if}
  </div>
</div>
