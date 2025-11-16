<script>
  /**
   * Agent Setup Guide Page
   * Configuration guide for integrating AI agents with Raven telemetry
   */
  import AgentsNav from '../components/layout/AgentsNav.svelte';
  import { api } from '../apiClient.js';

  // State
  let testingTelemetry = $state(false);
  let testResult = $state(null);
  let testError = $state(null);
  let copiedEndpoint = $state(false);
  let copiedPayload = $state(false);

  // Example payload
  const examplePayload = {
    agent: 'your-agent-name',
    event_type: 'edit',
    message: 'Modified user authentication logic',
    file: 'src/auth.js',
    lines_changed: 25,
    duration_ms: 1500,
    metadata: {
      model: 'claude-3-5-sonnet',
      prompt_type: 'code-edit'
    }
  };

  // Test telemetry connection
  async function testTelemetry() {
    testingTelemetry = true;
    testResult = null;
    testError = null;

    try {
      await api.post('/telemetry', {
        agent: 'test-agent',
        event_type: 'test',
        message: 'Test telemetry event from Raven UI',
        file: 'test.js',
        lines_changed: 10,
        duration_ms: 150,
        metadata: { source: 'raven-ui-test' }
      });

      testResult = 'Test event sent successfully!';
      testError = null;
    } catch (err) {
      console.error('Test telemetry failed:', err);
      testError = `Connection failed: ${err.message}`;
      testResult = null;
    } finally {
      testingTelemetry = false;
    }
  }

  // Copy endpoint to clipboard
  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText('http://localhost:3030/telemetry');
      copiedEndpoint = true;
      setTimeout(() => copiedEndpoint = false, 2000);
    } catch (err) {
      console.error('Failed to copy endpoint:', err);
    }
  }

  // Copy example payload to clipboard
  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(examplePayload, null, 2));
      copiedPayload = true;
      setTimeout(() => copiedPayload = false, 2000);
    } catch (err) {
      console.error('Failed to copy payload:', err);
    }
  }
</script>

