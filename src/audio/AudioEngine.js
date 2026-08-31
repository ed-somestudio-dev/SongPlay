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
    this.animationFrame = null;
    this.startTime = 0;
    this.pauseOffset = 0;

    // Default tracks list
    this.trackNames = [
      { id: 'click', label: 'Click', defaultVol: 0.8 },
      { id: 'guide', label: 'Guia', defaultVol: 0.7 },
      { id: 'drums', label: 'Bateria', defaultVol: 0.85 },
      { id: 'bass', label: 'Baixo', defaultVol: 0.8 },
      { id: 'guitar1', label: 'Guitar 1', defaultVol: 0.75 },
      { id: 'guitar2', label: 'Guitar 2', defaultVol: 0.7 },
      { id: 'keys', label: 'Teclas', defaultVol: 0.8 },
      { id: 'pad', label: 'Pad Track', defaultVol: 0.65 }
    ];
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.9;
    this.masterGain.connect(this.ctx.destination);

    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 64;
    this.masterGain.connect(this.masterAnalyser);

    // Setup channel nodes
    this.trackNames.forEach(track => {
      const gainNode = this.ctx.createGain();
      gainNode.gain.value = track.defaultVol;

      const analyserNode = this.ctx.createAnalyser();
      analyserNode.fftSize = 64;

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

    this._startSyntheticAudioGenerators();
  }

  async decodeFile(file) {
    if (!this.ctx) this.init();
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

  play() {
    if (!this.ctx) this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.startTime = this.ctx.currentTime - this.pauseOffset;

    // Start AudioBuffer Sources for loaded stems
    this._startBufferSources(this.pauseOffset);

    this._startPlaybackLoop();
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.pauseOffset = this.ctx.currentTime - this.startTime;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    this._stopBufferSources();
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

  setMasterVolume(volume) {
    if (this.masterGain) {
      this.masterGain.gain.value = volume;
    }
  }

  onTimeUpdate(callback) {
    this.onTimeUpdateCallbacks.push(callback);
  }

  getChannelMeterLevel(trackId) {
    if (!this.channels[trackId] || !this.isPlaying) return 0;
    const analyser = this.channels[trackId].analyserNode;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const avg = sum / dataArray.length;
    // Scale 0 - 100
    return Math.min(100, Math.round((avg / 128) * 100));
  }

  getMasterMeterLevel() {
    if (!this.masterAnalyser || !this.isPlaying) return 0;
    const dataArray = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    return Math.min(100, Math.round((sum / dataArray.length / 128) * 100));
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
        this.seek(0);
        this.pause();
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
