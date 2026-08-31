export class ChordSyncViewer {
  constructor(containerElement) {
    this.container = containerElement;
    this.currentSong = null;
    this.activeSectionLabel = null;
    this.transposeOffset = 0;
    this.displayMode = 'chords'; // 'chords' or 'lyrics'
    this.fontScale = 1.0; // 0.7 .. 2.5
  }

  setSong(song) {
    this.currentSong = song;
    this.render();
  }

  setDisplayMode(mode) {
    this.displayMode = mode;
    this.render();
  }

  zoomIn() {
    this.fontScale = Math.min(2.5, +(this.fontScale + 0.15).toFixed(2));
    this.render();
  }

  zoomOut() {
    this.fontScale = Math.max(0.7, +(this.fontScale - 0.15).toFixed(2));
    this.render();
  }

  updateActiveSection(sectionLabel) {
    if (this.activeSectionLabel === sectionLabel) return;
    this.activeSectionLabel = sectionLabel;

    if (!this.container) return;
    const blocks = this.container.querySelectorAll('.chord-section-block');
    blocks.forEach(block => {
      if (block.dataset.section === sectionLabel) {
        block.classList.add('active-block');
        block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        block.classList.remove('active-block');
      }
    });
  }

  render() {
    if (!this.container || !this.currentSong) return;

    const contentArea = this.container.querySelector('.chord-content');
    if (!contentArea) return;

    contentArea.innerHTML = '';
    contentArea.style.setProperty('--chord-font-scale', this.fontScale);

    const titleSpan = this.container.querySelector('.panel-title span');
    if (titleSpan) {
      titleSpan.innerHTML = this.displayMode === 'lyrics'
        ? '&#x1F3A4; Letras Sincronizadas'
        : '&#x1F3B6; Cifras Sincronizadas';
    }

    if (!this.currentSong.chords) {
      contentArea.innerHTML = `<div class="lyric-line" style="color: var(--text-muted);">Sem conteúdo disponível para esta música.</div>`;
      return;
    }

    this.currentSong.chords.forEach(chBlock => {
      const blockEl = document.createElement('div');
      blockEl.className = `chord-section-block ${chBlock.section === this.activeSectionLabel ? 'active-block' : ''}`;
      blockEl.dataset.section = chBlock.section;

      let html = `<div class="block-title">${chBlock.section}</div>`;
      chBlock.lines.forEach(line => {
        if (this.displayMode === 'chords' && line.chord) {
          html += `<div class="chord-line">${this._transposeChordLine(line.chord, this.transposeOffset)}</div>`;
        }
        if (line.lyric) {
          const isLyricsOnly = this.displayMode === 'lyrics';
          html += `<div class="lyric-line ${isLyricsOnly ? 'large-lyric' : ''}">${line.lyric}</div>`;
        }
      });

      blockEl.innerHTML = html;
      contentArea.appendChild(blockEl);
    });
  }

  _transposeChordLine(chordStr, semitones) {
    if (semitones === 0) return chordStr;
    const scale = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const regex = /[A-G][b#]?/g;
    return chordStr.replace(regex, (match) => {
      let idx = scale.indexOf(match);
      if (idx === -1) {
        if (match === 'Gb') idx = 6;
        if (match === 'Db') idx = 1;
      }
      if (idx !== -1) {
        let newIdx = (idx + semitones + 12) % 12;
        return scale[newIdx];
      }
      return match;
    });
  }
}
