export class WaveformTimeline {
  constructor(canvasElement, audioEngine) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.audioEngine = audioEngine;
    this.sections = [];
    this.midiCues = [];
    this.queuedSection = null;
    this.onSectionClickCallback = null;

    this._setupEvents();
  }

  setSections(sections) {
    this.sections = sections;
    this.render();
  }

  setMidiCues(cues) {
    this.midiCues = cues;
    this.render();
  }

  setQueuedSection(sec) {
    this.queuedSection = sec;
  }

  onSectionClick(cb) {
    this.onSectionClickCallback = cb;
  }

  render() {
    if (!this.canvas) return;

    // Resize canvas resolution to match display size
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    const duration = this.audioEngine.duration || 1;
    const currentTime = this.audioEngine.currentTime || 0;

    // Clear background
    this.ctx.fillStyle = '#08090c';
    this.ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    this.ctx.strokeStyle = '#1a202c';
    this.ctx.lineWidth = 1;
    const step = width / 16;
    for (let x = 0; x < width; x += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
      this.ctx.stroke();
    }

    // Draw Section Blocks + Labels
    this.sections.forEach(sec => {
      const startX = (sec.startTime / duration) * width;
      const endX = (sec.endTime / duration) * width;
      const secWidth = endX - startX;

      // Section tint (slightly more opaque for clickability hint)
      this.ctx.fillStyle = sec.color + '33';
      this.ctx.fillRect(startX, 0, secWidth, height);

      // Section boundary line
      this.ctx.strokeStyle = sec.color + 'aa';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(startX, 0);
      this.ctx.lineTo(startX, height);
      this.ctx.stroke();

      // Section label pill at top of block
      const labelPadX = 6;
      const labelPadY = 4;
      const labelHeight = 18;
      const fontSize = 11;

      this.ctx.font = `700 ${fontSize}px "Inter", sans-serif`;
      const textWidth = this.ctx.measureText(sec.label).width;
      const pillWidth = Math.min(textWidth + labelPadX * 2, secWidth - 4);

      if (pillWidth > 16) {
        // Pill background
        this.ctx.fillStyle = sec.color + 'cc';
        this._roundRect(startX + 2, labelPadY, pillWidth, labelHeight, 4);
        this.ctx.fill();

        // Pill label text
        this.ctx.fillStyle = '#fff';
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(
          sec.label,
          startX + 2 + labelPadX,
          labelPadY + labelHeight / 2,
          pillWidth - labelPadX * 2
        );
      }
    });

    // Draw Waveform Bars
    const barCount = 120;
    const barWidth = width / barCount;

    for (let i = 0; i < barCount; i++) {
      const barX = i * barWidth;
      const progressRatio = barX / width;
      const isPlayed = progressRatio <= (currentTime / duration);

      const amp = Math.sin(i * 0.15) * 0.4 + Math.cos(i * 0.08) * 0.3 + 0.35;
      const barHeight = Math.max(8, amp * (height * 0.75));
      const barY = (height - barHeight) / 2;

      this.ctx.fillStyle = isPlayed ? '#00e676' : '#2b3345';
      this.ctx.fillRect(barX + 1, barY, barWidth - 2, barHeight);
    }

    // Draw MIDI Cue dots
    this.midiCues.forEach(cue => {
      const cueX = (cue.time / duration) * width;
      this.ctx.fillStyle = '#ff9100';
      this.ctx.beginPath();
      this.ctx.arc(cueX, height - 10, 4, 0, Math.PI * 2);
      this.ctx.fill();
    });

    // Draw Queued Section — pulsing white outline
    if (this.queuedSection) {
      const sec = this.queuedSection;
      const startX = (sec.startTime / duration) * width;
      const endX = (sec.endTime / duration) * width;
      const secWidth = endX - startX;

      // Pulse using time: opacity oscillates between 0.15 and 1.0
      const pulse = (Math.sin(Date.now() / 300) + 1) / 2; // 0..1
      const alpha = Math.round((0.15 + pulse * 0.85) * 255).toString(16).padStart(2, '0');

      this.ctx.strokeStyle = `#ffffff${alpha}`;
      this.ctx.lineWidth = 2.5;
      this.ctx.setLineDash([]);
      this.ctx.shadowColor = '#ffffff';
      this.ctx.shadowBlur = pulse * 10;
      this.ctx.strokeRect(startX + 1.5, 1.5, secWidth - 3, height - 3);
      this.ctx.shadowBlur = 0;
    }

    // Draw active section top bar highlight
    const activeSec = this.sections.find(s => currentTime >= s.startTime && currentTime <= s.endTime);
    if (activeSec) {
      const startX = (activeSec.startTime / duration) * width;
      const endX = (activeSec.endTime / duration) * width;
      this.ctx.fillStyle = activeSec.color + '55';
      this.ctx.fillRect(startX, 0, endX - startX, 3);
    }

    // Draw Playhead Line
    const playheadX = (currentTime / duration) * width;
    this.ctx.shadowColor = '#00e676';
    this.ctx.shadowBlur = 8;
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(playheadX, 0);
    this.ctx.lineTo(playheadX, height);
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  // Helper: draw a rounded rect path
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
    let isDragging = false;

    const handleInteraction = (e, isDrag) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      const targetTime = ratio * this.audioEngine.duration;

      if (isDrag) {
        // During drag scrub — always seek immediately
        this.audioEngine.seek(targetTime);
        return;
      }

      // On click: check if hit a section block
      const clickedSection = this.sections.find(
        sec => targetTime >= sec.startTime && targetTime <= sec.endTime
      );

      if (clickedSection && this.onSectionClickCallback) {
        // Let main.js decide: queued or immediate based on play state + shift key
        this.onSectionClickCallback(clickedSection, e.shiftKey);
      } else {
        // Clicked outside any section — immediate seek
        this.audioEngine.seek(targetTime);
      }
    };

    this.canvas.addEventListener('mousedown', (e) => {
      isDragging = false;
      handleInteraction(e, false);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (e.buttons === 1) {
        isDragging = true;
        handleInteraction(e, true);
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Touch support
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleInteraction({ clientX: touch.clientX, shiftKey: false }, false);
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleInteraction({ clientX: touch.clientX, shiftKey: false }, true);
    }, { passive: false });
  }
}
