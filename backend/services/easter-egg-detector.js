/**
 * Easter Egg Detector
 *
 * Finds hidden messages and seasonal content based on:
 * - Special dates (holidays, birthdays)
 * - Code patterns
 * - Time triggers
 * - Event sequences
 */

import { logger } from '../utils/logger.js';

export class EasterEggDetector {
  constructor(ravenDb) {
    this.db = ravenDb;
    this.projectName = ravenDb.projectName || 'raven';
  }

  /**
   * Easter egg definitions
   */
  static EASTER_EGGS = {
    // Seasonal
    NEW_YEAR: {
      id: 'new_year',
      title: '🎊 Happy New Year!',
      message:
        "It's a new year! Time for fresh code and new adventures! *excited caw* May your code be bug-free and your commits be meaningful! 🎉",
      trigger_type: 'date',
      checkFn: () => {
        const now = new Date();
        return now.getMonth() === 0 && now.getDate() === 1;
      }
    },
    HALLOWEEN: {
      id: 'halloween',
      title: '🎃 Happy Halloween!',
      message:
        '*spooky caw* 👻 Beware of ghost bugs and zombie processes! Happy Halloween, brave coder! 🦇',
      trigger_type: 'date',
      checkFn: () => {
        const now = new Date();
        return now.getMonth() === 9 && now.getDate() === 31;
      }
    },
    CHRISTMAS: {
      id: 'christmas',
      title: '🎄 Merry Christmas!',
      message:
        '*festive caw* 🎅 Merry Christmas! May your bugs be few and your deployments be successful! Ho ho ho! 🎁',
      trigger_type: 'date',
      checkFn: () => {
        const now = new Date();
        return now.getMonth() === 11 && now.getDate() === 25;
      }
    },
    FRIDAY_13TH: {
      id: 'friday_13th',
      title: '😱 Friday the 13th!',
      message:
        "*nervous caw* It's Friday the 13th... extra careful with those deployments today! 🐈‍⬛",
      trigger_type: 'date',
      checkFn: () => {
        const now = new Date();
        return now.getDay() === 5 && now.getDate() === 13;
      }
    },

    // Code pattern Easter eggs
    KONAMI_CODE: {
      id: 'konami_code',
      title: '🎮 Konami Code!',
      message:
        '↑↑↓↓←→←→BA - You found the secret! 30 extra lives... I mean, 30 bonus points! *playful caw* 🕹️',
      trigger_type: 'pattern',
      pattern: 'up up down down left right left right b a'
    },
    HELLO_RAVEN: {
      id: 'hello_raven',
      title: '👋 Hello there!',
      message: 'Oh! You said hello! *happy caw* Hello to you too, friend! 🐦‍⬛💙',
      trigger_type: 'code',
      pattern: /(hello|hi|hey).*raven/i
    },
    THANK_YOU: {
      id: 'thank_you',
      title: "🥰 You're welcome!",
      message:
        "*blushing caw* Aww, you're thanking me? YOU'RE the awesome one! Keep being great! 💙",
      trigger_type: 'code',
      pattern: /thank.*you.*raven/i
    },
    GOOD_BOT: {
      id: 'good_bot',
      title: '😊 Good bot!',
      message: "*proud caw* I'm a good Raven? You're making me blush! *happy feather ruffle* 🐦‍⬛❤️",
      trigger_type: 'code',
      pattern: /good.*(bird|raven|bot)/i
    },

    // Time-based
    MIDNIGHT_CODER: {
      id: 'midnight_coder',
      title: '🌙 Midnight Oil',
      message:
        "It's midnight and you're still coding! *impressed caw* Dedication! But don't forget to rest, night owl! 😴",
      trigger_type: 'time',
      checkFn: () => new Date().getHours() === 0
    },
    LUCKY_777: {
      id: 'lucky_777',
      title: '🎰 Lucky 777!',
      message: "777 commits! *jackpot caw* You're on a winning streak! 💰✨",
      trigger_type: 'milestone',
      value: 777
    },
    ANSWER_42: {
      id: 'answer_42',
      title: '🌌 The Answer',
      message:
        '42 commits in a day? You know the answer to life, the universe, and everything! *philosophical caw* 🚀',
      trigger_type: 'daily_commits',
      value: 42
    },

    // Fun discoveries
    RAVEN_IN_CODE: {
      id: 'raven_in_code',
      title: '🔍 Found Me!',
      message:
        "You put 'raven' in your code? *excited caw* I'm famous! Or... infamous? Either way, CAW CAW! 🐦‍⬛",
      trigger_type: 'code',
      pattern: /raven/i
    },
    CAW_IN_CODE: {
      id: 'caw_in_code',
      title: '🎵 Caw Caw!',
      message:
        "Did you just... write 'caw' in your code? *delighted caw* ONE OF US! ONE OF US! 🐦‍⬛🐦‍⬛",
      trigger_type: 'code',
      pattern: /\bcaw\b/i
    },
    PERFECT_SCORE: {
      id: 'perfect_score',
      title: '💯 Perfection!',
      message: 'Health score of 100? *amazed caw* PERFECTION! You are a coding deity! ✨👑',
      trigger_type: 'health_score',
      value: 100
    }
  };

