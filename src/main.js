import { AudioEngine } from './audio/AudioEngine.js';
import { PadPlayer } from './audio/PadPlayer.js';
import { WaveformTimeline } from './components/WaveformTimeline.js';
import { MixerConsole } from './components/MixerConsole.js';
import { SetlistManager } from './components/SetlistManager.js';
import { ChordSyncViewer } from './components/ChordSyncViewer.js';
import { MidiCueEditor } from './components/MidiCueEditor.js';

function initApp() {
  // 1. Initialize Audio Engine & Pad Player
  const audioEngine = new AudioEngine();
  audioEngine.init();
  const padPlayer = new PadPlayer(audioEngine.ctx);

  // 2. Initialize Setlist Manager
  const setlistContainer = document.getElementById('setlistContainer');
  let currentSong = null;

  const setlistManager = new SetlistManager(setlistContainer, (song) => {
    loadSong(song);
  });
  setlistManager.render();

  // 3. Initialize Waveform Timeline
  const canvasEl = document.getElementById('waveformCanvas');
  const waveformTimeline = new WaveformTimeline(canvasEl, audioEngine);

  // 4. Initialize Mixer Console
  const mixerConsoleContainer = document.getElementById('mixerConsoleContainer');
  const mixerConsole = new MixerConsole(mixerConsoleContainer, audioEngine);
  mixerConsole.render();

  // 5. Initialize Chord Sync Viewer
  const chordSyncPanel = document.getElementById('chordSyncPanel');
  const chordSyncViewer = new ChordSyncViewer(chordSyncPanel);

  // 6. Initialize MIDI Cue Editor Modal
  const midiModalEl = document.getElementById('midiCueModal');
  const midiCueEditor = new MidiCueEditor(midiModalEl, (cue) => {
    console.log('MIDI Cue Updated:', cue);
  });

  // Load initial song
  currentSong = setlistManager.getActiveSong();
  loadSong(currentSong);

  function loadSong(song) {
    currentSong = song;
    if (!song.id || !song.id.startsWith('custom_')) {
      audioEngine.clearAudioBuffers();
    }
    audioEngine.bpm = song.bpm;
    audioEngine.timeSignature = song.timeSignature;
    audioEngine.duration = song.duration;
    audioEngine.seek(0);

    // Update Header Display
    document.getElementById('hdrBpm').textContent = `${song.bpm} BPM`;
    document.getElementById('hdrTimeSig').textContent = song.timeSignature;
    updateTimeDisplay(0);

    // Update Timeline Sections
    waveformTimeline.setSections(song.sections);
    renderSectionBanners(song.sections);

    // Update Chord Sync
    chordSyncViewer.setSong(song);

    // Auto Link Pad if enabled
    const linkChk = document.getElementById('linkSongKeyChk');
    if (linkChk && linkChk.checked) {
      if (padPlayer.activeKey) {
        padPlayer.playKey(song.key);
        updatePadGridActiveKey(song.key);
      }
    }
  }

  let queuedSection = null;
  let isLoopActive = false;
  let lastHandledTransitionTime = -1;

  const loopBtn = document.getElementById('loopBtn');
  if (loopBtn) {
    loopBtn.addEventListener('click', () => {
      isLoopActive = !isLoopActive;
      loopBtn.classList.toggle('active', isLoopActive);
    });
  }

  function handleSectionClick(sec, isShiftOrOverride = false) {
    if (!audioEngine.isPlaying || isShiftOrOverride) {
      // Immediate jump if paused or shift is held
      queuedSection = null;
      audioEngine.seek(sec.startTime);
      waveformTimeline.render();
      updateSectionBannersUI();
      return;
    }

    // Toggle queue: if already queued this section, cancel queue
    if (queuedSection && queuedSection.label === sec.label) {
      queuedSection = null;
    } else {
      queuedSection = sec;
    }
    updateSectionBannersUI();
  }

  function updateSectionBannersUI() {
    const container = document.getElementById('sectionBannersContainer');
    if (!container || !currentSong || !currentSong.sections) return;

    const currentTime = audioEngine.currentTime || 0;
    const activeSec = currentSong.sections.find(s => currentTime >= s.startTime && currentTime <= s.endTime);

    const tags = container.querySelectorAll('.section-tag');
    tags.forEach((tag, idx) => {
      const sec = currentSong.sections[idx];
      if (!sec) return;

      tag.className = `section-tag tag-${sec.label.toLowerCase().replace(/[^a-z]/g, '')}`;
      let text = sec.label;

      if (activeSec && activeSec.label === sec.label) {
        tag.classList.add('active-section');
      }

      if (queuedSection && queuedSection.label === sec.label) {
        tag.classList.add('queued-jump');
        text = `⏳ PRÓXIMO: ${sec.label}`;
      }

      tag.textContent = text;
    });
  }

  function renderSectionBanners(sections) {
    const container = document.getElementById('sectionBannersContainer');
    if (!container) return;
    container.innerHTML = '';

    sections.forEach(sec => {
      const tag = document.createElement('div');
      tag.className = `section-tag tag-${sec.label.toLowerCase().replace(/[^a-z]/g, '')}`;
      tag.textContent = sec.label;
      tag.style.backgroundColor = sec.color;

      tag.addEventListener('click', (e) => {
        handleSectionClick(sec, e.shiftKey);
      });

      container.appendChild(tag);
    });
    updateSectionBannersUI();
  }

  // Audio Engine Time Update Subscription
  audioEngine.onTimeUpdate((currentTime) => {
    updateTimeDisplay(currentTime);
    waveformTimeline.render();

    if (!currentSong || !currentSong.sections) return;

    const activeSec = currentSong.sections.find(sec => currentTime >= sec.startTime && currentTime <= sec.endTime);
    if (activeSec) {
      chordSyncViewer.updateActiveSection(activeSec.label);
    }

    updateSectionBannersUI();

    // Check Section End Transition (Quantized Jump or Loop)
    if (audioEngine.isPlaying && activeSec) {
      const timeUntilEnd = activeSec.endTime - currentTime;
      if (timeUntilEnd <= 0.3 && Math.abs(currentTime - lastHandledTransitionTime) > 1.0) {
        lastHandledTransitionTime = currentTime;

        if (queuedSection) {
          const target = queuedSection;
          queuedSection = null;
          audioEngine.seek(target.startTime);
          updateSectionBannersUI();
        } else if (isLoopActive) {
          audioEngine.seek(activeSec.startTime);
          updateSectionBannersUI();
        }
      }
    }
  });

  function updateTimeDisplay(seconds) {
    const curMin = Math.floor(seconds / 60).toString().padStart(2, '0');
    const curSec = Math.floor(seconds % 60).toString().padStart(2, '0');
    const totalMin = Math.floor(audioEngine.duration / 60).toString().padStart(2, '0');
    const totalSec = Math.floor(audioEngine.duration % 60).toString().padStart(2, '0');

    document.getElementById('hdrCurrentTime').textContent = `${curMin}:${curSec}`;
    document.getElementById('hdrTotalTime').textContent = `${curMin}:${curSec} / ${totalMin}:${totalSec}`;
  }

  // Play / Pause Button Listener
  const playPauseBtn = document.getElementById('playPauseBtn');
  const playIcon = document.getElementById('playIcon');

  audioEngine.onStateChange((isPlaying) => {
    if (isPlaying) {
      playIcon.innerHTML = '&#x23F8; PAUSE';
      playPauseBtn.classList.add('btn-primary');
    } else {
      playIcon.innerHTML = '&#x25B6; PLAY';
      playPauseBtn.classList.remove('btn-primary');
    }
  });

  playPauseBtn.addEventListener('click', () => {
    if (audioEngine.isPlaying) {
      audioEngine.pause();
    } else {
      audioEngine.play();
    }
  });

  // Next / Prev Songs
  document.getElementById('nextTrackBtn').addEventListener('click', () => {
    if (setlistManager.activeSongIndex < setlistManager.songs.length - 1) {
      setlistManager.activeSongIndex++;
      setlistManager.render();
      loadSong(setlistManager.getActiveSong());
    }
  });

  document.getElementById('prevTrackBtn').addEventListener('click', () => {
    if (setlistManager.activeSongIndex > 0) {
      setlistManager.activeSongIndex--;
      setlistManager.render();
      loadSong(setlistManager.getActiveSong());
    }
  });

  // Pad Player Modal & Grid Logic
  const padModal = document.getElementById('padPlayerModal');
  const padBtn = document.getElementById('padPlayerBtn');
  const closePadBtn = document.getElementById('closePadModalBtn');

  padBtn.addEventListener('click', () => padModal.classList.add('open'));
  closePadBtn.addEventListener('click', () => padModal.classList.remove('open'));

  const padGrid = document.getElementById('padGrid');
  padGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.pad-key-btn');
    if (!btn) return;
    const key = btn.dataset.key;

    if (!padPlayer.ctx) padPlayer.init(audioEngine.masterGain);

    if (padPlayer.activeKey === key) {
      padPlayer.stopKey();
      updatePadGridActiveKey(null);
      padBtn.classList.remove('active');
    } else {
      padPlayer.playKey(key, audioEngine.masterGain, audioEngine.ctx);
      updatePadGridActiveKey(key);
      padBtn.classList.add('active');
    }
  });

  function updatePadGridActiveKey(key) {
    const keys = padGrid.querySelectorAll('.pad-key-btn');
    keys.forEach(k => {
      if (k.dataset.key === key) k.classList.add('active');
      else k.classList.remove('active');
    });
  }

  document.getElementById('stopPadBtn').addEventListener('click', () => {
    padPlayer.stopKey();
    updatePadGridActiveKey(null);
    padBtn.classList.remove('active');
  });

  // Transposition buttons for ChordSync
  document.getElementById('transposeUpBtn').addEventListener('click', () => {
    chordSyncViewer.transposeOffset++;
    chordSyncViewer.render();
  });
  document.getElementById('transposeDownBtn').addEventListener('click', () => {
    chordSyncViewer.transposeOffset--;
    chordSyncViewer.render();
  });

  // Toggle Chords drawer
  const toggleChordBtn = document.getElementById('toggleChordBtn');
  toggleChordBtn.addEventListener('click', () => {
    chordSyncPanel.classList.toggle('collapsed');
    toggleChordBtn.classList.toggle('active');
  });

  // Open MIDI Cue Editor
  document.getElementById('editMidiBtn').addEventListener('click', () => {
    midiCueEditor.open();
  });

  // Stem Import Modal & Dropzone Logic
  const importModal = document.getElementById('importStemsModal');
  const importBtn = document.getElementById('importStemsBtn');
  const closeImportBtn = document.getElementById('closeImportModalBtn');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const fileMappingList = document.getElementById('fileMappingList');
  const confirmImportBtn = document.getElementById('confirmImportBtn');
  const importProgress = document.getElementById('importProgress');

  let selectedFilesMap = []; // { file, trackId }

  importBtn.addEventListener('click', () => importModal.classList.add('open'));
  closeImportBtn.addEventListener('click', () => importModal.classList.remove('open'));

  dropzone.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--accent-green)';
    dropzone.style.background = '#1a2333';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--border-active)';
    dropzone.style.background = 'var(--bg-card)';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border-active)';
    dropzone.style.background = 'var(--bg-card)';
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleSelectedFiles(Array.from(e.dataTransfer.files));
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleSelectedFiles(Array.from(e.target.files));
    }
  });

  function autoDetectTrackId(filename) {
    const name = filename.toLowerCase();
    if (name.includes('click') || name.includes('metronomo')) return 'click';
    if (name.includes('guia') || name.includes('guide') || name.includes('voice')) return 'guide';
    if (name.includes('bateria') || name.includes('drums') || name.includes('perc')) return 'drums';
    if (name.includes('baixo') || name.includes('bass')) return 'bass';
    if (name.includes('guitar1') || name.includes('gtr1') || name.includes('violao')) return 'guitar1';
    if (name.includes('guitar') || name.includes('gtr')) return 'guitar2';
    if (name.includes('teclado') || name.includes('keys') || name.includes('piano')) return 'keys';
    if (name.includes('pad')) return 'pad';
    return 'guitar1'; // default fallback
  }

  function handleSelectedFiles(files) {
    selectedFilesMap = files.map(file => ({
      file,
      trackId: autoDetectTrackId(file.name)
    }));

    // Auto-fill song title if empty
    const titleInput = document.getElementById('importSongTitle');
    if (!titleInput.value && files.length > 0) {
      const cleanName = files[0].name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      titleInput.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    }

    renderFileMappingList();
  }

  function renderFileMappingList() {
    fileMappingList.innerHTML = '';
    selectedFilesMap.forEach((item, idx) => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; background: var(--bg-panel); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); font-size: 0.82rem;';
      
      const trackOptionsHtml = audioEngine.trackNames.map(tr => 
        `<option value="${tr.id}" ${tr.id === item.trackId ? 'selected' : ''}>${tr.label}</option>`
      ).join('');

      row.innerHTML = `
        <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; color: var(--text-main);" title="${item.file.name}">${item.file.name}</span>
        <select data-idx="${idx}" class="track-select" style="background: var(--bg-card); color: var(--accent-amber); border: 1px solid var(--border-color); padding: 4px 8px; border-radius: 4px; font-weight: 600;">
          ${trackOptionsHtml}
        </select>
      `;

      fileMappingList.appendChild(row);
    });

    const selects = fileMappingList.querySelectorAll('.track-select');
    selects.forEach(sel => {
      sel.addEventListener('change', (e) => {
        const i = parseInt(e.target.dataset.idx);
        selectedFilesMap[i].trackId = e.target.value;
      });
    });
  }

  confirmImportBtn.addEventListener('click', async () => {
    if (selectedFilesMap.length === 0) {
      alert('Por favor, selecione ao menos um arquivo de áudio (.wav ou .mp3).');
      return;
    }

    importProgress.style.display = 'block';
    confirmImportBtn.disabled = true;

    try {
      audioEngine.clearAudioBuffers();

      let maxDuration = 0;

      for (const item of selectedFilesMap) {
        const audioBuffer = await audioEngine.decodeFile(item.file);
        audioEngine.loadTrackBuffer(item.trackId, audioBuffer);
        if (audioBuffer.duration > maxDuration) {
          maxDuration = audioBuffer.duration;
        }
      }

      const songTitle = document.getElementById('importSongTitle').value.trim() || 'Minha Música Custom';
      const songKey = document.getElementById('importSongKey').value.trim() || 'G';
      const songBpm = parseInt(document.getElementById('importSongBpm').value) || 120;

      const newSong = {
        id: 'custom_' + Date.now(),
        title: songTitle,
        artist: 'Minha Banda',
        key: songKey,
        bpm: songBpm,
        timeSignature: '4/4',
        duration: Math.round(maxDuration),
        cover: '/covers/a_ele_a_gloria.png',
        sections: [
          { label: 'Intro', startTime: 0, endTime: Math.round(maxDuration * 0.15), color: '#6366f1' },
          { label: 'Verso 1', startTime: Math.round(maxDuration * 0.15), endTime: Math.round(maxDuration * 0.4), color: '#3b82f6' },
          { label: 'Refrão', startTime: Math.round(maxDuration * 0.4), endTime: Math.round(maxDuration * 0.7), color: '#a855f7' },
          { label: 'Outro', startTime: Math.round(maxDuration * 0.7), endTime: Math.round(maxDuration), color: '#10b981' }
        ],
        chords: [
          {
            section: 'Intro',
            lines: [{ chord: songKey, lyric: '(Faixas de áudio importadas em execução)' }]
          }
        ]
      };

      setlistManager.addSong(newSong);
      loadSong(newSong);
      mixerConsole.render();

      importProgress.style.display = 'none';
      confirmImportBtn.disabled = false;
      importModal.classList.remove('open');
      selectedFilesMap = [];
      fileMappingList.innerHTML = '';
      fileInput.value = '';
    } catch (err) {
      console.error('Erro ao decodificar arquivo de áudio:', err);
      alert('Ocorreu um erro ao decodificar os arquivos de áudio. Verifique se os arquivos estão em formato WAV ou MP3 válido.');
      importProgress.style.display = 'none';
      confirmImportBtn.disabled = false;
    }
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.code === 'Space') {
      e.preventDefault();
      playPauseBtn.click();
    } else if (e.code === 'KeyP') {
      padBtn.click();
    } else if (e.code === 'KeyC') {
      toggleChordBtn.click();
    } else if (e.code >= 'Digit1' && e.code <= 'Digit9') {
      const idx = parseInt(e.code.replace('Digit', '')) - 1;
      if (currentSong && currentSong.sections && currentSong.sections[idx]) {
        handleSectionClick(currentSong.sections[idx], e.shiftKey);
      }
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
