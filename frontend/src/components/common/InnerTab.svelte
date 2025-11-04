<script lang="ts">
  let {
    id,
    classNames = [],
    text,
    activeTabId = $bindable<string>(),
  }: { id: string; classNames?: string[]; text: string; activeTabId: string } = $props();

  const isActive = $derived(activeTabId === id);

  function changeActiveTab() {
    activeTabId = id;
  }
</script>

<li class="nav-item {classNames?.join(' ')}">
  <button
    class="nav-link"
    class:active={isActive}
    role="tab {id}"
    aria-selected={isActive}
    onclick={changeActiveTab}
  >
    {text}
  </button>
</li>

<style lang="scss">
  .nav-link.active {
    text-decoration: underline;
  }
</style>