  /**
   * Check for easter eggs based on current context
   */
  async checkEasterEggs(context = {}) {
    const discoveries = [];

    for (const egg of Object.values(EasterEggDetector.EASTER_EGGS)) {
      // Check if already discovered
      const existing = this.db.db
        .prepare(
          `
        SELECT * FROM easter_eggs
        WHERE project_name = ? AND egg_id = ?
      `
        )
        .get(this.projectName, egg.id);

      // Skip if already discovered (unless it's a repeatable one)
      if (existing && egg.trigger_type !== 'date' && egg.trigger_type !== 'time') {
        continue;
      }

      let triggered = false;

      // Check different trigger types
      switch (egg.trigger_type) {
        case 'date':
          triggered = egg.checkFn ? egg.checkFn() : false;
          break;

        case 'time':
          triggered = egg.checkFn ? egg.checkFn() : false;
          break;

        case 'code':
          if (context.code && egg.pattern) {
            triggered = egg.pattern.test(context.code);
          }
          break;

        case 'milestone':
          if (context.totalCommits === egg.value) {
            triggered = true;
          }
          break;

        case 'daily_commits':
          if (context.dailyCommits === egg.value) {
            triggered = true;
          }
          break;

        case 'health_score':
          if (context.healthScore === egg.value) {
            triggered = true;
          }
          break;
      }

      if (triggered) {
        const discovery = await this.discoverEgg(egg);
        if (discovery) {
          discoveries.push(discovery);
        }
      }
    }

    return discoveries;
  }

  /**
   * Discover/record an easter egg
   */
  async discoverEgg(egg) {
    try {
      // For date/time based eggs, check if discovered today
      if (egg.trigger_type === 'date' || egg.trigger_type === 'time') {
        const today = new Date().toISOString().split('T')[0];
        const existing = this.db.db
          .prepare(
            `
          SELECT * FROM easter_eggs
          WHERE project_name = ? AND egg_id = ? AND DATE(discovered_at) = ?
        `
          )
          .get(this.projectName, egg.id, today);

        if (existing) return null; // Already shown today
      }

      // Insert discovery
      this.db.db
        .prepare(
          `
        INSERT INTO easter_eggs (project_name, egg_id, title, message, trigger_type)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run(this.projectName, egg.id, egg.title, egg.message, egg.trigger_type);

      logger.info('Easter egg discovered', {
        service: 'easter-egg-detector',
        project: this.projectName,
        egg: egg.title
      });

      return {
        ...egg,
        justDiscovered: true
      };
    } catch (error) {
      // Ignore unique constraint violations (egg already discovered)
      if (error.message.includes('UNIQUE constraint failed')) {
        return null;
      }
      logger.error('Failed to record easter egg', {
        service: 'easter-egg-detector',
        error: error.message
      });
      return null;
    }
  }

  /**
   * Get all discovered easter eggs
   */
  getDiscoveredEggs() {
    return this.db.db
      .prepare(
        `
      SELECT * FROM easter_eggs
      WHERE project_name = ?
      ORDER BY discovered_at DESC
    `
      )
      .all(this.projectName);
  }

  /**
   * Check seasonal messages for today
   */
  async checkSeasonalMessage() {
    const discoveries = [];

    for (const egg of Object.values(EasterEggDetector.EASTER_EGGS)) {
      if (egg.trigger_type === 'date' && egg.checkFn && egg.checkFn()) {
        const discovery = await this.discoverEgg(egg);
        if (discovery) {
          discoveries.push(discovery);
        }
      }
    }

    return discoveries;
  }
}
