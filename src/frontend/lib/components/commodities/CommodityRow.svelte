<script>
  import StationBadge from './StationBadge.svelte';
  import Stepper from '../controls/Stepper.svelte';
  import { getCargoForCommodity } from '../../stores/cargo.svelte.js';
  import { isAvailableAtStation } from '../../stores/station.svelte.js';
  import { isCommodityComplete } from '../../utils/format.js';
  import { updateFcCargo } from '../../utils/api.js';

  /**
   * @type {{
   *   commodity: Object,
   *   mode: 'collecting' | 'delivering' | 'single-site',
   *   stationGroups?: Map,
   *   activeConstructions?: Array,
   *   allowStepper?: boolean
   * }}
   */
  let { commodity, mode, stationGroups = new Map(), activeConstructions = [], allowStepper = false, onRemove = null } = $props();

  let done = $derived(isCommodityComplete(commodity));
  let available = $derived(!done && isAvailableAtStation(commodity.name));
  let cargo = $derived(getCargoForCommodity(commodity.name));
  let editing = $state(false);

  // Collecting mode
  let remaining = $derived(Math.max(0, commodity.amount_required - commodity.amount_delivered));
  let gap = $derived(commodity.amount_required - cargo.fc - cargo.ship);
  let collectingDone = $derived(remaining === 0 || (cargo.fc + cargo.ship) >= remaining);
  let gapDisplay = $derived(gap <= 0 ? (gap === 0 ? '✓' : `+${Math.abs(gap)}`) : gap);

  // Delivering mode
  let allSitesDone = $derived(
    mode === 'delivering'
      ? activeConstructions.every(con => {
          const siteData = commodity.sites?.get(con.id);
          return !siteData || siteData.remaining === 0;
        })
      : done
  );

  let showRow = $derived(mode === 'collecting' ? collectingDone : allSitesDone);
  let showStation = $derived(
    mode === 'collecting' && !collectingDone && commodity.nearest_station
  );
  let showSingleSiteStation = $derived(
    mode === 'single-site' && !done && remaining > 0 && (cargo.fc + cargo.ship) < remaining && commodity.nearest_station
  );

  async function handleStepperSave(newValue) {
    editing = false;
    if (newValue === null) return;
    await updateFcCargo(commodity.name, newValue);
  }

  function handleCarrierClick() {
    if (!allowStepper || editing) return;
    editing = true;
  }
</script>

<tr class="commodity-row" class:row-done={mode === 'delivering' ? allSitesDone : (mode === 'collecting' ? collectingDone : done)} class:available-here={available}>
  <td class="col-check">{showRow || done ? '✓' : ''}</td>
  <td class="commodity-name">
    {commodity.name}
    {#if available}<span class="in-stock-badge">In stock</span>{/if}
    {#if showStation}
      <StationBadge {commodity} {stationGroups} />
    {/if}
    {#if showSingleSiteStation}
      <StationBadge {commodity} {stationGroups} />
    {/if}
  </td>

  {#if mode === 'collecting'}
    <td>{collectingDone ? '' : commodity.amount_required}</td>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <td class:col-carrier={!collectingDone && cargo.fc > 0} onclick={handleCarrierClick}>
      {#if editing}
        <Stepper value={cargo.fc} onSave={handleStepperSave} />
      {:else if collectingDone}
        {''}
      {:else}
        {cargo.fc > 0 ? cargo.fc : '—'}
      {/if}
    </td>
    <td>{collectingDone ? '' : gapDisplay}</td>
    <td>{collectingDone ? '' : (cargo.ship > 0 ? cargo.ship : '—')}</td>
  {:else if mode === 'delivering'}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <td class:col-carrier={!allSitesDone && cargo.fc > 0} onclick={handleCarrierClick}>
      {#if editing}
        <Stepper value={cargo.fc} onSave={handleStepperSave} />
      {:else if allSitesDone}
        {''}
      {:else}
        {cargo.fc > 0 ? cargo.fc : '—'}
      {/if}
    </td>
    {#each activeConstructions as con}
      {@const siteData = commodity.sites?.get(con.id)}
      {@const siteRemaining = siteData ? siteData.remaining : 0}
      <td>{siteRemaining > 0 ? siteRemaining : (siteRemaining === 0 ? '✓' : '—')}</td>
    {/each}
  {:else if mode === 'single-site'}
    <td>{done ? '' : remaining}</td>
    <td>{done ? '' : commodity.amount_required}</td>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <td class:col-carrier={!done && cargo.fc > 0} onclick={handleCarrierClick}>
      {#if editing}
        <Stepper value={cargo.fc} onSave={handleStepperSave} />
      {:else if done}
        {''}
      {:else}
        {cargo.fc > 0 ? cargo.fc : '—'}
      {/if}
    </td>
    <td>{done ? '' : (cargo.ship > 0 ? cargo.ship : '—')}</td>
  {/if}
  {#if onRemove}
    <td class="col-remove">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <span class="remove-btn" role="button" tabindex="0" onclick={() => onRemove(commodity.name)}>×</span>
    </td>
  {/if}
</tr>

<style>
  .commodity-row {
    transition: background 0.15s;
  }

  .commodity-row:hover {
    background: rgba(0, 117, 222, 0.04);
  }

  .row-done {
    opacity: 0.4;
  }

  .available-here {
    background: rgba(26, 174, 57, 0.06);
  }

  .col-check {
    width: 2rem;
    text-align: center;
    color: var(--color-success);
    font-size: 0.875rem;
  }

  .commodity-name {
    font-weight: 500;
  }

  .in-stock-badge {
    display: inline-block;
    background: rgba(26, 174, 57, 0.12);
    color: var(--color-success);
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: var(--radius-pill);
    margin-left: var(--space-sm);
  }

  .col-carrier {
    cursor: pointer;
    color: var(--color-teal);
    font-weight: 600;
  }

  td {
    padding: var(--space-md) var(--space-lg);
    font-size: 0.9375rem;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }

  .col-remove {
    width: 2rem;
    text-align: center;
  }

  .remove-btn {
    font-size: 1rem;
    opacity: 0.3;
    cursor: pointer;
    padding: 0 var(--space-sm);
  }

  .remove-btn:hover {
    opacity: 1;
    color: var(--color-danger);
  }
</style>
