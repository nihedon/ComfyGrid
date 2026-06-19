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
    if (!triggerElement || !contentsElement) return;

    triggerElement.dataset.bsToggle = 'popover';

    const popover = new bootstrap.Popover(triggerElement, {
      content: contentsElement,
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
      setTimeout(() => document.addEventListener('click', handleDocumentClick), 0);
    };

    const handleHidden = () => {
      document.removeEventListener('click', handleDocumentClick);
    };

    triggerElement.addEventListener('show.bs.popover', handleShow);
    triggerElement.addEventListener('shown.bs.popover', handleShown);
    triggerElement.addEventListener('hidden.bs.popover', handleHidden);

    return () => {
      document.removeEventListener('click', handleDocumentClick);
      triggerElement?.removeEventListener('show.bs.popover', handleShow);
      triggerElement?.removeEventListener('shown.bs.popover', handleShown);
      triggerElement?.removeEventListener('hidden.bs.popover', handleHidden);
      popover.dispose();
    };
  });
</script>
