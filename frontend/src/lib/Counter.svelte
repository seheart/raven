<script>
  let count = $state(0);
  const increment = () => {
    count += 1;
  };
</script>

<button onclick={increment} aria-label="Increment count, current value is {count}">
  count is {count}
</button>
