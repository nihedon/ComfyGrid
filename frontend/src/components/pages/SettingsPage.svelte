<script lang="ts">
  import { onMount } from 'svelte';
  import { toLower } from 'es-toolkit/compat';
  import { appState } from '@/states/app-state.svelte';
  import type { FormInfo } from '@/states/option-state.svelte';
  import BootswatchThemePicker from '../widgets/BootswatchThemePicker.svelte';
  import Option from '../widgets/OptionForm.svelte';

  type GroupedForm = {
    id: string;
    isSection: boolean;
    label?: string;
    items: Array<[string, FormInfo]>;
  };

  const optionState = appState.optionState;

  type MainGroup = {
    id: string;
    name: string;
    forms: Map<string, FormInfo>;
    sections: GroupedForm[];
  };

  function formatSectionName(name: string): { label: string; id: string } {
    const id = toLower(name.replaceAll(/\s+/g, '_'));
    if (id === 'ui') {
      return { label: 'UI', id };
    }
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    return { label, id };
  }

  function getSections(forms: ReadonlyMap<string, FormInfo>): GroupedForm[] {
    const sections: GroupedForm[] = [];
    let currentSection: GroupedForm = { id: 'general', isSection: false, items: [] };
    sections.push(currentSection);

    for (const [key, formInfo] of forms.entries()) {
      let rawSectionName = formInfo.group;
      if (!rawSectionName) {
        const parts = key.split('.');
        if (parts.length >= 3) {
          rawSectionName = parts[1];
        }
      }

      if (rawSectionName) {
        const { label, id } = formatSectionName(rawSectionName);
        if (!currentSection.isSection || currentSection.label !== label) {
          currentSection = { id, isSection: true, label, items: [] };
          sections.push(currentSection);
        }
        currentSection.items.push([key, formInfo]);
      } else {
        if (currentSection.isSection) {
          currentSection = { id: 'general', isSection: false, items: [] };
          sections.push(currentSection);
        }
        currentSection.items.push([key, formInfo]);
      }
    }
    return sections.filter((s) => s.items.length > 0);
  }

  function getMainGroups(forms: ReadonlyMap<string, FormInfo>): MainGroup[] {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const mainGroupsMap = new Map<string, MainGroup>();
    for (const [key, formInfo] of forms.entries()) {
      let mainGroupName = 'ComfyGrid';
      if (key.includes('.')) {
        mainGroupName = key.split('.')[0];
      }
      const id = toLower(mainGroupName);

      if (!mainGroupsMap.has(id)) {
        mainGroupsMap.set(id, {
          id,
          name: mainGroupName,
          forms: new Map<string, FormInfo>(),
          sections: [],
        });
      }
      mainGroupsMap.get(id)!.forms.set(key, formInfo);
    }

    const groups = Array.from(mainGroupsMap.values());
    for (const group of groups) {
      group.sections = getSections(group.forms);
    }
    return groups;
  }

  let optContentsElement = $state<HTMLElement>();
  let spyInstance: typeof window.bootstrap.ScrollSpy | null = null;

  onMount(() => {
    requestAnimationFrame(() => {
      if (optContentsElement) {
        spyInstance = new window.bootstrap.ScrollSpy(optContentsElement, {
          target: '#opt-menu',
          smoothScroll: true,
          rootMargin: '0px 0px -40%',
        });
      }
    });

    return () => {
      spyInstance?.dispose();
    };
  });

  $effect(() => {
    void optionState.forms.size;
    void optionState.extForms.size;
    requestAnimationFrame(() => {
      spyInstance?.refresh();
    });
  });
</script>

<div id="settings-page" class="h-100 d-flex">
  <div class="p-2 border-end overflow-y-auto" style="width: 20rem; min-width: 20rem;">
    <div id="opt-menu" class="list-group">
      {#snippet optionMenu(id: string, name: string, sections: GroupedForm[])}
        <a class="list-group-item list-group-item-action fw-semibold" href="#opt_{id}">
          <span>{name}</span>
        </a>
        {#if sections.some((s) => s.isSection && s.label)}
          <div class="list-group list-group-flush ms-2 my-1">
            {#each sections as section (section.id)}
              {#if section.isSection && section.label}
                <a
                  class="list-group-item list-group-item-action py-1 ps-3 border-0 small rounded"
                  href="#opt_{id}_{section.id}"
                >
                  <span class="text-capitalize">{section.label.replaceAll('_', ' ')}</span>
                </a>
              {/if}
            {/each}
          </div>
        {/if}
      {/snippet}
      {#each getMainGroups(optionState.forms) as mainGroup (mainGroup.id)}
        {@render optionMenu(mainGroup.id, mainGroup.name, mainGroup.sections)}
      {/each}
      {#each optionState.extForms.entries() as [id, extForm] (id)}
        {@render optionMenu(id, extForm.name, getSections(extForm.forms))}
      {/each}
    </div>
  </div>
  <div class="vstack">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      id="opt-contents"
      class="overflow-auto px-2 pb-4 d-grid gap-4 position-relative"
      tabindex="0"
      bind:this={optContentsElement}
    >
      {#snippet optionContents(id: string, name: string, sections: GroupedForm[])}
        <div id="opt_{id}" class="opt-group-section">
          <h2 class="mt-1">{name}</h2>
          <div class="vstack gap-3 ps-4">
            {#each sections as group (group.id)}
              {#if group.isSection}
                <div id="opt_{id}_{group.id}" class="card opt-sub-section">
                  {#if group.label}
                    <div class="card-header fw-bold text-capitalize">
                      {group.label.replaceAll('_', ' ')}
                    </div>
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
        {@render optionContents(mainGroup.id, mainGroup.name, mainGroup.sections)}
      {/each}

      {#each optionState.extForms.entries() as [id, extForm] (id)}
        {@render optionContents(id, extForm.name, getSections(extForm.forms))}
      {/each}

      <hr />
      {@render optionContents(
        'comfygrid_debug',
        'Debug',
        getSections(new Map([['debug_mode', { type: 'checkbox', default: false }]])),
      )}
    </div>
  </div>
</div>

<style lang="scss">
  .opt-group-section,
  .opt-sub-section {
    scroll-margin-top: 1rem;
  }

  :global(#opt-menu .list-group-item.active) {
    z-index: 2;
  }
</style>
