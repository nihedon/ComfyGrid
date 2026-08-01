<script lang="ts">
  import { onMount } from 'svelte';
  import { toLower } from 'es-toolkit/compat';
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

  type MainGroup = {
    id: string;
    name: string;
    forms: Map<string, FormInfo>;
  };

  function getMainGroups(forms: ReadonlyMap<string, FormInfo>): MainGroup[] {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const mainGroupsMap = new Map<string, MainGroup>();
    for (const [key, formInfo] of forms.entries()) {
      let mainGroupName = 'ComfyGrid'; // Default fallback
      if (key.includes('.')) {
        mainGroupName = key.split('.')[0];
      }
      const id = toLower(mainGroupName);

      if (!mainGroupsMap.has(id)) {
        mainGroupsMap.set(id, {
          id,
          name: mainGroupName,
          forms: new Map<string, FormInfo>(),
        });
      }
      mainGroupsMap.get(id)!.forms.set(key, formInfo);
    }
    return Array.from(mainGroupsMap.values());
  }

  function getSections(forms: ReadonlyMap<string, FormInfo>): GroupedForm[] {
    const sections: GroupedForm[] = [];
    let currentSection: GroupedForm = { isSection: false, items: [] };
    sections.push(currentSection);

    for (const [key, formInfo] of forms.entries()) {
      let sectionName = formInfo.group;
      if (!sectionName) {
        const parts = key.split('.');
        if (parts.length >= 3) {
          // Format: Group.Category.Option
          sectionName = parts[1];
        }
      }

      if (sectionName) {
        // Capitalize the first letter for display
        sectionName = sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
        if (!currentSection.isSection || currentSection.label !== sectionName) {
          currentSection = { isSection: true, label: sectionName, items: [] };
          sections.push(currentSection);
        }
        currentSection.items.push([key, formInfo]);
      } else {
        if (currentSection.isSection) {
          currentSection = { isSection: false, items: [] };
          sections.push(currentSection);
        }
        currentSection.items.push([key, formInfo]);
      }
    }
    return sections.filter((s) => s.items.length > 0);
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
      {#each getMainGroups(optionState.forms) as mainGroup (mainGroup.id)}
        {@render optionMenu(mainGroup.id, mainGroup.name)}
      {/each}
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
            {#each getSections(forms) as group, i (i)}
              {#if group.isSection}
                <div class="card">
                  {#if group.label}
                    <div class="card-header fw-bold text-uppercase">{group.label}</div>
                  {/if}
                  <div class="card-body vstack gap-3">
                    {#each group.items as [key, formInfo] (key)}
                      <Option optionKey={key} {formInfo} />
                      {#if id === 'comfygrid' && (key === 'color_theme' || key.endsWith('.color_theme'))}
                        <BootswatchThemePicker />
                      {/if}
                    {/each}
                  </div>
                </div>
              {:else}
                {#each group.items as [key, formInfo] (key)}
                  <Option optionKey={key} {formInfo} />
                  {#if id === 'comfygrid' && (key === 'color_theme' || key.endsWith('.color_theme'))}
                    <BootswatchThemePicker />
                  {/if}
                {/each}
              {/if}
            {/each}
          </div>
        </div>
      {/snippet}

      {#each getMainGroups(optionState.forms) as mainGroup (mainGroup.id)}
        {@render optionContents(mainGroup.id, mainGroup.name, mainGroup.forms)}
      {/each}

      {#each optionState.extForms.entries() as [id, extForm] (id)}
        {@render optionContents(id, extForm.name, extForm.forms)}
      {/each}

      <hr />
      {@render optionContents(
        'comfygrid_debug',
        'Debug',
        new Map([['debug_mode', { type: 'checkbox', default: false }]]),
      )}
    </div>
  </div>
</div>
