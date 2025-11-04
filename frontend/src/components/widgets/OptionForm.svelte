<script lang="ts">
  import { t } from '@/i18n/i18n';
  import { saveOptsWithCallback } from '@/services/options-service';
  import { appState } from '@/states/app-state.svelte';
  import type { FormInfo } from '@/states/option-state.svelte';

  let { optionKey, formInfo }: { optionKey: string; formInfo: FormInfo } = $props();

  // Computed properties for display
  const label = $derived($t(`opts.${optionKey}.label`) ?? formInfo.label ?? optionKey);
  const hint = $derived($t(`opts.${optionKey}.hint`) ?? formInfo.hint);

  // Current value with fallback to default
  const optionState = appState.optionState;
  const currentValue = $derived(optionState.opts.get(optionKey) ?? formInfo.default);

  /**
   * Handle value change for all input types
   */
  function handleChange(newValue: unknown) {
    optionState.setOptionValue(optionKey, newValue);
    saveOptsWithCallback();
  }

  /**
   * Handle input event for text-like inputs
   */
  function handleInputChange(e: Event) {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    handleChange(target.value);
  }

  /**
   * Handle checkbox change
   */
  function handleCheckboxChange(e: Event) {
    const target = e.target as HTMLInputElement;
    handleChange(target.checked);
  }

  /**
   * Handle radio change
   */
  function handleRadioChange(e: Event) {
    const target = e.target as HTMLInputElement;
    handleChange(target.value);
  }

  /**
   * Handle number/slider change
   */
  function handleNumberChange(e: Event) {
    const target = e.target as HTMLInputElement;
    handleChange(parseFloat(target.value));
  }
</script>

{#snippet labelBlock()}
  <div class="label-block d-flex">
    <label for={optionKey}>
      {label}
      {#if hint}
        <i class="pi pi-info-circle" title={hint}></i>
      {/if}
    </label>
  </div>
{/snippet}

{#if formInfo.type === 'checkbox'}
  <div class="flex gap-2">
    <div class="form-check">
      <input
        id={optionKey}
        class="form-check-input"
        type="checkbox"
        name={optionKey}
        checked={currentValue as boolean}
        onchange={handleCheckboxChange}
      />
      {@render labelBlock()}
    </div>
  </div>
{:else if formInfo.type === 'slider'}
  <div class="vstack">
    {@render labelBlock()}
    <div class="d-flex justify-content-between align-items-center gap-2">
      <input
        id={optionKey}
        class="form-range"
        type="range"
        name={optionKey}
        min={formInfo.minimum}
        max={formInfo.maximum}
        step={formInfo.step ?? 1}
        value={currentValue}
        onchange={handleNumberChange}
      />
      <input
        class="py-0 px-2 form-control"
        style="width: 5rem;"
        type="number"
        name={optionKey}
        min={formInfo.minimum}
        max={formInfo.maximum}
        step={formInfo.step ?? 1}
        value={currentValue}
        onchange={handleNumberChange}
      />
    </div>
  </div>
{:else if formInfo.type === 'text'}
  <div class="vstack">
    {@render labelBlock()}
    <div>
      <input
        id={optionKey}
        class="form-control"
        type="text"
        name={optionKey}
        placeholder={formInfo.placeholder ?? ''}
        value={currentValue}
        onchange={handleInputChange}
      />
    </div>
  </div>
{:else if formInfo.type === 'textarea'}
  <div class="vstack">
    {@render labelBlock()}
    <textarea
      id={optionKey}
      class="form-control"
      name={optionKey}
      rows={formInfo.lines ?? 4}
      placeholder={formInfo.placeholder ?? ''}
      value={currentValue as string}
      onchange={handleInputChange}
    ></textarea>
  </div>
{:else if formInfo.type === 'number'}
  <div class="vstack">
    {@render labelBlock()}
    <div>
      <input
        id={optionKey}
        class="form-control"
        type="number"
        name={optionKey}
        min={formInfo.minimum}
        max={formInfo.maximum}
        step={formInfo.step ?? 1}
        value={currentValue}
        onchange={handleNumberChange}
      />
    </div>
  </div>
{:else if formInfo.type === 'dropdown'}
  <div class="vstack">
    {@render labelBlock()}
    <div>
      <select
        id={optionKey}
        class="form-select"
        name={optionKey}
        value={currentValue}
        onchange={handleInputChange}
      >
        {#each formInfo.choices as choice (choice)}
          <option value={choice} selected={choice === currentValue}>
            {$t(`opts.${optionKey}.choice.${choice}`) || choice}
          </option>
        {/each}
      </select>
    </div>
  </div>
{:else if formInfo.type === 'radio'}
  <div class="vstack">
    {@render labelBlock()}
    <div>
      <div class="d-flex gap-4">
        {#each formInfo.choices as choice (choice)}
          <div class="form-check">
            <input
              id="{optionKey}_{choice}"
              class="form-check-input"
              type="radio"
              name={optionKey}
              value={choice}
              checked={choice === currentValue}
              onchange={handleRadioChange}
            />
            <label for="{optionKey}_{choice}">
              {$t(`opts.${optionKey}.choice.${choice}`) || choice}
            </label>
          </div>
        {/each}
      </div>
    </div>
  </div>
{:else if formInfo.type === 'color'}
  <div class="vstack">
    {@render labelBlock()}
    <input
      id={optionKey}
      type="color"
      name={optionKey}
      value={currentValue}
      onchange={handleInputChange}
    />
  </div>
{/if}
