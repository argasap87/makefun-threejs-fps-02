// The DOM HUD: crosshair, hit marker, ammo, health, money, timer, team scores,
// kill feed, objective bar, round banner and the buy menu. It never touches the
// simulation; main.js pushes numbers in and reads the play callback out.
const COPY = {
  start: {
    title: 'Emberline',
    copy: 'Five on five in the Foundry Yard. Plant the charge on Furnace or Depot, or drop every Warden. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Emberline',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Match over',
    copy: 'The yard is decided.',
    action: 'Play again',
  },
};

function el(id) { return document.getElementById(id); }

export function createHud() {
  const overlay = el('overlay');
  const title = el('overlay-title');
  const copy = el('overlay-copy');
  const play = el('play');
  const ammo = el('ammo');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const weaponName = el('weapon-name');
  const healthNum = el('health-num');
  const healthBar = el('health-bar');
  const healthBox = el('health');
  const healthSub = el('health-sub');
  const hitmarker = el('hitmarker');
  const timer = el('timer');
  const phase = el('phase');
  const scoreEmber = el('score-ember');
  const scoreWarden = el('score-warden');
  const killfeed = el('killfeed');
  const objective = el('objective');
  const objectiveLabel = el('objective-label');
  const objectiveBar = el('objective-bar');
  const banner = el('banner');
  const bannerText = el('banner-text');
  const bannerSub = el('banner-sub');
  const flash = el('flash');
  const buy = el('buy');
  const buyMoney = el('buy-money');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = { mag: -1, reserve: -2, health: -1, money: -1, armor: -1, weapon: '' };

  function fmtTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setAmmo(mag, reserve, name) {
      if (mag === last.mag && reserve === last.reserve && name === last.weapon) return;
      last.mag = mag; last.reserve = reserve; last.weapon = name;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = reserve < 0 ? '/ ∞' : `/ ${reserve}`;
      ammo.classList.toggle('empty', mag === 0);
      weaponName.textContent = name;
    },
    setHealth(health, money, armor) {
      if (health === last.health && money === last.money && armor === last.armor) return;
      last.health = health; last.money = money; last.armor = armor;
      healthNum.textContent = String(Math.max(0, Math.round(health)));
      healthBar.style.width = `${Math.max(0, Math.min(100, health))}%`;
      healthBox.classList.toggle('low', health <= 30);
      healthSub.textContent = `$${money} · ${armor > 0 ? `armour ${Math.round(armor)}` : 'no armour'}`;
    },
    setTimer(seconds, phaseName) {
      timer.textContent = fmtTime(seconds);
      timer.classList.toggle('low', seconds <= 10 && phaseName === 'live');
      phase.textContent = phaseName.toUpperCase();
    },
    setScores(ember, warden) {
      scoreEmber.textContent = String(ember);
      scoreWarden.textContent = String(warden);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    feed(killer, killerTeam, victim, victimTeam, how) {
      const line = document.createElement('div');
      const kc = killerTeam === 'ember' ? 'e' : 'w';
      const vc = victimTeam === 'ember' ? 'e' : 'w';
      line.innerHTML = `<b class="${kc}"></b> <b class="${vc}"></b>`;
      line.children[0].textContent = killer;
      line.children[1].textContent = ` ▸ ${victim}${how ? ` (${how})` : ''}`;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => line.remove(), 6000);
    },
    showBanner(text, sub, holdMs = 2600) {
      bannerText.textContent = text;
      bannerSub.textContent = sub;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), holdMs);
    },
    hideBanner() {
      banner.classList.remove('on');
    },
    setObjective(label, fraction) {
      if (!label) { objective.classList.remove('on'); return; }
      objective.classList.add('on');
      objectiveLabel.textContent = label;
      objectiveBar.style.width = `${Math.round(fraction * 100)}%`;
    },
    flashScreen(strength) {
      flash.style.opacity = String(Math.min(0.9, strength));
      setTimeout(() => { flash.style.opacity = '0'; }, 120);
    },
    showBuy(money) {
      buyMoney.textContent = `$${money}`;
      buy.hidden = false;
    },
    hideBuy() {
      buy.hidden = true;
    },
    get buyOpen() {
      return !buy.hidden;
    },
    showOverlay(mode, score) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'end' ? `${text.copy} Ember ${score.ember} — ${score.warden} Warden.` : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
