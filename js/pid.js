// P&ID: a piping and instrumentation diagram of the crude unit, drawn as SVG.
// A level shows only its units. Loops you own appear as empty slots that you
// fill by dragging instruments from the storeroom (install), then connect with
// signal wires by tapping two instruments (wire). During start-up the same
// drawing shows live values.
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  // ---- Drawing data (SVG units; the main process line runs along y = 320) ----

  const SHAPES = {
    TK101: { type: 'tank', x: 40, y: 160, w: 120, h: 200, label: 'TK-101', sub: 'Crude tank', liquid: 'TK101.L', max: 6 },
    P201: { type: 'pump', cx: 245, cy: 320, label: 'P-201', sub: 'Charge pump' },
    D401: { type: 'hvessel', x: 370, y: 295, w: 140, h: 50, label: 'D-401', sub: 'Desalter', liquid: 'D401.I', max: 100 },
    E301: { type: 'exchanger', cx: 580, cy: 320, r: 22, label: 'E-301', sub: 'Preheat' },
    H501: { type: 'heater', x: 700, y: 260, w: 90, h: 120, label: 'H-501', sub: 'Charge heater' },
    C601: { type: 'column', x: 900, y: 80, w: 50, h: 420, label: 'C-601', sub: 'Tower', liquid: 'C601.L', max: 4, liquidZone: 120 },
    D701: { type: 'hvessel', x: 1010, y: 110, w: 120, h: 40, label: 'D-701', sub: 'Reflux drum', liquid: 'D701.L', max: 3, labelRight: true },
    P801: { type: 'pump', cx: 1040, cy: 360, label: 'P-801', sub: 'Diesel pump' },
    TK802: { type: 'tank', x: 1140, y: 300, w: 100, h: 120, label: 'TK-802', sub: 'Diesel', liquid: 'TK802.L', max: 10 },
    TK803: { type: 'tank', x: 1140, y: 520, w: 100, h: 120, label: 'TK-803', sub: 'Residue', liquid: 'TK803.L', max: 10 },
    K1101: { type: 'compressor', cx: 60, cy: 560, label: 'K-1101', sub: 'Air compressor' },
  };

  // Pipes: drawn when every unit in `need` is in the level and none in `not`.
  // `end` labels the open end; it is hidden when the `unless` unit is present.
  const PIPES = [
    { need: ['TK101'], pts: [[-150, 190], [40, 190]], start: 'Crude from ship' },
    { need: ['TK101'], pts: [[160, 320], [227, 320]] },
    { need: ['TK101'], not: ['P201'], pts: [[227, 320], [300, 320]], end: 'To unit' },
    { need: ['P201'], not: ['TK101'], pts: [[170, 320], [227, 320]], start: 'Suction' },
    { need: ['P201'], pts: [[263, 320], [370, 320]], end: 'To desalter', unless: 'D401' },
    { need: ['D401'], pts: [[510, 320], [558, 320]], end: 'To preheat', unless: 'E301' },
    { need: ['D401'], pts: [[440, 345], [440, 440], [510, 440]], end: 'Water' },
    { need: ['E301'], pts: [[602, 320], [700, 320]], end: 'To heater', unless: 'H501' },
    { need: ['E301'], pts: [[545, 320], [545, 250], [615, 250], [615, 320]] },
    { need: ['E301'], not: ['C601'], pts: [[572, 600], [572, 340]], start: 'Hot residue' },
    { need: ['E301'], not: ['TK803'], pts: [[588, 340], [588, 640]], end: 'Residue out' },
    { need: ['H501'], pts: [[790, 320], [900, 320]], end: 'To tower', unless: 'C601' },
    { need: ['H501'], pts: [[745, 490], [745, 380]], start: 'Fuel gas' },
    { need: ['C601'], pts: [[925, 80], [925, 40], [1050, 40], [1050, 110]], end: 'To condenser', unless: 'D701' },
    { need: ['C601', 'E301'], pts: [[925, 500], [925, 520], [572, 520], [572, 340]] },
    { need: ['C601'], not: ['E301'], pts: [[925, 500], [925, 520], [820, 520]], end: 'Residue' },
    { need: ['D701'], pts: [[1030, 150], [1030, 200], [950, 200]] },
    { need: ['D701'], pts: [[1110, 150], [1110, 230], [1270, 230]], end: 'Naphtha' },
    { need: ['P801'], pts: [[950, 360], [1022, 360]] },
    { need: ['P801'], pts: [[1058, 360], [1140, 360]], end: 'Diesel', unless: 'TK802' },
    { need: ['TK802'], pts: [[1240, 400], [1330, 400]], end: 'Dispatch' },
    { need: ['TK803', 'E301'], pts: [[588, 340], [588, 580], [1140, 580]] },
    { need: ['TK803'], pts: [[1240, 620], [1330, 620]], end: 'Dispatch' },
    { need: ['K1101'], pts: [[82, 560], [430, 560]], end: 'Air to every valve' },
  ];

  // Where each loop's transmitter, controller and valve sit.
  const LOOP_GEO = {
    'LIC-101': { tap: [40, 300], tt: [-15, 315], ctrl: [-15, 250], valve: [200, 320] },
    'FIC-201': { tap: [290, 320], tt: [290, 255], ctrl: [290, 185], valve: [330, 320] },
    'LIC-401': { tap: [400, 345], tt: [395, 405], ctrl: [395, 475], valve: [440, 400], vertical: true },
    'TIC-301': { tap: [650, 320], tt: [650, 255], ctrl: [650, 185], valve: [580, 250] },
    'TIC-501': { tap: [820, 320], tt: [820, 255], ctrl: [820, 185], valve: [745, 440], vertical: true },
    'FIC-502': { tap: [745, 470], tt: [690, 470], ctrl: [690, 535], valve: [745, 440], vertical: true },
    'LIC-601': { tap: [950, 470], tt: [990, 470], ctrl: [990, 540], valve: [860, 520] },
    'PIC-602': { tap: [900, 110], tt: [860, 110], ctrl: [860, 45], valve: [990, 40] },
    'LIC-701': { tap: [1130, 140], tt: [1170, 140], ctrl: [1170, 75], valve: [1180, 230] },
    'FIC-702': { tap: [1010, 200], tt: [1010, 250], ctrl: [1010, 300], valve: [980, 200] },
    'FIC-801': { tap: [1080, 360], tt: [1080, 425], ctrl: [1080, 490], valve: [1110, 360] },
    'LIC-802': { tap: [1240, 330], tt: [1280, 330], ctrl: [1280, 265], valve: [1285, 400] },
    'LIC-803': { tap: [1240, 550], tt: [1280, 550], ctrl: [1280, 485], valve: [1285, 620] },
    'PIC-1101': { tap: [200, 560], tt: [200, 495], ctrl: [200, 425], valve: [130, 560] },
  };

  // Safety functions: independent sensors, a logic solver and a shut-off valve (XV).
  const SIS_GEO = {
    'LSHH-101': { taps: [[160, 195], [160, 228], [160, 261]], sensors: [[205, 195], [205, 228], [205, 261]], box: [110, 105], xv: [-40, 190], xvTag: 'XV-101', part: 'LZT' },
    'TSHH-501': { taps: [[850, 320], [885, 320]], sensors: [[850, 390], [885, 390]], box: [868, 455], xv: [745, 398], xvTag: 'XV-502', part: 'TZT', vertical: true },
  };

  // The storeroom.
  const PARTS = {
    LT: { name: 'Level transmitter', kind: 'tt', v: 'L' },
    FT: { name: 'Flow transmitter', kind: 'tt', v: 'F' },
    PT: { name: 'Pressure transmitter', kind: 'tt', v: 'P' },
    TT: { name: 'Temperature transmitter', kind: 'tt', v: 'T' },
    LIC: { name: 'Level controller', kind: 'ctrl', v: 'L' },
    FIC: { name: 'Flow controller', kind: 'ctrl', v: 'F' },
    PIC: { name: 'Pressure controller', kind: 'ctrl', v: 'P' },
    TIC: { name: 'Temperature controller', kind: 'ctrl', v: 'T' },
    CV: { name: 'Control valve', kind: 'valve' },
    HV: { name: 'Hand valve', kind: 'hand' },
    LZT: { name: 'Safety level transmitter', kind: 'sis', v: 'L' },
    TZT: { name: 'Safety temperature transmitter', kind: 'sis', v: 'T' },
  };
  const VAR_WORD = { L: 'level', F: 'flow', P: 'pressure', T: 'temperature' };

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(e);
    return e;
  }

  function text(parent, x, y, str, cls, anchor) {
    const t = el('text', { x, y, class: cls || 'pid-text', 'text-anchor': anchor || 'middle' }, parent);
    t.textContent = str;
    return t;
  }

  const tagNumber = (tag) => tag.split('-')[1];
  const tagLetters = (tag) => tag.split('-')[0];

  // ---- Builder ----

  function create(host, level, Plant, callbacks) {
    const cb = callbacks || {};
    const active = new Set(level.units);
    const modes = level.modes || {};
    const loops = Object.keys(level.loops);
    const sisTags = Object.keys(level.sis || {});

    // Nodes: every instrument position. Player loops start as empty slots.
    const nodes = {};
    const required = []; // wires the player must make: [from, to]
    const givenWires = [];

    loops.forEach((tag) => {
      const L = Plant.LOOPS[tag];
      const g = LOOP_GEO[tag];
      const v = tagLetters(tag)[0];
      const mine = level.loops[tag] === 'player';
      const master = Plant.isMaster(level, tag);
      const ttTag = L.tt;
      nodes[`${tag}:tt`] = { id: `${tag}:tt`, loop: tag, kind: 'tt', expect: `${v}T`, pos: g.tt, tap: g.tap, tag: ttTag, mine, placed: !mine, what: `Measures the ${VAR_WORD[v]} (${Plant.VARS[L.pv].label}).` };
      nodes[`${tag}:ctrl`] = { id: `${tag}:ctrl`, loop: tag, kind: 'ctrl', expect: `${v}IC`, pos: g.ctrl, tag, mine, placed: !mine, what: `Control room: compares the ${VAR_WORD[v]} with its setpoint and decides the output.` };
      const wires = [[`${tag}:tt`, `${tag}:ctrl`]];
      if (master) {
        const slave = Object.keys(modes).find((k) => modes[k].cascadeFrom === tag);
        wires.push([`${tag}:ctrl`, `${slave}:ctrl`]);
      } else {
        nodes[`${tag}:valve`] = { id: `${tag}:valve`, loop: tag, kind: 'valve', expect: 'CV', pos: g.valve, vertical: g.vertical, tag: L.valve, mine, placed: !mine, what: `On the pipe: ${Plant.VALVES[L.valve].name}. Needs a valve the controller can move.` };
        wires.push([`${tag}:ctrl`, `${tag}:valve`]);
      }
      if (modes[tag] && modes[tag].ratioTo === 'FT201.F') wires.push(['FIC-201:tt', `${tag}:ctrl`]);
      wires.forEach((w) => (mine ? required : givenWires).push(w));
    });

    // The ratio input needs FT-201 on the drawing even if FIC-201 is not in the level.
    if (!nodes['FIC-201:tt'] && required.some((w) => w[0] === 'FIC-201:tt')) {
      nodes['FIC-201:tt'] = { id: 'FIC-201:tt', loop: null, kind: 'tt', expect: 'FT', pos: LOOP_GEO['FIC-201'].tt, tap: LOOP_GEO['FIC-201'].tap, tag: 'FT-201', mine: false, placed: true };
    }

    sisTags.forEach((tag) => {
      const S = Plant.SIS[tag];
      const g = SIS_GEO[tag];
      const mine = level.sis[tag] === 'player';
      nodes[`${tag}:box`] = { id: `${tag}:box`, kind: 'box', pos: g.box, tag, mine: false, placed: true };
      nodes[`${tag}:xv`] = { id: `${tag}:xv`, kind: 'xv', pos: g.xv, vertical: g.vertical, tag: g.xvTag, mine: false, placed: true };
      givenWires.push([`${tag}:box`, `${tag}:xv`]);
      S.sensors.forEach((s, i) => {
        const id = `${tag}:s${i}`;
        nodes[id] = { id, sis: tag, kind: 'sis', expect: g.part, pos: g.sensors[i], tap: g.taps[i], tag: s, mine, placed: !mine, what: `${s}: independent safety sensor for ${tag}.` };
        (mine ? required : givenWires).push([id, `${tag}:box`]);
      });
    });

    const state = {
      mode: 'view',
      selectedPart: null,
      selectedNode: null,
      wires: new Set(givenWires.map(wireKey)),
      live: null,
    };

    function wireKey(w) {
      return `${w[0]}>${w[1]}`;
    }

    // ---- SVG skeleton ----
    host.textContent = '';
    const svg = el('svg', { class: 'pid-svg', role: 'img', 'aria-label': `P&ID for ${level.title}` }, host);
    const defs = el('defs', {}, svg);
    const marker = el('marker', { id: 'pid-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', class: 'pid-arrowhead' }, marker);

    const gPipes = el('g', {}, svg);
    const gUnits = el('g', {}, svg);
    const gTaps = el('g', {}, svg);
    const gWires = el('g', {}, svg);
    const gNodes = el('g', {}, svg);

    // Pipes
    const pipePts = [];
    PIPES.forEach((p) => {
      if (!p.need.every((u) => active.has(u))) return;
      if (p.not && p.not.some((u) => active.has(u))) return;
      p.pts.forEach((pt) => pipePts.push(pt));
      const d = p.pts.map((pt, i) => `${i ? 'L' : 'M'}${pt[0]},${pt[1]}`).join(' ');
      const showEnd = p.end && !(p.unless && active.has(p.unless));
      el('path', { d, class: 'pid-pipe', 'marker-end': showEnd || !p.start ? 'url(#pid-arrow)' : '' }, gPipes);
      if (p.start) text(gPipes, p.pts[0][0], p.pts[0][1] - 8, p.start, 'pid-note', 'start');
      if (showEnd) {
        const last = p.pts[p.pts.length - 1];
        const prev = p.pts[p.pts.length - 2];
        const horizontal = last[1] === prev[1];
        text(gPipes, last[0] + (horizontal ? 4 : 0), last[1] + (horizontal ? -8 : 16), p.end, 'pid-note', horizontal ? 'end' : 'middle');
      }
    });

    // Equipment
    const liquids = {};
    level.units.forEach((u) => {
      const s = SHAPES[u];
      const g = el('g', { class: 'pid-unit' }, gUnits);
      if (s.type === 'tank') {
        el('path', { d: `M${s.x},${s.y + 14} Q${s.x + s.w / 2},${s.y - 14} ${s.x + s.w},${s.y + 14} V${s.y + s.h} H${s.x} Z`, class: 'pid-equip' }, g);
        liquids[u] = { el: el('rect', { x: s.x + 2, width: s.w - 4, class: 'pid-liquid' }, g), top: s.y + 14, bottom: s.y + s.h - 1, s };
        text(g, s.x + s.w / 2, s.y + 36, s.label, 'pid-label');
        text(g, s.x + s.w / 2, s.y + 50, s.sub, 'pid-sub');
      } else if (s.type === 'pump') {
        el('circle', { cx: s.cx, cy: s.cy, r: 18, class: 'pid-equip' }, g);
        el('path', { d: `M${s.cx - 10},${s.cy + 10} L${s.cx},${s.cy - 18} L${s.cx + 10},${s.cy + 10}`, class: 'pid-thin' }, g);
        text(g, s.cx, s.cy + 34, s.label, 'pid-label');
        text(g, s.cx, s.cy + 46, s.sub, 'pid-sub');
      } else if (s.type === 'hvessel') {
        el('rect', { x: s.x, y: s.y, width: s.w, height: s.h, rx: s.h / 2, class: 'pid-equip' }, g);
        liquids[u] = { el: el('rect', { x: s.x + s.h / 2, width: s.w - s.h, class: 'pid-liquid' + (u === 'D401' ? ' water' : '') }, g), top: s.y + 2, bottom: s.y + s.h - 2, s };
        if (s.labelRight) text(g, s.x + 46, s.y - 8, `${s.label} ${s.sub}`, 'pid-label', 'start');
        else text(g, s.x + s.w / 2, s.y - 8, `${s.label} ${s.sub}`, 'pid-label');
      } else if (s.type === 'exchanger') {
        el('circle', { cx: s.cx, cy: s.cy, r: s.r, class: 'pid-equip' }, g);
        el('path', { d: `M${s.cx - s.r},${s.cy} l8,-10 l8,20 l8,-20 l8,20 l8,-10`, class: 'pid-thin' }, g);
        text(g, s.cx + 30, s.cy + 40, `${s.label} ${s.sub}`, 'pid-label', 'start');
      } else if (s.type === 'heater') {
        el('rect', { x: s.x, y: s.y, width: s.w, height: s.h, class: 'pid-equip' }, g);
        el('path', { d: `M${s.x},${s.y + 60} h12 v-30 h14 v60 h14 v-60 h14 v60 h14 v-30 h12`, class: 'pid-thin' }, g);
        el('path', { d: `M${s.x + s.w / 2 - 10},${s.y + s.h - 4} q10,-30 10,-34 q0,4 10,34 z`, class: 'pid-flame' }, g);
        text(g, s.x + s.w / 2, s.y - 8, `${s.label} ${s.sub}`, 'pid-label');
      } else if (s.type === 'column') {
        el('rect', { x: s.x, y: s.y, width: s.w, height: s.h, rx: 24, class: 'pid-equip' }, g);
        for (let y = s.y + 40; y < s.y + s.h - s.liquidZone; y += 28) el('line', { x1: s.x + 4, x2: s.x + s.w - 4, y1: y, y2: y, class: 'pid-thin' }, g);
        liquids[u] = { el: el('rect', { x: s.x + 2, width: s.w - 4, class: 'pid-liquid' }, g), top: s.y + s.h - s.liquidZone, bottom: s.y + s.h - 6, s };
        text(g, s.x + s.w / 2, s.y + s.h + 34, `${s.label} ${s.sub}`, 'pid-label');
      } else if (s.type === 'compressor') {
        el('circle', { cx: s.cx, cy: s.cy, r: 22, class: 'pid-equip' }, g);
        el('path', { d: `M${s.cx - 14},${s.cy - 16} L${s.cx + 18},${s.cy - 8} L${s.cx + 18},${s.cy + 8} L${s.cx - 14},${s.cy + 16}`, class: 'pid-thin' }, g);
        text(g, s.cx, s.cy + 40, `${s.label} ${s.sub}`, 'pid-label');
      }
    });
    Object.values(liquids).forEach((lq) => {
      const h0 = (lq.bottom - lq.top) * 0.5;
      lq.el.setAttribute('y', lq.bottom - h0);
      lq.el.setAttribute('height', h0);
    });

    // ---- Instruments ----
    const nodeEls = {};
    const liveText = {};

    function drawNode(n) {
      if (nodeEls[n.id]) nodeEls[n.id].remove();
      const g = el('g', { class: 'pid-node', 'data-node': n.id }, gNodes);
      nodeEls[n.id] = g;
      const [x, y] = n.pos;
      if (!n.placed) {
        g.classList.add('slot');
        if (n.kind === 'valve') el('rect', { x: x - 20, y: y - 20, width: 40, height: 40, rx: 8, class: 'pid-slot' }, g);
        else el('circle', { cx: x, cy: y, r: 20, class: 'pid-slot' }, g);
        text(g, x, y + 5, '?', 'pid-slot-q');
        el('circle', { cx: x, cy: y, r: 30, class: 'pid-hit' }, g);
        return;
      }
      if (n.kind === 'valve' || n.kind === 'xv') {
        drawValve(g, x, y, n.vertical, n.kind === 'xv');
        const lx = n.vertical ? x + 30 : x;
        const ly = n.vertical ? y + 4 : y + 30;
        text(g, lx, ly, n.tag, 'pid-tag', n.vertical ? 'start' : 'middle');
        liveText[n.id] = text(g, lx, ly + 13, '', 'pid-live', n.vertical ? 'start' : 'middle');
      } else if (n.kind === 'box') {
        el('rect', { x: x - 24, y: y - 14, width: 48, height: 28, rx: 3, class: 'pid-sisbox' }, g);
        text(g, x, y + 4, 'SIS', 'pid-tag');
        liveText[n.id] = text(g, x, y + 28, '', 'pid-live');
      } else {
        if (n.kind === 'ctrl') el('rect', { x: x - 19, y: y - 19, width: 38, height: 38, class: 'pid-dcs' }, g);
        el('circle', { cx: x, cy: y, r: 17, class: n.kind === 'sis' ? 'pid-bubble sis' : 'pid-bubble' }, g);
        if (n.kind === 'ctrl') el('line', { x1: x - 17, x2: x + 17, y1: y, y2: y, class: 'pid-thin' }, g);
        const letters = tagLetters(n.tag);
        text(g, x, y - 3, letters, 'pid-bubble-top');
        text(g, x, y + 11, tagNumber(n.tag), 'pid-bubble-bottom');
        liveText[n.id] = text(g, x + 23, y + 4, '', 'pid-live', 'start');
      }
      el('circle', { cx: x, cy: y, r: 28, class: 'pid-hit' }, g);
      if (n.mine) g.classList.add('mine');
    }

    function drawValve(g, x, y, vertical, isXv) {
      const vg = el('g', { transform: `translate(${x},${y}) rotate(${vertical ? 90 : 0})` }, g);
      el('path', { d: 'M-12,-8 L12,8 L12,-8 L-12,8 Z', class: isXv ? 'pid-valve xv' : 'pid-valve' }, vg);
      el('line', { x1: 0, y1: 0, x2: 0, y2: -16, class: 'pid-thin' }, vg);
      if (isXv) el('rect', { x: -7, y: -26, width: 14, height: 10, class: 'pid-valve xv' }, vg);
      else el('path', { d: 'M-9,-16 A9,9 0 0 1 9,-16 Z', class: 'pid-valve' }, vg);
    }

    function drawTaps() {
      gTaps.textContent = '';
      Object.values(nodes).forEach((n) => {
        if (!n.tap) return;
        el('line', { x1: n.tap[0], y1: n.tap[1], x2: n.pos[0], y2: n.pos[1], class: n.placed ? 'pid-tapline' : 'pid-tapline faint' }, gTaps);
        el('circle', { cx: n.tap[0], cy: n.tap[1], r: 3, class: 'pid-tapdot' }, gTaps);
      });
    }

    // Signal lines: dashed, routed horizontally then vertically.
    function drawWires() {
      gWires.textContent = '';
      state.wires.forEach((k) => {
        const [a, b] = k.split('>');
        const A = nodes[a];
        const B = nodes[b];
        if (!A || !B) return;
        const mine = required.some((w) => wireKey(w) === k);
        const d = `M${A.pos[0]},${A.pos[1]} H${B.pos[0]} V${B.pos[1]}`;
        el('path', { d, class: mine ? 'pid-signal mine' : 'pid-signal', 'marker-end': 'url(#pid-arrow)' }, gWires);
      });
      if (state.selectedNode) {
        const n = nodes[state.selectedNode];
        el('circle', { cx: n.pos[0], cy: n.pos[1], r: 27, class: 'pid-selected' }, gWires);
      }
    }

    Object.values(nodes).forEach(drawNode);
    drawTaps();
    drawWires();

    // ---- Fit to the units and instruments in this level ----
    function bounds() {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      const grow = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
      level.units.forEach((u) => {
        const s = SHAPES[u];
        if (s.x !== undefined) { grow(s.x, s.y); grow(s.x + s.w, s.y + s.h); } else { grow(s.cx - 30, s.cy - 30); grow(s.cx + 30, s.cy + 50); }
      });
      Object.values(nodes).forEach((n) => { grow(n.pos[0] - 30, n.pos[1] - 30); grow(n.pos[0] + 70, n.pos[1] + 40); });
      pipePts.forEach((pt) => grow(pt[0], pt[1]));
      return { minX: minX - 60, minY: minY - 40, w: maxX - minX + 120, h: maxY - minY + 90 };
    }
    const box = bounds();
    svg.setAttribute('viewBox', `${box.minX} ${box.minY} ${box.w} ${box.h}`);

    function fit() {
      const avail = host.clientWidth || 600;
      // Never shrink below 60% of natural size: on a phone the drawing scrolls sideways instead.
      const scale = Math.max(Math.min(avail / box.w, 1.25), 0.6);
      svg.setAttribute('width', Math.round(box.w * scale));
      svg.setAttribute('height', Math.round(box.h * scale));
    }
    fit();

    // ---- Install: drag (or tap) a part onto a slot ----
    function checkPart(n, key) {
      const part = PARTS[key];
      const want = PARTS[n.expect];
      const word = VAR_WORD[want.v];
      if (key === n.expect) {
        if (n.kind === 'tt') return { ok: true, msg: `${n.tag} installed. It measures the ${word} and sends a 4–20 mA signal to the control room.` };
        if (n.kind === 'ctrl') return { ok: true, msg: `${n.tag} installed in the DCS. It compares the ${word} with the setpoint and sets an output from 0 to 100%.` };
        if (n.kind === 'valve') return { ok: true, msg: `${n.tag} installed. Its actuator moves the valve to follow the controller output.` };
        return { ok: true, msg: `${n.tag} installed. It reports to the safety logic only, never to the control loop.` };
      }
      if (n.kind === 'tt') {
        if (part.kind === 'tt') return { ok: false, msg: `That is a ${part.name.toLowerCase()}. This point is on ${word === 'level' ? 'the vessel wall' : 'the pipe'} and must measure ${word}: use a ${want.name.toLowerCase()} (${n.expect}).` };
        if (part.kind === 'ctrl') return { ok: false, msg: 'Controllers live in the control room (the DCS), not on the equipment. Out here you need a transmitter that measures.' };
        if (part.kind === 'sis') return { ok: false, msg: 'Safety transmitters (Z) belong to the safety system only. The control loop needs its own ordinary transmitter.' };
        return { ok: false, msg: 'A valve cannot measure anything. This connection needs a transmitter.' };
      }
      if (n.kind === 'ctrl') {
        if (part.kind === 'ctrl') return { ok: false, msg: `Controller letters follow what it controls: L = level, F = flow, P = pressure, T = temperature. This one controls ${word}, so ${n.expect}.` };
        return { ok: false, msg: `This square-and-circle bubble is a controller in the DCS. Install a ${want.name.toLowerCase()} (${n.expect}) here.` };
      }
      if (n.kind === 'valve') {
        if (key === 'HV') return { ok: false, msg: 'A hand valve is turned by an operator. The controller cannot move it. Use a control valve, which has an actuator driven by the 4–20 mA output.' };
        return { ok: false, msg: 'This spot is on the pipe. It needs a control valve that the controller can move.' };
      }
      if (part.kind === 'tt') return { ok: false, msg: `The safety function needs its own independent sensors, not ordinary transmitters. Use a ${want.name.toLowerCase()} (${n.expect}).` };
      return { ok: false, msg: `This is a safety sensor position. Use a ${want.name.toLowerCase()} (${n.expect}).` };
    }

    function tryPlace(nodeId, key) {
      const n = nodes[nodeId];
      if (!n || n.placed || !n.mine) return;
      const r = checkPart(n, key);
      if (r.ok) {
        n.placed = true;
        drawNode(n);
        drawTaps();
      }
      say(r.msg, r.ok ? 'good' : 'bad');
      if (cb.onChange) cb.onChange();
    }

    function say(msg, kind) {
      if (cb.onMessage) cb.onMessage(msg, kind || 'info');
    }

    // Tap on the drawing: in install mode a tap places the selected part; in wire mode it connects.
    svg.addEventListener('click', (e) => {
      const g = e.target.closest('[data-node]');
      if (!g) return;
      const n = nodes[g.dataset.node];
      if (state.mode === 'install') {
        if (!n.placed && state.selectedPart) tryPlace(n.id, state.selectedPart);
        else if (!n.placed) say(`Empty position. ${n.what} Pick a part from the storeroom, then tap here (or drag it here).`);
        else say(`${n.tag}${n.what ? ': ' + n.what : ''}`);
      } else if (state.mode === 'wire') {
        tapWire(n);
      } else if (n.placed) {
        say(`${n.tag}${n.what ? ': ' + n.what : ''}`);
      }
    });

    function tapWire(n) {
      if (!n.placed) {
        say('Install an instrument here first.', 'bad');
        return;
      }
      if (!state.selectedNode) {
        state.selectedNode = n.id;
        say(`${n.tag} selected. Now tap the instrument its signal goes to (or comes from).`);
        drawWires();
        return;
      }
      if (state.selectedNode === n.id) {
        state.selectedNode = null;
        drawWires();
        return;
      }
      const a = state.selectedNode;
      const b = n.id;
      state.selectedNode = null;
      const match = required.find((w) => (w[0] === a && w[1] === b) || (w[0] === b && w[1] === a));
      if (match) {
        if (state.wires.has(wireKey(match))) {
          say('Those two are already connected.');
        } else {
          state.wires.add(wireKey(match));
          say(wireMessage(match), 'good');
        }
      } else {
        say(wireError(nodes[a], nodes[b]), 'bad');
      }
      drawWires();
      if (cb.onChange) cb.onChange();
    }

    function wireMessage(w) {
      const A = nodes[w[0]];
      const B = nodes[w[1]];
      if (A.kind === 'tt' && B.kind === 'ctrl' && A.loop !== B.loop) return `${A.tag} → ${B.tag}: the measured flow is the "wild" input of the ratio. ${B.tag}'s setpoint = ratio × this flow.`;
      if (A.kind === 'tt') return `${A.tag} → ${B.tag}: the measurement (PV) reaches the controller.`;
      if (A.kind === 'ctrl' && B.kind === 'ctrl') return `${A.tag} → ${B.tag}: cascade. The master's output becomes the slave's setpoint.`;
      if (A.kind === 'sis') return `${A.tag} → safety logic. It votes on the trip.`;
      return `${A.tag} → ${B.tag}: the controller output (0–100%, sent as 4–20 mA) moves the valve.`;
    }

    function wireError(A, B) {
      if (A.kind === 'sis' || B.kind === 'sis') return 'Safety sensors connect only to the SIS logic box, never to a control loop.';
      if (A.kind === 'valve' && B.kind === 'valve') return 'Two valves never talk to each other. A valve only receives a signal from its controller.';
      if ((A.kind === 'tt' && B.kind === 'valve') || (A.kind === 'valve' && B.kind === 'tt')) return 'A transmitter never drives a valve directly: the signal goes transmitter → controller → valve.';
      if (A.loop && B.loop && A.loop !== B.loop) return `${A.tag} and ${B.tag} are in different loops. Each transmitter feeds its own controller.`;
      return 'Those two are not connected in this loop. Signals go transmitter → controller → valve.';
    }

    // Drag from the storeroom (mouse or finger).
    function startDrag(key, e) {
      state.selectedPart = key;
      if (cb.onSelectPart) cb.onSelectPart(key);
      const ghost = document.createElement('div');
      ghost.className = 'pid-ghost';
      ghost.textContent = key;
      document.body.appendChild(ghost);
      const move = (ev) => {
        ghost.style.left = `${ev.clientX}px`;
        ghost.style.top = `${ev.clientY}px`;
      };
      move(e);
      const up = (ev) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        ghost.remove();
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        const g = target && target.closest && target.closest('[data-node]');
        if (g && svg.contains(g)) tryPlace(g.dataset.node, key);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }

    // ---- Live values during start-up ----
    function fmt(v) {
      if (!Number.isFinite(v)) return '-';
      const a = Math.abs(v);
      return v.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : 2);
    }

    function setLive(run) {
      Object.entries(liquids).forEach(([u, lq]) => {
        const s = lq.s;
        const value = run ? run.x[s.liquid] : Plant.VARS[s.liquid].init;
        const frac = Math.min(Math.max(value / s.max, 0), 1);
        const h = (lq.bottom - lq.top) * frac;
        lq.el.setAttribute('y', lq.bottom - h);
        lq.el.setAttribute('height', h);
      });
      Object.values(nodes).forEach((n) => {
        const t = liveText[n.id];
        if (!t) return;
        if (!run) { t.textContent = ''; return; }
        if (n.kind === 'tt' && n.loop && run.loops[n.loop]) {
          const d = Plant.VARS[Plant.LOOPS[n.loop].pv];
          t.textContent = `${fmt(run.x[Plant.LOOPS[n.loop].pv])} ${d.unit}`;
          const alarm = (d.hh !== null && run.x[Plant.LOOPS[n.loop].pv] >= d.hh) || (d.ll !== null && run.x[Plant.LOOPS[n.loop].pv] <= d.ll);
          nodeEls[n.id].classList.toggle('alarm', alarm);
        } else if (n.kind === 'tt' && n.tag === 'FT-201') {
          t.textContent = `${fmt(run.x['FT201.F'])} m³/s`;
        } else if (n.kind === 'ctrl') {
          const st = run.loops[n.loop];
          t.textContent = `SP ${fmt(st.sp)} · OUT ${st.out.toFixed(0)}%`;
        } else if (n.kind === 'valve') {
          t.textContent = `${run.valves[n.tag].toFixed(0)}% open`;
        } else if (n.kind === 'sis') {
          t.textContent = fmt(Plant.sensorReadings(run, n.sis)[Number(n.id.slice(-1))]);
        } else if (n.kind === 'box') {
          const st = run.sis[n.tag];
          t.textContent = st && st.tripped ? 'TRIPPED' : 'armed';
          nodeEls[n.id].classList.toggle('alarm', Boolean(st && st.tripped));
        } else if (n.kind === 'xv') {
          const sisTag = n.id.split(':')[0];
          t.textContent = run.sis[sisTag] && run.sis[sisTag].tripped ? 'CLOSED' : 'open';
        }
      });
    }
    setLive(null);

    // ---- Public ----
    return {
      nodes,
      required,
      setMode(mode) {
        state.mode = mode;
        state.selectedNode = null;
        host.classList.toggle('mode-install', mode === 'install');
        host.classList.toggle('mode-wire', mode === 'wire');
        drawWires();
      },
      selectPart(key) { state.selectedPart = key; },
      startDrag,
      installDone: () => Object.values(nodes).every((n) => n.placed),
      wiringDone: () => required.every((w) => state.wires.has(wireKey(w))),
      missingSlots: () => Object.values(nodes).filter((n) => !n.placed).length,
      missingWires: () => required.filter((w) => !state.wires.has(wireKey(w))).length,
      fit,
      setLive,
    };
  }

  window.PID = { create, PARTS };
})();
