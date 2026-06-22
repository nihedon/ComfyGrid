<script lang="ts">
  import { onMount } from 'svelte';
  import jQuery from 'jquery';
  import { appState } from '@/states/app-state.svelte';
  import { ComfyGridNode, ComfyGridWidget } from '@/states/model-state.svelte';
  import type { Model } from '@/states/storage-state.svelte';

  let {
    node,
    widget,
    select,
    isValid,
    handleInput,
  }: {
    node: ComfyGridNode;
    widget: ComfyGridWidget<string, unknown>;
    select: string[];
    isValid: boolean;
    handleInput: (e: CustomEvent, widget: ComfyGridWidget<string, unknown>, model?: Model) => void;
  } = $props();

  let inputDomEl = $state<HTMLInputElement>()!;
  let ddEl = $state<HTMLElement>()!;
  let showAllOnNextSearch = false;

  const storageState = appState.storageState;
  const popoverState = appState.popoverState;
  const workspaceState = appState.workspaceState;

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

  onMount(async () => {
    const inputEl = jQuery(inputDomEl!);
    inputEl.autoComplete({
      resolver: 'custom',
      bootstrapVersion: '5',
      minLength: 0,
      events: {
        search: function (query: string, callback: (results: string[]) => void) {
          const MAX_RESULTS = 100;
          if (showAllOnNextSearch) {
            showAllOnNextSearch = false;
            callback(select.slice(0, MAX_RESULTS));
          } else {
            const lowerQuery = query.toLowerCase();
            const filtered = select.filter((v) => v.toLowerCase().includes(lowerQuery));
            callback(filtered.slice(0, MAX_RESULTS));
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

    return {
      destroy() {
        inputEl.autoComplete('destroy');
        ddEl?.remove();
        window.removeEventListener('scroll', handleScrollOrResize, true);
        window.removeEventListener('resize', handleScrollOrResize);
      },
    };
  });

  function handleClick() {
    showAllOnNextSearch = isValid;
    jQuery(inputDomEl).autoComplete('show');
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
    // TODO
    const modelDir = 'models';
    if (modelDir !== 'models') {
      return;
    }
    const item = (e.target as HTMLElement).closest('.dropdown-item') as HTMLElement;
    if (!item) {
      popoverState.hidePopover();
    } else {
      const model = storageState.findModelByPath(item.innerText);
      if (model) {
        popoverState.showModelPopover(item, model, modelDir);
      }
    }
  }

  $effect(() => {
    if (node.mode === 0 && !isValid) {
      workspaceState.addErrorWidget(node.id, widget.id);
    } else {
      workspaceState.deleteErrorWidget(node.id, widget.id);
    }
  });
</script>

<input
  id={widget.id}
  class="form-control autoCompleteForm"
  class:is-invalid={node.mode === 0 && !isValid}
  autocomplete="off"
  data-name={widget.name}
  bind:value={widget.value}
  onblur={handleChanged}
  onclick={handleClick}
  bind:this={inputDomEl}
/>

<style lang="scss">
  :global(.bootstrap-autocomplete.dropdown-menu) {
    max-height: 400px;
    overflow-y: scroll;
    width: max-content !important;
  }
</style>
