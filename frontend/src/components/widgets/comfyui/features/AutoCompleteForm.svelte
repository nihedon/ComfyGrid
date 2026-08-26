<script lang="ts">
  import { onMount } from 'svelte';
  import jQuery from 'jquery';
  import { appState } from '@/states/app-state.svelte';
  import { ComfyGridWidget } from '@/states/model-state.svelte';
  import type { Model, ModelTypes } from '@/states/storage-state.svelte';

  type ComboWidget = ComfyGridWidget<
    string | number,
    {
      values: (string | number)[];
      fixed_values: (string | number)[];
    }
  >;

  let {
    widget,
    select,
    modelDir,
    modelSubdirs,
    isValidOverride = undefined,
    handleInput,
  }: {
    widget: ComboWidget;
    select: (string | number)[];
    modelDir?: ModelTypes;
    modelSubdirs?: string[];
    isValidOverride?: boolean;
    handleInput: (
      e: CustomEvent,
      widget: ComfyGridWidget<string | number, unknown>,
      model?: Model,
    ) => void;
  } = $props();

  let inputDomEl = $state<HTMLInputElement>()!;
  let ddEl = $state<HTMLElement>()!;
  let showAllOnNextSearch = false;

  const storageState = appState.storageState;
  const popoverState = appState.popoverState;
  const workspaceState = appState.workspaceState;

  const showNsfw = $derived(appState.optionState.get('ComfyGrid.ui.show_nsfw'));

  const selectStr = $derived(
    select
      .map((v) => String(v))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })),
  );
  const fixedValuesStr = $derived((widget.options?.fixed_values ?? []).map((v) => String(v)));

  const isValid = $derived.by(() => {
    if (isValidOverride !== undefined) return isValidOverride;
    const strValue = String(widget.value);
    return (
      selectStr.includes(strValue) ||
      strValue.toLocaleLowerCase() === 'none' ||
      strValue.indexOf('Select ') === 0 ||
      fixedValuesStr.includes(strValue)
    );
  });

  function teleportDropdown() {
    document.body.appendChild(ddEl);
    repositionDropdown();
  }

  function repositionDropdown() {
    const rect = inputDomEl?.getBoundingClientRect();
    if (rect && ddEl) {
      const dropdownHeight = ddEl.offsetHeight || 400;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        ddEl.style.top = `${rect.top - dropdownHeight}px`;
      } else {
        ddEl.style.top = `${rect.bottom}px`;
      }
      ddEl.style.left = `${rect.left}px`;
    }
  }

  onMount(() => {
    const inputEl = jQuery(inputDomEl!);
    inputEl.autoComplete({
      resolver: 'custom',
      bootstrapVersion: '4',
      minLength: 0,
      events: {
        search: function (query: string, callback: (results: string[]) => void) {
          if (showAllOnNextSearch) {
            showAllOnNextSearch = false;
            callback(selectStr);
          } else {
            const lowerQuery = query.toLowerCase();
            const filtered = selectStr.filter((v) => v.toLowerCase().includes(lowerQuery));
            callback(filtered);
          }
        },
      },
    });

    inputEl.on('autocomplete.dd.shown', () => {
      if (!ddEl) {
        ddEl = inputDomEl.parentElement?.querySelector<HTMLElement>(
          '.bootstrap-autocomplete.dropdown-menu',
        ) as HTMLElement;
        ddEl.onmousemove = handleMouseMove;
      }
      teleportDropdown();

      if (ddEl && inputDomEl.value) {
        const items = ddEl.querySelectorAll<HTMLElement>('.dropdown-item');
        for (const item of items) {
          if (item.textContent === inputDomEl.value) {
            setTimeout(() => {
              item.scrollIntoView({ behavior: 'instant', block: 'start' });
            }, 0);
            break;
          }
        }
      }
    });

    inputEl.on('autocomplete.dd.hidden', () => {
      popoverState.hidePopover();
    });

    inputEl.on('autocomplete.select', handleChanged);

    const handleScrollOrResize = () => {
      if (ddEl) repositionDropdown();
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      inputEl.autoComplete('destroy');
      ddEl?.remove();
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  });

  let originalValue: string | number = '';

  function handleFocus() {
    originalValue = widget.value;
  }

  function handleClick() {
    if (isValid) {
      showAllOnNextSearch = true;
    } else {
      const lowerQuery = String(inputDomEl?.value ?? '').toLowerCase();
      const hasPartialMatch = selectStr.some((v) => v.toLowerCase().includes(lowerQuery));
      showAllOnNextSearch = !hasPartialMatch;
    }
    jQuery(inputDomEl).autoComplete('show');
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      widget.value = originalValue;
      if (inputDomEl) inputDomEl.value = String(originalValue);
      jQuery(inputDomEl).autoComplete('hide');
      inputDomEl.blur();
    }
  }

  function handleChanged() {
    if (inputDomEl && inputDomEl.value !== widget.value) {
      handleInput(
        new CustomEvent('autocompleteChange', {
          detail: { value: inputDomEl.value },
          bubbles: true,
        }),
        widget,
      );
      popoverState.hidePopover();
    }
  }

  function handleMouseMove(e: Event) {
    if (modelDir !== 'models') {
      return;
    }
    const item = (e.target as HTMLElement).closest('.dropdown-item') as HTMLElement;
    if (!item) {
      popoverState.hidePopover();
    } else {
      const model = storageState.findModel(modelDir, modelSubdirs!, item.innerText);
      if (model && (showNsfw || !model.nsfw)) {
        popoverState.showModelPopover(item, model, modelDir);
      }
    }
  }

  $effect(() => {
    if (widget.node.mode === 0 && !isValid) {
      workspaceState.addErrorWidget(widget.node.id, widget.id);
    } else {
      workspaceState.deleteErrorWidget(widget.node.id, widget.id);
    }
  });
</script>

<input
  id={widget.id}
  class="form-control autoCompleteForm"
  class:is-invalid={widget.node.mode === 0 && !isValid}
  autocomplete="off"
  data-name={widget.name}
  bind:value={widget.value}
  onblur={handleChanged}
  onfocus={handleFocus}
  onclick={handleClick}
  onkeydown={handleKeyDown}
  bind:this={inputDomEl}
/>

<style lang="scss">
  :global(.bootstrap-autocomplete.dropdown-menu) {
    max-height: 400px;
    overflow-y: scroll;
    width: max-content !important;
  }
</style>
