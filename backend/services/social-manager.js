/**
 * Social Manager
 *
 * Handles:
 * - Achievement/milestone sharing
 * - Story exports
 * - Team insights
 * - Social feed generation
 */

import { logger } from '../utils/logger.js';

export class SocialManager {
  constructor(ravenDb) {
    this.db = ravenDb;
    this.projectName = ravenDb.projectName || 'raven';
  }

  /**
   * Generate shareable achievement card
   */
  generateAchievementCard(achievement) {
    const card = {
      type: 'achievement',
      title: achievement.title,
      description: achievement.description,
      icon: achievement.icon,
      rarity: achievement.rarity,
      points: achievement.points,
      unlockedAt: achievement.unlocked_at,
      shareText: this.generateShareText('achievement', achievement)
    };

    return card;
  }

  /**
   * Generate shareable milestone card
   */
  generateMilestoneCard(milestone) {
    const card = {
      type: 'milestone',
      title: `${milestone.value} ${milestone.milestone_type}`,
      description: `Reached ${milestone.value} ${milestone.milestone_type}!`,
      achievedAt: milestone.achieved_at,
      shareText: this.generateShareText('milestone', milestone)
    };

    return card;
  }

  /**
   * Generate shareable session story
   */
  generateStoryCard(story) {
    const card = {
      type: 'story',
      narrative: story.narrative,
      stats: JSON.parse(story.stats || '{}'),
      timeline: JSON.parse(story.timeline || '[]'),
      mood: story.mood,
      achievements: JSON.parse(story.achievements || '[]'),
      shareText: this.generateShareText('story', story)
    };

    return card;
  }

  /**
   * Generate share text for different content types
   */
  generateShareText(type, data) {
    switch (type) {
      case 'achievement':
        return `🎉 Just unlocked "${data.title}" in Raven! ${data.description} #RavenMonitor #Coding`;

      case 'milestone':
        return `🏆 Milestone reached: ${data.value} ${data.milestone_type}! Tracked with Raven 🐦‍⬛ #RavenMonitor #CodingMilestone`;

      case 'story':
        const stats = JSON.parse(data.stats || '{}');
        return `📖 Coding session complete! ${stats.duration || 'Unknown time'}, ${stats.filesChanged || 0} files changed. Tracked with Raven 🐦‍⬛ #RavenMonitor #CodingStory`;

      case 'stats':
        return `📊 My coding stats with Raven: Level ${data.level}, ${data.total_points} points, ${data.streak_days} day streak! 🐦‍⬛ #RavenMonitor #CodingStats`;

      default:
        return 'Check out my progress with Raven Monitor! 🐦‍⬛ #RavenMonitor';
    }
  }

  /**
   * Record a share event
   */
  recordShare(shareType, content, platform = 'clipboard') {
    try {
      this.db.db
        .prepare(
          `
        INSERT INTO social_shares (project_name, share_type, content, platform)
        VALUES (?, ?, ?, ?)
      `
        )
        .run(this.projectName, shareType, JSON.stringify(content), platform);

      logger.info('Share recorded', {
        service: 'social-manager',
        project: this.projectName,
        type: shareType,
        platform
      });
    } catch (error) {
      logger.error('Failed to record share', {
        service: 'social-manager',
        error: error.message
      });
    }
  }

  /**
   * Get share history
   */
  getShareHistory(limit = 20) {
    return this.db.db
      .prepare(
        `
      SELECT * FROM social_shares
      WHERE project_name = ?
      ORDER BY shared_at DESC
      LIMIT ?
    `
      )
      .all(this.projectName, limit);
  }

  /**
   * Add team member
   */
  addTeamMember(memberName, role = 'developer') {
    try {
      this.db.db
        .prepare(
          `
        INSERT INTO team_members (project_name, member_name, role)
        VALUES (?, ?, ?)
        ON CONFLICT(project_name, member_name)
        DO UPDATE SET last_seen = CURRENT_TIMESTAMP
      `
        )
        .run(this.projectName, memberName, role);

      return { success: true };
    } catch (error) {
      logger.error('Failed to add team member', {
        service: 'social-manager',
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get team members
   */
  getTeamMembers() {
    return this.db.db
      .prepare(
        `
      SELECT * FROM team_members
      WHERE project_name = ?
      ORDER BY joined_at DESC
    `
      )
      .all(this.projectName);
  }

  /**
   * Export data in various formats
   */
  exportData(format = 'json', dataType = 'all') {
    const data = {};

    if (dataType === 'all' || dataType === 'achievements') {
      data.achievements = this.db.db
        .prepare(
          `
        SELECT * FROM achievements WHERE project_name = ?
      `
        )
        .all(this.projectName);
    }

    if (dataType === 'all' || dataType === 'stats') {
      data.stats = this.db.db
        .prepare(
          `
        SELECT * FROM user_stats WHERE project_name = ?
      `
        )
        .get(this.projectName);
    }

    if (dataType === 'all' || dataType === 'easter_eggs') {
      data.easterEggs = this.db.db
        .prepare(
          `
        SELECT * FROM easter_eggs WHERE project_name = ?
      `
        )
        .all(this.projectName);
    }

    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);

      case 'markdown':
        return this.exportToMarkdown(data);

      case 'text':
        return this.exportToText(data);

      default:
        return data;
    }
  }

  /**
   * Export to Markdown format
   */
  exportToMarkdown(data) {
    let md = '# Raven Coding Stats\n\n';

    if (data.stats) {
      md += '## Profile\n\n';
      md += `- **Level**: ${data.stats.level}\n`;
      md += `- **Total Points**: ${data.stats.total_points}\n`;
      md += `- **Streak**: ${data.stats.streak_days} days\n`;
      md += `- **Badges Unlocked**: ${data.stats.badges_unlocked}\n\n`;
    }

    if (data.achievements && data.achievements.length > 0) {
      md += `## Achievements (${data.achievements.length})\n\n`;
      data.achievements.forEach(a => {
        md += `### ${a.title}\n`;
        md += `${a.description}\n`;
        md += `- **Rarity**: ${a.rarity}\n`;
        md += `- **Points**: ${a.points}\n`;
        md += `- **Unlocked**: ${new Date(a.unlocked_at).toLocaleDateString()}\n\n`;
      });
    }

    if (data.easterEggs && data.easterEggs.length > 0) {
      md += `## Easter Eggs Found (${data.easterEggs.length})\n\n`;
      data.easterEggs.forEach(e => {
        md += `- ${e.title} *(${new Date(e.discovered_at).toLocaleDateString()})*\n`;
      });
    }

    md += '\n---\n*Generated with Raven Monitor 🐦‍⬛*\n';

    return md;
  }

  /**
   * Export to plain text format
   */
  exportToText(data) {
    let txt = `RAVEN CODING STATS\n${'='.repeat(50)}\n\n`;

    if (data.stats) {
      txt += `PROFILE\n${'-'.repeat(50)}\n`;
      txt += `Level: ${data.stats.level}\n`;
      txt += `Total Points: ${data.stats.total_points}\n`;
      txt += `Streak: ${data.stats.streak_days} days\n`;
      txt += `Badges Unlocked: ${data.stats.badges_unlocked}\n\n`;
    }

    if (data.achievements && data.achievements.length > 0) {
      txt += `ACHIEVEMENTS (${data.achievements.length})\n${'-'.repeat(50)}\n`;
      data.achievements.forEach(a => {
        txt += `${a.title} - ${a.description}\n`;
      });
      txt += '\n';
    }

    txt += '\nGenerated with Raven Monitor\n';

    return txt;
  }
}
