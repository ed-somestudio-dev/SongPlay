export class MidiCueEditor {
  constructor(modalElement, onSaveCallback) {
    this.modal = modalElement;
    this.onSave = onSaveCallback;
  }

  open(cueData = null) {
    if (!this.modal) return;
    this.modal.classList.add('open');

    const busInput = this.modal.querySelector('#midiBus');
    const msgInput = this.modal.querySelector('#midiMsg');
    const valInput = this.modal.querySelector('#midiVal');
    const descInput = this.modal.querySelector('#midiDesc');

    if (cueData) {
      if (busInput) busInput.value = cueData.bus || 'Lyrics';
      if (msgInput) msgInput.value = cueData.msg || 'Note';
      if (valInput) valInput.value = cueData.val || 'C1';
      if (descInput) descInput.value = cueData.desc || '';
    }

    this._bindEvents();
  }

  close() {
    if (!this.modal) return;
    this.modal.classList.remove('open');
  }

  _bindEvents() {
    const closeBtn = this.modal.querySelector('.close-btn');
    const saveBtn = this.modal.querySelector('#saveMidiCueBtn');

    if (closeBtn) {
      closeBtn.onclick = () => this.close();
    }

    if (saveBtn) {
      saveBtn.onclick = () => {
        const cue = {
          bus: this.modal.querySelector('#midiBus')?.value || 'Lyrics',
          msg: this.modal.querySelector('#midiMsg')?.value || 'Note',
          val: this.modal.querySelector('#midiVal')?.value || 'C1',
          desc: this.modal.querySelector('#midiDesc')?.value || ''
        };
        if (this.onSave) this.onSave(cue);
        this.close();
      };
    }
  }
}
