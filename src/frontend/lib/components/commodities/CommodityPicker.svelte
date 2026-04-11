<script>
  import { fetchCommodities, setCommodityRequired } from '../../utils/api.js';
  import { updateCommodity } from '../../stores/constructions.svelte.js';

  let { constructionId } = $props();

  let commodities = $state([]);
  let query = $state('');
  let selected = $state(null);
  let quantity = $state(1);
  let submitting = $state(false);
  let showDropdown = $state(false);
  let inputEl = $state(null);
  let qtyEl = $state(null);
  let dropdownPos = $state({ top: 0, left: 0, width: 0 });

  $effect(() => {
    fetchCommodities().then(data => { commodities = data; });
  });

  let filtered = $derived(
    query.length >= 2 && !selected
      ? commodities.filter(c => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
      : []
  );

  function updateDropdownPosition() {
    if (!inputEl) return;
    const rect = inputEl.getBoundingClientRect();
    dropdownPos = { top: rect.bottom + 2, left: rect.left, width: rect.width };
  }

  function selectCommodity(c) {
    selected = c;
    query = c.name;
    showDropdown = false;
    setTimeout(() => qtyEl?.focus(), 0);
  }

  function handleQueryInput() {
    if (selected && query !== selected.name) {
      selected = null;
    }
    updateDropdownPosition();
    showDropdown = true;
  }

  async function handleAdd() {
    if (!selected || quantity < 1 || submitting) return;
    submitting = true;
    const name = selected.name;
    const res = await setCommodityRequired(constructionId, name, quantity);
    const slots = await res.json();
    const slot = slots.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (slot) updateCommodity(constructionId, slot);
    query = '';
    selected = null;
    quantity = 1;
    submitting = false;
    showDropdown = false;
  }

  function handleSearchKeydown(e) {
    if (e.key === 'Enter' && selected) { handleAdd(); return; }
    if (e.key === 'ArrowDown' && filtered.length > 0) selectCommodity(filtered[0]);
    if (e.key === 'Escape') { query = ''; selected = null; showDropdown = false; }
  }

  function handleQtyKeydown(e) {
    if (e.key === 'Enter') handleAdd();
  }
</script>

<div class="commodity-picker">
  <span class="picker-label">Add commodity</span>
  <div class="picker-row">
    <div class="picker-search-wrapper">
      <input
        class="picker-search"
        class:locked={!!selected}
        bind:this={inputEl}
        bind:value={query}
        oninput={handleQueryInput}
        onkeydown={handleSearchKeydown}
        onfocus={() => { updateDropdownPosition(); showDropdown = true; }}
        onblur={() => setTimeout(() => { showDropdown = false; }, 200)}
        placeholder="Search (e.g. alu, steel)…"
      />
    </div>
    {#if showDropdown && filtered.length > 0}
      <ul
        class="picker-dropdown"
        style="top: {dropdownPos.top}px; left: {dropdownPos.left}px; width: {dropdownPos.width}px;"
      >
        {#each filtered as c (c.name_internal)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <li
            role="option"
            aria-selected={selected?.name_internal === c.name_internal}
            onmousedown={(e) => { e.preventDefault(); selectCommodity(c); }}
          >
            {c.name}
          </li>
        {/each}
      </ul>
    {/if}
    <input
      class="picker-qty"
      type="number"
      min="1"
      max="99999"
      bind:this={qtyEl}
      bind:value={quantity}
      onkeydown={handleQtyKeydown}
      placeholder="Qty"
    />
    <button
      class="picker-add"
      onclick={handleAdd}
      disabled={!selected || quantity < 1 || submitting}
    >
      {submitting ? '…' : 'Add'}
    </button>
  </div>
</div>

<style>
  .commodity-picker {
    padding: var(--space-lg) var(--space-xl);
    border-top: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .picker-label {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .picker-row {
    display: flex;
    gap: var(--space-md);
    align-items: center;
  }

  .picker-search-wrapper {
    flex: 1;
    max-width: 320px;
  }

  .picker-search {
    width: 100%;
    padding: var(--space-sm) var(--space-lg);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-micro);
    font-size: 0.875rem;
    color: var(--color-text-primary);
    font-family: inherit;
    box-sizing: border-box;
  }

  .picker-search:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .picker-search.locked {
    border-color: var(--color-primary);
    color: var(--color-primary);
    cursor: default;
  }

  .picker-dropdown {
    position: fixed;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-micro);
    list-style: none;
    margin: 0;
    padding: 0;
    z-index: 9999;
    max-height: 220px;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }

  .picker-dropdown li {
    padding: var(--space-sm) var(--space-lg);
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--color-text-primary);
  }

  .picker-dropdown li:hover,
  .picker-dropdown li[aria-selected="true"] {
    background: var(--color-bg-subtle);
    color: var(--color-primary);
  }

  .picker-qty {
    width: 120px;
    padding: var(--space-sm) var(--space-lg);
    background: var(--color-bg-subtle);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-micro);
    font-size: 0.875rem;
    color: var(--color-text-primary);
    font-family: inherit;
    text-align: right;
  }

  .picker-qty:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .picker-add {
    padding: var(--space-sm) var(--space-xl);
    background: var(--color-primary);
    border: none;
    border-radius: var(--radius-micro);
    font-size: 0.875rem;
    font-weight: 600;
    color: white;
    cursor: pointer;
    font-family: inherit;
  }

  .picker-add:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .picker-add:hover:not(:disabled) {
    opacity: 0.85;
  }
</style>
