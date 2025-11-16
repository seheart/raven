import { logger } from '../logger.js';

/**
 * Audio Manager
 *
 * Handles:
 * - Sound effects playback
 * - Text-to-speech (voice mode)
 * - Volume controls
 * - Audio preferences
 */

class AudioManager {
  constructor() {
    this.soundEnabled = true;
    this.voiceEnabled = false;
    this.volume = 0.7;
    this.voiceType = 'female';
    this.voiceSpeed = 1.0;
    this.voicePitch = 1.0;

    // Sound library (using data URIs for small beep sounds)
    this.sounds = {
      achievement: this.createBeep(800, 0.2, 'sine'),
      notification: this.createBeep(600, 0.15, 'sine'),
      success: this.createChord([523.25, 659.25, 783.99], 0.3), // C major
      warning: this.createBeep(400, 0.2, 'square'),
      error: this.createBeep(200, 0.3, 'sawtooth'),
      levelUp: this.createAscending([400, 500, 600, 800], 0.15),
      caw: this.createCawSound()
    };

    // Load preferences from localStorage
    this.loadPreferences();

    // Initialize Web Speech API for voice
    this.initVoice();
  }

  /**
   * Create a simple beep sound using Web Audio API
   */
  createBeep(frequency, duration, type = 'sine') {
    return async () => {
      if (!this.soundEnabled) return;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = type;

      gainNode.gain.setValueAtTime(this.volume, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration);
    };
  }

  /**
   * Create a chord sound
   */
  createChord(frequencies, duration) {
    return async () => {
      if (!this.soundEnabled) return;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const gainNode = audioContext.createGain();
      gainNode.connect(audioContext.destination);
      gainNode.gain.setValueAtTime(this.volume / frequencies.length, audioContext.currentTime);

      frequencies.forEach(freq => {
        const oscillator = audioContext.createOscillator();
        oscillator.connect(gainNode);
        oscillator.frequency.value = freq;
        oscillator.type = 'sine';
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
      });
    };
  }

  /**
   * Create an ascending sound
   */
  createAscending(frequencies, noteDuration) {
    return async () => {
      if (!this.soundEnabled) return;

      for (let i = 0; i < frequencies.length; i++) {
        await this.createBeep(frequencies[i], noteDuration, 'sine')();
        await new Promise(resolve => setTimeout(resolve, noteDuration * 1000));
      }
    };
  }

  /**
   * Create a "caw" sound (approximation)
   */
  createCawSound() {
    return async () => {
      if (!this.soundEnabled) return;

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = 'sawtooth';

      // Simulate "caw" with frequency sweep
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
      oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.2);

      gainNode.gain.setValueAtTime(this.volume, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    };
  }

  /**
   * Play a sound effect
   */
  async playSound(soundName) {
    if (!this.soundEnabled) return;

    const sound = this.sounds[soundName];
    if (sound) {
      try {
        await sound();
      } catch (error) {
        logger.error('Failed to play sound:', error);
      }
    }
  }

  /**
   * Initialize voice synthesis
   */
  initVoice() {
    if ('speechSynthesis' in window) {
      this.speechSynthesis = window.speechSynthesis;
      this.voices = [];

      // Load voices
      const loadVoices = () => {
        this.voices = this.speechSynthesis.getVoices();
      };

      loadVoices();
      if (this.speechSynthesis.onvoiceschanged !== undefined) {
        this.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
  }

  /**
   * Speak text using text-to-speech
   */
  speak(text) {
    if (!this.voiceEnabled || !this.speechSynthesis) return;

    // Cancel any ongoing speech
    this.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Select voice
    const selectedVoice = this.voices.find(voice => {
      if (this.voiceType === 'female') {
        return (
          voice.name.toLowerCase().includes('female') ||
          voice.name.toLowerCase().includes('samantha')
        );
      } else if (this.voiceType === 'male') {
        return (
          voice.name.toLowerCase().includes('male') || voice.name.toLowerCase().includes('daniel')
        );
      }
      return false;
    });

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.rate = this.voiceSpeed;
    utterance.pitch = this.voicePitch;
    utterance.volume = this.volume;

    this.speechSynthesis.speak(utterance);
  }

  /**
   * Stop any ongoing speech
   */
  stopSpeaking() {
    if (this.speechSynthesis) {
      this.speechSynthesis.cancel();
    }
  }

  /**
   * Update preferences
   */
  updatePreferences(prefs) {
    if (prefs.soundEnabled !== undefined) this.soundEnabled = prefs.soundEnabled;
    if (prefs.volume !== undefined) this.volume = Math.max(0, Math.min(1, prefs.volume));
    if (prefs.voiceEnabled !== undefined) this.voiceEnabled = prefs.voiceEnabled;
    if (prefs.voiceType !== undefined) this.voiceType = prefs.voiceType;
    if (prefs.voiceSpeed !== undefined)
      this.voiceSpeed = Math.max(0.5, Math.min(2, prefs.voiceSpeed));
    if (prefs.voicePitch !== undefined)
      this.voicePitch = Math.max(0.5, Math.min(2, prefs.voicePitch));

    this.savePreferences();
  }

  /**
   * Save preferences to localStorage
   */
  savePreferences() {
    const prefs = {
      soundEnabled: this.soundEnabled,
      volume: this.volume,
      voiceEnabled: this.voiceEnabled,
      voiceType: this.voiceType,
      voiceSpeed: this.voiceSpeed,
      voicePitch: this.voicePitch
    };
    localStorage.setItem('raven_audio_prefs', JSON.stringify(prefs));
  }

  /**
   * Load preferences from localStorage
   */
  loadPreferences() {
    try {
      const saved = localStorage.getItem('raven_audio_prefs');
      if (saved) {
        const prefs = JSON.parse(saved);
        this.updatePreferences(prefs);
      }
    } catch (error) {
      logger.error('Failed to load audio preferences:', error);
    }
  }

  /**
   * Get current preferences
   */
  getPreferences() {
    return {
      soundEnabled: this.soundEnabled,
      volume: this.volume,
      voiceEnabled: this.voiceEnabled,
      voiceType: this.voiceType,
      voiceSpeed: this.voiceSpeed,
      voicePitch: this.voicePitch
    };
  }

  /**
   * Play achievement sound and optionally speak
   */
  celebrateAchievement(achievement) {
    this.playSound('achievement');
    if (this.voiceEnabled && achievement.title) {
      this.speak(`Achievement unlocked: ${achievement.title}`);
    }
  }

  /**
   * Play notification and optionally speak message
   */
  notify(message, type = 'notification') {
    this.playSound(type);
    if (this.voiceEnabled && message) {
      this.speak(message);
    }
  }
}

// Export singleton instance
export const audioManager = new AudioManager();
