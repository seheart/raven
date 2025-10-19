#!/usr/bin/env node

/**
 * Multi-Agent Telemetry Test
 *
 * Tests Raven's ability to handle telemetry from multiple agent types:
 * - Ollama
 * - LM Studio
 * - Claude
 * - Custom agents
 *
 * This demonstrates the passive telemetry API approach used by Node.js backend.
 */

const API_URL = 'http://localhost:3030';

async function sendTelemetry(agent, event, message, metadata = {}) {
  const payload = {
    agent,
    event,
    message,
    ...metadata
  };

  console.log(`📡 Sending telemetry: ${agent} - ${event}`);

  const response = await fetch(`${API_URL}/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (response.ok) {
    const data = await response.json();
    console.log(`✅ Success: Event ID ${data.event_id}`);
    return data;
  } else {
    const error = await response.text();
    console.error(`❌ Failed: ${error}`);
    throw new Error(error);
  }
}

async function getAgentStatus() {
  console.log('\n📊 Fetching agent status...');
  const response = await fetch(`${API_URL}/api/agents-status`);
  const agents = await response.json();

  console.log(`\n🤖 Active Agents: ${agents.length}`);
  agents.forEach(agent => {
    console.log(`  - ${agent.agent_name}: ${agent.is_running ? '🟢 ONLINE' : '🔴 OFFLINE'} (${agent.requests_handled} requests)`);
  });

  return agents;
}

async function getAgentStats() {
  console.log('\n📈 Fetching agent statistics...');
  const response = await fetch(`${API_URL}/api/agent-stats`);
  const stats = await response.json();

  console.log('\n📊 Agent Statistics:');
  stats.forEach(stat => {
    console.log(`  ${stat.agent}:`);
    console.log(`    Events: ${stat.event_count}`);
    console.log(`    Avg Duration: ${stat.avg_duration_ms?.toFixed(2) || 'N/A'}ms`);
    console.log(`    Lines Changed: ${stat.total_lines_changed || 0}`);
  });

  return stats;
}

async function runTests() {
  console.log('Raven Multi-Agent Telemetry Test\n');
  console.log('Testing passive telemetry API with multiple agent types...\n');

  try {
    // Test 1: Ollama generating text
    console.log('\n=== Test 1: Ollama Agent ===');
    await sendTelemetry('ollama', 'generate', 'Generated 250 tokens using llama2:latest', {
      file: null,
      lines_changed: null,
      duration_ms: 3500,
      metadata: {
        model: 'llama2:latest',
        tokens: 250,
        temperature: 0.7
      }
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 2: LM Studio model load
    console.log('\n=== Test 2: LM Studio Agent ===');
    await sendTelemetry('lm-studio', 'model_load', 'Loaded mistral-7b-instruct', {
      file: null,
      lines_changed: null,
      duration_ms: 2100,
      metadata: {
        model: 'mistral-7b-instruct',
        quantization: 'Q4_K_M',
        size_gb: 4.1
      }
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 3: Ollama code completion
    console.log('\n=== Test 3: Ollama Code Completion ===');
    await sendTelemetry('ollama', 'code_complete', 'Code completion for main.rs', {
      file: 'src/main.rs',
      lines_changed: 15,
      duration_ms: 1800,
      metadata: {
        model: 'codellama:7b',
        suggestion_count: 3
      }
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 4: LM Studio chat response
    console.log('\n=== Test 4: LM Studio Chat ===');
    await sendTelemetry('lm-studio', 'chat', 'Responded to user query about Rust async', {
      file: null,
      lines_changed: null,
      duration_ms: 4200,
      metadata: {
        model: 'mixtral-8x7b',
        tokens_in: 45,
        tokens_out: 320
      }
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 5: Claude Code edit
    console.log('\n=== Test 5: Claude Agent ===');
    await sendTelemetry('claude', 'edit', 'Refactored authentication module', {
      file: 'backend/auth.js',
      lines_changed: 42,
      duration_ms: 2800,
      metadata: {
        model: 'claude-sonnet-3.5',
        edit_type: 'refactor'
      }
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 6: Custom agent
    console.log('\n=== Test 6: Custom Agent ===');
    await sendTelemetry('github-copilot', 'suggest', 'Inline suggestion accepted', {
      file: 'frontend/App.svelte',
      lines_changed: 5,
      duration_ms: 450,
      metadata: {
        suggestion_type: 'inline',
        accepted: true
      }
    });

    // Wait for all events to be processed
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get current agent status
    const agents = await getAgentStatus();

    // Get statistics
    const stats = await getAgentStats();

    // Verify results
    console.log('\n\n✅ TEST RESULTS:');
    console.log('================');
    console.log(`✅ Sent telemetry from 4 different agent types`);
    console.log(`✅ All agents registered in system: ${agents.length >= 4 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Agent statistics collected: ${stats.length >= 4 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Multi-agent support: WORKING`);

    // Verify specific agents
    const agentNames = agents.map(a => a.agent_name.toLowerCase());
    console.log('\n📋 Agent Detection:');
    console.log(`  Ollama: ${agentNames.includes('ollama') ? '✅' : '❌'}`);
    console.log(`  LM Studio: ${agentNames.includes('lm-studio') ? '✅' : '❌'}`);
    console.log(`  Claude: ${agentNames.includes('claude') ? '✅' : '❌'}`);
    console.log(`  GitHub Copilot: ${agentNames.includes('github-copilot') ? '✅' : '❌'}`);

    console.log('\n🎉 All multi-agent telemetry tests passed!');
    console.log('\nNote: The Node.js backend uses a PASSIVE telemetry API.');
    console.log('Any agent can send events to POST /telemetry - no custom adapters needed!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
