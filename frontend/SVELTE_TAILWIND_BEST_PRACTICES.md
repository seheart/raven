# Svelte + Tailwind Best Practices for Raven Frontend

## Common Pitfalls & Solutions

### 1. API Client Pattern
**❌ WRONG:**
```javascript
const response = await api.get('/endpoint');
if (!response.ok) throw new Error('Failed');
const data = await response.json();
```

**✅ CORRECT:**
```javascript
const data = await api.get('/endpoint');
// data is already parsed JSON!
```

**Why:** Our `apiClient.js` already handles `.json()` parsing and returns the data directly, not a Response object.

---

### 2. Tailwind Opacity Syntax in class: Directives
**❌ WRONG:**
```svelte
<div class:bg-green-500/10={isActive}></div>
```

**✅ CORRECT - Option 1 (Dynamic Classes):**
```svelte
{@const classes = isActive ? 'bg-green-500/10' : ''}
<div class="{classes}"></div>
```

**✅ CORRECT - Option 2 (Template String):**
```svelte
<div class={isActive ? 'bg-green-500/10' : ''}></div>
```

**Why:** Svelte's `class:` directive doesn't support `/` characters. Use dynamic class strings instead.

---

### 3. Tailwind Arbitrary Values in <style> Blocks
**❌ WRONG:**
```svelte
<style>
  .bg-[var(--custom)] { background: var(--custom); }
</style>
```

**✅ CORRECT - Option 1 (Remove <style> block):**
Use Tailwind classes directly in HTML.

**✅ CORRECT - Option 2 (Use :global()):**
```svelte
<style>
  :global(.custom-bg) { background: var(--custom); }
</style>
```

**Why:** Svelte's CSS parser doesn't understand Tailwind's bracket syntax in scoped `<style>` blocks.

---

### 4. Chart.js Integration
**✅ BEST PRACTICE:**
```javascript
// Wait for DOM to be ready
$effect(() => {
  if (!loading && data.length > 0) {
    setTimeout(() => {
      createCharts();
    }, 200);
  }
});

// Theme observer for dynamic updates
$effect(() => {
  const observer = createThemeObserver(() => {
    createCharts(); // Recreate on theme change
  });

  return () => {
    // Cleanup
    charts.forEach(chart => destroyChart(chart));
    observer?.disconnect();
  };
});
```

---

### 5. Conditional Styling Best Practices
**✅ BEST PRACTICE:**
```svelte
{#each items as item}
  {@const isCreate = item.type === 'create'}
  {@const isEdit = item.type === 'edit'}
  {@const isDelete = item.type === 'delete'}

  <div class="
    base-classes
    {isCreate ? 'bg-green-500/10 text-green-600' : ''}
    {isEdit ? 'bg-blue-500/10 text-blue-600' : ''}
    {isDelete ? 'bg-red-500/10 text-red-600' : ''}
  ">
    {item.name}
  </div>
{/each}
```

**Why:** `{@const}` computes values once per iteration, and dynamic class strings work with all Tailwind syntax.

---

### 6. API Error Handling
**✅ BEST PRACTICE:**
```javascript
async function loadData() {
  try {
    loading = true;
    error = null;

    const data = await api.get('/endpoint');
    items = Array.isArray(data) ? data : (data.items || []);

    loading = false;
  } catch (err) {
    console.error('Failed to load data:', err);
    error = err.message;
    loading = false;
  }
}
```

---

## Quick Reference

### ✅ Do:
- Use dynamic class strings for conditional Tailwind classes
- Use `{@const}` to compute values once per loop iteration
- Handle both array and object API responses
- Use `setTimeout()` before creating charts
- Clean up observers/charts in `$effect` return functions

### ❌ Don't:
- Use `class:` directive with `/` characters
- Call `.ok` or `.json()` on api client responses
- Put Tailwind arbitrary values in scoped `<style>` blocks
- Create charts without waiting for DOM
- Forget to clean up resources in effects

---

## Automated Checks

Run these commands to catch issues:

```bash
# Check for class: with opacity syntax (will fail)
grep -r "class:[a-z-]*/[0-9]" src/lib/

# Check for Response object methods on api client
grep -r "\.ok\|\.json()" src/lib/pages/

# Validate Svelte syntax
npx svelte-check --tsconfig ./jsconfig.json
```
