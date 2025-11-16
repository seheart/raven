<script>
  /**
   * FileUpload Component - Raven UI Library
   * File upload with drag & drop support
   *
   * @component
   * @example
   * <FileUpload bind:files={selectedFiles} accept="image/*" />
   */

  import FormField from './FormField.svelte';
  import { cx } from '$lib/utils/classBuilder.js';

  let {
    /** Selected files (bindable) */
    files = $bindable(null),
    /** Label text */
    label = '',
    /** Helper text */
    helper = '',
    /** Error message */
    error = '',
    /** Required field */
    required = false,
    /** Accepted file types */
    accept = undefined,
    /** Allow multiple files */
    multiple = false,
    /** Disabled state */
    disabled = false,
    /** Max file size (bytes) */
    maxSize = undefined,
    /** On file select callback */
    onFilesSelect = undefined,
    /** Additional CSS classes */
    class: className = '',
    /** Name attribute */
    name = '',
    /** ID attribute */
    id = '',
    ...restProps
  } = $props();

  let isDragging = $state(false);
  let fileInput = $state(null);

  function handleDragOver(e) {
    e.preventDefault();
    if (!disabled) isDragging = true;
  }

  function handleDragLeave() {
    isDragging = false;
  }

  function handleDrop(e) {
    e.preventDefault();
    isDragging = false;
    if (disabled) return;

    const droppedFiles = e.dataTransfer?.files;
    if (droppedFiles) {
      handleFiles(droppedFiles);
    }
  }

  function handleInputChange(e) {
    const selectedFiles = e.target?.files;
    if (selectedFiles) {
      handleFiles(selectedFiles);
    }
  }

  function handleFiles(fileList) {
    // Validate file size if maxSize is set
    if (maxSize) {
      const validFiles = Array.from(fileList).filter(file => file.size <= maxSize);
      if (validFiles.length !== fileList.length) {
        error = `Some files exceed maximum size of ${(maxSize / 1024 / 1024).toFixed(2)}MB`;
        return;
      }
    }

    files = fileList;
    onFilesSelect?.(fileList);
  }

  function handleClick() {
    if (!disabled) {
      fileInput?.click();
    }
  }

  // Container classes
  const containerClasses = $derived(
    cx(
      'border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 cursor-pointer font-sans',
      error
        ? 'border-[var(--error)] bg-[var(--error)] bg-opacity-5'
        : isDragging
          ? 'border-[var(--accent)] bg-[var(--accent)] bg-opacity-5'
          : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)]',
      disabled && 'opacity-50 cursor-not-allowed',
      className
    )
  );
</script>

<FormField {label} {error} {helper} {required} {id} {name}>
  {#snippet children({ describedById })}
    <div
      class={containerClasses}
      ondragover={handleDragOver}
      ondragleave={handleDragLeave}
      ondrop={handleDrop}
      onclick={handleClick}
      role="button"
      tabindex="0"
      onkeydown={e => e.key === 'Enter' && handleClick()}
      aria-invalid={error ? 'true' : 'false'}
      aria-describedby={describedById}
      {...restProps}
    >
      <input
        bind:this={fileInput}
        type="file"
        {name}
        id={id || name}
        {accept}
        {multiple}
        {disabled}
        onchange={handleInputChange}
        class="hidden"
      />

      <div class="flex flex-col items-center gap-2">
        <svg
          class="w-12 h-12 text-[var(--muted)]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>

        {#if files && files.length > 0}
          <p class="text-sm font-medium text-[var(--text)]">
            {files.length} file{files.length > 1 ? 's' : ''} selected
          </p>
          <p class="text-xs text-[var(--muted)]">
            {Array.from(files)
              .map(f => f.name)
              .join(', ')}
          </p>
        {:else}
          <p class="text-sm font-medium text-[var(--text)]">
            {isDragging ? 'Drop files here' : 'Click to upload or drag and drop'}
          </p>
          <p class="text-xs text-[var(--muted)]">
            {accept || 'Any file type'}
            {maxSize ? ` • Max ${(maxSize / 1024 / 1024).toFixed(2)}MB` : ''}
          </p>
        {/if}
      </div>
    </div>
  {/snippet}
</FormField>
