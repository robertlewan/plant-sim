// Refinery engine: a simplified crude distillation unit. Every level runs the
// same plant model; a level switches units on and decides which loops the player
// owns. Units that are not active hold their normal operating values, so a level
// that only builds the crude tank still sits inside the same refinery.
//
// Pure logic, no DOM: runs in the browser and in Node tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Plant = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DT = 0.1;          // s, fixed simulation step
  const VALVE_TAU = 3;     // s, valve actuator lag
  const TAU_FLOW = 1.5;    // s, flow line lag
  const TANK_AREA = 10;    // m2, crude tank
  const K_OUT = 1.414;     // crude tank gravity outlet coefficient
  const K_FLOW = 2;        // charge flow at 100% valve and unit head
  const WARMUP = 300;      // s, settle the plant before the player takes over
  const AIR_MIN = 4;       // bar, valves lose their air below this header pressure

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // Process variables: label, unit, transmitter range, alarm limits, normal value.
  const VARS = {
    'TK101.L': { label: 'TK-101 crude level', unit: 'm', range: [0, 6], hh: 5.2, ll: 0.5, init: 3 },
    'FT201.F': { label: 'Charge flow', unit: 'm³/s', range: [0, 2.5], hh: 2.3, ll: 0.1, init: 1.2 },
    'D401.I': { label: 'Desalter interface', unit: '%', range: [0, 100], hh: 85, ll: 15, init: 50 },
    'E301.T': { label: 'Preheat outlet temp', unit: '°C', range: [0, 300], hh: 200, ll: 60, init: 130 },
    'H501.T': { label: 'Heater outlet temp', unit: '°C', range: [0, 500], hh: 400, ll: 120, init: 350 },
    'FT502.F': { label: 'Fuel gas flow', unit: 'kg/s', range: [0, 2], hh: null, ll: null, init: 1.0 },
    'C601.L': { label: 'Tower bottoms level', unit: 'm', range: [0, 4], hh: 3.4, ll: 0.6, init: 2 },
    'C601.P': { label: 'Tower overhead pressure', unit: 'bar', range: [0, 3], hh: 2.5, ll: 0.5, init: 1.5 },
    'D701.L': { label: 'Reflux drum level', unit: 'm', range: [0, 3], hh: 2.6, ll: 0.4, init: 1.5 },
    'FT702.F': { label: 'Reflux flow', unit: 'm³/s', range: [0, 1], hh: null, ll: null, init: 0.4 },
    'FT801.F': { label: 'Diesel side draw', unit: 'm³/s', range: [0, 1], hh: null, ll: null, init: 0.3 },
    'TK802.L': { label: 'TK-802 diesel level', unit: 'm', range: [0, 10], hh: 9, ll: 1, init: 5 },
    'TK803.L': { label: 'TK-803 residue level', unit: 'm', range: [0, 10], hh: 9, ll: 1, init: 5 },
    'PT1101.P': { label: 'Instrument air header', unit: 'bar', range: [0, 10], hh: 9.5, ll: 4.5, init: 7 },
  };

  // Units of the refinery, in flow order. Each owns some process variables.
  const UNITS = {
    TK101: { name: 'Crude tank TK-101', vars: ['TK101.L'] },
    P201: { name: 'Charge pump P-201', vars: ['FT201.F'] },
    D401: { name: 'Desalter D-401', vars: ['D401.I'] },
    E301: { name: 'Preheat exchanger E-301', vars: ['E301.T'] },
    H501: { name: 'Charge heater H-501', vars: ['H501.T', 'FT502.F'] },
    C601: { name: 'Atmospheric tower C-601', vars: ['C601.L', 'C601.P'] },
    D701: { name: 'Reflux drum D-701', vars: ['D701.L', 'FT702.F'] },
    P801: { name: 'Diesel side draw P-801', vars: ['FT801.F'] },
    TK802: { name: 'Diesel tank TK-802', vars: ['TK802.L'] },
    TK803: { name: 'Residue tank TK-803', vars: ['TK803.L'] },
    K1101: { name: 'Instrument air K-1101', vars: ['PT1101.P'] },
  };

  // Control valves: normal position (%) and whether the actuator needs instrument air.
  const VALVES = {
    'LV-101': { name: 'TK-101 outlet', init: 45 },
    'FV-201': { name: 'Charge flow', init: 60 },
    'LV-401': { name: 'Desalter water draw', init: 36 },
    'TV-301': { name: 'Preheat bypass', init: 35 },
    'FV-502': { name: 'Heater fuel gas', init: 50 },
    'LV-601': { name: 'Tower bottoms', init: 52 },
    'PV-602': { name: 'Overhead vent to condenser', init: 38 },
    'LV-701': { name: 'Distillate (naphtha) draw', init: 28 },
    'FV-702': { name: 'Reflux', init: 40 },
    'FV-801': { name: 'Diesel side draw', init: 30 },
    'LV-802': { name: 'Diesel dispatch', init: 37.5 },
    'LV-803': { name: 'Residue dispatch', init: 52 },
    'PV-1101': { name: 'Air compressor load', init: 50, electric: true },
  };

  // Loop catalogue with the reference (correct) configuration of each loop.
  const LOOPS = {
    'LIC-101': { name: 'Crude tank level', pv: 'TK101.L', tt: 'LT-101', valve: 'LV-101', sp: 3, action: 'direct', kc: 2, ti: 30, fail: 'open' },
    'FIC-201': { name: 'Charge flow', pv: 'FT201.F', tt: 'FT-201', valve: 'FV-201', sp: 1.2, action: 'reverse', kc: 1, ti: 5, fail: 'closed' },
    'LIC-401': { name: 'Desalter interface', pv: 'D401.I', tt: 'LT-401', valve: 'LV-401', sp: 50, action: 'direct', kc: 2, ti: 20, fail: 'closed' },
    'TIC-301': { name: 'Preheat outlet temperature', pv: 'E301.T', tt: 'TT-301', valve: 'TV-301', sp: 130, action: 'direct', kc: 2, ti: 15, fail: 'open' },
    'TIC-501': { name: 'Heater outlet temperature', pv: 'H501.T', tt: 'TT-501', valve: 'FV-502', sp: 350, action: 'reverse', kc: 1, ti: 40, fail: 'closed' },
    'FIC-502': { name: 'Fuel gas flow', pv: 'FT502.F', tt: 'FT-502', valve: 'FV-502', sp: 1.0, action: 'reverse', kc: 1, ti: 5, fail: 'closed' },
    'LIC-601': { name: 'Tower bottoms level', pv: 'C601.L', tt: 'LT-601', valve: 'LV-601', sp: 2, action: 'direct', kc: 2, ti: 30, fail: 'closed' },
    'PIC-602': { name: 'Tower overhead pressure', pv: 'C601.P', tt: 'PT-602', valve: 'PV-602', sp: 1.5, action: 'direct', kc: 2, ti: 20, fail: 'open' },
    'LIC-701': { name: 'Reflux drum level', pv: 'D701.L', tt: 'LT-701', valve: 'LV-701', sp: 1.5, action: 'direct', kc: 2, ti: 30, fail: 'closed' },
    'FIC-702': { name: 'Reflux flow', pv: 'FT702.F', tt: 'FT-702', valve: 'FV-702', sp: 0.4, action: 'reverse', kc: 1, ti: 5, fail: 'open' },
    'FIC-801': { name: 'Diesel side draw flow', pv: 'FT801.F', tt: 'FT-801', valve: 'FV-801', sp: 0.3, action: 'reverse', kc: 1, ti: 5, fail: 'closed' },
    'LIC-802': { name: 'Diesel tank level', pv: 'TK802.L', tt: 'LT-802', valve: 'LV-802', sp: 5, action: 'direct', kc: 5, ti: 60, fail: 'closed' },
    'LIC-803': { name: 'Residue tank level', pv: 'TK803.L', tt: 'LT-803', valve: 'LV-803', sp: 5, action: 'direct', kc: 5, ti: 60, fail: 'closed' },
    'PIC-1101': { name: 'Instrument air header pressure', pv: 'PT1101.P', tt: 'PT-1101', valve: 'PV-1101', sp: 7, action: 'reverse', kc: 2, ti: 20, fail: 'closed' },
  };

  // Safety instrumented functions: independent sensors, voting and a latched trip.
  const SIS = {
    'LSHH-101': {
      name: 'Crude tank high-high level trip', pv: 'TK101.L',
      sensors: ['LT-101A', 'LT-101B', 'LT-101C'], votings: ['1oo3', '2oo3', '3oo3'],
      action: 'Closes XV-101 and stops crude receipt',
    },
    'TSHH-501': {
      name: 'Heater high-high outlet temperature trip', pv: 'H501.T',
      sensors: ['TT-501A', 'TT-501B'], votings: ['1oo2', '2oo2'],
      action: 'Closes XV-502 and shuts the fuel gas',
    },
  };
  const VOTES_NEEDED = { '1oo3': 1, '2oo3': 2, '3oo3': 3, '1oo2': 1, '2oo2': 2 };

  // Boundary conditions, overridden per level (number or function of time).
  const LOADS = {
    crude: 1.2,     // m3/s, crude receipt into TK-101
    head: 1,        // charge pump suction head factor (when TK-101 is not modelled)
    wash: 0.06,     // wash water as a fraction of charge
    hot: 0.62,      // m3/s, hot residue through E-301 (when the tower is not modelled)
    fuelP: 1,       // fuel gas header pressure factor
    airDemand: 1,   // instrument air consumption
    airCap: 2,      // compressor capacity at 100% load
    lights: 0,      // m3/s, extra light gas overhead (a lighter crude)
  };

  function load(run, key) {
    const v = run.level.loads && run.level.loads[key];
    const t = run.warming ? 0 : run.t;
    if (typeof v === 'function') return v(t);
    return v === undefined ? LOADS[key] : v;
  }

  function trueRange(level, tag) {
    return (level.ranges && level.ranges[tag]) || VARS[LOOPS[tag].pv].range;
  }

  function finalSp(level, tag) {
    let sp = level.sp && level.sp[tag] !== undefined ? level.sp[tag] : LOOPS[tag].sp;
    (level.spChanges || []).forEach((c) => { if (c.loop === tag) sp = c.sp; });
    return sp;
  }

  // The correct configuration for every loop and trip in a level.
  function referenceConfig(level) {
    const loops = {};
    Object.keys(level.loops).forEach((tag) => {
      const L = LOOPS[tag];
      const [lo, hi] = trueRange(level, tag);
      loops[tag] = Object.assign({
        lo, hi,
        sp: level.sp && level.sp[tag] !== undefined ? level.sp[tag] : L.sp,
        ratio: level.ratio && level.ratio[tag] !== undefined ? level.ratio[tag] : null,
        action: L.action, kc: L.kc, ti: L.ti, failPos: L.fail,
      }, level.tuning && level.tuning[tag]);
    });
    const sis = {};
    Object.keys(level.sis || {}).forEach((tag) => {
      sis[tag] = Object.assign({}, level.sisRef[tag]);
    });
    return { loops, sis };
  }

  // What the player sees at the start: given loops are commissioned (with any
  // planted faults), player loops are blank.
  function initialConfig(level) {
    const ref = referenceConfig(level);
    const faults = (level.faults && level.faults.cfg) || {};
    Object.keys(level.loops).forEach((tag) => {
      if (level.loops[tag] === 'player') {
        ref.loops[tag] = {
          lo: 0, hi: 10, sp: null, ratio: null, action: 'reverse', kc: 1, ti: 30, failPos: 'closed',
        };
      } else if (faults[tag]) {
        Object.assign(ref.loops[tag], faults[tag]);
      }
    });
    Object.keys(level.sis || {}).forEach((tag) => {
      if (level.sis[tag] === 'player') ref.sis[tag] = { sp: null, voting: SIS[tag].votings[0] };
    });
    return ref;
  }

  function isMaster(level, tag) {
    const modes = level.modes || {};
    return Object.keys(modes).some((k) => modes[k].cascadeFrom === tag);
  }

  // ---- Run setup ----

  function startRun(level, cfg) {
    const run = {
      level,
      cfg,
      t: 0,
      warming: false,
      active: new Set(level.units),
      x: {},
      valves: {},
      cmd: {},
      loops: {},
      sis: {},
      buf: {},
      pumpTrip: false,
      flowB: 0.62,
      flowS: 0.3,
      vapor: 0.68,
      airOk: true,
      events: [],
      trend: [],
      lastTrend: -1,
      stats: null,
    };
    Object.keys(VARS).forEach((k) => { run.x[k] = VARS[k].init; });
    Object.keys(VALVES).forEach((k) => { run.valves[k] = VALVES[k].init; run.cmd[k] = VALVES[k].init; });

    // Masters run before their slaves.
    const tags = Object.keys(level.loops);
    run.order = tags.filter((t) => isMaster(level, t)).concat(tags.filter((t) => !isMaster(level, t)));
    run.owner = {};
    tags.forEach((tag) => { if (!isMaster(level, tag)) run.owner[LOOPS[tag].valve] = tag; });
    tags.forEach((tag) => { run.loops[tag] = { integral: 0, out: 0, bias: 0, sp: 0, pv: 0 }; });
    Object.keys(level.sis || {}).forEach((tag) => { run.sis[tag] = { tripped: false, at: null }; });

    if (level.warmup !== false) {
      // Settle the plant on the reference configuration, then hand over bumplessly.
      const playerCfg = run.cfg;
      run.cfg = referenceConfig(level);
      initLoopBias(run);
      run.warming = true;
      for (let i = 0; i < WARMUP / DT; i += 1) stepCore(run);
      run.warming = false;
      run.cfg = playerCfg;
    }
    Object.assign(run.x, level.init || {});
    initLoopBias(run);
    run.t = 0;
    run.pumpTrip = false;
    run.stats = freshStats(level);
    track(run);
    return run;
  }

  // Bumpless start: each controller output starts where its valve (or slave setpoint) is.
  function initLoopBias(run) {
    const level = run.level;
    run.order.slice().reverse().forEach((tag) => {
      const st = run.loops[tag];
      const L = LOOPS[tag];
      let out;
      if (isMaster(level, tag)) {
        const slave = Object.keys(level.modes).find((k) => level.modes[k].cascadeFrom === tag);
        const sc = run.cfg.loops[slave];
        const span = sc.hi - sc.lo > 0 ? sc.hi - sc.lo : 1;
        const slaveSp = run.x[LOOPS[slave].pv];
        out = clamp(((slaveSp - sc.lo) / span) * 100, 0, 100);
      } else {
        out = run.valves[L.valve];
      }
      st.bias = out;
      st.out = out;
      st.integral = 0;
    });
  }

  function freshStats(level) {
    return {
      hh: {}, ll: {}, max: {}, min: {},
      holdOut: level.checks.map(() => 0),
      par: { lastOut: 0, sign: 0, crossed: false, maxDev: 0 },
      firstAlarm: null,
    };
  }

  // ---- Measurement and control ----

  function measure(run, tag) {
    const cfg = run.cfg.loops[tag];
    const [tlo, thi] = trueRange(run.level, tag);
    let value = run.x[LOOPS[tag].pv];
    const fault = run.level.faults && run.level.faults.pv && run.level.faults.pv[tag];
    if (fault && !run.warming && run.t >= fault.at) value = fault.value;
    const frac = clamp((value - tlo) / (thi - tlo), 0, 1);
    return cfg.lo + frac * (cfg.hi - cfg.lo);
  }

  // Setpoint of a loop in the transmitter's physical units, for drawing.
  function spTrue(run, tag) {
    const cfg = run.cfg.loops[tag];
    const [tlo, thi] = trueRange(run.level, tag);
    const span = cfg.hi - cfg.lo || 1;
    return tlo + ((run.loops[tag].sp - cfg.lo) / span) * (thi - tlo);
  }

  // PID with output bias. 'direct': output rises when PV is above SP.
  function pid(st, cfg, pv, sp) {
    const span = cfg.hi - cfg.lo > 0 ? cfg.hi - cfg.lo : 1;
    const ti = Math.max(cfg.ti, 0.1);
    const err = ((cfg.action === 'direct' ? pv - sp : sp - pv) / span) * 100;
    const u = st.bias + cfg.kc * (err + st.integral / ti);
    const saturating = (u > 100 && err > 0) || (u < 0 && err < 0);
    if (!saturating) st.integral += err * DT; // anti-windup
    st.out = clamp(st.bias + cfg.kc * (err + st.integral / ti), 0, 100);
  }

  function controllers(run) {
    const modes = run.level.modes || {};
    run.order.forEach((tag) => {
      const cfg = run.cfg.loops[tag];
      const st = run.loops[tag];
      const mode = modes[tag] || {};
      let sp;
      if (mode.cascadeFrom) {
        sp = cfg.lo + (run.loops[mode.cascadeFrom].out / 100) * (cfg.hi - cfg.lo);
      } else if (mode.ratioTo) {
        sp = (cfg.ratio || 0) * run.x[mode.ratioTo];
      } else {
        sp = cfg.sp;
      }
      st.sp = sp;
      st.pv = measure(run, tag);
      pid(st, cfg, st.pv, sp);
      if (!isMaster(run.level, tag)) run.cmd[LOOPS[tag].valve] = st.out;
    });
  }

  function airLost(run, valve) {
    if (VALVES[valve].electric || run.warming) return false;
    const test = run.level.airTest;
    if (test && run.t >= test.start && run.t < test.end && (!test.valves || test.valves.includes(valve))) return true;
    return !run.airOk;
  }

  function failPosition(run, valve) {
    const owner = run.owner[valve];
    return owner ? run.cfg.loops[owner].failPos : 'closed';
  }

  function moveValves(run) {
    run.airOk = !run.active.has('K1101') || run.x['PT1101.P'] >= AIR_MIN;
    Object.keys(VALVES).forEach((v) => {
      const target = airLost(run, v) ? (failPosition(run, v) === 'open' ? 100 : 0) : run.cmd[v];
      run.valves[v] += ((target - run.valves[v]) * DT) / VALVE_TAU;
    });
  }

  function safety(run) {
    if (run.warming) return;
    Object.keys(run.sis).forEach((tag) => {
      const st = run.sis[tag];
      if (st.tripped) return;
      const c = run.cfg.sis[tag];
      if (c.sp === null || !Number.isFinite(c.sp)) return;
      const readings = sensorReadings(run, tag);
      const votes = readings.filter((r) => r >= c.sp).length;
      if (votes >= VOTES_NEEDED[c.voting]) {
        st.tripped = true;
        st.at = run.t;
        run.events.push({ t: run.t, kind: 'trip', text: `${tag} tripped: ${SIS[tag].action}.` });
      }
    });
  }

  function sensorReadings(run, tag) {
    const S = SIS[tag];
    const faults = (run.level.faults && run.level.faults.sensors && run.level.faults.sensors[tag]) || {};
    return S.sensors.map((name) => {
      const f = faults[name];
      return f && run.t >= f.at ? f.value : run.x[S.pv];
    });
  }

  // ---- Process model ----

  function lag(run, key, target, tau) {
    run.x[key] += ((target - run.x[key]) * DT) / tau;
  }

  // First-order lag behind a pure dead time (heat transfer is slow to show up).
  function deadLag(run, key, target, dead, tau) {
    const n = Math.max(1, Math.round(dead / DT));
    let b = run.buf[key];
    if (!b) {
      b = run.buf[key] = { data: new Array(n).fill(target), i: 0 };
    }
    const delayed = b.data[b.i];
    b.data[b.i] = target;
    b.i = (b.i + 1) % n;
    lag(run, key, delayed, tau);
  }

  function physics(run) {
    const X = run.x;
    const act = run.active;
    const V = (tag) => run.valves[tag] / 100;

    // Charge pump P-201 and charge flow
    if (act.has('P201')) {
      let head = load(run, 'head');
      if (act.has('TK101')) {
        if (X['TK101.L'] < 0.3 && !run.pumpTrip) {
          run.pumpTrip = true;
          if (!run.warming) run.events.push({ t: run.t, kind: 'alarm', text: 'P-201 tripped on low suction level.' });
        }
        if (run.pumpTrip && X['TK101.L'] > 1.0) run.pumpTrip = false;
        head = run.pumpTrip ? 0 : 1;
      }
      lag(run, 'FT201.F', K_FLOW * V('FV-201') * Math.sqrt(Math.max(head, 0)), TAU_FLOW);
    }
    const F = X['FT201.F'];
    const Fh = Math.max(F, 0.3);

    // Crude tank TK-101
    if (act.has('TK101')) {
      const tripped = run.sis['LSHH-101'] && run.sis['LSHH-101'].tripped;
      const inflow = tripped ? 0 : load(run, 'crude');
      const out = act.has('P201') ? F : K_OUT * V('LV-101') * Math.sqrt(Math.max(X['TK101.L'], 0));
      X['TK101.L'] = clamp(X['TK101.L'] + ((inflow - out) / TANK_AREA) * DT, 0, 6);
    }

    // Desalter D-401: wash water settles out, the interface level rises
    if (act.has('D401')) {
      const win = load(run, 'wash') * F;
      const wout = 0.2 * V('LV-401');
      X['D401.I'] = clamp(X['D401.I'] + (win - wout) * 50 * DT, 0, 100);
    }

    // Preheat E-301: hot residue heats crude; the bypass valve sends crude around it
    if (act.has('E301')) {
      const hot = act.has('C601') ? run.flowB : load(run, 'hot');
      const dTmax = (300 * hot) / Fh;
      deadLag(run, 'E301.T', 30 + (1 - V('TV-301')) * dTmax, 4, 15);
    }

    // Charge heater H-501: fuel gas heats the charge
    if (act.has('H501')) {
      const shut = run.sis['TSHH-501'] && run.sis['TSHH-501'].tripped;
      const fuel = shut ? 0 : 2 * V('FV-502') * Math.sqrt(Math.max(load(run, 'fuelP'), 0));
      lag(run, 'FT502.F', fuel, TAU_FLOW);
      deadLag(run, 'H501.T', X['E301.T'] + (264 * X['FT502.F']) / Fh, 5, 25);
    }

    // Atmospheric tower C-601: hotter feed vaporises more; vapour goes overhead
    if (act.has('C601')) {
      const phi = clamp((X['H501.T'] - 250) / 250, 0.05, 0.7);
      const R = act.has('D701') ? X['FT702.F'] : 0.4;
      if (act.has('P801')) {
        lag(run, 'FT801.F', (X['C601.L'] > 0.3 ? 1 : 0) * V('FV-801'), TAU_FLOW);
        run.flowS = X['FT801.F'];
      } else {
        run.flowS = 0.3;
      }
      const B = X['C601.L'] > 0.05 ? 1.2 * V('LV-601') : 0;
      run.flowB = B;
      X['C601.L'] = clamp(X['C601.L'] + ((F * (1 - phi) + 0.5 * R - run.flowS - B) / 4) * DT, 0, 4);
      run.vapor = F * phi + 0.5 * R + load(run, 'lights');
      X['C601.P'] = clamp(X['C601.P'] + ((run.vapor - 1.2 * V('PV-602') * X['C601.P']) / 3) * DT, 0, 3);
    }

    // Reflux drum D-701: condensed overhead, split into reflux and naphtha product
    if (act.has('D701')) {
      lag(run, 'FT702.F', (X['D701.L'] > 0.1 ? 1 : 0) * V('FV-702'), TAU_FLOW);
      const D = X['D701.L'] > 0.05 ? V('LV-701') : 0;
      X['D701.L'] = clamp(X['D701.L'] + ((run.vapor - X['FT702.F'] - D) / 2) * DT, 0, 3);
    }

    // Product tanks
    if (act.has('TK802')) {
      X['TK802.L'] = clamp(X['TK802.L'] + ((run.flowS - 0.8 * V('LV-802')) / 20) * DT, 0, 10);
    }
    if (act.has('TK803')) {
      X['TK803.L'] = clamp(X['TK803.L'] + ((run.flowB - 1.2 * V('LV-803')) / 20) * DT, 0, 10);
    }

    // Instrument air header
    if (act.has('K1101')) {
      const supply = load(run, 'airCap') * V('PV-1101');
      X['PT1101.P'] = clamp(X['PT1101.P'] + ((supply - load(run, 'airDemand')) / 3) * DT, 0, 10);
    }
  }

  function applySpChanges(run) {
    (run.level.spChanges || []).forEach((c) => {
      if (Math.abs(run.t - c.at) < DT / 2) {
        run.cfg.loops[c.loop].sp = c.sp;
        run.events.push({ t: run.t, kind: 'sp', text: `Operator sets ${c.loop} setpoint to ${c.sp}.`, loop: c.loop });
      }
    });
    (run.level.events || []).forEach((e) => {
      if (Math.abs(run.t - e.at) < DT / 2) run.events.push({ t: run.t, kind: 'info', text: e.text });
    });
  }

  function stepCore(run) {
    if (!run.warming) applySpChanges(run);
    controllers(run);
    moveValves(run);
    safety(run);
    physics(run);
    run.t = Math.round((run.t + DT) * 10) / 10;
  }

  function activeVars(run) {
    const out = [];
    run.level.units.forEach((u) => UNITS[u].vars.forEach((v) => out.push(v)));
    return out;
  }

  function holdTarget(level, c) {
    if (c.target !== undefined) return c.target;
    return finalSp(level, c.loop);
  }

  function holdVar(c) {
    return c.var || LOOPS[c.loop].pv;
  }

  function track(run) {
    const level = run.level;
    const s = run.stats;
    const X = run.x;
    activeVars(run).forEach((k) => {
      const d = VARS[k];
      if (s.max[k] === undefined || X[k] > s.max[k]) s.max[k] = X[k];
      if (s.min[k] === undefined || X[k] < s.min[k]) s.min[k] = X[k];
      if (d.hh !== null && X[k] >= d.hh && !s.hh[k]) {
        s.hh[k] = run.t;
        run.events.push({ t: run.t, kind: 'alarm', text: `HIGH ALARM ${d.label}: ${X[k].toFixed(2)} ${d.unit}` });
      }
      if (d.ll !== null && run.t > 2 && X[k] <= d.ll && !s.ll[k]) {
        s.ll[k] = run.t;
        run.events.push({ t: run.t, kind: 'alarm', text: `LOW ALARM ${d.label}: ${X[k].toFixed(2)} ${d.unit}` });
      }
    });
    level.checks.forEach((c, i) => {
      if (c.type !== 'hold') return;
      if (Math.abs(X[holdVar(c)] - holdTarget(level, c)) > c.tol) s.holdOut[i] = run.t;
    });

    // Performance of the first hold check: settling time, and overshoot = how far
    // the value swings past the target after it first crosses it on the way back.
    const parIdx = level.checks.findIndex((c) => c.type === 'hold');
    if (parIdx >= 0 && run.t >= (level.measureFrom || 0)) {
      const c = level.checks[parIdx];
      const err = X[holdVar(c)] - holdTarget(level, c);
      const p = s.par;
      if (Math.abs(err) > c.tol) {
        p.lastOut = run.t;
        if (!p.sign) p.sign = Math.sign(err);
      }
      if (p.sign && !p.crossed && Math.sign(err) === -p.sign) p.crossed = true;
      if (p.crossed) p.maxDev = Math.max(p.maxDev, -p.sign * err);
    }

    if (run.t - run.lastTrend >= 0.5 - 1e-9) {
      run.lastTrend = run.t;
      const sample = { t: run.t, x: {}, sp: {}, v: {} };
      activeVars(run).forEach((k) => { sample.x[k] = X[k]; });
      run.order.forEach((tag) => {
        sample.sp[tag] = spTrue(run, tag);
        sample.v[tag] = run.valves[LOOPS[tag].valve];
      });
      run.trend.push(sample);
    }
  }

  function step(run) {
    stepCore(run);
    track(run);
  }

  // Stream flows for drawing (m3/s, or kg/s for fuel). Units that are not built
  // report their normal flow so the plant still looks alive around them.
  const NORMAL_FLOWS = {
    crude: 1.2, charge: 1.2, water: 0.07, fuel: 1, vapor: 0.68, reflux: 0.4, naphtha: 0.28,
    side: 0.3, bottoms: 0.62, dieselOut: 0.3, residueOut: 0.62, air: 1,
  };

  function flows(run) {
    const X = run.x;
    const act = run.active;
    const V = (tag) => run.valves[tag] / 100;
    const tripped = run.sis['LSHH-101'] && run.sis['LSHH-101'].tripped;
    const f = Object.assign({}, NORMAL_FLOWS);
    if (act.has('TK101')) f.crude = tripped ? 0 : load(run, 'crude');
    f.charge = act.has('P201') ? X['FT201.F']
      : act.has('TK101') ? K_OUT * V('LV-101') * Math.sqrt(Math.max(X['TK101.L'], 0)) : f.charge;
    if (act.has('D401')) f.water = 0.2 * V('LV-401');
    if (act.has('H501')) f.fuel = X['FT502.F'];
    if (act.has('C601')) { f.vapor = run.vapor; f.bottoms = run.flowB; f.side = run.flowS; }
    if (act.has('D701')) { f.reflux = X['FT702.F']; f.naphtha = X['D701.L'] > 0.05 ? V('LV-701') : 0; }
    if (act.has('TK802')) f.dieselOut = 0.8 * V('LV-802');
    if (act.has('TK803')) f.residueOut = 1.2 * V('LV-803');
    if (act.has('K1101')) f.air = run.airOk ? 1 : 0.1;
    return f;
  }

  function isDone(run) {
    return run.t >= run.level.duration - 1e-9;
  }

  // ---- Grading ----

  function checkResult(run, c, i) {
    const level = run.level;
    const s = run.stats;
    switch (c.type) {
      case 'hold': {
        const v = holdVar(c);
        const target = holdTarget(level, c);
        const d = VARS[v];
        return {
          label: c.label || `${d.label} holds ${target} ${d.unit} ±${c.tol} for ${c.hold} s at the end`,
          ok: run.t - s.holdOut[i] >= c.hold,
        };
      }
      case 'noAlarms': {
        const except = c.except || [];
        const bad = activeVars(run).filter((k) => !except.includes(k) && (s.hh[k] !== undefined || s.ll[k] !== undefined));
        return { label: c.label || 'No process alarms', ok: bad.length === 0, detail: bad.map((k) => VARS[k].label).join(', ') };
      }
      case 'noHigh': {
        const bad = activeVars(run).filter((k) => s.hh[k] !== undefined);
        return { label: c.label || 'No high alarms', ok: bad.length === 0, detail: bad.map((k) => VARS[k].label).join(', ') };
      }
      case 'max':
        return { label: c.label || `${VARS[c.var].label} stays below ${c.limit} ${VARS[c.var].unit}`, ok: s.max[c.var] < c.limit };
      case 'min':
        return { label: c.label || `${VARS[c.var].label} stays above ${c.limit} ${VARS[c.var].unit}`, ok: s.min[c.var] > c.limit };
      case 'tripped': {
        const st = run.sis[c.sis];
        return { label: c.label || `${c.sis} trips on the real demand (not before ${c.after} s)`, ok: st.tripped && st.at >= c.after };
      }
      case 'notTripped':
        return { label: c.label || `${c.sis} does not trip spuriously`, ok: !run.sis[c.sis].tripped };
      default:
        return { label: 'Unknown check', ok: false };
    }
  }

  // Stars: 1 for passing every must-check, +1 for the performance target, +1 without hints.
  function evaluate(run, hintsUsed) {
    const level = run.level;
    const must = level.checks.map((c, i) => checkResult(run, c, i));
    const p = run.stats.par;
    const holdIdx = level.checks.findIndex((c) => c.type === 'hold');
    let settleTime = 0;
    let overshootPct = 0;
    const par = [];
    if (holdIdx >= 0 && level.par) {
      const c = level.checks[holdIdx];
      const target = holdTarget(level, c);
      settleTime = Math.max(0, p.lastOut - (level.measureFrom || 0));
      overshootPct = (p.maxDev / Math.abs(target || 1)) * 100;
      if (level.par.settle !== undefined) par.push({ label: `Settles within ${level.par.settle} s`, ok: settleTime <= level.par.settle });
      if (level.par.overshoot !== undefined) par.push({ label: `Overshoot under ${level.par.overshoot}% of target`, ok: overshootPct <= level.par.overshoot });
    }
    const pass = must.every((c) => c.ok);
    const parMet = par.every((c) => c.ok);
    const stars = pass ? 1 + (parMet ? 1 : 0) + (hintsUsed === 0 ? 1 : 0) : 0;
    return { pass, stars, checks: must.concat(par), settleTime, overshootPct };
  }

  return {
    DT, VARS, UNITS, VALVES, LOOPS, SIS, NORMAL_FLOWS,
    referenceConfig, initialConfig, trueRange, finalSp, isMaster, flows,
    startRun, step, isDone, evaluate, measure, spTrue, sensorReadings, activeVars,
  };
});
