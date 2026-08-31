export class WaveformTimeline {
  constructor(canvasElement, audioEngine) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.audioEngine = audioEngine;
    this.sections = [];
    this.midiCues = [];
    this.queuedSection = null;
    this.loopedSection = null;
    this.onSectionClickCallback = null;
    this.onSectionLoopToggleCallback = null;

    this.cachedPeaks = null;
    this.cachedPeaksCount = 0;
    this.lastBufferStateKey = '';

    this._loopIconAreas = [];
    this._setupEvents();
  }

  setSections(sections) {
    this.sections = sections;
    this.invalidatePeaks();
    this.render();
  }

  setMidiCues(cues) {
    this.midiCues = cues;
    this.render();
  }

  setQueuedSection(sec) {
    this.queuedSection = sec;
  }

  setLoopedSection(sec) {
    this.loopedSection = sec;
  }

  onSectionClick(cb) {
    this.onSectionClickCallback = cb;
  }

  onSectionLoopToggle(cb) {
    this.onSectionLoopToggleCallback = cb;
  }

  invalidatePeaks() {
    this.cachedPeaks = null;
  }

  /**
   * Extract real PCM audio peaks from loaded AudioBuffers,
   * or generate realistic section-based multitrack waveform peaks for demo songs.
   */
  _getOrComputePeaks(numBars) {
    // Generate cache key based on loaded buffers
    const bufferKey = Object.entries(this.audioEngine.channels || {})
      .map(([id, ch]) => `${id}:${ch.audioBuffer ? ch.audioBuffer.length : 0}`)
      .join('|') + `_${this.sections.length}_${numBars}`;

    if (this.cachedPeaks && this.lastBufferStateKey === bufferKey && this.cachedPeaksCount === numBars) {
      return this.cachedPeaks;
    }

    this.lastBufferStateKey = bufferKey;
    this.cachedPeaksCount = numBars;

    // Check if any channel has a real AudioBuffer loaded
    const loadedChannels = Object.values(this.audioEngine.channels || {})
      .filter(ch => ch.audioBuffer && ch.audioBuffer.length > 0);

    const peaks = new Float32Array(numBars);

    if (loadedChannels.length > 0) {
      // ── REAL AUDIO WAVEFORM EXTRACTION ─────────────────────────────────────
      for (const ch of loadedChannels) {
        const buffer = ch.audioBuffer;
        const pcm = buffer.getChannelData(0);
        const step = Math.floor(pcm.length / numBars);

        for (let i = 0; i < numBars; i++) {
          const start = i * step;
          const end = Math.min(start + step, pcm.length);
          let maxVal = 0;

          // Find peak amplitude in bucket
          for (let j = start; j < end; j += 4) { // stride of 4 for fast computation
            const abs = Math.abs(pcm[j]);
            if (abs > maxVal) maxVal = abs;
          }

          peaks[i] = Math.max(peaks[i], maxVal);
        }
      }

      // Normalize real peaks so highest peak is ~0.95
      let maxPeak = 0;
      for (let i = 0; i < numBars; i++) {
        if (peaks[i] > maxPeak) maxPeak = peaks[i];
      }
      if (maxPeak > 0) {
        for (let i = 0; i < numBars; i++) {
          peaks[i] = Math.min(1.0, peaks[i] / maxPeak);
        }
      }
    } else {
      // ── REALISTIC MULTITRACK DEMO WAVEFORM GENERATION ──────────────────────
      const totalDuration = this.audioEngine.duration || 278;

      for (let i = 0; i < numBars; i++) {
        const barTime = (i / numBars) * totalDuration;

        // Find which section this bar belongs to
        const currentSec = this.sections.find(s => barTime >= s.startTime && barTime <= s.endTime);

        let sectionEnergy = 0.5; // Default energy
        if (currentSec) {
          const label = currentSec.label.toLowerCase();
          if (label.includes('intro')) sectionEnergy = 0.38;
          else if (label.includes('verso') || label.includes('verse')) sectionEnergy = 0.55;
          else if (label.includes('refr') || label.includes('chorus')) sectionEnergy = 0.92;
          else if (label.includes('ponte') || label.includes('bridge')) sectionEnergy = 0.68;
          else if (label.includes('outro') || label.includes('coda')) sectionEnergy = 0.30;
          else if (label.includes('pré') || label.includes('pre')) sectionEnergy = 0.75;
          else if (label.includes('solo')) sectionEnergy = 0.88;
        }

        // Add organic micro-variations (snare/kick dynamics + harmonics)
        const beatPulse = Math.pow(Math.abs(Math.sin((i * Math.PI * 8) / (numBars / 16))), 2.5) * 0.25;
        const subDynamic = Math.sin(i * 0.35) * 0.12 + Math.cos(i * 0.8) * 0.08;
        const noise = (Math.sin(i * 999) * 0.5 + 0.5) * 0.08;

        const val = Math.max(0.12, Math.min(0.98, sectionEnergy * (0.65 + subDynamic + beatPulse + noise)));
        peaks[i] = val;
      }
    }

    this.cachedPeaks = peaks;
    return peaks;
  }

  // Abbreviate section labels: "Verso 1" → "V1", "Refrão" → "Rf", etc.
  _abbrevLabel(label) {
    const map = [
      [/^verso/i,    'V'],
      [/^refrão/i,   'Rf'],
      [/^refrao/i,   'Rf'],
      [/^chorus/i,   'Ch'],
      [/^intro/i,    'I'],
      [/^ponte/i,    'P'],
      [/^bridge/i,   'Br'],
      [/^outro/i,    'O'],
      [/^coda/i,     'C'],
      [/^pre.refr/i, 'PR'],
      [/^pré.refr/i, 'PR'],
      [/^verse/i,    'V'],
      [/^tag/i,      'T'],
    ];

    const parts = label.trim().split(/\s+/);
    const num = parts.length > 1 ? parts[parts.length - 1] : '';

    for (const [rx, abbrev] of map) {
      if (rx.test(label)) return abbrev + num;
    }

    return label.substring(0, 2).toUpperCase() + num;
  }

  // Draw loop icon centered at cx, cy with radius r
  _drawLoopIcon(cx, cy, r, active, alpha = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = active ? '#00e676' : 'rgba(255,255,255,0.7)';
    ctx.fillStyle = active ? '#00e676' : 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;

    const startAngle = -Math.PI * 0.75;
    const endAngle   =  Math.PI * 0.75;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.stroke();

    const arrowTip = {
      x: cx + Math.cos(endAngle) * r,
      y: cy + Math.sin(endAngle) * r,
    };
    const arrowAngle = endAngle + Math.PI / 2;
    const as = 3.5;
    ctx.beginPath();
    ctx.moveTo(arrowTip.x, arrowTip.y);
    ctx.lineTo(
      arrowTip.x + Math.cos(arrowAngle - 0.5) * as,
      arrowTip.y + Math.sin(arrowAngle - 0.5) * as
    );
    ctx.lineTo(
      arrowTip.x + Math.cos(arrowAngle + 0.5) * as,
      arrowTip.y + Math.sin(arrowAngle + 0.5) * as
    );
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  render() {
    if (!this.canvas) return;

    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.invalidatePeaks();
    }

    const duration = this.audioEngine.duration || 1;
    const currentTime = this.audioEngine.currentTime || 0;
    this._loopIconAreas = [];

    // ── 1. Background ───────────────────────────────────────────────────────
    this.ctx.fillStyle = '#08090c';
    this.ctx.fillRect(0, 0, width, height);

    // ── 2. Grid lines ───────────────────────────────────────────────────────
    this.ctx.strokeStyle = '#1a202c';
    this.ctx.lineWidth = 1;
    const step = width / 16;
    for (let x = 0; x < width; x += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
      this.ctx.stroke();
    }

    // ── 3. Waveform Bars (REAL AUDIO / MULTITRACK DYNAMICS — drawn FIRST) ──
    const barCount = Math.max(120, Math.floor(width / 3.5)); // High density Playback style bars
    const barWidth = width / barCount;
    const peaks = this._getOrComputePeaks(barCount);

    for (let i = 0; i < barCount; i++) {
      const barX = i * barWidth;
      const progressRatio = barX / width;
      const isPlayed = progressRatio <= (currentTime / duration);
      const amp = peaks[i] || 0.1;

      // Realistic Playback style mirrored waveform bar height
      const barHeight = Math.max(6, amp * (height * 0.72));
      const barY = (height - barHeight) / 2;

      this.ctx.fillStyle = isPlayed ? '#00e676' : '#2b3345';
      this.ctx.fillRect(barX + 0.5, barY, Math.max(1, barWidth - 1.5), barHeight);
    }

    // ── 4. Section color tints + boundary lines (over waveform) ─────────────
    this.sections.forEach(sec => {
      const startX = (sec.startTime / duration) * width;
      const endX   = (sec.endTime   / duration) * width;
      const secWidth = endX - startX;

      // Section tint overlay
      this.ctx.fillStyle = sec.color + '44';
      this.ctx.fillRect(startX, 0, secWidth, height);

      // Left boundary line
      this.ctx.strokeStyle = sec.color + 'cc';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([]);
      this.ctx.beginPath();
      this.ctx.moveTo(startX, 0);
      this.ctx.lineTo(startX, height);
      this.ctx.stroke();
    });

    // ── 5. Section labels + loop icons (topmost, clear text) ────────────────
    const LABEL_H = 20;
    const LABEL_PAD_X = 6;
    const LABEL_PAD_Y = 4;
    const LOOP_R  = 7;
    const LOOP_MARGIN = 14;

    this.ctx.textBaseline = 'middle';
    this.ctx.textAlign = 'left';

    this.sections.forEach(sec => {
      const startX  = (sec.startTime / duration) * width;
      const endX    = (sec.endTime   / duration) * width;
      const secWidth = endX - startX;

      // Loop icon area (top-right corner of section)
      const loopIconCX = endX - LOOP_R - LOOP_MARGIN;
      const loopIconCY = LABEL_PAD_Y + LABEL_H / 2;
      const isLooped = this.loopedSection && this.loopedSection.label === sec.label;

      if (secWidth > (LOOP_R + LOOP_MARGIN) * 2) {
        this._drawLoopIcon(loopIconCX, loopIconCY, LOOP_R, isLooped, isLooped ? 1 : 0.55);
        this._loopIconAreas.push({
          x: loopIconCX - LOOP_R - 3,
          y: loopIconCY - LOOP_R - 3,
          w: (LOOP_R + 3) * 2,
          h: (LOOP_R + 3) * 2,
          sec,
        });
      }

      // Section label pill
      const abbrev = this._abbrevLabel(sec.label);
      const fontSize = 11;
      this.ctx.font = `700 ${fontSize}px "Inter", sans-serif`;
      const abbrevW = this.ctx.measureText(abbrev).width;
      const pillW = Math.min(abbrevW + LABEL_PAD_X * 2, secWidth - (LOOP_R * 2 + LOOP_MARGIN * 2) - 6);

      if (pillW > 10) {
        this.ctx.fillStyle = sec.color + 'dd';
        this._roundRect(startX + 2, LABEL_PAD_Y, pillW, LABEL_H, 4);
        this.ctx.fill();

        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(
          abbrev,
          startX + 2 + LABEL_PAD_X,
          LABEL_PAD_Y + LABEL_H / 2,
          pillW - LABEL_PAD_X * 2
        );
      }
    });

    // ── 6. MIDI Cue dots ────────────────────────────────────────────────────
    this.midiCues.forEach(cue => {
      const cueX = (cue.time / duration) * width;
      this.ctx.fillStyle = '#ff9100';
      this.ctx.beginPath();
      this.ctx.arc(cueX, height - 10, 4, 0, Math.PI * 2);
      this.ctx.fill();
    });

    // ── 7. Queued section — pulsing white outline ───────────────────────────
    if (this.queuedSection) {
      const sec    = this.queuedSection;
      const startX = (sec.startTime / duration) * width;
      const endX   = (sec.endTime   / duration) * width;
      const secWidth = endX - startX;

      const pulse = (Math.sin(Date.now() / 300) + 1) / 2;
      const alpha = Math.round((0.2 + pulse * 0.8) * 255).toString(16).padStart(2, '0');

      this.ctx.strokeStyle = `#ffffff${alpha}`;
      this.ctx.lineWidth = 2.5;
      this.ctx.setLineDash([]);
      this.ctx.shadowColor = '#ffffff';
      this.ctx.shadowBlur = pulse * 12;
      this.ctx.strokeRect(startX + 1.5, 1.5, secWidth - 3, height - 3);
      this.ctx.shadowBlur = 0;
    }

    // ── 8. Looped section — green dashed outline ────────────────────────────
    if (this.loopedSection) {
      const sec    = this.loopedSection;
      const startX = (sec.startTime / duration) * width;
      const endX   = (sec.endTime   / duration) * width;
      const secWidth = endX - startX;

      this.ctx.strokeStyle = '#00e676cc';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 4]);
      this.ctx.strokeRect(startX + 2, 2, secWidth - 4, height - 4);
      this.ctx.setLineDash([]);
    }

    // ── 9. Active section — top color bar ──────────────────────────────────
    const activeSec = this.sections.find(s => currentTime >= s.startTime && currentTime <= s.endTime);
    if (activeSec) {
      const startX = (activeSec.startTime / duration) * width;
      const endX   = (activeSec.endTime   / duration) * width;
      this.ctx.fillStyle = activeSec.color + '88';
      this.ctx.fillRect(startX, 0, endX - startX, 3);
    }

    // ── 10. Playhead ────────────────────────────────────────────────────────
    const playheadX = (currentTime / duration) * width;
    this.ctx.shadowColor = '#00e676';
    this.ctx.shadowBlur = 8;
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([]);
    this.ctx.beginPath();
    this.ctx.moveTo(playheadX, 0);
    this.ctx.lineTo(playheadX, height);
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  _roundRect(x, y, w, h, r) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  _setupEvents() {
    const getTimeFromEvent = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      return ratio * this.audioEngine.duration;
    };

    const getCanvasPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    this.canvas.addEventListener('mousedown', (e) => {
      const targetTime = getTimeFromEvent(e);
      const pos = getCanvasPos(e);

      // 1. Check loop icon hit first
      const loopHit = this._loopIconAreas.find(
        area => pos.x >= area.x && pos.x <= area.x + area.w &&
                pos.y >= area.y && pos.y <= area.y + area.h
      );
      if (loopHit) {
        if (this.onSectionLoopToggleCallback) {
          this.onSectionLoopToggleCallback(loopHit.sec);
        }
        return;
      }

      // 2. Check section block click
      const clickedSection = this.sections.find(
        sec => targetTime >= sec.startTime && targetTime <= sec.endTime
      );
      if (clickedSection && this.onSectionClickCallback) {
        this.onSectionClickCallback(clickedSection, e.shiftKey);
      } else {
        // 3. Free click seek outside sections
        this.audioEngine.seek(targetTime);
      }
    });

    // Touch support (tap only)
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const pos = getCanvasPos({ clientX: touch.clientX, clientY: touch.clientY });

      const loopHit = this._loopIconAreas.find(
        area => pos.x >= area.x && pos.x <= area.x + area.w &&
                pos.y >= area.y && pos.y <= area.y + area.h
      );
      if (loopHit) {
        if (this.onSectionLoopToggleCallback) {
          this.onSectionLoopToggleCallback(loopHit.sec);
        }
        return;
      }

      const targetTime = getTimeFromEvent({ clientX: touch.clientX });
      const clickedSection = this.sections.find(
        sec => targetTime >= sec.startTime && targetTime <= sec.endTime
      );
      if (clickedSection && this.onSectionClickCallback) {
        this.onSectionClickCallback(clickedSection, false);
      } else {
        this.audioEngine.seek(targetTime);
      }
    }, { passive: false });
  }
}
