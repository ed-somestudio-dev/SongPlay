import { AudioEngine } from './audio/AudioEngine.js';
import { PadPlayer } from './audio/PadPlayer.js';
import { WaveformTimeline } from './components/WaveformTimeline.js';
import { MixerConsole } from './components/MixerConsole.js';
import { SetlistManager } from './components/SetlistManager.js';
import { ChordSyncViewer } from './components/ChordSyncViewer.js';
import { MidiCueEditor } from './components/MidiCueEditor.js';

// === DEBUG OVERLAY — shows JS errors visually on-screen ===
function showDebugError(msg) {
  let panel = document.getElementById('__debugPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = '__debugPanel';
    panel.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#ff1744;color:#fff;font:13px monospace;padding:10px 16px;white-space:pre-wrap;max-height:200px;overflow:auto;';
    document.body.appendChild(panel);
  }
  panel.textContent += '\n❌ ' + msg;
  console.error('[DEBUG]', msg);
}

window.onerror = (msg, src, line, col, err) => {
  showDebugError(`${msg}\n   at ${src}:${line}:${col}`);
};

window.onunhandledrejection = (e) => {
  showDebugError('Promise rejected: ' + (e.reason?.stack || e.reason));
};
// === END DEBUG OVERLAY ===

function initApp() {

  // 1. Initialize Audio Engine
  // init() creates the AudioContext and channel nodes (needed for MixerConsole to render).
  // The AudioContext starts in 'suspended' state per browser autoplay policy.
  // play() already calls await ctx.resume() before starting playback.
  const audioEngine = new AudioEngine();
  audioEngine.init();

  // padPlayer is initialized lazily — first pad click calls padPlayer init
  let padPlayer = null;

  // 2. Initialize Setlist Manager
  const setlistContainer = document.getElementById('setlistContainer');
  let currentSong = null;

  const setlistManager = new SetlistManager(setlistContainer, (song, idx) => {
    requestSongChange(song, idx);
  });
  setlistManager.render();

  // 3. Initialize Waveform Timeline
  const canvasEl = document.getElementById('waveformCanvas');
  const waveformTimeline = new WaveformTimeline(canvasEl, audioEngine);

  // 4. Initialize Mixer Console
  const mixerConsoleContainer = document.getElementById('mixerConsoleContainer');
  const mixerConsole = new MixerConsole(mixerConsoleContainer, audioEngine);
  mixerConsole.render();

  mixerConsole.onMixChange(() => {
    if (currentSong) {
      currentSong.mixState = audioEngine.getMixState();
    }
  });

  // 5. Initialize Chord Sync Viewer
  const chordSyncPanel = document.getElementById('chordSyncPanel');
  const chordSyncViewer = new ChordSyncViewer(chordSyncPanel);

  // 6. Initialize MIDI Cue Editor Modal
  const midiModalEl = document.getElementById('midiCueModal');
  const midiCueEditor = new MidiCueEditor(midiModalEl, (cue) => {
    console.log('MIDI Cue Updated:', cue);
  });

  // ── State variables declared here (before loadSong) to avoid TDZ errors ──
  let queuedSection = null;
  let queuedNextSong = null;
  let lastHandledTransitionTime = -1;
  let lastActiveSecLabel = null;
  let lastQueuedSecLabel = null;

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

    // Restore or initialize custom mix settings for this song
    if (song.mixState) {
      audioEngine.applyMixState(song.mixState);
    } else {
      song.mixState = audioEngine.getMixState();
    }
    mixerConsole.render();

    // Update Header Display
    document.getElementById('hdrBpm').textContent = `${song.bpm} BPM`;
    document.getElementById('hdrTimeSig').textContent = song.timeSignature;
    updateTimeDisplay(0);

    // Update Timeline Sections (labels drawn on canvas now)
    waveformTimeline.setSections(song.sections);
    queuedSection = null;
    waveformTimeline.setQueuedSection(null);

    // Update Chord Sync
    chordSyncViewer.setSong(song);

    // Auto Link Pad if enabled
    const linkChk = document.getElementById('linkSongKeyChk');
    if (linkChk && linkChk.checked && padPlayer && padPlayer.activeKey) {
      padPlayer.playKey(song.key);
      updatePadGridActiveKey(song.key);
    }
  }

  // Global AudioContext Unlocker for browser autoplay policies
  window.addEventListener('click', () => {
    if (audioEngine && audioEngine.ctx && audioEngine.ctx.state === 'suspended') {
      audioEngine.ctx.resume().catch(() => {});
    }
  });

  // Wire waveform section click → quantized jump logic
  waveformTimeline.onSectionClick((sec, isShiftKey) => handleSectionClick(sec, isShiftKey));

  // Wire per-section loop toggle
  let loopedSection = null;
  waveformTimeline.onSectionLoopToggle((sec) => {
    if (loopedSection && loopedSection.label === sec.label) {
      loopedSection = null; // turn off
    } else {
      loopedSection = sec;  // turn on for this section
    }
    waveformTimeline.setLoopedSection(loopedSection);
  });

  function requestSongChange(song, songIndex = -1) {
    if (!song) return;

    if (audioEngine.isPlaying) {
      // While playing: queue transition for end of current section
      if (queuedNextSong && queuedNextSong.id === song.id) {
        queuedNextSong = null; // cancel queue if clicking same queued song again
      } else {
        queuedNextSong = song;
      }
      setlistManager.setQueuedSong(queuedNextSong);
    } else {
      // While paused: change song immediately
      queuedNextSong = null;
      setlistManager.setQueuedSong(null);
      if (songIndex >= 0) {
        setlistManager.activeSongIndex = songIndex;
      } else {
        const foundIdx = setlistManager.songs.findIndex(s => s.id === song.id);
        if (foundIdx >= 0) setlistManager.activeSongIndex = foundIdx;
      }
      setlistManager.render();
      loadSong(song);
    }
  }

  function handleSectionClick(sec, isShiftKey = false) {
    if (isShiftKey || !audioEngine.isPlaying) {
      // Shift+click or paused = IMMEDIATE jump
      queuedSection = null;
      waveformTimeline.setQueuedSection(null);
      audioEngine.seek(sec.startTime);
      waveformTimeline.render();
      chordSyncViewer.updateActiveSection(sec.label, null);
    } else {
      // Regular click while playing = queue jump for end of current section
      if (queuedSection && queuedSection.label === sec.label) {
        queuedSection = null; // cancel
      } else {
        queuedSection = sec;
      }
      waveformTimeline.setQueuedSection(queuedSection);
      const currentTime = audioEngine.currentTime;
      const activeSec = (currentSong && currentSong.sections) ? currentSong.sections.find(s => currentTime >= s.startTime && currentTime <= s.endTime) : null;
      const curLabel = activeSec ? activeSec.label : sec.label;
      chordSyncViewer.updateActiveSection(curLabel, queuedSection ? queuedSection.label : null);
    }
  }

  // Audio Engine Time Update Subscription
  audioEngine.onTimeUpdate((currentTime) => {
    updateTimeDisplay(currentTime);
    waveformTimeline.render();

    if (!currentSong || !currentSong.sections) return;

    const activeSec = currentSong.sections.find(sec => currentTime >= sec.startTime && currentTime <= sec.endTime);
    if (activeSec) {
      chordSyncViewer.updateActiveSection(activeSec.label, queuedSection ? queuedSection.label : null);
    }


    // Check Section End Transition (Song Switch > Quantized Jump > Section Loop)
    if (audioEngine.isPlaying && activeSec) {
      const timeUntilEnd = activeSec.endTime - currentTime;
      if (timeUntilEnd <= 0.3 && Math.abs(currentTime - lastHandledTransitionTime) > 1.0) {
        lastHandledTransitionTime = currentTime;

        if (queuedNextSong) {
          const nextSongToLoad = queuedNextSong;
          queuedNextSong = null;
          queuedSection = null;
          waveformTimeline.setQueuedSection(null);
          setlistManager.setQueuedSong(null);

          const foundIdx = setlistManager.songs.findIndex(s => s.id === nextSongToLoad.id);
          if (foundIdx >= 0) setlistManager.activeSongIndex = foundIdx;

          loadSong(nextSongToLoad);
          setlistManager.render();
          audioEngine.play(); // Seamless transition into new song
        } else if (queuedSection) {
          const target = queuedSection;
          queuedSection = null;
          waveformTimeline.setQueuedSection(null);
          audioEngine.seek(target.startTime);
        } else if (loopedSection && loopedSection.label === activeSec.label) {
          // Per-section loop
          audioEngine.seek(activeSec.startTime);
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

  playPauseBtn.addEventListener('click', async () => {
    if (audioEngine.isPlaying) {
      audioEngine.pause();
    } else {
      await audioEngine.play();
    }
  });

  // Next / Prev Songs
  document.getElementById('nextTrackBtn').addEventListener('click', () => {
    if (setlistManager.activeSongIndex < setlistManager.songs.length - 1) {
      const nextIdx = setlistManager.activeSongIndex + 1;
      const nextSong = setlistManager.songs[nextIdx];
      requestSongChange(nextSong, nextIdx);
    }
  });

  document.getElementById('prevTrackBtn').addEventListener('click', () => {
    if (setlistManager.activeSongIndex > 0) {
      const prevIdx = setlistManager.activeSongIndex - 1;
      const prevSong = setlistManager.songs[prevIdx];
      requestSongChange(prevSong, prevIdx);
    }
  });

  // Pad Player Modal & Grid Logic
  const padModal = document.getElementById('padPlayerModal');
  const padBtn = document.getElementById('padPlayerBtn');
  const closePadBtn = document.getElementById('closePadModalBtn');

  closePadBtn.addEventListener('click', () => padModal.classList.remove('open'));

  function getPadDestinationNode() {
    if (audioEngine.channels && audioEngine.channels['pad'] && audioEngine.channels['pad'].gainNode) {
      return audioEngine.channels['pad'].gainNode;
    }
    return audioEngine.songMasterGain || audioEngine.masterGain;
  }

  function ensurePadPlayer() {
    if (!padPlayer) {
      if (!audioEngine.ctx) audioEngine.init();
      padPlayer = new PadPlayer(audioEngine.ctx);
    }
    const dest = getPadDestinationNode();
    if (!padPlayer.ctx || !padPlayer.padGainNode) {
      padPlayer.init(dest, audioEngine.ctx);
    }
    return padPlayer;
  }

  function togglePadPlayStop() {
    const player = ensurePadPlayer();
    if (player.activeKey) {
      player.stopKey();
      updatePadGridActiveKey(null);
      padBtn.classList.remove('active');
    } else {
      const targetKey = (currentSong && currentSong.key) ? currentSong.key : 'C';
      player.playKey(targetKey, getPadDestinationNode(), audioEngine.ctx);
      updatePadGridActiveKey(targetKey);
      padBtn.classList.add('active');
    }
  }

  // Press & hold (Long Press) vs Single Click detection for padBtn
  let padHoldTimer = null;
  let isPadLongPress = false;

  const startPadHold = () => {
    isPadLongPress = false;
    padHoldTimer = setTimeout(() => {
      isPadLongPress = true;
      padModal.classList.add('open');
    }, 400); // 400ms threshold for hold to open modal
  };

  const cancelPadHold = () => {
    if (padHoldTimer) {
      clearTimeout(padHoldTimer);
      padHoldTimer = null;
    }
  };

  padBtn.addEventListener('mousedown', startPadHold);
  padBtn.addEventListener('mouseleave', cancelPadHold);

  padBtn.addEventListener('touchstart', (e) => {
    startPadHold();
  }, { passive: true });

  padBtn.addEventListener('touchend', () => {
    cancelPadHold();
  });

  padBtn.addEventListener('click', (e) => {
    cancelPadHold();
    if (isPadLongPress) {
      isPadLongPress = false;
      return; // Ignore click action if long press opened modal
    }
    togglePadPlayStop();
  });

  const padGrid = document.getElementById('padGrid');
  padGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.pad-key-btn');
    if (!btn) return;
    const key = btn.dataset.key;

    const player = ensurePadPlayer();
    if (player.activeKey === key) {
      player.stopKey();
      updatePadGridActiveKey(null);
      padBtn.classList.remove('active');
    } else {
      player.playKey(key, getPadDestinationNode(), audioEngine.ctx);
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
    if (key) {
      padBtn.classList.add('active');
    } else {
      padBtn.classList.remove('active');
    }
  }

  document.getElementById('stopPadBtn').addEventListener('click', () => {
    if (padPlayer) padPlayer.stopKey();
    updatePadGridActiveKey(null);
    padBtn.classList.remove('active');
  });


  // View Toggle Mode (MIXER, CIFRAS, LETRAS)
  const btnViewMixer = document.getElementById('btnViewMixer');
  const btnViewChords = document.getElementById('btnViewChords');
  const btnViewLyrics = document.getElementById('btnViewLyrics');

  function setWorkspaceView(viewMode) {
    btnViewMixer.classList.toggle('active', viewMode === 'mixer');
    btnViewChords.classList.toggle('active', viewMode === 'chords');
    btnViewLyrics.classList.toggle('active', viewMode === 'lyrics');

    if (viewMode === 'mixer') {
      mixerConsoleContainer.classList.remove('hidden');
      chordSyncPanel.classList.add('hidden');
    } else {
      mixerConsoleContainer.classList.add('hidden');
      chordSyncPanel.classList.remove('hidden');
      chordSyncViewer.setDisplayMode(viewMode === 'lyrics' ? 'lyrics' : 'chords');
    }
  }

  btnViewMixer.addEventListener('click', () => setWorkspaceView('mixer'));
  btnViewChords.addEventListener('click', () => setWorkspaceView('chords'));
  btnViewLyrics.addEventListener('click', () => setWorkspaceView('lyrics'));

  // Default mode: MIXER
  setWorkspaceView('mixer');

  // Transposition buttons for ChordSync
  document.getElementById('transposeUpBtn').addEventListener('click', () => {
    chordSyncViewer.transposeOffset++;
    chordSyncViewer.render();
  });
  document.getElementById('transposeDownBtn').addEventListener('click', () => {
    chordSyncViewer.transposeOffset--;
    chordSyncViewer.render();
  });

  // Font Size Zoom buttons for ChordSync / Lyrics
  document.getElementById('fontSizeUpBtn').addEventListener('click', () => {
    chordSyncViewer.zoomIn();
  });
  document.getElementById('fontSizeDownBtn').addEventListener('click', () => {
    chordSyncViewer.zoomOut();
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
      if (btnViewChords.classList.contains('active')) {
        setWorkspaceView('mixer');
      } else {
        setWorkspaceView('chords');
      }
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
