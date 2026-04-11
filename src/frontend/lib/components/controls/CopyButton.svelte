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

<button type="button" class="copyable" onclick={handleCopy}>
  {@render children()}
</button>

{#if showToast}
  <div class="copy-toast">Copied!</div>
{/if}

<style>
  .copyable {
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
    text-align: inherit;
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
