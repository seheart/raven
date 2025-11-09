/**
 * Gamification Engine
 *
 * Handles:
 * - Achievement detection and unlocking
 * - Points and experience tracking
 * - Level progression
 * - Streak tracking
 * - Badge awards
 */

import { logger } from '../utils/logger.js';

export class GamificationEngine {
  constructor(ravenDb) {
    this.db = ravenDb;
    this.projectName = ravenDb.projectName || 'raven';
  }

  /**
   * Achievement definitions
   */
  static ACHIEVEMENTS = {
    // Milestone achievements
    FIRST_COMMIT: {
      id: 'first_commit',
      title: '🎉 First Steps',
      description: 'Made your first commit with Raven!',
      points: 10,
      rarity: 'common'
    },
    COMMITS_100: {
      id: 'commits_100',
      title: '💯 Century',
      description: 'Reached 100 commits!',
      points: 100,
      rarity: 'rare'
    },
    COMMITS_1000: {
      id: 'commits_1000',
      title: '🏆 Legendary Coder',
      description: 'Made 1,000 commits!',
      points: 500,
      rarity: 'legendary'
    },

    // Streak achievements
    STREAK_7: {
      id: 'streak_7',
      title: '🔥 Week Warrior',
      description: '7-day coding streak!',
      points: 50,
      rarity: 'uncommon'
    },
    STREAK_30: {
      id: 'streak_30',
      title: '🌟 Monthly Master',
      description: '30-day coding streak!',
      points: 200,
      rarity: 'epic'
    },

    // Quality achievements
    PERFECT_TESTS: {
      id: 'perfect_tests',
      title: '⭐ Perfect Score',
      description: 'All tests passed on first try!',
      points: 25,
      rarity: 'uncommon'
    },
    ZERO_ROLLBACKS: {
      id: 'zero_rollbacks_week',
      title: '✨ Flawless Week',
      description: '7 days without a rollback!',
      points: 75,
      rarity: 'rare'
    },

    // Learning achievements
    NEW_TECH: {
      id: 'first_new_tech',
      title: '🎓 Learner',
      description: 'Tried a new technology!',
      points: 30,
      rarity: 'common'
    },
    TECH_5: {
      id: 'tech_explorer_5',
      title: '🌍 Tech Explorer',
      description: 'Learned 5 new technologies!',
      points: 100,
      rarity: 'rare'
    },

    // Speed achievements
    FAST_SESSION: {
      id: 'fast_session',
      title: '⚡ Speed Demon',
      description: '50+ changes in one hour!',
      points: 40,
      rarity: 'uncommon'
    },
    DEEP_FOCUS: {
      id: 'deep_focus',
      title: '🧘 Flow State Master',
      description: '4+ hours in flow state!',
      points: 60,
      rarity: 'rare'
    },

    // Fun achievements
    NIGHT_OWL: {
      id: 'night_owl',
      title: '🦉 Night Owl',
      description: 'Coding at 3 AM!',
      points: 20,
      rarity: 'common'
    },
    EARLY_BIRD: {
      id: 'early_bird',
      title: '🐦 Early Bird',
      description: 'Coding before 6 AM!',
      points: 20,
      rarity: 'common'
    },
    WEEKEND_WARRIOR: {
      id: 'weekend_warrior',
      title: '⚔️ Weekend Warrior',
      description: 'Coded on both Saturday and Sunday!',
      points: 30,
      rarity: 'uncommon'
    }
  };

  /**
   * Check and award achievements based on activity
   */
  async checkAchievements(activity) {
    const achievements = [];

    // Check milestone achievements
    if (activity.totalCommits === 1) {
      achievements.push(await this.unlockAchievement('first_commit'));
    }
    if (activity.totalCommits === 100) {
      achievements.push(await this.unlockAchievement('commits_100'));
    }
    if (activity.totalCommits === 1000) {
      achievements.push(await this.unlockAchievement('commits_1000'));
    }

    // Check streak achievements
    if (activity.streak === 7) {
      achievements.push(await this.unlockAchievement('streak_7'));
    }
    if (activity.streak === 30) {
      achievements.push(await this.unlockAchievement('streak_30'));
    }

    // Check time-based achievements
    const hour = new Date().getHours();
    if (hour >= 3 && hour < 4) {
      achievements.push(await this.unlockAchievement('night_owl'));
    }
    if (hour >= 5 && hour < 6) {
      achievements.push(await this.unlockAchievement('early_bird'));
    }

    // Check weekend
    const day = new Date().getDay();
    if (day === 0 || day === 6) {
      achievements.push(await this.unlockAchievement('weekend_warrior'));
    }

    return achievements.filter(a => a !== null);
  }

