<script>
  let { text = '', children } = $props();
  let showToast = $state(false);
  let toastTimer;

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      if (toastTimer) clearTimeout(toastTimer);
      showToast = true;
      toastTimer = setTimeout(() => { showToast = false; }, 1500);
    });
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<span class="copyable" onclick={handleCopy}>
  {@render children()}
</span>

{#if showToast}
  <div class="copy-toast">Copied!</div>
{/if}

<style>
  .copyable {
    cursor: pointer;
  }

  .copyable:hover {
    color: var(--color-primary);
  }

  .copy-toast {
    position: fixed;
    bottom: var(--space-2xl);
    left: 50%;
    transform: translateX(-50%);
    background: var(--color-text-primary);
    color: var(--color-bg);
    padding: var(--space-md) var(--space-xl);
    border-radius: var(--radius-pill);
    font-size: 0.875rem;
    font-weight: 600;
    z-index: 2000;
    pointer-events: none;
  }
</style>
