/**
 * Example Plugin for Raven
 * Demonstrates how to create a Raven plugin
 */

export const hooks = {
  /**
   * Called when agent event is received
   * @param {Object} event - Agent event data
   * @param {Object} ctx - Context with utilities
   */
  async onAgentEvent(event, ctx) {
    if (event.type === 'file_created') {
      console.log(`[Example Plugin] New file created: ${event.file_path}`);
    }
  },

  /**
   * Called when file changes are detected
   * @param {Object} change - File change data
   * @param {Object} ctx - Context with utilities
   */
  async onFileChange(change, ctx) {
    console.log(`[Example Plugin] File changed: ${change.path}`);
  }
};

export default { hooks };
