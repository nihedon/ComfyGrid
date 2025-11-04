<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';
  import { appState } from '@/states/app-state.svelte';

  let toastState = appState.toastState;
  let toastElements = new SvelteMap<string, HTMLDivElement>();

  function getToastIcon(type: string): string {
    switch (type) {
      case 'success':
        return 'pi-check-circle';
      case 'error':
        return 'pi-times-circle';
      case 'warning':
        return 'pi-exclamation-triangle';
      case 'info':
        return 'pi-info-circle';
      default:
        return 'pi-info-circle';
    }
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

  $effect(() => {
    // Track toasts reactively
    toastState.toasts.forEach((toast) => {
      if (!toastElements.has(toast.id)) {
        // Use setTimeout to defer element lookup after DOM update
        setTimeout(() => {
          const element = document.getElementById(toast.id) as HTMLDivElement;
          if (element && !toastElements.has(toast.id)) {
            toastElements.set(toast.id, element);
            const bsToast = new window.bootstrap.Toast(element, {
              autohide: true,
              delay: 5000,
            });
            bsToast.show();

            element.addEventListener('hidden.bs.toast', () => {
              toastState.removeToast(toast.id);
              toastElements.delete(toast.id);
            });
          }
        }, 0);
      }
    });
  });
</script>

<div class="toast-container position-fixed bottom-0 end-0 p-3" style="z-index: 9999;">
  {#each toastState.toasts as toast (toast.id)}
    <div
      id={toast.id}
      class="toast {getToastClass(toast.type)}"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div class="toast-header {getToastClass(toast.type)}">
        <i class="pi {getToastIcon(toast.type)} me-2"></i>
        <strong class="me-auto">{toast.title}</strong>
        <small>{new Date(toast.timestamp).toLocaleTimeString()}</small>
        <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">{toast.message}</div>
    </div>
  {/each}
</div>
