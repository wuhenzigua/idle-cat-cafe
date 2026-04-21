type SoundKind = 'click' | 'purchase' | 'milestone' | 'achievement' | 'prestige';

interface TonePreset {
  frequency: number;
  duration: number;
  gain: number;
  type: OscillatorType;
}

const TONE_PRESETS: Record<SoundKind, TonePreset> = {
  click: { frequency: 520, duration: 0.05, gain: 0.016, type: 'triangle' },
  purchase: { frequency: 730, duration: 0.08, gain: 0.02, type: 'sine' },
  milestone: { frequency: 980, duration: 0.12, gain: 0.024, type: 'triangle' },
  achievement: { frequency: 880, duration: 0.15, gain: 0.03, type: 'sine' },
  prestige: { frequency: 660, duration: 0.2, gain: 0.035, type: 'sawtooth' },
};

export class SoundManager {
  private audioContext: AudioContext | null = null;
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  play(kind: SoundKind): void {
    if (!this.enabled || typeof window === 'undefined') {
      return;
    }

    const context = this.getContext();

    if (!context) {
      return;
    }

    const preset = TONE_PRESETS[kind];
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = preset.type;
    oscillator.frequency.setValueAtTime(preset.frequency, now);
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(preset.gain, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + preset.duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + preset.duration);
  }

  private getContext(): AudioContext | null {
    if (this.audioContext) {
      return this.audioContext;
    }

    const WebAudio = window.AudioContext ?? (window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;

    if (!WebAudio) {
      return null;
    }

    this.audioContext = new WebAudio();

    return this.audioContext;
  }
}
