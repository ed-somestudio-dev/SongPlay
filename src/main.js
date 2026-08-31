import { AudioEngine } from './audio/AudioEngine.js';
import { PadPlayer } from './audio/PadPlayer.js';
import { WaveformTimeline } from './components/WaveformTimeline.js';
import { MixerConsole } from './components/MixerConsole.js';
import { SetlistManager } from './components/SetlistManager.js';
import { ChordSyncViewer } from './components/ChordSyncViewer.js';
import { MidiCueEditor } from './components/MidiCueEditor.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Audio Engine & Pad Player
  const audioEngine = new AudioEngine();
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

  function renderSectionBanners(sections) {
    const container = document.getElementById('sectionBannersContainer');
    if (!container) return;
    container.innerHTML = '';

    sections.forEach(sec => {
      const tag = document.createElement('div');
      tag.className = `section-tag tag-${sec.label.toLowerCase().replace(/[^a-z]/g, '')}`;
      tag.textContent = sec.label;
      tag.style.backgroundColor = sec.color;

      tag.addEventListener('click', () => {
        audioEngine.seek(sec.startTime);
        waveformTimeline.render();
      });

      container.appendChild(tag);
    });
  }

  // Audio Engine Time Update Subscription
  audioEngine.onTimeUpdate((currentTime) => {
    updateTimeDisplay(currentTime);
    waveformTimeline.render();

    // Check active song section
    if (currentSong && currentSong.sections) {
      const activeSec = currentSong.sections.find(sec => currentTime >= sec.startTime && currentTime <= sec.endTime);
      if (activeSec) {
        chordSyncViewer.updateActiveSection(activeSec.label);
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

  playPauseBtn.addEventListener('click', () => {
    if (audioEngine.isPlaying) {
      audioEngine.pause();
      playIcon.innerHTML = '&#x25B6; PLAY';
      playPauseBtn.classList.remove('btn-primary');
    } else {
      audioEngine.play();
      playIcon.innerHTML = '&#x23F8; PAUSE';
      playPauseBtn.classList.add('btn-primary');
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
      padPlayer.playKey(key);
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
        audioEngine.seek(currentSong.sections[idx].startTime);
      }
    }
  });
});
