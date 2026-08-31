export class SetlistManager {
  constructor(containerElement, onSongSelectCallback) {
    this.container = containerElement;
    this.onSongSelect = onSongSelectCallback;
    this.queuedSong = null;
    this.songs = [
      {
        id: 'a_ele_a_gloria',
        title: 'A Ele a Glória',
        artist: 'Diante do Trono',
        key: 'Gb',
        bpm: 68,
        timeSignature: '4/4',
        duration: 278,
        cover: '/covers/a_ele_a_gloria.png',
        sections: [
          { label: 'Intro', startTime: 0, endTime: 24, color: '#6366f1' },
          { label: 'Verso 1', startTime: 24, endTime: 75, color: '#3b82f6' },
          { label: 'Refrão', startTime: 75, endTime: 140, color: '#a855f7' },
          { label: 'Ponte', startTime: 140, endTime: 210, color: '#f59e0b' },
          { label: 'Outro', startTime: 210, endTime: 278, color: '#10b981' }
        ],
        chords: [
          {
            section: 'Intro',
            lines: [
              { chord: 'Gb  |  Db/F  |  Ebm7  |  B', lyric: '(Instrumental suave)' }
            ]
          },
          {
            section: 'Verso 1',
            lines: [
              { chord: 'Gb                          Db/F', lyric: 'Porque dEle e por Ele, para Ele são todas as coisas' },
              { chord: 'Ebm7                        B', lyric: 'Porque dEle e por Ele, para Ele são todas as coisas' }
            ]
          },
          {
            section: 'Refrão',
            lines: [
              { chord: 'Gb        Db/F', lyric: 'A Ele a glória, a Ele a glória' },
              { chord: 'Ebm7      B', lyric: 'A Ele a glória para sempre, amém' }
            ]
          },
          {
            section: 'Ponte',
            lines: [
              { chord: 'Ebm7      B           Gb           Db', lyric: 'Quão profundas são as riquezas da sabedoria de Deus' },
              { chord: 'Ebm7      B           Gb           Db', lyric: 'Quão insondáveis Seus juízos e incalculáveis Seus caminhos' }
            ]
          },
          {
            section: 'Outro',
            lines: [
              { chord: 'Gb  |  B/Gb  |  Gb', lyric: 'Amém, Amém!' }
            ]
          }
        ]
      },
      {
        id: 'lugar_secreto',
        title: 'Lugar Secreto',
        artist: 'Gabriela Rocha',
        key: 'C',
        bpm: 72,
        timeSignature: '4/4',
        duration: 250,
        cover: '/covers/lugar_secreto.png',
        sections: [
          { label: 'Intro', startTime: 0, endTime: 20, color: '#6366f1' },
          { label: 'Verso 1', startTime: 20, endTime: 70, color: '#3b82f6' },
          { label: 'Refrão', startTime: 70, endTime: 135, color: '#a855f7' },
          { label: 'Ponte', startTime: 135, endTime: 200, color: '#f59e0b' },
          { label: 'Outro', startTime: 200, endTime: 250, color: '#10b981' }
        ],
        chords: [
          {
            section: 'Intro',
            lines: [
              { chord: 'C  |  G/B  |  Am7  |  F2', lyric: '(Teclado e Pad)' }
            ]
          },
          {
            section: 'Verso 1',
            lines: [
              { chord: 'C', lyric: 'Tu és a minha vaidade, nada me faltará' },
              { chord: 'Am7                             F2', lyric: 'Em teus braços é o meu descanso' }
            ]
          },
          {
            section: 'Refrão',
            lines: [
              { chord: 'C                       G', lyric: 'Eu quero conhecer Jesus, eu quero conhecer Jesus' },
              { chord: 'Am7                     F', lyric: 'E ser achado nEle, e ser achado nEle' }
            ]
          }
        ]
      },
      {
        id: 'algo_novo',
        title: 'Algo Novo',
        artist: 'Kemuel & Lukas Agustinho',
        key: 'D',
        bpm: 130,
        timeSignature: '4/4',
        duration: 230,
        cover: '/covers/algo_novo.png',
        sections: [
          { label: 'Intro', startTime: 0, endTime: 18, color: '#6366f1' },
          { label: 'Verso 1', startTime: 18, endTime: 60, color: '#3b82f6' },
          { label: 'Refrão', startTime: 60, endTime: 125, color: '#a855f7' },
          { label: 'Ponte', startTime: 125, endTime: 185, color: '#f59e0b' },
          { label: 'Outro', startTime: 185, endTime: 230, color: '#10b981' }
        ],
        chords: [
          {
            section: 'Intro',
            lines: [
              { chord: 'D  |  A/C#  |  Bm7  |  G', lyric: '(Guitarra e Bateria)' }
            ]
          },
          {
            section: 'Refrão',
            lines: [
              { chord: 'D                     A/C#', lyric: 'Deus está fazendo algo novo' },
              { chord: 'Bm7                   G', lyric: 'Derramando do Seu Espírito' }
            ]
          }
        ]
      }
    ];

    this.activeSongIndex = 0;
  }

  getActiveSong() {
    return this.songs[this.activeSongIndex];
  }

  setQueuedSong(song) {
    this.queuedSong = song;
    this.render();
  }

  addSong(song) {
    this.songs.push(song);
    this.activeSongIndex = this.songs.length - 1;
    this.render();
    return song;
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = '';

    this.songs.forEach((song, idx) => {
      const isActive = idx === this.activeSongIndex;
      const isQueued = this.queuedSong && this.queuedSong.id === song.id;

      const card = document.createElement('div');
      card.className = `setlist-card ${isActive ? 'active' : ''} ${isQueued ? 'queued' : ''}`;
      card.innerHTML = `
        <img src="${song.cover}" class="card-art" alt="${song.title}">
        <div class="card-info">
          <div class="card-title">${song.title}</div>
          <div class="card-meta">
            <span class="key-badge">${song.key}</span>
            <span>${song.bpm} BPM</span>
          </div>
        </div>
        ${idx < this.songs.length - 1 ? '<div class="setlist-next-arrow">&rarr;</div>' : ''}
      `;

      card.addEventListener('click', () => {
        if (this.onSongSelect) this.onSongSelect(song, idx);
      });

      this.container.appendChild(card);
    });
  }
}
