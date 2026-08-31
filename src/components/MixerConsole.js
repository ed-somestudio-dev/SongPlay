export class MixerConsole {
  constructor(containerElement, audioEngine) {
    this.container = containerElement;
    this.audioEngine = audioEngine;
    this.vuInterval = null;
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = '';

    // Render Track Channel Strips
    this.audioEngine.trackNames.forEach(track => {
      const channel = this.audioEngine.channels[track.id];
      const stripEl = document.createElement('div');
      stripEl.className = 'channel-strip';
      stripEl.dataset.trackId = track.id;

      stripEl.innerHTML = `
        <div class="channel-header" title="${track.label}">${track.label}</div>
        <div class="channel-controls">
          <button class="sm-btn solo-btn ${channel.isSolo ? 'active' : ''}" data-track="${track.id}" data-action="solo">S</button>
          <button class="sm-btn mute-btn ${channel.isMuted ? 'active' : ''}" data-track="${track.id}" data-action="mute">M</button>
        </div>
        <div class="fader-area">
          <div class="fader-track">
            <input type="range" min="0" max="1" step="0.01" value="${channel.volume}" class="vertical-range fader-slider" data-track="${track.id}">
          </div>
          <div class="vu-meter" id="vu-${track.id}">
            ${Array.from({ length: 10 }).map((_, i) => `<div class="vu-led" data-led="${i}"></div>`).join('')}
          </div>
        </div>
        <div class="channel-volume-text" id="vol-txt-${track.id}">${Math.round(channel.volume * 100)}%</div>
      `;

      this.container.appendChild(stripEl);
    });

    // 1. Render Song Master Channel Strip (Laranja - saved per song)
    const songMasterVol = this.audioEngine.songMasterGain ? this.audioEngine.songMasterGain.gain.value : 0.9;
    const songMasterStrip = document.createElement('div');
    songMasterStrip.className = 'channel-strip song-master-strip';
    songMasterStrip.innerHTML = `
      <div class="channel-header" title="Master da Música (Salvo por Música)">MÚSICA</div>
      <div class="channel-controls">
        <button class="sm-btn mute-btn" id="masterMuteBtn">M</button>
      </div>
      <div class="fader-area">
        <div class="fader-track">
          <input type="range" min="0" max="1" step="0.01" value="${songMasterVol}" class="vertical-range" id="masterFader">
        </div>
        <div class="vu-meter" id="vu-master">
          ${Array.from({ length: 10 }).map((_, i) => `<div class="vu-led" data-led="${i}"></div>`).join('')}
        </div>
      </div>
      <div class="channel-volume-text" id="vol-txt-master">${Math.round(songMasterVol * 100)}%</div>
    `;
    this.container.appendChild(songMasterStrip);

    // 2. Render Independent Pad Channel Strip (Roxo - independent, not saved per song)
    const padChannel = this.audioEngine.channels['pad'] || { volume: 0.65, isMuted: false, isSolo: false };
    const padMasterStrip = document.createElement('div');
    padMasterStrip.className = 'channel-strip pad-master-strip';
    padMasterStrip.dataset.trackId = 'pad';
    padMasterStrip.innerHTML = `
      <div class="channel-header" title="Volume do Pad Ambiente (Independente)">PAD</div>
      <div class="channel-controls">
        <button class="sm-btn solo-btn ${padChannel.isSolo ? 'active' : ''}" data-track="pad" data-action="solo">S</button>
        <button class="sm-btn mute-btn ${padChannel.isMuted ? 'active' : ''}" data-track="pad" data-action="mute">M</button>
      </div>
      <div class="fader-area">
        <div class="fader-track">
          <input type="range" min="0" max="1" step="0.01" value="${padChannel.volume}" class="vertical-range fader-slider" data-track="pad">
        </div>
        <div class="vu-meter" id="vu-pad">
          ${Array.from({ length: 10 }).map((_, i) => `<div class="vu-led" data-led="${i}"></div>`).join('')}
        </div>
      </div>
      <div class="channel-volume-text" id="vol-txt-pad">${Math.round(padChannel.volume * 100)}%</div>
    `;
    this.container.appendChild(padMasterStrip);

    // 3. Render Global Device Master Strip (Azul - persistent device main master)
    const globalMasterVol = this.audioEngine.globalMasterGain ? this.audioEngine.globalMasterGain.gain.value : 1.0;
    const globalMasterStrip = document.createElement('div');
    globalMasterStrip.className = 'channel-strip global-master-strip';
    globalMasterStrip.innerHTML = `
      <div class="channel-header" title="Master Geral do Dispositivo (Saída Main)">MAIN GERAL</div>
      <div class="channel-controls">
        <button class="sm-btn mute-btn" id="globalMasterMuteBtn">M</button>
      </div>
      <div class="fader-area">
        <div class="fader-track">
          <input type="range" min="0" max="1" step="0.01" value="${globalMasterVol}" class="vertical-range" id="globalMasterFader">
        </div>
        <div class="vu-meter" id="vu-global-master">
          ${Array.from({ length: 10 }).map((_, i) => `<div class="vu-led" data-led="${i}"></div>`).join('')}
        </div>
      </div>
      <div class="channel-volume-text" id="vol-txt-global-master">${Math.round(globalMasterVol * 100)}%</div>
    `;
    this.container.appendChild(globalMasterStrip);

    if (!this.eventsBound) {
      this._bindEvents();
      this.eventsBound = true;
    }
    this._startVUMeterAnimation();
  }

  onMixChange(cb) {
    this.onMixChangeCallback = cb;
  }

  _notifyMixChange() {
    if (this.onMixChangeCallback) {
      this.onMixChangeCallback();
    }
  }

  updateButtonsState() {
    Object.keys(this.audioEngine.channels || {}).forEach(trackId => {
      const channel = this.audioEngine.channels[trackId];
      const soloBtn = this.container.querySelector(`.solo-btn[data-track="${trackId}"]`);
      const muteBtn = this.container.querySelector(`.mute-btn[data-track="${trackId}"]`);
      if (soloBtn) soloBtn.classList.toggle('active', !!channel.isSolo);
      if (muteBtn) muteBtn.classList.toggle('active', !!channel.isMuted);
    });
  }

  _bindEvents() {
    this.container.addEventListener('input', (e) => {
      if (e.target.classList.contains('fader-slider')) {
        const trackId = e.target.dataset.track;
        const val = parseFloat(e.target.value);
        this.audioEngine.setTrackVolume(trackId, val);
        const txt = this.container.querySelector(`#vol-txt-${trackId}`);
        if (txt) txt.textContent = `${Math.round(val * 100)}%`;
        if (trackId !== 'pad') this._notifyMixChange();
      } else if (e.target.id === 'masterFader') {
        const val = parseFloat(e.target.value);
        this.audioEngine.setSongMasterVolume(val);
        const txt = this.container.querySelector('#vol-txt-master');
        if (txt) txt.textContent = `${Math.round(val * 100)}%`;
        this._notifyMixChange();
      } else if (e.target.id === 'globalMasterFader') {
        const val = parseFloat(e.target.value);
        this.audioEngine.setGlobalMasterVolume(val);
        const txt = this.container.querySelector('#vol-txt-global-master');
        if (txt) txt.textContent = `${Math.round(val * 100)}%`;
      }
    });

    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('.sm-btn');
      if (!btn) return;
      const trackId = btn.dataset.track;
      const action = btn.dataset.action;

      if (action === 'solo' && trackId) {
        this.audioEngine.toggleSolo(trackId);
        this.updateButtonsState();
        if (trackId !== 'pad') this._notifyMixChange();
      } else if (action === 'mute' && trackId) {
        this.audioEngine.toggleMute(trackId);
        this.updateButtonsState();
        if (trackId !== 'pad') this._notifyMixChange();
      } else if (btn.id === 'masterMuteBtn') {
        btn.classList.toggle('active');
        const isMuted = btn.classList.contains('active');
        this.audioEngine.setSongMasterVolume(isMuted ? 0 : 0.9);
        this._notifyMixChange();
      } else if (btn.id === 'globalMasterMuteBtn') {
        btn.classList.toggle('active');
        const isMuted = btn.classList.contains('active');
        this.audioEngine.setGlobalMasterVolume(isMuted ? 0 : 1.0);
      }
    });
  }

  _startVUMeterAnimation() {
    if (this.vuInterval) clearInterval(this.vuInterval);

    this.vuInterval = setInterval(() => {
      // Clear or update meters for all active channels (including pad)
      Object.keys(this.audioEngine.channels || {}).forEach(trackId => {
        const level = (this.audioEngine.isPlaying || (trackId === 'pad' && this.audioEngine.channels['pad']?.volume > 0))
          ? this.audioEngine.getChannelMeterLevel(trackId)
          : 0;

        const activeCount = Math.floor((level / 100) * 10);
        const vuMeter = this.container.querySelector(`#vu-${trackId}`);
        if (vuMeter) {
          const leds = vuMeter.querySelectorAll('.vu-led');
          leds.forEach((led, idx) => {
            if (idx < activeCount) {
              if (idx >= 8) led.className = 'vu-led active-red';
              else if (idx >= 6) led.className = 'vu-led active-yellow';
              else led.className = 'vu-led active-green';
            } else {
              led.className = 'vu-led';
            }
          });
        }
      });

      // Master meter
      const masterLevel = this.audioEngine.isPlaying ? this.audioEngine.getMasterMeterLevel() : 0;
      const masterActiveCount = Math.floor((masterLevel / 100) * 10);
      const masterVu = this.container.querySelector('#vu-master');
      if (masterVu) {
        const leds = masterVu.querySelectorAll('.vu-led');
        leds.forEach((led, idx) => {
          if (idx < masterActiveCount) {
            if (idx >= 8) led.className = 'vu-led active-red';
            else if (idx >= 6) led.className = 'vu-led active-yellow';
            else led.className = 'vu-led active-green';
          } else {
            led.className = 'vu-led';
          }
        });
      }
    }, 50);
  }
}
