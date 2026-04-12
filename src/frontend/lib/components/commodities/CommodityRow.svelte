<script>
  import StationBadge from './StationBadge.svelte';
  import Stepper from '../controls/Stepper.svelte';
  import { getCargoForCommodity } from '../../stores/cargo.svelte.js';
  import { isAvailableAtStation } from '../../stores/station.svelte.js';
  import { isCommodityComplete } from '../../utils/format.js';
  import { updateFcCargo, setCommodityDelivered } from '../../utils/api.js';

/**
 * @type {{
 *   commodity: Object,
 *   mode: 'collecting' | 'delivering' | 'single-site',
 *   activeConstructions?: Array,
 *   allowStepper?: boolean
 * }}
 */
let { commodity, mode, activeConstructions = [], allowStepper = false, onRemove = null, constructionId = null } = $props();

let done = $derived(isCommodityComplete(commodity));
let available = $derived(!done && isAvailableAtStation(commodity.name));
let cargo = $derived(getCargoForCommodity(commodity.name));
let editing = $state(false);
let editingDelivered = $state(false);

let remaining = $derived(Math.max(0, commodity.amount_required - commodity.amount_delivered));
let gap = $derived(commodity.amount_required - cargo.fc - cargo.ship);
let collectingDone = $derived(remaining === 0 || (cargo.fc + cargo.ship) >= remaining);
let gapDisplay = $derived(gap <= 0 ? (gap === 0 ? '✓' : `+${Math.abs(gap)}`) : gap);

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

function handleDeliveredClick() {
  if (!constructionId || editingDelivered || done) return;
  editingDelivered = true;
}

async function handleDeliveredSave(newValue) {
  editingDelivered = false;
  if (newValue === null) return;
  const delta = newValue - commodity.amount_delivered;
  if (delta === 0) return;
  await setCommodityDelivered(constructionId, commodity.name, delta);
}
</script>

<tr class="commodity-row" class:row-done={mode === 'delivering' ? allSitesDone : (mode === 'collecting' ? collectingDone : done)} class:available-here={available}>
  <td class="col-check">{showRow || done ? '✓' : ''}</td>
  <td class="commodity-name">
    {commodity.name}
    {#if showStation}
      <StationBadge {commodity} />
    {/if}
    {#if showSingleSiteStation}
      <StationBadge {commodity} />
    {/if}
  </td>

{#if mode === 'collecting'}
     <td class="col-total">{collectingDone ? '' : commodity.amount_required}</td>
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
     <td class="col-remaining">{collectingDone ? '' : gapDisplay}</td>
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
       <td class="col-remaining">{siteRemaining > 0 ? siteRemaining : (siteRemaining === 0 ? '✓' : '—')}</td>
     {/each}
   {:else if mode === 'single-site'}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <td class:col-remaining={!done} class:editable-cell={!!constructionId && !done} onclick={handleDeliveredClick}>
      {#if editingDelivered}
        <Stepper value={commodity.amount_delivered} min={0} onSave={handleDeliveredSave} />
      {:else}
        {done ? '' : remaining}
      {/if}
    </td>
     <td class="col-total">{done ? '' : commodity.amount_required}</td>
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
    background: var(--color-in-stock-bg);
    border-left: 3px solid var(--color-success);
    padding-left: calc(var(--space-lg) - 3px);
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

  .col-carrier {
    cursor: pointer;
    color: var(--color-teal);
    font-weight: 600;
  }

  .editable-cell {
    cursor: pointer;
  }

  .editable-cell:hover {
    color: var(--color-warning);
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
