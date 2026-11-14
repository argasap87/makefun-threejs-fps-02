// The objective: Ember plants a charge on a site, Wardens defuse it. A round is won
// by eliminating the other team, by the charge going off, by a defuse, or by the
// clock running out with the charge unplanted (Wardens hold the yard).
import * as THREE from 'three';
export function createObjective(world) {
  const state = {
    phase: 'buy', // 'buy' | 'live' | 'over'
    round: 1,
    wins: { ember: 0, warden: 0 },
    timer: 12,
    planted: false,
    plantedSite: null, // 'A' | 'B'
    plantAt: 0,
    defuseAt: 0,
    chargeTimer: 40,
    winner: null,
    reason: '',
    matchOver: false,
  };

  function siteBox(name) {
    return name === 'A' ? world.siteA : world.siteB;
  }

  function siteOf(pos) {
    if (world.siteA.containsPoint(pos)) return 'A';
    if (world.siteB.containsPoint(pos)) return 'B';
    return null;
  }

  return {
    state,
    siteOf,
    startRound(round) {
      state.round = round;
      state.phase = 'buy';
      state.timer = 12;
      state.planted = false;
      state.plantedSite = null;
      state.plantAt = 0;
      state.defuseAt = 0;
      state.chargeTimer = 40;
      state.winner = null;
      state.reason = '';
    },
    beginLive() {
      state.phase = 'live';
      state.timer = 100;
    },
    plant(site) {
      if (state.phase !== 'live' || state.planted) return false;
      state.planted = true;
      state.plantedSite = site;
      state.chargeTimer = 40;
      return true;
    },
    endRound(winner, reason) {
      if (state.phase === 'over') return;
      state.phase = 'over';
      state.winner = winner;
      state.reason = reason;
      state.wins[winner] += 1;
      state.matchOver = state.wins.ember >= 5 || state.wins.warden >= 5 || state.round >= 9;
    },
    resetMatch() {
      state.wins = { ember: 0, warden: 0 };
      state.round = 1;
      state.matchOver = false;
      this.startRound(1);
    },
    siteCenter(name) {
      const box = siteBox(name);
      const c = box.getCenter(new THREE.Vector3());
      return { x: c.x, z: c.z };
    },
  };
}
