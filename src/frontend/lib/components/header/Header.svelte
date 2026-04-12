<script>
  import StatusWidget from './StatusWidget.svelte';
  import { getZoom, setZoom, getTheme, toggleTheme, getVrMode, toggleVrMode } from '../../stores/ui.svelte.js';

  let { onOpenArchived } = $props();

  function zoomOut() { setZoom(getZoom() - 0.1); }
  function zoomIn() { setZoom(getZoom() + 0.1); }

  let zoomDisplay = $derived(Math.round(getZoom() * 100) + '%');
  let isDark = $derived(getTheme() === 'dark');
  let isVr = $derived(getVrMode());
</script>

<header class="header">
  <div class="header-title">ED Colonization Tracker</div>
  <div class="zoom-controls">
    <button class="zoom-btn" onclick={zoomOut} disabled={getZoom() <= 0.5}>−</button>
    <span class="zoom-display">{zoomDisplay}</span>
    <button class="zoom-btn" onclick={zoomIn} disabled={getZoom() >= 2.0}>+</button>
  </div>
  <div class="header-status">
    <button
      class="vr-toggle-btn"
      class:vr-active={isVr}
      onclick={toggleVrMode}
      title="Toggle VR mode"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/>
        <circle cx="8" cy="12" r="2"/>
        <circle cx="16" cy="12" r="2"/>
        <path d="M12 8v2"/>
      </svg>
    </button>
    <button class="theme-toggle-btn" onclick={toggleTheme} title="Toggle dark/light mode">
      {#if isDark}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"/>
          <line x1="12" y1="1" x2="12" y2="3"/>
          <line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/>
          <line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      {/if}
    </button>
    <button class="header-btn" onclick={onOpenArchived} title="Archived constructions">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="5" rx="1"/>
        <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/>
        <line x1="10" y1="12" x2="10" y2="17"/>
        <line x1="14" y1="12" x2="14" y2="17"/>
      </svg>
    </button>
    <StatusWidget />
  </div>
</header>

<style>
  .header {
    background: var(--color-bg);
    border-bottom: 1px solid var(--color-border);
    padding: var(--space-xl) var(--space-2xl);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .header-title {
    font-size: 1.63rem;
    font-weight: 700;
    color: var(--color-text-primary);
  }

  .header-status {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .header-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-micro);
    color: var(--color-text-secondary);
    cursor: pointer;
    user-select: none;
    transition: all 0.2s ease;
  }

  .header-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-text-primary);
  }

  .header-btn svg, .theme-toggle-btn svg, .vr-toggle-btn svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: var(--space-xl);
  }

  .zoom-btn {
    width: 3rem;
    height: 3rem;
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-micro);
    color: var(--color-text-primary);
    font-size: 1.25rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .zoom-btn:hover:not(:disabled) {
    border-color: var(--color-primary);
  }

  .zoom-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .zoom-display {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    min-width: 3.5rem;
    text-align: center;
  }

  .theme-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-md) var(--space-lg);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-micro);
    color: var(--color-text-secondary);
    cursor: pointer;
    user-select: none;
    transition: all 0.2s ease;
  }

  .theme-toggle-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-text-primary);
  }

  .vr-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-md) var(--space-lg);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-micro);
    color: var(--color-text-secondary);
    cursor: pointer;
    user-select: none;
    transition: all 0.2s ease;
  }

  .vr-toggle-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-text-primary);
  }

  .vr-toggle-btn.vr-active {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }


</style>
