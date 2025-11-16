<script>
  import { buildFormLabelClasses, buildFormHelperClasses } from '$lib/utils/classBuilder.js';

  let {
    label = '',
    error = '',
    helper = '',
    required = false,
    id = '',
    name = '',
    children,
    class: className = '',
    ...restProps
  } = $props();

  const labelClasses = $derived(buildFormLabelClasses({ className: '' }));
  const helperClasses = $derived(buildFormHelperClasses({ error: !!error }));
  const fieldId = $derived(id || name);
  const describedById = $derived(fieldId ? `${fieldId}-description` : undefined);
</script>

<div class="form-field {className}" {...restProps}>
  {#if label}
    <label for={fieldId} class={labelClasses}>
      {label}
      {#if required}
        <span class="text-[var(--error)] ml-0.5">*</span>
      {/if}
    </label>
  {/if}

  {@render children?.({ describedById })}

  {#if error || helper}
    <p id={describedById} class={helperClasses}>
      {error || helper}
    </p>
  {/if}
</div>

<style>
  .form-field {
    display: flex;
    flex-direction: column;
  }
</style>
