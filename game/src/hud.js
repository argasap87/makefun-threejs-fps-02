// The DOM HUD: crosshair, hit marker, ammo, health, money, timer, team scores,
// kill feed, objective bar, round banner and the buy menu. It never touches the
// simulation; main.js pushes numbers in and reads the play callback out.
const OVERLAY_COPY = {
  start: {
    title: "Emberline",
    copy: "Five on five in the Foundry Yard. Plant the charge on Furnace or Depot, or drop every Warden. Click to play.",
    action: "Click to play",
  },
  paused: {
    title: "Emberline",
    copy: "Paused. Click to resume.",
    action: "Click to resume",
  },
  end: {
    title: "Match over",
    copy: "The yard is decided.",
    action: "Play again",
  },
};

function get(id) { return document.getElementById(id); }

export function createHud() {
  const overlay = get("overlay");
  const title = get("overlay-title");
  const copy = get("overlay-copy");
  const play = get("play");
  const ammo = get("ammo");
  const ammoMag = get("ammo-mag");
  const ammoReserve = get("ammo-reserve");
  const weaponName = get("weapon-name");
  const healthNum = get("health-num");
  const healthBar = get("health-bar");
  const healthBox = get("health");
  const healthSub = get("health-sub");
  const hitmarker = get("hitmarker");
  const timer = get("timer");
  const phase = get("phase");
  const scoreEmber = get("score-ember");
  const scoreWarden = get("score-warden");
  const killfeed = get("killfeed");
  const objective = get("objective");
  const objectiveLabel = get("objective-label");
  const objectiveBar = get("objective-bar");
  const banner = get("banner");
  const bannerText = get("banner-text");
  const bannerSub = get("banner-sub");
  const flash = get("flash");
  const buy = get("buy");
  const buyMoney = get("buy-money");
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = { mag: -1, reserve: -2, health: -1, money: -1, armor: -1, weapon: "" };

  function clockText(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  return {
    setAmmo(mag, reserve, name) {
      if (mag === last.mag && reserve === last.reserve && name === last.weapon) return;
      last.mag = mag; last.reserve = reserve; last.weapon = name;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = reserve < 0 ? "/ ∞" : `/ ${reserve}`;
      ammo.classList.toggle("empty", mag === 0);
      weaponName.textContent = name;
    },
    setHealth(health, money, armor) {
      if (health === last.health && money === last.money && armor === last.armor) return;
      last.health = health; last.money = money; last.armor = armor;
      healthNum.textContent = String(Math.max(0, Math.round(health)));
      healthBar.style.width = `${Math.max(0, Math.min(100, health))}%`;
      healthBox.classList.toggle("low", health <= 30);
      healthSub.textContent = `$${money} · ${armor > 0 ? `armour ${Math.round(armor)}` : "no armour"}`;
    },
    setTimer(seconds, phaseName) {
      timer.textContent = clockText(seconds);
      timer.classList.toggle("low", seconds <= 10 && phaseName === "live");
      phase.textContent = phaseName.toUpperCase();
    },
    setScores(ember, warden) {
      scoreEmber.textContent = String(ember);
      scoreWarden.textContent = String(warden);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add("on");
      hitmarker.style.transform = killed ? "translate(-50%, -50%) rotate(45deg) scale(1.25)" : "";
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove("on");
        hitmarker.style.transform = "";
      }, holdMs);
    },
    feed(killer, killerTeam, victim, victimTeam, how) {
      const line = document.createElement("div");
      const kc = killerTeam === "ember" ? "e" : "w";
      const vc = victimTeam === "ember" ? "e" : "w";
      line.innerHTML = `<b class="${kc}"></b> <b class="${vc}"></b>`;
      line.children[0].textContent = killer;
      line.children[1].textContent = ` ▸ ${victim}${how ? ` (${how})` : ""}`;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => line.remove(), 6000);
    },
    showBanner(text, sub, holdMs = 2600) {
      bannerText.textContent = text;
      bannerSub.textContent = sub;
      banner.classList.add("on");
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove("on"), holdMs);
    },
    hideBanner() {
      banner.classList.remove("on");
    },
    setObjective(label, fraction) {
      if (!label) { objective.classList.remove("on"); return; }
      objective.classList.add("on");
      objectiveLabel.textContent = label;
      objectiveBar.style.width = `${Math.round(fraction * 100)}%`;
    },
    flashScreen(strength) {
      flash.style.opacity = String(Math.min(0.9, strength));
      setTimeout(() => { flash.style.opacity = "0"; }, 120);
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
      const text = OVERLAY_COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === "end" ? `${text.copy} Ember ${score.ember} — ${score.warden} Warden.` : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener("click", handler);
    },
  };
}