  /**
   * Unlock an achievement
   */
  async unlockAchievement(achievementId) {
    const achievement = Object.values(GamificationEngine.ACHIEVEMENTS).find(
      a => a.id === achievementId
    );
    if (!achievement) return null;

    try {
      // Check if already unlocked
      const existing = this.db.db
        .prepare(
          `
        SELECT * FROM achievements
        WHERE project_name = ? AND achievement_id = ?
      `
        )
        .get(this.projectName, achievementId);

      if (existing) return null;

      // Insert achievement
      this.db.db
        .prepare(
          `
        INSERT INTO achievements (
          project_name, achievement_type, achievement_id, title, description, icon, rarity, points
        ) VALUES (?, 'standard', ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          this.projectName,
          achievement.id,
          achievement.title,
          achievement.description,
          achievement.title.split(' ')[0], // First emoji as icon
          achievement.rarity,
          achievement.points
        );

      // Award points
      await this.awardPoints(achievement.points);

      logger.info('Achievement unlocked', {
        service: 'gamification-engine',
        project: this.projectName,
        achievement: achievement.title
      });

      return {
        ...achievement,
        justUnlocked: true
      };
    } catch (error) {
      logger.error('Failed to unlock achievement', {
        service: 'gamification-engine',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Award points and update level/experience
   */
  async awardPoints(points) {
    // Get or create user stats
    let stats = this.db.db
      .prepare(
        `
      SELECT * FROM user_stats WHERE project_name = ?
    `
      )
      .get(this.projectName);

    if (!stats) {
      this.db.db
        .prepare(
          `
        INSERT INTO user_stats (project_name, total_points, level, experience)
        VALUES (?, 0, 1, 0)
      `
        )
        .run(this.projectName);
      stats = { total_points: 0, level: 1, experience: 0 };
    }

    const newPoints = stats.total_points + points;
    const newExperience = stats.experience + points;
    const newLevel = this.calculateLevel(newExperience);

    this.db.db
      .prepare(
        `
      UPDATE user_stats
      SET total_points = ?,
          level = ?,
          experience = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE project_name = ?
    `
      )
      .run(newPoints, newLevel, newExperience, this.projectName);

    return {
      points: newPoints,
      level: newLevel,
      experience: newExperience,
      leveledUp: newLevel > stats.level
    };
  }

  /**
   * Calculate level from experience
   * Every 100 XP = 1 level, scaling exponentially
   */
  calculateLevel(experience) {
    return Math.floor(Math.sqrt(experience / 100)) + 1;
  }

  /**
   * Update streak
   */
  async updateStreak() {
    const stats = this.db.db
      .prepare(
        `
      SELECT * FROM user_stats WHERE project_name = ?
    `
      )
      .get(this.projectName);

    if (!stats) return;

    const today = new Date().toISOString().split('T')[0];
    const lastActive = stats.last_active_date;

    let newStreak = stats.streak_days || 0;

    if (lastActive) {
      const lastDate = new Date(lastActive);
      const todayDate = new Date(today);
      const daysDiff = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

      if (daysDiff === 0) {
        // Same day, no change
        return;
      } else if (daysDiff === 1) {
        // Consecutive day
        newStreak += 1;
      } else {
        // Streak broken
        newStreak = 1;
      }
    } else {
      newStreak = 1;
    }

    this.db.db
      .prepare(
        `
      UPDATE user_stats
      SET streak_days = ?,
          last_active_date = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE project_name = ?
    `
      )
      .run(newStreak, today, this.projectName);

    return newStreak;
  }

  /**
   * Get user stats
   */
  getUserStats() {
    return this.db.db
      .prepare(
        `
      SELECT * FROM user_stats WHERE project_name = ?
    `
      )
      .get(this.projectName);
  }

  /**
   * Get all unlocked achievements
   */
  getUnlockedAchievements() {
    return this.db.db
      .prepare(
        `
      SELECT * FROM achievements
      WHERE project_name = ?
      ORDER BY unlocked_at DESC
    `
      )
      .all(this.projectName);
  }

  /**
   * Get recent achievements (uncelebrated)
   */
  getRecentAchievements() {
    return this.db.db
      .prepare(
        `
      SELECT * FROM achievements
      WHERE project_name = ? AND celebrated = 0
      ORDER BY unlocked_at DESC
      LIMIT 5
    `
      )
      .all(this.projectName);
  }

  /**
   * Mark achievement as celebrated
   */
  markAsCelebrated(achievementId) {
    this.db.db
      .prepare(
        `
      UPDATE achievements
      SET celebrated = 1
      WHERE project_name = ? AND achievement_id = ?
    `
      )
      .run(this.projectName, achievementId);
  }
}
