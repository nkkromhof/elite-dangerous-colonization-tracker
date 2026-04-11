<script>
  let { children, headers = [], totals = [] } = $props();
</script>

<table class="commodity-table">
  <thead>
    <tr>
      <th class="col-check"></th>
      {#each headers as h}
        <th>{h}</th>
      {/each}
    </tr>
  </thead>
  <tbody>
    {#if totals.length > 0}
      <tr class="totals-row">
        <td></td>
        {#each totals as t}
          <td>{@html t}</td>
        {/each}
      </tr>
    {/if}
    {@render children()}
  </tbody>
</table>

<style>
  .commodity-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9375rem;
  }

  .commodity-table th {
    padding: var(--space-md) var(--space-lg);
    text-align: left;
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid var(--color-border);
  }

  .col-check {
    width: 2rem;
  }

  .totals-row {
    font-weight: 700;
    background: var(--color-bg-subtle);
  }

  .totals-row td {
    padding: var(--space-md) var(--space-lg);
    border-bottom: 2px solid var(--color-border);
    font-size: 0.9375rem;
  }
</style>
