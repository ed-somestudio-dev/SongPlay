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
    this.activeSectionLabel = (song && song.sections && song.sections[0]) ? song.sections[0].label : null;
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

  updateActiveSection(sectionLabel, queuedSectionLabel = null) {
    if (!sectionLabel) return;
    this.activeSectionLabel = sectionLabel;

    if (!this.container) return;
    const contentArea = this.container.querySelector('.chord-content');
    if (!contentArea) return;

    const blocks = Array.from(contentArea.querySelectorAll('.chord-section-block'));
    if (blocks.length === 0) return;

    let activeIdx = -1;
    let queuedIdx = -1;

    blocks.forEach((block, idx) => {
      const blockSec = block.dataset.section || '';
      const isActiveMatch = this._isSectionMatch(blockSec, sectionLabel);
      const isQueuedMatch = queuedSectionLabel ? this._isSectionMatch(blockSec, queuedSectionLabel) : false;

      block.classList.remove('active-block', 'next-preview-block');

      if (isActiveMatch) {
        activeIdx = idx;
      }
      if (isQueuedMatch) {
        queuedIdx = idx;
      }
    });

    if (activeIdx !== -1) {
      blocks[activeIdx].classList.add('active-block');

      // Target for upcoming section preview: explicit queued section or next sequential block
      const nextIdx = (queuedIdx !== -1) ? queuedIdx : activeIdx + 1;
      if (nextIdx < blocks.length && nextIdx !== activeIdx) {
        blocks[nextIdx].classList.add('next-preview-block');
      }

      // Smooth scroll active block directly to the TOP of the viewing window
      const targetTop = blocks[activeIdx].offsetTop - contentArea.offsetTop - 10;
      contentArea.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    }
  }

  _isSectionMatch(nameA, nameB) {
    if (!nameA || !nameB) return false;
    const a = nameA.trim().toLowerCase();
    const b = nameB.trim().toLowerCase();
    if (a === b) return true;

    // Check normalized equivalents (Verso 1 vs V1, Refrão vs Rf, etc.)
    const normA = this._normalizeSec(nameA);
    const normB = this._normalizeSec(nameB);
    return normA === normB || a.includes(b) || b.includes(a);
  }

  _normalizeSec(str) {
    return str.toLowerCase()
      .replace(/verso\s*/g, 'v')
      .replace(/refrão|refrao\s*/g, 'rf')
      .replace(/ponte|bridge\s*/g, 'p')
      .replace(/intro\s*/g, 'i')
      .replace(/outro\s*/g, 'o')
      .replace(/\s+/g, '');
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
      blockEl.className = 'chord-section-block';
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

    if (this.activeSectionLabel) {
      setTimeout(() => this.updateActiveSection(this.activeSectionLabel), 30);
    }
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
