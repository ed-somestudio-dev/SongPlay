export class WaveformTimeline {
  constructor(canvasElement, audioEngine) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.audioEngine = audioEngine;
    this.sections = [];
    this.midiCues = [];
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

    // Draw Section Blocks
    this.sections.forEach(sec => {
      const startX = (sec.startTime / duration) * width;
      const endX = (sec.endTime / duration) * width;
      const secWidth = endX - startX;

      // Section subtle tint
      this.ctx.fillStyle = sec.color + '22'; // 13% opacity
      this.ctx.fillRect(startX, 0, secWidth, height);

      // Section boundary line
      this.ctx.strokeStyle = sec.color + '88';
      this.ctx.beginPath();
      this.ctx.moveTo(startX, 0);
      this.ctx.lineTo(startX, height);
      this.ctx.stroke();
    });

    // Draw Waveform Bars
    const barCount = 120;
    const barWidth = width / barCount;

    for (let i = 0; i < barCount; i++) {
      const barX = i * barWidth;
      const progressRatio = barX / width;
      const isPlayed = progressRatio <= (currentTime / duration);

      // Simulated amplitude peak
      const amp = Math.sin(i * 0.15) * 0.4 + Math.cos(i * 0.08) * 0.3 + 0.35;
      const barHeight = Math.max(8, amp * (height * 0.75));
      const barY = (height - barHeight) / 2;

      this.ctx.fillStyle = isPlayed ? '#00e676' : '#2b3345';
      this.ctx.fillRect(barX + 1, barY, barWidth - 2, barHeight);
    }

    // Draw MIDI Cue Flags
    this.midiCues.forEach(cue => {
      const cueX = (cue.time / duration) * width;
      this.ctx.fillStyle = '#ff9100';
      this.ctx.beginPath();
      this.ctx.arc(cueX, height - 10, 4, 0, Math.PI * 2);
      this.ctx.fill();
    });

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

  _setupEvents() {
    let isDragging = false;

    const handleScrub = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      const targetTime = ratio * this.audioEngine.duration;
      this.audioEngine.seek(targetTime);

      // Check if clicked inside a section
      const clickedSection = this.sections.find(sec => targetTime >= sec.startTime && targetTime <= sec.endTime);
      if (clickedSection && this.onSectionClickCallback) {
        this.onSectionClickCallback(clickedSection);
      }
    };

    this.canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      handleScrub(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) handleScrub(e);
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }
}
