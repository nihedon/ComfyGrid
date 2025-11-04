<script lang="ts">
  import { t } from '@/i18n/i18n';
  import type { ComfyGridWidget } from '@/states/model-state.svelte';
  import type { Model, ModelTypes } from '@/states/storage-state.svelte';
  import AutoCompleteForm from './features/AutoCompleteForm.svelte';
  import ModalComboWidget from './features/ModalComboWidget.svelte';

  type ComboWidget = ComfyGridWidget<
    string,
    {
      values: string[];
      fixed_values: string[];
    }
  >;

  let { widget }: { widget: ComboWidget } = $props();

  const modelDirInfo = $derived.by(() => {
    if (widget.name.includes('unet_name') || widget.name.includes('ckpt_name')) {
      return { dir: 'models', subdirs: ['checkpoints', 'diffusion_models'] };
    } else if (widget.name.includes('vae_name')) {
      return { dir: 'models', subdirs: ['vae'] };
    } else if (widget.name.includes('clip_name')) {
      if (widget.node.type.toLowerCase().indexOf('clipvision') >= 0) {
        return { dir: 'models', subdirs: ['clip_vision'] };
      } else {
        return { dir: 'models', subdirs: ['clip', 'text_encoders'] };
      }
    } else if (widget.name.includes('hypernetwork_name')) {
      return { dir: 'models', subdirs: ['hypernetworks'] };
    } else if (widget.name.startsWith('lora_')) {
      return { dir: 'models', subdirs: ['loras'] };
    } else if (widget.name.includes('control_net_name')) {
      return { dir: 'models', subdirs: ['controlnet'] };
    } else if (widget.name.includes('yolo_model')) {
      return { dir: 'models', subdirs: ['detection'] };
    } else if (widget.name.includes('vitpose_model')) {
      return { dir: 'models', subdirs: ['detection'] };
    } else if (widget.name.includes('image')) {
      return { dir: 'images', subdirs: [] };
    } else if (widget.name.includes('video')) {
      return { dir: 'videos', subdirs: [] };
    }
    return null;
  }) as { dir: ModelTypes; subdirs: string[] } | null;

  const optionValuesSet = $derived(new Set(widget.options?.values ?? []));

  const optionFixedValuesSet = $derived(new Set(widget.options?.fixed_values ?? []));

  const hasValue = $derived(optionValuesSet.has(widget.value));

  const isValid = $derived.by(() => {
    return (
      hasValue ||
      String(widget.value).toLocaleLowerCase() === 'none' ||
      String(widget.value).indexOf('Select ') === 0 ||
      optionFixedValuesSet.has(widget.value)
    );
  });

  function handleInput(
    e: Event,
    widget: ComfyGridWidget<string, unknown>,
    model?: Model,
    doUpdate?: boolean,
  ) {
    if (model) {
      widget.value = model.path;
    } else if (e.type === 'autocompleteChange') {
      widget.value = (e as CustomEvent).detail.value;
    } else {
      widget.value = (e.currentTarget as HTMLSelectElement).value;
    }

    widget.updateComfyUiValue();
    if (doUpdate) {
      widget.node.drawBackground();
    }
  }
</script>

<div data-name={widget.name} title={widget.tooltip ?? ''}>
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
    {#if modelDirInfo === null}
      <AutoCompleteForm
        node={widget.node}
        {widget}
        select={widget.options?.values ?? []}
        {isValid}
        handleInput={(e, w, m) => handleInput(e, w, m, true)}
      />
    {:else}
      <ModalComboWidget
        node={widget.node}
        {widget}
        select={widget.options?.values ?? []}
        {isValid}
        modelDir={modelDirInfo?.dir as ModelTypes}
        modelSubdirs={modelDirInfo?.subdirs}
        handleInput={(e, w, m) => handleInput(e, w, m, false)}
      />
    {/if}
  </div>
</div>