<div class="min-h-screen bg-[var(--bg)] pb-20">
  <AgentsNav />
  <div class="max-w-5xl mx-auto space-y-6 px-6">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-[var(--text-heading)] mb-1">Agent Setup Guide</h1>
      <p class="text-base text-[var(--muted)] font-sans">
        Configure your AI agents to send telemetry data to Raven for real-time monitoring and analytics
      </p>
    </div>

    <!-- 1. Test the Connection -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 mb-6">
      <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-2 font-sans">
        1. Test the Connection
      </h2>
      <p class="text-base text-[var(--muted)] font-sans mb-4">
        Send a test event to verify Raven is receiving telemetry:
      </p>
      <button
        onclick={testTelemetry}
        disabled={testingTelemetry}
        class="px-4 py-2 bg-[var(--accent)] text-white rounded text-base font-sans hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
      >
        {#if testingTelemetry}
          <span class="animate-spin">⏳</span>
          <span>Sending...</span>
        {:else}
          <span>🧪</span>
          <span>Send Test Event</span>
        {/if}
      </button>

      {#if testResult}
        <div class="mt-4 bg-[var(--success-subtle)] border border-[var(--success)] rounded-lg p-3">
          <span class="text-sm text-[var(--success)] font-sans">{testResult}</span>
        </div>
      {/if}

      {#if testError}
        <div class="mt-4 bg-[var(--error-subtle)] border border-[var(--error)] rounded-lg p-3">
          <span class="text-sm text-[var(--error)] font-sans">{testError}</span>
        </div>
      {/if}
    </div>

    <!-- 2. Telemetry Endpoint -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 mb-6">
      <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-2 font-sans">
        2. Telemetry Endpoint
      </h2>
      <p class="text-base text-[var(--muted)] font-sans mb-4">
        Configure your agents to POST telemetry data to:
      </p>
      <div class="flex items-center gap-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg p-4">
        <code class="flex-1 text-base font-mono text-[var(--text)]">POST http://localhost:3030/telemetry</code>
        <button
          onclick={copyEndpoint}
          class="px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
        >
          {copiedEndpoint ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>
    </div>

    <!-- 3. Example Payload -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 mb-6">
      <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-2 font-sans">
        3. Example Payload
      </h2>
      <p class="text-base text-[var(--muted)] font-sans mb-4">
        Send a JSON payload with the following structure:
      </p>
      <div class="relative">
        <pre
          class="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-4 overflow-x-auto text-sm font-mono text-[var(--text)]"
        ><code>{JSON.stringify(examplePayload, null, 2)}</code></pre>
        <button
          onclick={copyPayload}
          class="absolute top-3 right-3 px-3 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded text-sm font-sans hover:border-[var(--accent)] transition-colors"
        >
          {copiedPayload ? '✓ Copied' : '📋 Copy Example'}
        </button>
      </div>
    </div>

    <!-- 4. Required Fields -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 mb-6">
      <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4 font-sans">
        4. Required Fields
      </h2>
      <div class="overflow-x-auto">
        <table class="w-full">
          <tbody class="divide-y divide-[var(--border)]">
            <tr>
              <td class="py-3 pr-4 align-top">
                <code class="text-base font-mono text-[var(--text)]">agent</code>
              </td>
              <td class="py-3 pr-4 align-top">
                <span class="text-sm font-mono text-[var(--muted)]">string</span>
              </td>
              <td class="py-3 text-base text-[var(--text)] font-sans">
                Agent identifier (e.g., "claude-code", "cursor", "chatgpt")
              </td>
            </tr>
            <tr>
              <td class="py-3 pr-4 align-top">
                <code class="text-base font-mono text-[var(--text)]">event_type</code>
              </td>
              <td class="py-3 pr-4 align-top">
                <span class="text-sm font-mono text-[var(--muted)]">string</span>
              </td>
              <td class="py-3 text-base text-[var(--text)] font-sans">
                Event type: "edit", "create", "delete", "read", "execute"
              </td>
            </tr>
            <tr>
              <td class="py-3 pr-4 align-top">
                <code class="text-base font-mono text-[var(--text)]">message</code>
              </td>
              <td class="py-3 pr-4 align-top">
                <span class="text-sm font-mono text-[var(--muted)]">string</span>
              </td>
              <td class="py-3 text-base text-[var(--text)] font-sans">
                Human-readable description of the event
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 class="text-lg font-semibold text-[var(--text-heading)] mt-6 mb-4 font-sans">
        Optional Fields
      </h3>
      <div class="overflow-x-auto">
        <table class="w-full">
          <tbody class="divide-y divide-[var(--border)]">
            <tr>
              <td class="py-3 pr-4 align-top">
                <code class="text-base font-mono text-[var(--text)]">file</code>
              </td>
              <td class="py-3 pr-4 align-top">
                <span class="text-sm font-mono text-[var(--muted)]">string</span>
              </td>
              <td class="py-3 text-base text-[var(--text)] font-sans">
                File path relative to project root
              </td>
            </tr>
            <tr>
              <td class="py-3 pr-4 align-top">
                <code class="text-base font-mono text-[var(--text)]">lines_changed</code>
              </td>
              <td class="py-3 pr-4 align-top">
                <span class="text-sm font-mono text-[var(--muted)]">number</span>
              </td>
              <td class="py-3 text-base text-[var(--text)] font-sans">
                Number of lines modified
              </td>
            </tr>
            <tr>
              <td class="py-3 pr-4 align-top">
                <code class="text-base font-mono text-[var(--text)]">duration_ms</code>
              </td>
              <td class="py-3 pr-4 align-top">
                <span class="text-sm font-mono text-[var(--muted)]">number</span>
              </td>
              <td class="py-3 text-base text-[var(--text)] font-sans">
                Operation duration in milliseconds
              </td>
            </tr>
            <tr>
              <td class="py-3 pr-4 align-top">
                <code class="text-base font-mono text-[var(--text)]">metadata</code>
              </td>
              <td class="py-3 pr-4 align-top">
                <span class="text-sm font-mono text-[var(--muted)]">object</span>
              </td>
              <td class="py-3 text-base text-[var(--text)] font-sans">
                Additional context (model, prompt type, etc.)
              </td>
            </tr>
            <tr>
              <td class="py-3 pr-4 align-top">
                <code class="text-base font-mono text-[var(--text)]">project</code>
              </td>
              <td class="py-3 pr-4 align-top">
                <span class="text-sm font-mono text-[var(--muted)]">string</span>
              </td>
              <td class="py-3 text-base text-[var(--text)] font-sans">
                Project identifier (optional, auto-detected)
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 5. Integration Examples -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6 mb-6">
      <h2 class="text-xl font-semibold text-[var(--text-heading)] mb-4 font-sans">
        5. Integration Examples
      </h2>

      <div class="space-y-4">
        <!-- JavaScript/Node.js -->
        <details class="bg-[var(--bg)] border border-[var(--border)] rounded-lg">
          <summary
            class="px-4 py-3 cursor-pointer text-base font-semibold text-[var(--text)] font-sans hover:text-[var(--accent)] transition-colors"
          >
            JavaScript/Node.js
          </summary>
          <div class="px-4 pb-4">
            <pre
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 overflow-x-auto text-sm font-mono text-[var(--text)]"
            ><code>{`async function sendTelemetry(agent, eventType, message, file, linesChanged) {
  await fetch('http://localhost:3030/telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent,
      event_type: eventType,
      message,
      file,
      lines_changed: linesChanged,
      duration_ms: Date.now() - startTime
    })
  });
}`}</code></pre>
          </div>
        </details>

        <!-- Python -->
        <details class="bg-[var(--bg)] border border-[var(--border)] rounded-lg">
          <summary
            class="px-4 py-3 cursor-pointer text-base font-semibold text-[var(--text)] font-sans hover:text-[var(--accent)] transition-colors"
          >
            Python
          </summary>
          <div class="px-4 pb-4">
            <pre
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 overflow-x-auto text-sm font-mono text-[var(--text)]"
            ><code>{`import requests

def send_telemetry(agent, event_type, message, file=None, lines_changed=0):
    requests.post('http://localhost:3030/telemetry', json={
        'agent': agent,
        'event_type': event_type,
        'message': message,
        'file': file,
        'lines_changed': lines_changed
    })`}</code></pre>
          </div>
        </details>

        <!-- cURL -->
        <details class="bg-[var(--bg)] border border-[var(--border)] rounded-lg">
          <summary
            class="px-4 py-3 cursor-pointer text-base font-semibold text-[var(--text)] font-sans hover:text-[var(--accent)] transition-colors"
          >
            cURL
          </summary>
          <div class="px-4 pb-4">
            <pre
              class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 overflow-x-auto text-sm font-mono text-[var(--text)]"
            ><code>{`curl -X POST http://localhost:3030/telemetry \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent": "my-agent",
    "event_type": "edit",
    "message": "Updated function",
    "file": "src/main.js",
    "lines_changed": 10
  }'`}</code></pre>
          </div>
        </details>
      </div>
    </div>

    <!-- Footer Info -->
    <div class="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-6">
      <p class="text-base text-[var(--muted)] font-sans text-center">
        Raven monitors AI agent activity through telemetry events. <br />
        Supports: Claude, GPT, Gemini, Ollama, and more.
      </p>
    </div>
  </div>
</div>
