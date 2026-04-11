<script>
  import { onMount } from 'svelte';
  import Header from './lib/components/header/Header.svelte';
  import ShipBar from './lib/components/header/ShipBar.svelte';
  import TabBar from './lib/components/tabs/TabBar.svelte';
  import AllTab from './lib/components/tabs/AllTab.svelte';
  import ConstructionTab from './lib/components/tabs/ConstructionTab.svelte';
  import Modal from './lib/components/controls/Modal.svelte';
  import { connect, disconnect, loadInitialState } from './lib/stores/sse.svelte.js';
  import {
    getActiveId,
    getConstructions,
    removeConstruction,
    restoreConstruction,
    ALL_TAB_ID,
  } from './lib/stores/constructions.svelte.js';
  import { getZoom, getTheme } from './lib/stores/ui.svelte.js';
  import {
    archiveConstruction,
    unarchiveConstruction,
    fetchArchivedConstructions,
    fetchConstruction,
  } from './lib/utils/api.js';

  // Archive modal state
  let showArchiveModal = $state(false);
  let pendingDeleteId = $state(null);
  let pendingDeleteName = $state('');

  // Archived list modal
  let showArchivedModal = $state(false);
  let archivedList = $state([]);

  // Reactive CSS variable application
  $effect(() => {
    document.documentElement.style.setProperty('--zoom', getZoom().toFixed(2));
  });

  $effect(() => {
    if (getTheme() === 'dark') {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  });

  // Lifecycle
  onMount(() => {
    loadInitialState();
    connect();
    return () => disconnect();
  });

  // Archive/delete flow
  function handleDeleteRequest(id) {
    const c = getConstructions().find(c => c.id === id);
    if (!c) return;
    pendingDeleteId = id;
    pendingDeleteName = c.station_name;
    showArchiveModal = true;
  }

  async function handleArchiveConfirm() {
    if (!pendingDeleteId) return;
    await archiveConstruction(pendingDeleteId);
    removeConstruction(pendingDeleteId);
    showArchiveModal = false;
    pendingDeleteId = null;
  }

  function handleArchiveCancel() {
    showArchiveModal = false;
    pendingDeleteId = null;
  }

  // Archived constructions modal
  async function openArchivedModal() {
    const all = await fetchArchivedConstructions();
    archivedList = all.filter(c => c.is_archived);
    showArchivedModal = true;
  }

  async function handleUnarchive(id) {
    await unarchiveConstruction(id);
    const construction = await fetchConstruction(id);
    restoreConstruction(construction);
    archivedList = archivedList.filter(c => c.id !== id);
    if (archivedList.length === 0) showArchivedModal = false;
  }
</script>

<div class="app">
  <Header onOpenArchived={openArchivedModal} />
  <ShipBar />
  <TabBar onDelete={handleDeleteRequest} />

  <main class="main">
    <div class="construction-card">
      {#if getActiveId() === ALL_TAB_ID}
        <AllTab />
      {:else}
        <ConstructionTab />
      {/if}
    </div>
  </main>

  <Modal
    open={showArchiveModal}
    title="Archive Construction?"
    onConfirm={handleArchiveConfirm}
    onCancel={handleArchiveCancel}
  >
    {#snippet children()}
      <p>This will archive "{pendingDeleteName}". It will be removed from the primary view but can be restored later.</p>
    {/snippet}
  </Modal>

  {#if showArchivedModal}
    <div
      class="modal-overlay"
      role="button"
      tabindex="-1"
      aria-label="Close"
      onclick={(e) => { if (e.target === e.currentTarget) showArchivedModal = false; }}
      onkeydown={(e) => { if (e.key === 'Escape') showArchivedModal = false; }}
    >
      <div class="archived-panel">
        <h3>Archived Constructions</h3>
        <div class="archived-list">
          {#if archivedList.length === 0}
            <p class="empty-state">No archived constructions</p>
          {:else}
            {#each archivedList as c}
              <div class="archived-item">
                <div class="archived-item-info">
                  <strong>{c.station_name}</strong>
                  <span>{c.system_name}</span>
                </div>
                <button class="unarchive-btn" onclick={() => handleUnarchive(c.id)}>Restore</button>
              </div>
            {/each}
          {/if}
        </div>
        <div class="archived-close">
          <button class="close-btn" onclick={() => showArchivedModal = false}>Close</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .main {
    flex: 1;
    padding: var(--space-2xl);
    overflow-y: auto;
  }

  .construction-card {
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .archived-panel {
    background: var(--color-bg);
    border-radius: var(--radius-card);
    padding: var(--space-2xl);
    max-width: 500px;
    width: 90%;
    box-shadow: var(--shadow-deep);
  }

  .archived-panel h3 {
    font-size: 1.125rem;
    font-weight: 700;
    margin-bottom: var(--space-xl);
  }

  .archived-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-lg);
    border-bottom: 1px solid var(--color-border);
  }

  .archived-item:last-child { border-bottom: none; }

  .archived-item-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .archived-item-info span {
    font-size: 0.8125rem;
    color: var(--color-text-muted);
  }

  .unarchive-btn {
    padding: var(--space-sm) var(--space-lg);
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: var(--radius-micro);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
  }

  .archived-close {
    margin-top: var(--space-xl);
    text-align: right;
  }

  .close-btn {
    padding: var(--space-md) var(--space-xl);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-micro);
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .empty-state {
    color: var(--color-text-muted);
    padding: var(--space-lg);
  }
</style>
