#!/usr/bin/env node
/**
 * Generate Sample Data for Tier 4 Features
 *
 * Populates the database with realistic sample data for:
 * - Health scores
 * - Drift events
 * - Productivity insights
 * - Personality analysis
 * - Growth snapshots
 * - User patterns
 * - Integration events
 */

import Database from 'better-sqlite3';
import { join } from 'path';

const DB_PATH = join(process.cwd(), '..', '.raven', 'db', 'raven.db');
const PROJECT = 'raven';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m'
};

console.log(`\n${colors.blue}========================================${colors.reset}`);
console.log(`${colors.blue}   Sample Data Generator${colors.reset}`);
console.log(`${colors.blue}========================================${colors.reset}\n`);

console.log(`${colors.cyan}Database:${colors.reset} ${DB_PATH}`);
console.log(`${colors.cyan}Project:${colors.reset} ${PROJECT}\n`);

const db = new Database(DB_PATH);

try {
  // Clear existing sample data
  console.log(`${colors.yellow}Clearing existing sample data...${colors.reset}`);
  db.prepare('DELETE FROM health_scores WHERE project_name = ?').run(PROJECT);
  db.prepare('DELETE FROM drift_events WHERE project_name = ?').run(PROJECT);
  db.prepare('DELETE FROM productivity_insights WHERE project_name = ?').run(PROJECT);
  db.prepare('DELETE FROM claude_personality WHERE project_name = ?').run(PROJECT);
  db.prepare('DELETE FROM growth_snapshots WHERE project_name = ?').run(PROJECT);
  db.prepare('DELETE FROM user_patterns WHERE project_name = ?').run(PROJECT);
  db.prepare('DELETE FROM integration_events WHERE project_name = ?').run(PROJECT);
  console.log(`${colors.green}✓ Cleared existing data${colors.reset}\n`);

  // ========================================
  // 1. HEALTH SCORES
  // ========================================
  console.log(`${colors.yellow}[1/7] Generating health scores...${colors.reset}`);

  const healthStmt = db.prepare(`
    INSERT INTO health_scores (
      project_name, score_date, overall_score, code_quality_score, test_coverage_score,
      documentation_score, velocity_score, stability_score, security_score,
      metrics, recommendations, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Generate 30 days of health scores with realistic variation
  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(9, 0, 0, 0); // Consistent time each day

    const baseScore = 75 + Math.random() * 15; // 75-90 range
    const variance = Math.random() * 10 - 5; // -5 to +5

    const scores = {
      codeQuality: Math.round(Math.max(60, Math.min(100, baseScore + variance))),
      testCoverage: Math.round(Math.max(50, Math.min(100, baseScore + variance - 10))),
      documentation: Math.round(Math.max(40, Math.min(100, baseScore + variance - 15))),
      velocity: Math.round(Math.max(60, Math.min(100, baseScore + variance + 5))),
      stability: Math.round(Math.max(70, Math.min(100, baseScore + variance + 10))),
      security: Math.round(Math.max(80, Math.min(100, baseScore + variance + 5)))
    };

    const overallScore = Math.round(
      (scores.codeQuality +
        scores.testCoverage +
        scores.documentation +
        scores.velocity +
        scores.stability +
        scores.security) /
        6
    );

    const recommendations = [
      { priority: 'high', message: 'Improve test coverage in authentication module' },
      { priority: 'medium', message: 'Add JSDoc comments to utility functions' },
      { priority: 'low', message: 'Consider refactoring error handling patterns' }
    ];

    const metadata = {
      totalFiles: 150 + Math.floor(Math.random() * 20),
      totalLines: 8000 + Math.floor(Math.random() * 1000),
      totalTests: 120 + Math.floor(Math.random() * 30)
    };

    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

    healthStmt.run(
      PROJECT,
      dateStr,
      overallScore,
      scores.codeQuality,
      scores.testCoverage,
      scores.documentation,
      scores.velocity,
      scores.stability,
      scores.security,
      JSON.stringify(metadata),
      JSON.stringify(recommendations),
      date.toISOString()
    );
  }

  console.log(`  ${colors.green}✓ Created 31 health score entries${colors.reset}`);

  // ========================================
  // 2. DRIFT EVENTS
  // ========================================
  console.log(`${colors.yellow}[2/7] Generating drift events...${colors.reset}`);

  const driftStmt = db.prepare(`
    INSERT INTO drift_events (
      project_name, drift_type, severity, description,
      baseline_value, current_value, deviation_percent,
      affected_files, metadata, detected_at, resolved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const driftTypes = ['complexity', 'test_coverage', 'error_rate', 'performance', 'bundle_size'];
  const severities = ['low', 'medium', 'high', 'critical'];

  // Generate 15 drift events over the past month
  for (let i = 0; i < 15; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const detectedDate = new Date();
    detectedDate.setDate(detectedDate.getDate() - daysAgo);

    const driftType = driftTypes[Math.floor(Math.random() * driftTypes.length)];
    const severity = severities[Math.floor(Math.random() * severities.length)];

    const baselineValue = 50 + Math.random() * 30;
    const deviationPercent = Math.floor(10 + Math.random() * 40);
    const currentValue = baselineValue * (1 + deviationPercent / 100);

    // 60% chance drift is resolved
    const isResolved = Math.random() > 0.4;
    const resolvedDate = isResolved
      ? new Date(detectedDate.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000)
      : null;

    const affectedFiles = [
      'src/services/health-scoring.js',
      'src/services/drift-detection.js',
      'src/utils/analytics.js'
    ];

    const metadata = {
      threshold: baselineValue * 1.2,
      alertsSent: Math.floor(Math.random() * 3),
      autoResolved: isResolved && Math.random() > 0.5
    };

    driftStmt.run(
      PROJECT,
      driftType,
      severity,
      `Detected ${driftType} drift with ${deviationPercent}% deviation from baseline`,
      baselineValue,
      currentValue,
      deviationPercent,
      JSON.stringify(affectedFiles.slice(0, Math.floor(Math.random() * 3) + 1)),
      JSON.stringify(metadata),
      detectedDate.toISOString(),
      resolvedDate ? resolvedDate.toISOString() : null
    );
  }

  console.log(`  ${colors.green}✓ Created 15 drift events${colors.reset}`);

  // ========================================
  // 3. PRODUCTIVITY INSIGHTS
  // ========================================
  console.log(`${colors.yellow}[3/7] Generating productivity insights...${colors.reset}`);

  const productivityStmt = db.prepare(`
    INSERT INTO productivity_insights (
      project_name, insights, period_start, period_end, calculated_at
    ) VALUES (?, ?, ?, ?, ?)
  `);

  // Generate 4 weekly productivity insights
  for (let i = 0; i < 4; i++) {
    const weeksAgo = i;
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - weeksAgo * 7);

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);

    const insights = {
      peak_hours: {
        start: '14:00',
        end: '17:00',
        productivity_score: 85 + Math.floor(Math.random() * 10)
      },
      session_patterns: {
        average_session_length_minutes: 45 + Math.floor(Math.random() * 30),
        sessions_per_day: 6 + Math.floor(Math.random() * 3),
        most_productive_day: ['Monday', 'Tuesday', 'Wednesday'][Math.floor(Math.random() * 3)]
      },
      code_velocity: {
        lines_added: 500 + Math.floor(Math.random() * 300),
        lines_removed: 200 + Math.floor(Math.random() * 150),
        files_modified: 20 + Math.floor(Math.random() * 15),
        commits: 15 + Math.floor(Math.random() * 10)
      },
      focus_areas: [
        { category: 'feature_development', percentage: 60 },
        { category: 'bug_fixes', percentage: 25 },
        { category: 'refactoring', percentage: 15 }
      ],
      interruption_analysis: {
        context_switches: 12 + Math.floor(Math.random() * 8),
        average_focus_duration_minutes: 25 + Math.floor(Math.random() * 15)
      }
    };

    productivityStmt.run(
      PROJECT,
      JSON.stringify(insights),
      startDate.toISOString(),
      endDate.toISOString(),
      endDate.toISOString()
    );
  }

  console.log(`  ${colors.green}✓ Created 4 productivity insight entries${colors.reset}`);

  // ========================================
  // 4. PERSONALITY ANALYSIS
  // ========================================
  console.log(`${colors.yellow}[4/7] Generating personality analysis...${colors.reset}`);

  const personalityStmt = db.prepare(`
    INSERT INTO claude_personality (
      project_name, agent_name, insights, period_start, period_end, analyzed_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Generate 3 monthly personality analyses
  for (let i = 0; i < 3; i++) {
    const monthsAgo = i;
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() - monthsAgo);

    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - 1);

    const insights = {
      communication_style: {
        style: 'concise',
        formality: 0.6 + Math.random() * 0.2,
        technical_depth: 0.8 + Math.random() * 0.15
      },
      risk_profile: {
        tolerance: 'moderate',
        innovation_score: 70 + Math.floor(Math.random() * 20),
        experimentation_rate: 0.3 + Math.random() * 0.2
      },
      creativity_score: {
        score: 75 + Math.floor(Math.random() * 15),
        novel_solutions: 8 + Math.floor(Math.random() * 5),
        pattern_breaks: 4 + Math.floor(Math.random() * 3)
      },
      consistency_metrics: {
        score: 80 + Math.floor(Math.random() * 15),
        code_style_variance: 0.1 + Math.random() * 0.1,
        naming_consistency: 0.85 + Math.random() * 0.1
      },
      problem_solving: {
        approach: 'analytical',
        debugging_patterns: ['systematic', 'incremental'],
        typical_steps: 5 + Math.floor(Math.random() * 3)
      },
      decision_speed: {
        speed: 'moderate',
        average_time_to_decision_minutes: 15 + Math.floor(Math.random() * 10)
      },
      collaboration_style: {
        preference: 'structured',
        feedback_frequency: 'high',
        documentation_detail: 'comprehensive'
      }
    };

    personalityStmt.run(
      PROJECT,
      'claude',
      JSON.stringify(insights),
      startDate.toISOString(),
      endDate.toISOString(),
      endDate.toISOString()
    );
  }

  console.log(`  ${colors.green}✓ Created 3 personality analysis entries${colors.reset}`);

  // ========================================
  // 5. GROWTH SNAPSHOTS
  // ========================================
  console.log(`${colors.yellow}[5/7] Generating growth snapshots...${colors.reset}`);

  const growthStmt = db.prepare(`
    INSERT INTO growth_snapshots (
      project_name, snapshot_date, week_number, month_number,
      total_commits, total_lines_added, total_lines_deleted,
      files_created, bugs_fixed, features_completed,
      avg_session_duration, skill_improvements, milestones, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Generate 30 days of growth snapshots
  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

    // Calculate week and month numbers
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const weekNumber = Math.ceil(((date - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
    const monthNumber = date.getMonth() + 1;

    const totalCommits = 5 + Math.floor(Math.random() * 15);
    const totalLinesAdded = 100 + Math.floor(Math.random() * 400);
    const totalLinesDeleted = 50 + Math.floor(Math.random() * 200);
    const filesCreated = Math.floor(Math.random() * 5);
    const bugsFixed = Math.floor(Math.random() * 4);
    const featuresCompleted = Math.floor(Math.random() * 2);
    const avgSessionDuration = 30 + Math.floor(Math.random() * 60); // 30-90 minutes

    const skillImprovements = JSON.stringify([
      { skill: 'JavaScript', improvement: Math.floor(Math.random() * 5) },
      { skill: 'Testing', improvement: Math.floor(Math.random() * 3) }
    ]);

    const milestones = JSON.stringify([
      { title: 'Feature implementation', achieved: Math.random() > 0.5 }
    ]);

    const metadata = JSON.stringify({
      productivity_score: 70 + Math.floor(Math.random() * 25),
      focus_time: avgSessionDuration * 0.8
    });

    growthStmt.run(
      PROJECT,
      dateStr,
      weekNumber,
      monthNumber,
      totalCommits,
      totalLinesAdded,
      totalLinesDeleted,
      filesCreated,
      bugsFixed,
      featuresCompleted,
      avgSessionDuration,
      skillImprovements,
      milestones,
      metadata
    );
  }

  console.log(`  ${colors.green}✓ Created 31 growth snapshots${colors.reset}`);

  // ========================================
  // 6. USER PATTERNS
  // ========================================
  console.log(`${colors.yellow}[6/7] Generating user patterns...${colors.reset}`);

  const patternStmt = db.prepare(`
    INSERT INTO user_patterns (
      project_name, pattern_type, pattern_key, pattern_value, frequency, last_seen
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_name, pattern_type, pattern_key) DO UPDATE SET
      pattern_value = excluded.pattern_value,
      frequency = excluded.frequency,
      last_seen = excluded.last_seen
  `);

  const patterns = [
    { type: 'work_schedule', key: 'preferred_hours', value: '14:00-18:00', freq: 45 },
    { type: 'work_schedule', key: 'most_active_day', value: 'Tuesday', freq: 12 },
    { type: 'coding_style', key: 'preferred_architecture', value: 'modular', freq: 30 },
    { type: 'coding_style', key: 'testing_approach', value: 'integration-first', freq: 25 },
    { type: 'tool_usage', key: 'primary_editor', value: 'vscode', freq: 50 },
    { type: 'tool_usage', key: 'git_workflow', value: 'feature-branch', freq: 40 },
    { type: 'communication', key: 'preferred_format', value: 'detailed', freq: 35 },
    { type: 'communication', key: 'question_frequency', value: 'moderate', freq: 28 }
  ];

  const now = new Date().toISOString();
  patterns.forEach(p => {
    patternStmt.run(PROJECT, p.type, p.key, p.value, p.freq, now);
  });

  console.log(`  ${colors.green}✓ Created ${patterns.length} user patterns${colors.reset}`);

  // ========================================
  // 7. INTEGRATION EVENTS
  // ========================================
  console.log(`${colors.yellow}[7/7] Generating integration events...${colors.reset}`);

  const integrationStmt = db.prepare(`
    INSERT INTO integration_events (
      project_name, integration_type, event_type, event_data, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const integrationTypes = ['github', 'discord', 'slack'];
  const eventTypes = {
    github: ['issue_created', 'health_comment_posted', 'status_created', 'drift_alert_posted'],
    discord: ['health_alert_sent', 'drift_notification_sent', 'error_notification_sent'],
    slack: ['daily_summary_sent', 'health_report_sent', 'drift_alert_sent']
  };

  // Generate 20 integration events
  for (let i = 0; i < 20; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const createdDate = new Date();
    createdDate.setDate(createdDate.getDate() - daysAgo);
    createdDate.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);

    const integrationType = integrationTypes[Math.floor(Math.random() * integrationTypes.length)];
    const eventTypesList = eventTypes[integrationType];
    const eventType = eventTypesList[Math.floor(Math.random() * eventTypesList.length)];

    const success = Math.random() > 0.1; // 90% success rate
    const eventData = {
      response_time_ms: 100 + Math.floor(Math.random() * 900),
      retry_count: Math.random() > 0.8 ? Math.floor(Math.random() * 3) : 0
    };

    integrationStmt.run(
      PROJECT,
      integrationType,
      eventType,
      JSON.stringify(eventData),
      success ? 'success' : 'failed',
      createdDate.toISOString()
    );
  }

  console.log(`  ${colors.green}✓ Created 20 integration events${colors.reset}`);

  // ========================================
  // SUMMARY
  // ========================================
  console.log(`\n${colors.blue}========================================${colors.reset}`);
  console.log(`${colors.blue}   Summary${colors.reset}`);
  console.log(`${colors.blue}========================================${colors.reset}\n`);

  const counts = {
    health_scores: db.prepare('SELECT COUNT(*) as count FROM health_scores').get().count,
    drift_events: db.prepare('SELECT COUNT(*) as count FROM drift_events').get().count,
    productivity_insights: db.prepare('SELECT COUNT(*) as count FROM productivity_insights').get()
      .count,
    claude_personality: db.prepare('SELECT COUNT(*) as count FROM claude_personality').get().count,
    growth_snapshots: db.prepare('SELECT COUNT(*) as count FROM growth_snapshots').get().count,
    user_patterns: db.prepare('SELECT COUNT(*) as count FROM user_patterns').get().count,
    integration_events: db.prepare('SELECT COUNT(*) as count FROM integration_events').get().count
  };

  console.log(`Health Scores:         ${counts.health_scores}`);
  console.log(`Drift Events:          ${counts.drift_events}`);
  console.log(`Productivity Insights: ${counts.productivity_insights}`);
  console.log(`Personality Analyses:  ${counts.claude_personality}`);
  console.log(`Growth Snapshots:      ${counts.growth_snapshots}`);
  console.log(`User Patterns:         ${counts.user_patterns}`);
  console.log(`Integration Events:    ${counts.integration_events}`);

  console.log(`\n${colors.green}✓ Sample data generation complete!${colors.reset}\n`);
} catch (error) {
  console.error(`\n${colors.red}✗ Error:${colors.reset}`, error.message);
  process.exit(1);
} finally {
  db.close();
}
