// Menus, windows and the HUD. All markup lives in index.html.

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.screens = ['loading', 'menu', 'hud', 'pause', 'goodbye'];
    this.current = 'loading';
    this.modal = null;
    this.focusIndex = 0;

    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) {
        game.audio.click();
        this.action(btn.dataset.action);
        return;
      }
      if (e.target.closest('[data-close]') || e.target.classList.contains('modal')) {
        game.audio.click();
        this.closeModal();
      }
    });
    document.addEventListener('mouseover', (e) => {
      const btn = e.target.closest('.aero-btn');
      if (btn && btn !== this.hovered) {
        this.hovered = btn;
        game.audio.hover();
        const list = this.focusables();
        const i = list.indexOf(btn);
        if (i >= 0) this.setFocus(i, false);
      }
      if (!btn) this.hovered = null;
    });
    addEventListener('keydown', (e) => this.key(e));
    const unlock = () => game.audio.start();
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);

    this.bindOptions();
    this.tickClock();
    setInterval(() => this.tickClock(), 1000 * 15);
  }

  show(name) {
    this.current = name;
    for (const s of this.screens) $(s).classList.toggle('show', s === name);
    this.setFocus(0, false);
  }

  progress(f, text) {
    $('load-fill').style.width = Math.round(f * 100) + '%';
    if (text) $('load-text').textContent = text;
  }

  focusables() {
    const root = this.modal ? $(this.modal) : $(this.current);
    return root ? [...root.querySelectorAll('.aero-btn')] : [];
  }

  setFocus(i, sound = true) {
    const list = this.focusables();
    document.querySelectorAll('.aero-btn.focus').forEach((b) => b.classList.remove('focus'));
    if (!list.length) return;
    this.focusIndex = (i + list.length) % list.length;
    list[this.focusIndex].classList.add('focus');
    if (sound) this.game.audio.hover();
  }

  key(e) {
    const g = this.game;
    if (e.code === 'Escape') {
      if (this.modal) return this.closeModal();
      if (g.state === 'playing') return g.pause();
      if (g.state === 'paused' && performance.now() - g.pausedAt > 400) return g.resume();
      return;
    }
    const menuish = this.modal || ['menu', 'pause', 'goodbye'].includes(this.current);
    if (!menuish) return;
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault();
      this.setFocus(this.focusIndex + (e.code === 'ArrowDown' ? 1 : -1));
    } else if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      const btn = this.focusables()[this.focusIndex];
      if (btn) btn.click();
    }
  }

  action(name) {
    const g = this.game;
    switch (name) {
      case 'play': return g.startPlay();
      case 'options': return this.openModal('options');
      case 'credits': return this.openModal('credits');
      case 'quit': return g.quit();
      case 'back': return g.toMenu();
      case 'resume': return g.resume();
      case 'menu': return g.toMenu();
    }
  }

  openModal(id) {
    this.modal = id;
    $(id).classList.add('show');
    this.syncOptions();
    this.setFocus(0, false);
  }

  closeModal() {
    if (!this.modal) return;
    $(this.modal).classList.remove('show');
    this.modal = null;
    this.setFocus(0, false);
  }

  bindOptions() {
    const s = this.game.settings;
    const root = $('options');
    root.querySelectorAll('[data-setting]').forEach((el) => {
      const key = el.dataset.setting;
      if (el.classList.contains('seg')) {
        el.addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          s[key] = b.dataset.value;
          this.syncOptions();
          this.game.settingsChanged(key);
        });
      } else {
        el.addEventListener('input', () => {
          s[key] = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
          this.game.settingsChanged(key);
        });
      }
    });
  }

  syncOptions() {
    const s = this.game.settings;
    $('options').querySelectorAll('[data-setting]').forEach((el) => {
      const v = s[el.dataset.setting];
      if (el.classList.contains('seg')) {
        el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.value === v));
      } else if (el.type === 'checkbox') {
        el.checked = !!v;
      } else {
        el.value = v;
      }
    });
  }

  tickClock() {
    const d = new Date();
    $('g-time').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    $('g-date').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  }

  placeSpeech(x, y, visible) {
    const el = $('speech');
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - el.offsetHeight)}px)`;
    el.style.opacity = visible ? '1' : '0';
  }

  setCount(n) {
    $('hud-count').textContent = n;
    const pill = $('hud-pill');
    pill.classList.remove('bump');
    void pill.offsetWidth;
    pill.classList.add('bump');
  }

  setFps(text) {
    $('hud-fps').textContent = text;
  }

  hint(visible) {
    $('hud-hint').classList.toggle('hidden', !visible);
  }

  helpFade(faded) {
    $('hud-help').classList.toggle('faded', faded);
  }

  fade(on) {
    $('fade').classList.toggle('on', on);
  }
}
