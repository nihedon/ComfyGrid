<script lang="ts">
  import { onMount } from 'svelte';
  import { appState } from '@/states/app-state.svelte';
  import type { FormInfo } from '@/states/option-state.svelte';
  import BootswatchThemePicker from '../widgets/BootswatchThemePicker.svelte';
  import Option from '../widgets/OptionForm.svelte';

  type GroupedForm = {
    isSection: boolean;
    label?: string;
    items: Array<[string, FormInfo]>;
  };

  const optionState = appState.optionState;

  function getGroups(forms: ReadonlyMap<string, FormInfo>): GroupedForm[] {
    const groups: GroupedForm[] = [];
    let currentGroup: GroupedForm = { isSection: false, items: [] };
    groups.push(currentGroup);

    for (const [key, formInfo] of forms.entries()) {
      const groupName = formInfo.group;
      if (groupName) {
        if (!currentGroup.isSection || currentGroup.label !== groupName) {
          currentGroup = { isSection: true, label: groupName, items: [] };
          groups.push(currentGroup);
        }
        currentGroup.items.push([key, formInfo]);
      } else {
        if (currentGroup.isSection) {
          currentGroup = { isSection: false, items: [] };
          groups.push(currentGroup);
        }
        currentGroup.items.push([key, formInfo]);
      }
    }
    return groups.filter((g) => g.items.length > 0);
  }

  let optContentsElement = $state<HTMLElement>();
  let spyInstance: typeof window.bootstrap.ScrollSpy | null = null;

  onMount(() => {
    requestAnimationFrame(() => {
      spyInstance = new window.bootstrap.ScrollSpy(optContentsElement, {
        target: '#opt-menu',
        smoothScroll: true,
        rootMargin: '0px 0px -40%',
      });
    });

    return () => {
      spyInstance?.dispose();
    };
  });
</script>

<div id="settings-page" class="h-100 d-flex">
  <div class="p-2 border-end" style="width: 20rem; min-width: 20rem;">
    <div id="opt-menu" class="list-group">
      {#snippet optionMenu(id: string, name: string)}
        <a class="list-group-item list-group-item-action" href="#opt_{id}">
          <span>{name}</span>
        </a>
      {/snippet}
      {@render optionMenu('comfygrid', 'ComfyGrid')}
      {#each optionState.extForms.entries() as [id, extForm] (id)}
        {@render optionMenu(id, extForm.name)}
      {/each}
    </div>
  </div>
  <div class="vstack">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      id="opt-contents"
      class="overflow-auto px-2 pb-4 d-grid gap-4"
      tabindex="0"
      bind:this={optContentsElement}
    >
      {#snippet optionContents(id: string, name: string, forms: ReadonlyMap<string, FormInfo>)}
        <div id="opt_{id}">
          <h2>{name}</h2>
          <div class="vstack gap-3 ps-4">
            {#each getGroups(forms) as group, i (i)}
              {#if group.isSection}
                <div class="card">
                  {#if group.label}
                    <div class="card-header fw-bold">{group.label}</div>
                  {/if}
                  <div class="card-body vstack gap-3">
                    {#each group.items as [key, formInfo] (key)}
                      <Option optionKey={key} {formInfo} />
                    {/each}
                  </div>
                </div>
              {:else}
                {#each group.items as [key, formInfo] (key)}
                  <Option optionKey={key} {formInfo} />
                  {#if id === 'comfygrid' && key === 'color_theme'}
                    <BootswatchThemePicker />
                  {/if}
                {/each}
              {/if}
            {/each}
          </div>
        </div>
      {/snippet}
      {@render optionContents('comfygrid', 'ComfyGrid', optionState.forms)}
      {#each optionState.extForms.entries() as [id, extForm] (id)}
        {@render optionContents(id, extForm.name, extForm.forms)}
      {/each}
      <hr />
      {@render optionContents(
        'comfygrid',
        'Debug',
        new Map([['debug_mode', { type: 'checkbox', default: false }]]),
      )}
    </div>
  </div>
</div>
