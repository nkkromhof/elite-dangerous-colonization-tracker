<script>
  import { getErrors, getErrorCount } from '../../stores/errors.svelte.js';

  let dropdownVisible = $state(false);

  function toggleDropdown(e) {
    e.stopPropagation();
    dropdownVisible = !dropdownVisible;
  }

  function closeDropdown() {
    dropdownVisible = false;
  }
</script>

<svelte:window onclick={closeDropdown} />

<div class="status-wrapper">
  <button
    class="header-btn"
    class:has-errors={getErrorCount() > 0}
    onclick={toggleDropdown}
    title="Session errors"
  >
    {#if getErrorCount() > 0}
      <svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span class="status-count has-errors">{getErrorCount()}</span>
    {:else}
      <svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    {/if}
  </button>

  {#if dropdownVisible}
    <div class="status-dropdown">
      <div class="status-header">Session Errors</div>
      <div class="status-list">
        {#if getErrorCount() === 0}
          <div class="status-item muted">No errors this session</div>
        {:else}
          {#each getErrors() as err}
            <div class="status-item">
              <div class="status-item-time">{new Date(err.timestamp).toLocaleTimeString()}</div>
              <div class="status-item-source">{err.source}</div>
              <div class="status-item-message">{err.message}</div>
              {#if err.details}
                <div class="status-item-details">{err.details}</div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .status-wrapper {
    position: relative;
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

  .header-btn.has-errors {
    color: var(--color-danger);
  }

  .status-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .status-count {
    font-size: 1rem;
    font-weight: 600;
  }

  .status-count.has-errors {
    color: var(--color-danger);
    animation: pulse 2s infinite;
  }

  .status-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: var(--space-md);
    width: 400px;
    max-height: 300px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    z-index: 100;
    overflow: hidden;
  }

  .status-header {
    padding: var(--space-lg) var(--space-xl);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-subtle);
  }

  .status-list {
    max-height: 240px;
    overflow-y: auto;
  }

  .status-item {
    padding: var(--space-lg) var(--space-xl);
    border-bottom: 1px solid var(--color-border);
    font-size: 0.9375rem;
  }

  .status-item:last-child { border-bottom: none; }
  .status-item.muted { color: var(--color-text-muted); }

  .status-item-time {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-bottom: var(--space-sm);
  }

  .status-item-source {
    font-weight: 600;
    color: var(--color-danger);
    margin-bottom: var(--space-xs);
  }

  .status-item-message { color: var(--color-text-primary); }

  .status-item-details {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
    margin-top: var(--space-sm);
    word-break: break-all;
  }
</style>
