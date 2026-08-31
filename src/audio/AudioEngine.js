export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 278; // 4 mins 38 sec default song length
    this.bpm = 68;
    this.timeSignature = '4/4';
    this.channels = {};
    this.soloActive = false;
    this.onTimeUpdateCallbacks = [];
    this.onStateChangeCallbacks = [];
    this.animationFrame = null;
    this.startTime = 0;
    this.pauseOffset = 0;

    // Default multitrack stems list
    this.trackNames = [
      { id: 'click', label: 'Click', defaultVol: 0.8 },
      { id: 'guide', label: 'Guia', defaultVol: 0.7 },
      { id: 'drums', label: 'Bateria', defaultVol: 0.85 },
      { id: 'bass', label: 'Baixo', defaultVol: 0.8 },
      { id: 'guitar1', label: 'Guitar 1', defaultVol: 0.75 },
      { id: 'guitar2', label: 'Guitar 2', defaultVol: 0.7 },
      { id: 'keys', label: 'Teclas', defaultVol: 0.8 }
    ];
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    // Per-song Master Gain node
    this.songMasterGain = this.ctx.createGain();
    this.songMasterGain.gain.value = 0.9;
    this.masterGain = this.songMasterGain; // alias for backward compatibility

    // Global Device Master Gain node (persists across song changes)
    const savedGlobalVol = parseFloat(localStorage.getItem('songplay_global_master_vol'));
    const initialGlobalVol = isNaN(savedGlobalVol) ? 1.0 : savedGlobalVol;

    this.globalMasterGain = this.ctx.createGain();
    this.globalMasterGain.gain.value = initialGlobalVol;

    this.songMasterGain.connect(this.globalMasterGain);
    this.globalMasterGain.connect(this.ctx.destination);

    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 256;
    this.masterAnalyser.smoothingTimeConstant = 0.6;
    this.globalMasterGain.connect(this.masterAnalyser);

    // Setup standard channel nodes
    this.trackNames.forEach(track => {
      const gainNode = this.ctx.createGain();
      gainNode.gain.value = track.defaultVol;

      const analyserNode = this.ctx.createAnalyser();
      analyserNode.fftSize = 256;
      analyserNode.smoothingTimeConstant = 0.6;

      gainNode.connect(analyserNode);
      analyserNode.connect(this.masterGain);

      this.channels[track.id] = {
        label: track.label,
        gainNode,
        analyserNode,
        volume: track.defaultVol,
        isMuted: false,
        isSolo: false,
        audioBuffer: null,
        bufferSource: null
      };
    });

    // Setup dedicated Pad channel node (independent volume)
    const savedPadVol = parseFloat(localStorage.getItem('songplay_pad_vol'));
    const initialPadVol = isNaN(savedPadVol) ? 0.65 : savedPadVol;

    const padGain = this.ctx.createGain();
    padGain.gain.value = initialPadVol;

    const padAnalyser = this.ctx.createAnalyser();
    padAnalyser.fftSize = 256;
    padAnalyser.smoothingTimeConstant = 0.6;

    padGain.connect(padAnalyser);
    padAnalyser.connect(this.masterGain);

    this.channels['pad'] = {
      label: 'Pad',
      gainNode: padGain,
      analyserNode: padAnalyser,
      volume: initialPadVol,
      isMuted: false,
      isSolo: false,
      audioBuffer: null,
      bufferSource: null
    };

    this._startSyntheticAudioGenerators();
  }

  async decodeFile(file) {
    if (!this.ctx) this.init();
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (e) {}
    }
    const arrayBuffer = await file.arrayBuffer();
    return await this.ctx.decodeAudioData(arrayBuffer);
  }

  loadTrackBuffer(trackId, audioBuffer) {
    if (!this.channels[trackId]) return;
    this.channels[trackId].audioBuffer = audioBuffer;
    
    // Update max duration
    let maxDur = 0;
    Object.values(this.channels).forEach(ch => {
      if (ch.audioBuffer && ch.audioBuffer.duration > maxDur) {
        maxDur = ch.audioBuffer.duration;
      }
    });
    if (maxDur > 0) {
      this.duration = maxDur;
    }
  }

  clearAudioBuffers() {
    Object.values(this.channels).forEach(ch => {
      ch.audioBuffer = null;
      if (ch.bufferSource) {
        try { ch.bufferSource.stop(); } catch (e) {}
        ch.bufferSource = null;
      }
    });
  }

  hasLoadedBuffers() {
    return Object.values(this.channels).some(ch => ch.audioBuffer !== null);
  }

  onStateChange(callback) {
    this.onStateChangeCallbacks.push(callback);
  }

  _notifyStateChange() {
    this.onStateChangeCallbacks.forEach(cb => cb(this.isPlaying));
  }

  async play() {
    // Lazy-init: Create AudioContext only on first user gesture
    if (!this.ctx) this.init();

    // Always try to resume — browsers start ctx as 'suspended'
    if (this.ctx.state !== 'running') {
      try { await this.ctx.resume(); } catch (e) { console.warn('ctx.resume failed', e); }
    }

    // Safety: if still not running, abort
    if (this.ctx.state !== 'running') {
      console.warn('AudioContext not running, state:', this.ctx.state);
      return;
    }

    if (this.isPlaying) return;

    this.isPlaying = true;
    this.startTime = this.ctx.currentTime - this.pauseOffset;

    // Start AudioBuffer Sources for loaded stems
    this._startBufferSources(this.pauseOffset);

    this._notifyStateChange();
    this._startPlaybackLoop();
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.pauseOffset = Math.max(0, Math.min(this.currentTime, this.duration));
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this._stopBufferSources();
    this._notifyStateChange();
  }

  seek(seconds) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this._stopBufferSources();
    }

    this.pauseOffset = Math.max(0, Math.min(seconds, this.duration));
    this.currentTime = this.pauseOffset;
    
    if (wasPlaying) {
      this.startTime = this.ctx.currentTime - this.pauseOffset;
      this._startBufferSources(this.pauseOffset);
    }
    
    this._notifyTimeUpdate();
  }

  _startBufferSources(offsetSeconds) {
    if (!this.ctx) return;
    Object.keys(this.channels).forEach(id => {
      const ch = this.channels[id];
      if (ch.audioBuffer) {
        if (ch.bufferSource) {
          try { ch.bufferSource.stop(); } catch (e) {}
        }
        if (offsetSeconds < ch.audioBuffer.duration) {
          const source = this.ctx.createBufferSource();
          source.buffer = ch.audioBuffer;
          source.connect(ch.gainNode);
          source.start(0, offsetSeconds);
          ch.bufferSource = source;
        }
      }
    });
  }

  _stopBufferSources() {
    Object.values(this.channels).forEach(ch => {
      if (ch.bufferSource) {
        try { ch.bufferSource.stop(); } catch (e) {}
        ch.bufferSource = null;
      }
    });
  }

  setTrackVolume(trackId, volume) {
    if (!this.channels[trackId]) return;
    this.channels[trackId].volume = volume;
    if (trackId === 'pad') {
      try {
        localStorage.setItem('songplay_pad_vol', volume);
      } catch (e) {}
    }
    this._updateChannelGains();
  }

  toggleMute(trackId) {
    if (!this.channels[trackId]) return;
    this.channels[trackId].isMuted = !this.channels[trackId].isMuted;
    this._updateChannelGains();
  }

  toggleSolo(trackId) {
    if (!this.channels[trackId]) return;
    this.channels[trackId].isSolo = !this.channels[trackId].isSolo;
    
    // Check if any solo is active
    this.soloActive = Object.values(this.channels).some(ch => ch.isSolo);
    this._updateChannelGains();
  }

  setSongMasterVolume(volume) {
    if (this.songMasterGain) {
      this.songMasterGain.gain.value = volume;
    }
  }

  setMasterVolume(volume) {
    this.setSongMasterVolume(volume);
  }

  setGlobalMasterVolume(volume) {
    if (this.globalMasterGain) {
      this.globalMasterGain.gain.value = volume;
      try {
        localStorage.setItem('songplay_global_master_vol', volume);
      } catch (e) {}
    }
  }

  fadeIn(durationSeconds = 2.5) {
    if (!this.ctx || !this.songMasterGain) return;
    const now = this.ctx.currentTime;
    const targetVol = (this.savedMasterGainValue !== undefined) ? this.savedMasterGainValue : (this.songMasterGain.gain.value > 0.05 ? this.songMasterGain.gain.value : 0.9);

    this.songMasterGain.gain.cancelScheduledValues(now);
    this.songMasterGain.gain.setValueAtTime(0, now);

    if (!this.isPlaying) {
      this.play();
    }

    this.songMasterGain.gain.linearRampToValueAtTime(targetVol, now + durationSeconds);
  }

  async fadeOut(durationSeconds = 2.5) {
    if (!this.ctx || !this.songMasterGain || !this.isPlaying) return;
    const now = this.ctx.currentTime;
    const currentVol = this.songMasterGain.gain.value > 0.05 ? this.songMasterGain.gain.value : 0.9;
    this.savedMasterGainValue = currentVol;

    this.songMasterGain.gain.cancelScheduledValues(now);
    this.songMasterGain.gain.setValueAtTime(currentVol, now);
    this.songMasterGain.gain.linearRampToValueAtTime(0, now + durationSeconds);

    return new Promise((resolve) => {
      // Wait durationSeconds + 50ms safety buffer so volume reaches complete zero before stopping sources
      setTimeout(() => {
        if (this.isPlaying) {
          this.pause();
        }
        if (this.ctx && this.songMasterGain) {
          this.songMasterGain.gain.cancelScheduledValues(this.ctx.currentTime);
          this.songMasterGain.gain.setValueAtTime(currentVol, this.ctx.currentTime);
        }
        resolve();
      }, (durationSeconds + 0.05) * 1000);
    });
  }



  getMixState() {
    const channelsState = {};
    Object.keys(this.channels).forEach(trackId => {
      if (trackId === 'pad') return; // Exclude independent pad from per-song mixState
      const ch = this.channels[trackId];
      channelsState[trackId] = {
        volume: ch.volume,
        isMuted: ch.isMuted,
        isSolo: ch.isSolo,
      };
    });
    return {
      channels: channelsState,
      songMasterVolume: this.songMasterGain ? this.songMasterGain.gain.value : 0.9,
    };
  }

  applyMixState(mixState) {
    if (!mixState) return;

    if (mixState.channels) {
      Object.keys(mixState.channels).forEach(trackId => {
        if (trackId === 'pad') return; // Do NOT overwrite Pad volume on song change!
        if (this.channels[trackId]) {
          const state = mixState.channels[trackId];
          if (typeof state.volume === 'number') this.channels[trackId].volume = state.volume;
          if (typeof state.isMuted === 'boolean') this.channels[trackId].isMuted = state.isMuted;
          if (typeof state.isSolo === 'boolean') this.channels[trackId].isSolo = state.isSolo;
        }
      });
    }


    this.soloActive = Object.values(this.channels).some(ch => ch.isSolo);
    this._updateChannelGains();

    const songVol = typeof mixState.songMasterVolume === 'number'
      ? mixState.songMasterVolume
      : (typeof mixState.masterVolume === 'number' ? mixState.masterVolume : 0.9);

    if (this.songMasterGain) {
      this.songMasterGain.gain.value = songVol;
    }
  }

  onTimeUpdate(callback) {
    this.onTimeUpdateCallbacks.push(callback);
  }

  getChannelMeterLevel(trackId) {
    if (!this.channels[trackId] || !this.isPlaying) return 0;
    const analyser = this.channels[trackId].analyserNode;

    // Use time-domain RMS for accurate level metering across all frequencies
    const dataArray = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    // rms is 0.0–1.0; scale to 0–100 with some headroom
    return Math.min(100, Math.round(rms * 300));
  }

  getMasterMeterLevel() {
    if (!this.masterAnalyser || !this.isPlaying) return 0;

    const dataArray = new Float32Array(this.masterAnalyser.fftSize);
    this.masterAnalyser.getFloatTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    return Math.min(100, Math.round(rms * 300));
  }

  _updateChannelGains() {
    Object.keys(this.channels).forEach(id => {
      const ch = this.channels[id];
      if (ch.isMuted) {
        ch.gainNode.gain.value = 0;
      } else if (this.soloActive) {
        ch.gainNode.gain.value = ch.isSolo ? ch.volume : 0;
      } else {
        ch.gainNode.gain.value = ch.volume;
      }
    });
  }

  _startPlaybackLoop() {
    const loop = () => {
      if (!this.isPlaying) return;
      this.currentTime = this.ctx.currentTime - this.startTime;

      if (this.currentTime >= this.duration) {
        this.pause();
        this.seek(0);
        return;
      }

      this._triggerSyntheticSoundEvents(this.currentTime);
      this._notifyTimeUpdate();
      this.animationFrame = requestAnimationFrame(loop);
    };
    this.animationFrame = requestAnimationFrame(loop);
  }

  _notifyTimeUpdate() {
    this.onTimeUpdateCallbacks.forEach(cb => cb(this.currentTime));
  }

  /* Synthetic Web Audio sound generator for Demo Playback */
  _startSyntheticAudioGenerators() {
    this.lastBeatTriggered = -1;
  }

  _triggerSyntheticSoundEvents(time) {
    if (!this.ctx) return;
    if (this.hasLoadedBuffers()) return; // Don't overlay synthetic audio if real stems are loaded!
    const secondsPerBeat = 60 / this.bpm;
    const currentBeat = Math.floor(time / secondsPerBeat);

    if (currentBeat !== this.lastBeatTriggered) {
      this.lastBeatTriggered = currentBeat;
      const beatInMeasure = (currentBeat % 4) + 1;

      // 1. Click Track trigger
      if (!this.channels.click.isMuted && (!this.soloActive || this.channels.click.isSolo)) {
        this._playClickSound(beatInMeasure === 1);
      }

      // 2. Drums trigger
      if (!this.channels.drums.isMuted && (!this.soloActive || this.channels.drums.isSolo)) {
        this._playDrumBeat(beatInMeasure);
      }

      // 3. Bass synth line
      if (!this.channels.bass.isMuted && (!this.soloActive || this.channels.bass.isSolo)) {
        this._playBassTone(beatInMeasure);
      }

      // 4. Guitar & Keys arpeggios
      if (!this.channels.keys.isMuted && (!this.soloActive || this.channels.keys.isSolo)) {
        this._playKeysChord(beatInMeasure);
      }
    }
  }

  _playClickSound(isAccent) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = isAccent ? 1200 : 800;

    gain.gain.setValueAtTime(this.channels.click.volume * 0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(this.channels.click.gainNode);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  _playDrumBeat(beat) {
    const time = this.ctx.currentTime;
    const vol = this.channels.drums.volume * 0.3;

    if (beat === 1 || beat === 3) {
      // Kick drum
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(130, time);
      osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.12);
      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
      osc.connect(gain);
      gain.connect(this.channels.drums.gainNode);
      osc.start(time);
      osc.stop(time + 0.12);
    } else {
      // Snare drum
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(250, time);
      gain.gain.setValueAtTime(vol * 0.7, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
      osc.connect(gain);
      gain.connect(this.channels.drums.gainNode);
      osc.start(time);
      osc.stop(time + 0.1);
    }
  }

  _playBassTone(beat) {
    if (beat !== 1 && beat !== 3) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 65.41; // C2 tone

    gain.gain.setValueAtTime(this.channels.bass.volume * 0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

    osc.connect(gain);
    gain.connect(this.channels.bass.gainNode);
    osc.start(time);
    osc.stop(time + 0.4);
  }

  _playKeysChord(beat) {
    const time = this.ctx.currentTime;
    const freqs = [261.63, 329.63, 392.00]; // C Major chord
    freqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(this.channels.keys.volume * 0.15, time + (idx * 0.05));
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

      osc.connect(gain);
      gain.connect(this.channels.keys.gainNode);
      osc.start(time + (idx * 0.05));
      osc.stop(time + 0.35);
    });
  }
}
