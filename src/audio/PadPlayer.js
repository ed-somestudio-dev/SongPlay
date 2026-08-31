export class PadPlayer {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.activeKey = null;
    this.volume = 0.7;
    this.isMuted = false;
    this.linkToSongKey = true;

    this.padGainNode = null;
    this.filterNode = null;
    this.activeOscillators = [];

    this.keyFrequencies = {
      'C': 130.81,
      'Db': 138.59,
      'D': 146.83,
      'Eb': 155.56,
      'E': 164.81,
      'F': 174.61,
      'Gb': 185.00,
      'G': 196.00,
      'Ab': 207.65,
      'A': 220.00,
      'Bb': 233.08,
      'B': 246.94
    };
  }

  init(destinationNode, audioCtx) {
    if (audioCtx) this.ctx = audioCtx;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.padGainNode) return;
    this.padGainNode = this.ctx.createGain();
    this.padGainNode.gain.value = this.volume;

    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 420; // Warm ambient pad filter cutoff

    this.filterNode.connect(this.padGainNode);
    if (destinationNode) {
      this.padGainNode.connect(destinationNode);
    } else {
      this.padGainNode.connect(this.ctx.destination);
    }
  }

  playKey(keyName, destinationNode, audioCtx) {
    if (!this.ctx || !this.padGainNode) {
      this.init(destinationNode, audioCtx);
    }
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const freq = this.keyFrequencies[keyName];
    if (!freq) return;

    if (this.activeKey === keyName && this.activeOscillators.length > 0) {
      // Already playing this key
      return;
    }

    // Smoothly stop previous key sound
    this.stopKey();

    this.activeKey = keyName;

    const now = this.ctx.currentTime;
    const keyGain = this.ctx.createGain();
    keyGain.gain.setValueAtTime(0.001, now);
    keyGain.gain.linearRampToValueAtTime(0.4, now + 1.2); // 1.2s smooth attack

    // Create 3 detuned oscillators for lush stereo pad depth
    const detunes = [-7, 0, 7];
    const oscTypes = ['sawtooth', 'triangle', 'sawtooth'];

    this.activeOscillators = detunes.map((detune, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = oscTypes[i];
      osc.frequency.value = freq;
      osc.detune.value = detune;

      osc.connect(keyGain);
      osc.start(now);
      return { osc, gain: keyGain };
    });

    keyGain.connect(this.filterNode);
  }

  stopKey() {
    if (this.activeOscillators.length === 0 || !this.ctx) return;
    const now = this.ctx.currentTime;

    this.activeOscillators.forEach(({ osc, gain }) => {
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0); // 1s smooth release
      setTimeout(() => {
        try { osc.stop(); } catch (e) {}
      }, 1000);
    });

    this.activeOscillators = [];
    this.activeKey = null;
  }

  setVolume(vol) {
    this.volume = vol;
    if (this.padGainNode) {
      this.padGainNode.gain.value = this.isMuted ? 0 : vol;
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.setVolume(this.volume);
    return this.isMuted;
  }
}
