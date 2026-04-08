/**
 * Test helpers for Svelte 5 components
 */

/**
 * Create a snippet-compatible children function for testing
 * @param {string} content - The text content to render
 * @returns {Function} A snippet-compatible function
 */
export function createTestChildren(content) {
  return {
    '@@render': () => {
      return {
        out: content,
        css: new Set(),
        head: ''
      };
    }
  };
}

/**
 * Helper to render text content in a Svelte 5 snippet
 */
export function textSnippet(text) {
  return (anchor, _props) => {
    const node = document.createTextNode(text);
    anchor.appendChild(node);
    return () => node.remove();
  };
}
