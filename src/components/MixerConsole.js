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

    // Render Master Channel Strip
    const masterStrip = document.createElement('div');
    masterStrip.className = 'channel-strip master-strip';
    masterStrip.innerHTML = `
      <div class="channel-header">MASTER</div>
      <div class="channel-controls">
        <button class="sm-btn mute-btn" id="masterMuteBtn">M</button>
      </div>
      <div class="fader-area">
        <div class="fader-track">
          <input type="range" min="0" max="1" step="0.01" value="0.9" class="vertical-range" id="masterFader">
        </div>
        <div class="vu-meter" id="vu-master">
          ${Array.from({ length: 10 }).map((_, i) => `<div class="vu-led" data-led="${i}"></div>`).join('')}
        </div>
      </div>
      <div class="channel-volume-text" id="vol-txt-master">90%</div>
    `;
    this.container.appendChild(masterStrip);

    this._bindEvents();
    this._startVUMeterAnimation();
  }

  _bindEvents() {
    this.container.addEventListener('input', (e) => {
      if (e.target.classList.contains('fader-slider')) {
        const trackId = e.target.dataset.track;
        const val = parseFloat(e.target.value);
        this.audioEngine.setTrackVolume(trackId, val);
        const txt = this.container.querySelector(`#vol-txt-${trackId}`);
        if (txt) txt.textContent = `${Math.round(val * 100)}%`;
      } else if (e.target.id === 'masterFader') {
        const val = parseFloat(e.target.value);
        this.audioEngine.setMasterVolume(val);
        const txt = this.container.querySelector('#vol-txt-master');
        if (txt) txt.textContent = `${Math.round(val * 100)}%`;
      }
    });

    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('.sm-btn');
      if (!btn) return;
      const trackId = btn.dataset.track;
      const action = btn.dataset.action;

      if (action === 'solo') {
        this.audioEngine.toggleSolo(trackId);
        this.render();
      } else if (action === 'mute') {
        this.audioEngine.toggleMute(trackId);
        this.render();
      }
    });
  }

  _startVUMeterAnimation() {
    if (this.vuInterval) clearInterval(this.vuInterval);

    this.vuInterval = setInterval(() => {
      if (!this.audioEngine.isPlaying) {
        // Clear all meters
        const leds = this.container.querySelectorAll('.vu-led');
        leds.forEach(led => led.className = 'vu-led');
        return;
      }

      this.audioEngine.trackNames.forEach(track => {
        const level = this.audioEngine.getChannelMeterLevel(track.id); // 0 to 100
        const activeCount = Math.floor((level / 100) * 10);
        const vuMeter = this.container.querySelector(`#vu-${track.id}`);
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
      const masterLevel = this.audioEngine.getMasterMeterLevel();
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
