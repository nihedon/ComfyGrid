<script lang="ts">
  import * as bootstrap from 'bootstrap';

  let {
    triggerElement,
    contentsElement,
    placement = 'auto',
    customClass = '',
  }: {
    triggerElement: HTMLElement;
    contentsElement: HTMLElement;
    placement?: 'auto' | 'top' | 'right' | 'bottom' | 'left';
    customClass?: string;
  } = $props();

  $effect(() => {
    const trigger = triggerElement;
    const content = contentsElement;
    if (!trigger || !content) return;
    let destroyed = false;
    let clickListenerTimer: ReturnType<typeof setTimeout> | undefined;

    trigger.dataset.bsToggle = 'popover';

    const popover = new bootstrap.Popover(trigger, {
      content,
      customClass: customClass,
      placement: placement,
      html: true,
    });

    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.popover.show')) {
        popover.hide();
      }
    };
    const handleShow = () => {
      const popoverElements = document.querySelectorAll('[data-bs-toggle="popover"]');
      popoverElements.forEach((el) => {
        const instance = bootstrap.Popover.getInstance(el);
        instance?.hide();
      });
    };

    const handleShown = () => {
      // Delay attaching to prevent immediate trigger from the same click event
      clearTimeout(clickListenerTimer);
      clickListenerTimer = setTimeout(() => {
        clickListenerTimer = undefined;
        if (!destroyed) document.addEventListener('click', handleDocumentClick);
      }, 0);
    };

    const handleHidden = () => {
      clearTimeout(clickListenerTimer);
      clickListenerTimer = undefined;
      document.removeEventListener('click', handleDocumentClick);
    };

    trigger.addEventListener('show.bs.popover', handleShow);
    trigger.addEventListener('shown.bs.popover', handleShown);
    trigger.addEventListener('hidden.bs.popover', handleHidden);

    return () => {
      destroyed = true;
      handleHidden();
      trigger.removeEventListener('show.bs.popover', handleShow);
      trigger.removeEventListener('shown.bs.popover', handleShown);
      trigger.removeEventListener('hidden.bs.popover', handleHidden);
      popover.dispose();
    };
  });
</script>
