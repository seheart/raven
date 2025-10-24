"use strict";
/**
 * Test Telemetry Generator
 * Sends simulated AI agent events to Raven backend
 */
const API_BASE = 'http://localhost:3030';
const agents = ['claude-sonnet-3.5', 'github-copilot', 'cursor'];
const files = [
    'backend/server.js',
    'frontend/src/App.svelte',
    'frontend/src/lib/StatusPanel.svelte',
    'frontend/src/lib/Dashboard.svelte',
    'backend/db.js',
    'frontend/src/lib/EventFeed.svelte'
];
const operations = ['edit', 'create', 'delete', 'read'];
function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
async function sendTelemetry(data) {
    try {
        const response = await fetch(`${API_BASE}/telemetry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const text = await response.text();
            console.error('❌ Telemetry failed:', response.status, text);
            return false;
        }
        console.log('✅ Sent:', data.agent, data.operation, data.file);
        return true;
    }
    catch (error) {
        console.error('❌ Error sending telemetry:', error.message);
        return false;
    }
}
async function generateTestData(count = 50) {
    console.log(`\n🧪 Generating ${count} test telemetry events...\n`);
    let successCount = 0;
    for (let i = 0; i < count; i++) {
        const agent = randomChoice(agents);
        const file = randomChoice(files);
        const operation = randomChoice(operations);
        const linesChanged = randomInt(1, 200);
        const durationMs = randomInt(100, 5000);
        const telemetry = {
            agent: agent,
            event: operation,
            file: file,
            lines_changed: linesChanged,
            duration_ms: durationMs,
            message: `${agent} performed ${operation} on ${file} (${linesChanged} lines, ${durationMs}ms)`,
            metadata: {
                tokens_used: randomInt(100, 2000),
                model: agent.includes('claude') ? 'claude-3.5-sonnet' : agent,
                session: 'test-session-' + randomInt(1, 5)
            }
        };
        const success = await sendTelemetry(telemetry);
        if (success)
            successCount++;
        // Small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    console.log(`\n✅ Successfully sent ${successCount}/${count} telemetry events`);
    console.log(`\n📊 Dashboard should now show:`);
    console.log(`   - ${successCount} total events`);
    console.log(`   - ${agents.length} active agents`);
    console.log(`   - ${files.length} files modified`);
    console.log(`\n🌐 Open http://localhost:5173 to see the data!`);
}
// Run the generator
const eventCount = parseInt(process.argv[2]) || 50;
generateTestData(eventCount).catch(console.error);
//# sourceMappingURL=test-telemetry.js.map