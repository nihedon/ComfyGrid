<script lang="ts">
  import { Check, Info, TriangleAlert, X } from '@lucide/svelte';
  import { appState } from '@/states/app-state.svelte';

  let toastState = appState.toastState;

  function initializeToast(element: HTMLDivElement) {
    const bsToast = new window.bootstrap.Toast(element, { autohide: true, delay: 5000 });
    const handleHidden = () => toastState.removeToast(element.id);
    let disposed = false;

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      element.removeEventListener('hidden.bs.toast', handleHidden);
      element.removeEventListener('shown.bs.toast', finishTransition);
      element.removeEventListener('hidden.bs.toast', finishTransition);
      bsToast.dispose();
    };
    const finishTransition = () => queueMicrotask(dispose);

    element.addEventListener('hidden.bs.toast', handleHidden);
    bsToast.show();

    return {
      destroy() {
        element.removeEventListener('hidden.bs.toast', handleHidden);
        // Bootstrap transition callbacks still access the instance after emitting events.
        if (element.classList.contains('showing')) {
          element.addEventListener('shown.bs.toast', finishTransition);
          element.addEventListener('hidden.bs.toast', finishTransition);
        } else {
          dispose();
        }
      },
    };
  }

  function getToastClass(type: string): string {
    switch (type) {
      case 'success':
        return 'text-bg-success';
      case 'error':
        return 'text-bg-danger';
      case 'warning':
        return 'text-bg-warning';
      case 'info':
        return 'text-bg-info';
      default:
        return 'text-bg-secondary';
    }
  }
</script>

<div class="toast-container position-fixed bottom-0 end-0 p-3" style="z-index: 9999;">
  {#each toastState.toasts as toast (toast.id)}
    <div
      use:initializeToast
      id={toast.id}
      class="toast {getToastClass(toast.type)}"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div class="toast-header {getToastClass(toast.type)} d-flex align-items-center gap-1">
        {#if toast.type === 'success'}
          <Check size={16} />
        {:else if toast.type === 'error'}
          <X size={16} />
        {:else if toast.type === 'warning'}
          <TriangleAlert size={16} />
        {:else}
          <Info size={16} />
        {/if}
        <strong class="me-auto">{toast.title}</strong>
        <small>{new Date(toast.timestamp).toLocaleTimeString()}</small>
        <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">{toast.message}</div>
    </div>
  {/each}
</div>
