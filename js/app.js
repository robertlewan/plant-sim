// UI: refinery overview, and each job in five steps:
// Job → Install (P&ID) → Wire (P&ID) → Configure (guided) → Start up (live P&ID, trend).
// The 3D refinery sits under every step and builds the job's units when you pass.
(function () {
  'use strict';

  const Plant = window.Plant;
  const PID = window.PID;
  const { LEVELS, GLOSSARY, AREAS } = window.PlantLevels;
  const STORE_KEY = 'plantsim.progress.v2';
  const POINTS_PER_STAR = 100;
  const SPEEDS = [1, 2, 4, 8, 16];
  const RANKS = [
    [9000, 'Plant manager'],
    [7000, 'Senior engineer'],
    [5000, 'Control engineer'],
    [3200, 'Instrument technician'],
    [1800, 'Field technician'],
    [700, 'Operator'],
    [0, 'Apprentice'],
  ];
  const STEPS = [
    ['job', 'Job'],
    ['install', 'Install'],
    ['wire', 'Wire'],
    ['config', 'Configure'],
    ['run', 'Start up'],
  ];

  // What happens if a valve goes to each end position (used to explain fail positions).
  const VALVE_ENDS = {
    'LV-101': ['Nothing leaves TK-101 while crude keeps arriving: the tank fills up.', 'TK-101 drains freely to the next unit.'],
    'FV-201': ['Charge to the unit stops: everything downstream loses feed.', 'Full charge flow: the pump pushes as much as it can.'],
    'LV-401': ['Water stays in the desalter: the interface rises toward the crude outlet.', 'Water drains continuously, and oil can follow it to the sewer.'],
    'TV-301': ['All crude goes through the exchanger: the preheat is as hot as it can be.', 'Crude bypasses the exchanger: the preheat goes cold.'],
    'FV-502': ['Fuel gas stops: the heater cools down.', 'Full fuel gas: the heater fires at maximum and overheats.'],
    'LV-601': ['Residue cannot leave the tower: the bottoms level rises.', 'Residue drains out: the bottoms level falls.'],
    'PV-602': ['Vapour is trapped in the tower: the pressure climbs.', 'Vapour goes to the condenser: the pressure falls.'],
    'LV-701': ['Naphtha stays in the drum: the drum fills.', 'The drum drains its naphtha.'],
    'FV-702': ['No reflux: the top of the tower runs hot.', 'Full reflux: the top of the tower runs cold.'],
    'FV-801': ['The diesel draw stops: more liquid falls to the bottoms.', 'Maximum diesel draw.'],
    'LV-802': ['No dispatch: TK-802 fills.', 'TK-802 empties.'],
    'LV-803': ['No dispatch: TK-803 fills.', 'TK-803 empties.'],
    'PV-1101': ['Compressor unloads: air header pressure falls.', 'Compressor at full load.'],
  };
  const VAR_WORD = { L: 'level', F: 'flow', P: 'pressure', T: 'temperature' };

  const $ = (id) => document.getElementById(id);
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  let progress = loadProgress();
  let current = null;
  let lastFrame = performance.now();
  let lastTable = 0;
  let view = null;
  try { view = window.Plant3D ? window.Plant3D.create() : null; } catch (e) { view = null; }

  // ---- Progress (per browser; storage may be blocked, so every access is guarded) ----

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && typeof saved.best === 'object') return saved;
    } catch (e) { /* start fresh */ }
    return { best: {} };
  }

  function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (e) { /* ignore */ }
  }

  const totalPoints = () => Object.values(progress.best).reduce((s, b) => s + b.points, 0);
  const rankName = (points) => RANKS.find(([min]) => points >= min)[1];
  const isUnlocked = (i) => i === 0 || Boolean(progress.best[LEVELS[i - 1].id]);
  const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

  function builtUnits() {
    const set = new Set();
    LEVELS.forEach((l) => { if (progress.best[l.id]) l.units.forEach((u) => set.add(u)); });
    return set;
  }

  // Progress per area, for the plot labels in the 3D yard.
  function areaInfo() {
    return AREAS.map((name) => {
      const idx = LEVELS.map((l, i) => i).filter((i) => LEVELS[i].area === name);
      return {
        name,
        done: idx.filter((i) => progress.best[LEVELS[i].id]).length,
        total: idx.length,
        unlocked: idx.some((i) => isUnlocked(i)),
      };
    });
  }

  function updateHeader() {
    const points = totalPoints();
    $('points').textContent = `${points} pts`;
    $('rank').textContent = rankName(points);
  }

  // ---- Overview: 3D yard and work orders grouped by area ----

  function renderLevels() {
    const built = builtUnits();
    const total = Object.keys(Plant.UNITS).length;
    const done = Object.keys(progress.best).length;
    $('built-count').textContent = `${built.size} of ${total} units built · ${done} of ${LEVELS.length} work orders done`;

    const wrap = $('areas');
    wrap.textContent = '';
    const nextIndex = LEVELS.findIndex((l, i) => isUnlocked(i) && !progress.best[l.id]);
    AREAS.forEach((area, ai) => {
      const levels = LEVELS.map((l, i) => ({ l, i })).filter((o) => o.l.area === area);
      const section = el('section', 'area');
      const head = el('div', 'area-head');
      head.append(el('h2', '', `${ai + 1}. ${area}`));
      head.append(el('span', 'muted small', `${levels.filter((o) => progress.best[o.l.id]).length}/${levels.length}`));
      section.append(head);
      const grid = el('div', 'level-grid');
      levels.forEach(({ l, i }) => {
        const unlocked = isUnlocked(i);
        const best = progress.best[l.id];
        const card = el('button', 'card level-card' + (unlocked ? '' : ' locked') + (i === nextIndex ? ' next' : ''));
        card.type = 'button';
        card.disabled = !unlocked;
        card.append(
          el('span', 'id', unlocked ? l.id : `${l.id} · locked`),
          el('span', 'title', l.title),
          el('span', 'stars', best ? starText(best.stars) : ''),
        );
        card.addEventListener('click', () => openLevel(i));
        grid.append(card);
      });
      section.append(grid);
      wrap.append(section);
    });

    if (view) {
      view.mount($('overview-3d'));
      view.setScene(built, new Set(), null, areaInfo());
    } else {
      show3dFallback($('overview-3d'));
    }
  }

  function show3dFallback(host) {
    if (host.querySelector('.fallback')) return;
    host.append(el('p', 'fallback', '3D view unavailable: it needs an internet connection the first time (three.js) and WebGL. The simulator still works without it.'));
  }

  function renderGlossary() {
    const dl = $('glossary');
    dl.textContent = '';
    GLOSSARY.forEach(([term, text]) => dl.append(el('dt', '', term), el('dd', '', text)));
  }

  function showView(name) {
    $('levels-view').hidden = name !== 'levels';
    $('play-view').hidden = name !== 'play';
    window.scrollTo(0, 0);
  }

  // ---- Opening a job ----

  function openLevel(index) {
    const level = LEVELS[index];
    current = {
      index, level,
      cfg: Plant.initialConfig(level),
      run: null, running: false, speed: 1, acc: 0, hintsUsed: 0, eventIdx: 0,
      invalid: new Set(),
      step: 'job',
      selectedPart: null,
      passed: false,
    };

    $('play-id').textContent = `${level.id} · ${level.area}`;
    $('play-title').textContent = level.title;
    const jobText = $('job-text');
    jobText.textContent = '';
    jobText.append(jobSections(level));
    $('study-title').textContent = level.study.title;
    const body = $('study-body');
    body.textContent = '';
    level.study.body.forEach((t) => body.append(el('p', '', t)));
    fillPin(level);
    $('hint-box').hidden = true;
    $('hint-box').textContent = '';
    updateHintButton();

    current.pid = PID.create($('pid'), level, Plant, {
      onMessage: (msg, kind) => setPidMessage(msg, kind),
      onChange: () => { renderSteps(); updatePidFooter(); },
    });
    buildPalette();
    buildConfigForm();
    buildLoopTable();
    buildTrendSelect();
    $('events').textContent = '';
    setSpeed(1);
    updateRunButton();
    showView('play');

    if (view) {
      view.mount($('plant-3d'));
      const active = new Set(level.units);
      view.setScene(builtUnits(), active, active, areaInfo());
    } else {
      show3dFallback($('plant-3d'));
    }
    goStep('job');
  }

  function fillList(ul, items) {
    ul.textContent = '';
    items.forEach((t) => ul.append(el('li', '', t)));
  }

  // ---- Job text: situation, task, timeline, pass rules and data sheet ----

  const UNIT_WORDS = {
    m: 'metres of liquid',
    'm³/s': 'cubic metres per second',
    bar: 'bar',
    '°C': '°C',
    '%': '% of the vessel height',
    'kg/s': 'kilograms per second',
  };
  const PART_NAMES = { L: 'level', F: 'flow', P: 'pressure', T: 'temperature' };
  // Lower-cases the first letter unless the word is a tag or acronym (TK-101, FIC, ...).
  const lower1 = (s) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const loopsOf = (level, who) => Object.keys(level.loops).filter((t) => (level.loops[t] === 'player') === (who === 'player'));
  const sisOf = (level) => Object.keys(level.sis || {}).filter((t) => level.sis[t] === 'player');

  function joinWords(items) {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  }

  // Steps for this job, built from what the player has to install and configure.
  function taskSteps(level) {
    const mine = loopsOf(level, 'player');
    const sis = sisOf(level);
    const modes = level.modes || {};
    const steps = [];
    if (!mine.length && !sis.length) {
      steps.push('Everything is already installed and wired. You do not need to add anything to the P&ID.');
      steps.push('Open the Configure step and check every loop, one setting at a time, against the data sheet below and what you have learned. Correct anything that is wrong.');
      steps.push(`Start up the plant and watch the trend until the run ends (${level.duration} seconds). You can still change settings while it runs.`);
      return steps;
    }
    const install = mine.map((tag) => {
      const v = PART_NAMES[tag[0]];
      const parts = [`a ${v} transmitter`, `a ${v} controller`];
      if (!Plant.isMaster(level, tag)) parts.push('a control valve');
      return `${joinWords(parts)} for ${tag}`;
    });
    sis.forEach((tag) => {
      const S = Plant.SIS[tag];
      install.push(`${['zero', 'one', 'two', 'three', 'four'][S.sensors.length]} safety ${PART_NAMES[S.pv.split('.')[1]]} transmitters for ${tag}`);
    });
    steps.push(`Install: put the missing instruments on the P&ID. You need ${install.join('; ')}.`);

    const wires = [];
    if (mine.length) wires.push('Wire: connect each transmitter to its controller, and each controller to its valve.');
    mine.forEach((tag) => {
      const slave = Object.keys(modes).find((k) => modes[k].cascadeFrom === tag);
      if (slave) wires.push(`Also connect ${tag} to ${slave}: the master's output becomes the slave's setpoint (cascade).`);
      if (modes[tag] && modes[tag].ratioTo) wires.push(`Also connect the charge flow transmitter FT-201 to ${tag}, so it can follow the charge (ratio).`);
    });
    if (sis.length) wires.push(`${mine.length ? 'Also connect' : 'Wire: connect'} each safety transmitter to its SIS logic box.`);
    steps.push(wires.join(' '));

    const what = [];
    if (mine.length) what.push(`set the range, setpoint, action, fail position and tuning of ${joinWords(mine)}`);
    if (sis.length) what.push(`set the trip setpoint and voting of ${joinWords(sis)}`);
    steps.push(`Configure: ${joinWords(what)}. The Configure step explains every setting as you go.`);
    steps.push(`Start up: press Start and watch the trend until the run ends (${level.duration} seconds). You can still change settings while it runs.`);
    return steps;
  }

  // The pass rules, in words.
  function passRules(level) {
    const rules = [];
    level.checks.forEach((c) => {
      if (c.type === 'hold') {
        const v = c.var || Plant.LOOPS[c.loop].pv;
        const d = Plant.VARS[v];
        const target = c.target !== undefined ? c.target : Plant.finalSp(level, c.loop);
        const lo = +(target - c.tol).toFixed(3);
        const hi = +(target + c.tol).toFixed(3);
        rules.push(`At the end of the run, the ${lower1(d.label)} must have stayed between ${lo} and ${hi} ${d.unit} (the target ${target} ${d.unit}, give or take ${c.tol}) for the last ${c.hold} seconds.`);
      } else if (c.type === 'noAlarms') {
        rules.push('No alarms at any time: no value in this job may go past its high or low alarm limit (the dashed red and orange lines on the trend).');
      } else if (c.type === 'noHigh') {
        rules.push('No high alarms at any time. Low values are allowed in this job.');
      } else if (c.type === 'max') {
        const d = Plant.VARS[c.var];
        rules.push(`The ${lower1(d.label)} must never go above ${c.limit} ${d.unit}.`);
      } else if (c.type === 'min') {
        const d = Plant.VARS[c.var];
        rules.push(`The ${lower1(d.label)} must never go below ${c.limit} ${d.unit}.`);
      } else if (c.type === 'tripped') {
        rules.push(`${c.sis} must trip when the real danger comes, which is not before ${c.after} seconds. A trip before that is a false trip and fails the job.`);
      } else if (c.type === 'notTripped') {
        rules.push(`${c.sis} must not trip at all during the run.`);
      }
    });
    return rules;
  }

  function bonusRules(level) {
    const out = [];
    if (level.par) {
      const parts = [];
      if (level.par.settle !== undefined) parts.push(`settle back inside the target band within ${level.par.settle} seconds of the upset`);
      if (level.par.overshoot !== undefined) parts.push(`swing past the target by less than ${level.par.overshoot}%`);
      const first = level.checks.find((c) => c.type === 'hold');
      const label = first ? lower1(Plant.VARS[first.var || Plant.LOOPS[first.loop].pv].label) : 'value';
      out.push(`Second star: after the upset (or after start-up, if nothing else changes), the ${label} must ${joinWords(parts)}.`);
    }
    else out.push('Second star: given automatically in this job, because there is no tuning target.');
    out.push('Third star: finish without using any hints.');
    return out;
  }

  // Data sheet: what each instrument is, its range and its target, in sentences.
  function dataSheet(level) {
    const items = [];
    const modes = level.modes || {};
    const ref = Plant.referenceConfig(level);
    const mine = loopsOf(level, 'player');
    const given = loopsOf(level, 'given');
    const troubleshoot = !mine.length && !sisOf(level).length;
    const describe = troubleshoot ? given : mine;

    describe.forEach((tag) => {
      const L = Plant.LOOPS[tag];
      const d = Plant.VARS[L.pv];
      const [lo, hi] = Plant.trueRange(level, tag);
      const mode = modes[tag] || {};
      const words = UNIT_WORDS[d.unit] || d.unit;
      const lines = [];
      lines.push(`${L.tt} measures the ${lower1(d.label)} in ${words}. It is calibrated from ${lo} to ${hi} ${d.unit}: it sends 4 mA when the value is ${lo} ${d.unit} and 20 mA when it is ${hi} ${d.unit}.`);
      if (mode.cascadeFrom) {
        lines.push(`${tag} has no fixed setpoint. It takes its setpoint from ${mode.cascadeFrom} (cascade).`);
      } else if (mode.ratioTo) {
        lines.push(`${tag} must keep this flow at ${ref.loops[tag].ratio} times the charge flow. That ${ref.loops[tag].ratio} is the ratio you enter.`);
      } else {
        lines.push(`${tag} must hold it at ${ref.loops[tag].sp} ${d.unit}. This is its setpoint.`);
      }
      if (Plant.isMaster(level, tag)) {
        const slave = Object.keys(modes).find((k) => modes[k].cascadeFrom === tag);
        lines.push(`Its output does not go to a valve: it sets the setpoint of ${slave}.`);
      } else {
        lines.push(`It moves control valve ${L.valve} (${lower1(Plant.VALVES[L.valve].name)}).`);
      }
      items.push({ tag, text: lines.join(' ') });
    });

    sisOf(level).forEach((tag) => {
      const S = Plant.SIS[tag];
      const d = Plant.VARS[S.pv];
      items.push({
        tag,
        text: `Uses ${S.sensors.length} safety transmitters (${joinWords(S.sensors)}) that measure the ${lower1(d.label)}. When enough of them read above the trip setpoint, it ${lower1(S.action)}. You choose the trip setpoint and how many must agree (the voting). The high alarm is ${d.hh} ${d.unit}.`,
      });
    });

    if (!troubleshoot && given.length) {
      items.push({ tag: 'Already running', text: `${joinWords(given)} ${given.length > 1 ? 'are' : 'is'} already installed and working. You do not need to change ${given.length > 1 ? 'them' : 'it'}.` });
    }
    return items;
  }

  function jobSections(level) {
    const frag = document.createDocumentFragment();
    const section = (title) => frag.appendChild(el('h3', 'job-h', title));

    section('The situation');
    level.situation.forEach((t) => frag.append(el('p', '', t)));

    section('Your task');
    const ol = el('ol', 'list');
    taskSteps(level).forEach((t) => ol.append(el('li', '', t)));
    frag.append(ol);

    section('What happens during the run');
    const tl = el('ul', 'list');
    level.timeline.forEach((t) => tl.append(el('li', '', t)));
    tl.append(el('li', '', `The run lasts ${level.duration} seconds. Use the speed buttons to run it faster.`));
    frag.append(tl);

    section('To pass');
    const pass = el('ul', 'list');
    passRules(level).forEach((t) => pass.append(el('li', '', t)));
    frag.append(pass);
    const bonus = el('ul', 'list bonus');
    bonusRules(level).forEach((t) => bonus.append(el('li', '', t)));
    frag.append(bonus);

    section('Data sheet');
    const ds = el('ul', 'list datasheet');
    dataSheet(level).forEach(({ tag, text }) => {
      const li = el('li');
      li.append(el('b', '', `${tag}: `), document.createTextNode(text));
      ds.append(li);
    });
    frag.append(ds);
    return frag;
  }

  // ---- The job, pinned at the top of the later steps ----

  let pinCollapsed = false;
  try { pinCollapsed = localStorage.getItem('plantsim.pinCollapsed') === '1'; } catch (e) { /* default open */ }

  function fillPin(level) {
    const job = $('pin-job');
    job.textContent = '';
    job.append(jobSections(level));
    $('pin-study-title').textContent = `What you need to know: ${level.study.title.toLowerCase()}`;
    const study = $('pin-study');
    study.textContent = '';
    level.study.body.forEach((t) => study.append(el('p', '', t)));
  }

  function setPinCollapsed(collapsed) {
    pinCollapsed = collapsed;
    $('job-pin').classList.toggle('collapsed', collapsed);
    $('pin-toggle').textContent = collapsed ? 'Show' : 'Hide';
    $('pin-toggle').setAttribute('aria-expanded', String(!collapsed));
    try { localStorage.setItem('plantsim.pinCollapsed', collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  // ---- Steps ----

  function stepState(step) {
    const c = current;
    const installed = c.pid.installDone();
    const wired = c.pid.wiringDone();
    const configured = c.invalid.size === 0;
    const done = { job: c.step !== 'job' || installed, install: installed, wire: wired, config: configured && wired, run: c.passed };
    const open = {
      job: true,
      install: true,
      wire: installed,
      config: installed && wired,
      run: installed && wired && configured,
    };
    return { done: done[step], open: open[step] };
  }

  function renderSteps() {
    const nav = $('steps');
    nav.textContent = '';
    STEPS.forEach(([key, label], i) => {
      const st = stepState(key);
      const b = el('button', (current.step === key ? 'current ' : '') + (st.done ? 'done' : ''));
      b.type = 'button';
      b.disabled = !st.open;
      const n = el('span', 'n', st.done && current.step !== key ? '✓' : String(i + 1));
      b.append(n, document.createTextNode(label));
      b.addEventListener('click', () => goStep(key));
      nav.append(b);
    });
  }

  function goStep(step) {
    const c = current;
    if (!stepState(step).open) return;
    c.step = step;
    $('step-job').hidden = step !== 'job';
    $('job-pin').hidden = step === 'job';
    $('pid-panel').hidden = !['install', 'wire', 'run'].includes(step);
    $('step-config').hidden = step !== 'config';
    $('step-run').hidden = step !== 'run';
    $('palette').hidden = step !== 'install';
    document.querySelector('.pid-layout').classList.toggle('with-palette', step === 'install');
    c.pid.setMode(step === 'install' ? 'install' : step === 'wire' ? 'wire' : 'live');
    c.pid.fit();

    const titles = { install: 'Install the instruments', wire: 'Wire the signals', run: 'Live P&ID' };
    $('pid-title').textContent = titles[step] || 'P&ID';
    if (step === 'install') {
      setPidMessage(c.pid.missingSlots()
        ? 'Each ? is an empty instrument position. Tap one to see what it is for, then put the right part from the storeroom there.'
        : 'Everything here is already installed. Tap any instrument to see what it does.');
    } else if (step === 'wire') {
      setPidMessage(c.pid.missingWires()
        ? 'Signals travel transmitter → controller → valve as 4–20 mA. Tap an instrument, then tap the one its signal goes to.'
        : 'All signals are connected. The blue dashed lines are yours; grey ones were already there.');
    } else if (step === 'run') {
      setPidMessage('Press Start. Values on the drawing update live: blue numbers next to each instrument.');
      draw(true);
    }
    updatePidFooter();
    renderSteps();
    window.scrollTo({ top: document.querySelector('.steps').offsetTop - 70, behavior: 'smooth' });
  }

  function setPidMessage(msg, kind) {
    const m = $('pid-msg');
    m.textContent = msg;
    m.className = `pid-msg ${kind || ''}`;
  }

  function updatePidFooter() {
    const c = current;
    const btn = $('pid-next');
    $('pid-actions').hidden = c.step === 'run';
    if (c.step === 'install') {
      const left = c.pid.missingSlots();
      $('pid-count').textContent = left ? `${left} to install` : 'All installed';
      btn.textContent = 'Next: wire the signals';
      btn.disabled = left > 0;
    } else if (c.step === 'wire') {
      const left = c.pid.missingWires();
      $('pid-count').textContent = left ? `${left} wire${left > 1 ? 's' : ''} to connect` : 'All connected';
      btn.textContent = 'Next: configure';
      btn.disabled = left > 0;
    } else {
      $('pid-count').textContent = '';
    }
  }

  function nextFromPid() {
    if (current.step === 'install') goStep('wire');
    else if (current.step === 'wire') goStep('config');
  }

  // ---- Storeroom ----

  function buildPalette() {
    const parts = $('parts');
    parts.textContent = '';
    const keys = ['LT', 'FT', 'PT', 'TT', 'LIC', 'FIC', 'PIC', 'TIC', 'CV', 'HV'];
    if (current.level.sis && Object.keys(current.level.sis).length) keys.push('LZT', 'TZT');
    keys.forEach((key) => {
      const p = PID.PARTS[key];
      const b = el('button', `part ${p.kind}`);
      b.type = 'button';
      b.dataset.part = key;
      b.append(el('span', 'sym', key === 'CV' ? '⋈' : key === 'HV' ? '⋈' : key), el('span', '', p.name));
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        selectPart(key);
        current.pid.startDrag(key, e);
      });
      parts.append(b);
    });
  }

  function selectPart(key) {
    current.selectedPart = key;
    current.pid.selectPart(key);
    document.querySelectorAll('.part').forEach((b) => b.classList.toggle('selected', b.dataset.part === key));
    setPidMessage(`${PID.PARTS[key].name} picked up. Drop it on a ? (or tap a ?).`);
  }

  // ---- Guided configuration ----

  function buildConfigForm() {
    const form = $('config');
    form.textContent = '';
    const level = current.level;
    const tags = Object.keys(level.loops);
    const mine = tags.filter((t) => level.loops[t] === 'player');
    const given = tags.filter((t) => level.loops[t] !== 'player');
    current.invalid.clear();

    mine.forEach((tag) => form.append(loopGuide(tag, true)));
    Object.keys(level.sis || {}).forEach((tag) => form.append(sisGuide(tag)));

    if (given.length) {
      const det = el('details', 'given');
      const troubleshoot = mine.length === 0 && !(level.sis && Object.keys(level.sis).length);
      det.open = troubleshoot;
      det.append(el('summary', '', troubleshoot
        ? `Commissioned loops (${given.length}): check each one against the data sheet`
        : `Commissioned loops (${given.length}): already working, open to inspect`));
      given.forEach((tag) => det.append(loopGuide(tag, false)));
      form.append(det);
    }
  }

  function numberInput(key, value, step) {
    const i = el('input');
    i.type = 'number';
    i.step = step || 'any';
    i.inputMode = 'decimal';
    i.dataset.key = key;
    i.value = value === null || value === undefined || Number.isNaN(value) ? '' : value;
    return i;
  }

  function hiddenInput(key, value) {
    const i = el('input');
    i.type = 'hidden';
    i.dataset.key = key;
    i.dataset.type = 'text';
    i.value = value || '';
    return i;
  }

  function labelled(text, input) {
    const l = el('label', '', text);
    l.append(input);
    return l;
  }

  function question(title, help) {
    const q = el('div', 'q');
    q.append(el('h5', '', title));
    if (help) q.append(el('p', 'help', help));
    return q;
  }

  // Two or three buttons that write one hidden value; `explain(value)` describes the choice.
  function choices(fs, key, options, value, explain) {
    const wrap = el('div', options.length > 2 ? 'choices three' : 'choices');
    const hidden = hiddenInput(key, value);
    const result = el('p', 'result');
    const set = (v) => {
      hidden.value = v;
      wrap.querySelectorAll('.choice').forEach((b) => b.classList.toggle('on', b.dataset.value === v));
      result.textContent = v && explain ? explain(v) : '';
    };
    options.forEach(([v, title, sub]) => {
      const b = el('button', 'choice');
      b.type = 'button';
      b.dataset.value = v;
      b.append(el('b', '', title));
      if (sub) b.append(document.createTextNode(sub));
      b.addEventListener('click', () => {
        set(v);
        onGuideEdit(fs);
      });
      wrap.append(b);
    });
    set(value);
    const frag = document.createDocumentFragment();
    frag.append(wrap, hidden, result);
    return frag;
  }

  function loopGuide(tag, mine) {
    const level = current.level;
    const L = Plant.LOOPS[tag];
    const d = Plant.VARS[L.pv];
    const unit = d.unit;
    const word = VAR_WORD[tag[0]];
    const cfg = current.cfg.loops[tag];
    const mode = (level.modes || {})[tag] || {};
    const master = Plant.isMaster(level, tag);
    const slave = master ? Object.keys(level.modes).find((k) => level.modes[k].cascadeFrom === tag) : null;
    const [tlo, thi] = Plant.trueRange(level, tag);
    const ref = Plant.referenceConfig(level).loops[tag];

    const fs = el('fieldset', `guide${mine ? ' mine' : ''}`);
    fs.dataset.loop = tag;
    fs.append(el('legend', '', `${tag} · ${L.name}${mine ? ' (yours)' : ''}`));
    fs.append(el('p', 'what', master
      ? `${L.tt} measures the ${word}. ${tag} decides, and its output becomes the setpoint of ${slave}, which moves the valve.`
      : `${L.tt} measures the ${word}. ${tag} compares it with the setpoint and moves ${L.valve} (${Plant.VALVES[L.valve].name}).`));

    // 1. Range
    const q1 = question('1. Range: what the transmitter can measure',
      `The transmitter turns the ${word} into a 4–20 mA current: 4 mA at the bottom of its calibrated range, 20 mA at the top. Type the same range here so the control system turns the current back into the right number. If they differ, every reading is wrong.`);
    q1.append(el('p', 'sheet', `From the data sheet: ${L.tt} is calibrated from ${tlo} to ${thi} ${unit}. So the low end is ${tlo} and the high end is ${thi}.`));
    const r = el('div', 'row2');
    r.append(labelled(`Low end, 4 mA (${unit})`, numberInput('lo', cfg.lo)), labelled(`High end, 20 mA (${unit})`, numberInput('hi', cfg.hi)));
    q1.append(r);
    fs.append(q1);

    // 2. Setpoint
    if (mode.cascadeFrom) {
      fs.append(question('2. Setpoint: comes from the master', `This is a cascade. ${mode.cascadeFrom}'s output (0–100%) is turned into this loop's setpoint across its range. You do not type one.`));
    } else if (mode.ratioTo) {
      const q2 = question('2. Ratio: how much per unit of the other flow', `The setpoint is not fixed: setpoint = ratio × ${Plant.VARS[mode.ratioTo].label.toLowerCase()}. If the charge goes up, this flow follows automatically.`);
      q2.append(el('p', 'sheet', `From the job: the ratio is ${ref.ratio}.`));
      q2.append(labelled('Ratio', numberInput('ratio', cfg.ratio)));
      fs.append(q2);
    } else {
      const q2 = question('2. Setpoint: the target', `The ${word} you want the controller to hold, like the temperature you set on a home thermostat. The controller keeps moving the valve until the measurement equals the setpoint.`);
      q2.append(el('p', 'sheet', `From the job: hold the ${word} at ${ref.sp} ${unit}.`));
      q2.append(labelled(`Setpoint (${unit})`, numberInput('sp', cfg.sp)));
      fs.append(q2);
    }

    // 3. Action
    const q3 = question('3. Action: which way should the output move?',
      master
        ? `If the ${word} is ABOVE its setpoint, should ${tag} raise or lower the ${slave} setpoint?`
        : `If the ${word} is ABOVE its setpoint, should ${tag} open ${L.valve} more or close it? Think about what opening ${L.valve} (${Plant.VALVES[L.valve].name}) does to the ${word}.`);
    const outWord = master ? `${slave} setpoint` : `${L.valve}`;
    q3.append(choices(fs, 'action', [
      ['direct', master ? 'Raise it ▲' : 'Open more ▲', ' Output goes up when the measurement is too high. Called DIRECT action.'],
      ['reverse', master ? 'Lower it ▼' : 'Close it ▼', ' Output goes down when the measurement is too high. Called REVERSE action.'],
    ], mine ? '' : cfg.action, (v) => {
      const [up, down] = master ? ['goes up', 'goes down'] : ['opens more', 'closes'];
      return v === 'direct'
        ? `Direct: when the ${word} is too high, ${outWord} ${up}; when it is too low, ${outWord} ${down}.`
        : `Reverse: when the ${word} is too high, ${outWord} ${down}; when it is too low, ${outWord} ${up}.`;
    }));
    fs.append(q3);

    // 4. Fail position
    if (!master) {
      const ends = VALVE_ENDS[L.valve];
      const q4 = question('4. Fail position: what if instrument air is lost?',
        `${L.valve} is moved by compressed air pushing against a spring. If the air is lost, the spring drives the valve fully closed or fully open, whatever the controller wants. Pick the end that keeps the plant safe.`);
      q4.append(choices(fs, 'failPos', [
        ['closed', 'Fail closed', ` ${ends[0]}`],
        ['open', 'Fail open', ` ${ends[1]}`],
      ], mine ? '' : cfg.failPos, (v) => `On air loss ${L.valve} goes fully ${v}. ${v === 'closed' ? ends[0] : ends[1]}`));
      fs.append(q4);
    }

    // 5. Tuning
    const q5 = question(`${master ? '4' : '5'}. Tuning: how hard and how fast to react`,
      'Kc (gain) is how hard the controller reacts to an error right now, like how far you turn the steering wheel when you drift. Ti (integral time, in seconds) is how patiently it removes an error that will not go away: small Ti is impatient (fast, but overshoots), large Ti is patient (smooth, but slow).');
    const presets = [
      ['gentle', 'Gentle', ` Kc ${round(ref.kc * 0.5)}, Ti ${round(ref.ti * 1.6)}`, ref.kc * 0.5, ref.ti * 1.6],
      ['normal', 'Normal', ` Kc ${round(ref.kc)}, Ti ${round(ref.ti)}`, ref.kc, ref.ti],
      ['fast', 'Fast', ` Kc ${round(ref.kc * 2)}, Ti ${round(ref.ti * 0.5)}`, ref.kc * 2, ref.ti * 0.5],
    ];
    const pw = el('div', 'choices three');
    const kcIn = numberInput('kc', cfg.kc, '0.1');
    const tiIn = numberInput('ti', cfg.ti, '1');
    const markPreset = () => {
      pw.querySelectorAll('.choice').forEach((b) => {
        const p = presets.find((x) => x[0] === b.dataset.value);
        b.classList.toggle('on', Math.abs(Number(kcIn.value) - round(p[3])) < 1e-6 && Math.abs(Number(tiIn.value) - round(p[4])) < 1e-6);
      });
    };
    presets.forEach(([key, title, sub, kc, ti]) => {
      const b = el('button', 'choice');
      b.type = 'button';
      b.dataset.value = key;
      b.append(el('b', '', title), document.createTextNode(sub));
      b.addEventListener('click', () => {
        kcIn.value = round(kc);
        tiIn.value = round(ti);
        markPreset();
        onGuideEdit(fs);
      });
      pw.append(b);
    });
    q5.append(pw);
    const adv = el('div', 'row2');
    adv.style.marginTop = '8px';
    adv.append(labelled('Gain Kc', kcIn), labelled('Integral time Ti (s)', tiIn));
    q5.append(adv);
    kcIn.addEventListener('input', markPreset);
    tiIn.addEventListener('input', markPreset);
    markPreset();
    fs.append(q5);

    fs.append(el('p', 'error', ''));
    validateLoop(fs, false);
    return fs;
  }

  function round(v) {
    return Math.round(v * 10) / 10;
  }

  function sisGuide(tag) {
    const S = Plant.SIS[tag];
    const d = Plant.VARS[S.pv];
    const cfg = current.cfg.sis[tag];
    const mine = current.level.sis[tag] === 'player';
    const fs = el('fieldset', `guide${mine ? ' mine' : ''}`);
    fs.dataset.sis = tag;
    fs.append(el('legend', '', `${tag} · ${S.name}${mine ? ' (yours)' : ''}`));
    fs.append(el('p', 'what', `A safety function is separate from the control loops. Its own sensors (${S.sensors.join(', ')}) watch the ${d.label.toLowerCase()}. If enough of them agree it is too high, it ${S.action.charAt(0).toLowerCase() + S.action.slice(1)}, and stays tripped until reset.`));

    const q1 = question('1. Trip setpoint: when to act',
      `Above the high alarm (${d.hh} ${d.unit}, which only warns the operator) and below the damage limit, with some margin for how fast things move.`);
    q1.append(labelled(`Trip at (${d.unit})`, numberInput('sp', cfg.sp)));
    fs.append(q1);

    const explain = {
      '1oo3': ['1 out of 3', ' Trips if any one sensor says high. Safest, but one faulty sensor causes a false trip.'],
      '2oo3': ['2 out of 3', ' Trips if any two agree. Survives one faulty sensor either way.'],
      '3oo3': ['3 out of 3', ' All three must agree. One dead sensor blocks the trip.'],
      '1oo2': ['1 out of 2', ' Trips if either sensor says high. Still works with one dead sensor.'],
      '2oo2': ['2 out of 2', ' Both must agree. Fewer false trips, but one dead sensor blocks it.'],
    };
    const q2 = question('2. Voting: how many sensors must agree?', 'Sensors fail. Voting decides whether a single bad sensor can cause a false trip, or block a real one.');
    q2.append(choices(fs, 'voting', S.votings.map((v) => [v, explain[v][0], explain[v][1]]), mine ? '' : cfg.voting, null));
    fs.append(q2);
    fs.append(el('p', 'error', ''));
    validateSis(fs);
    return fs;
  }

  function readFieldset(fs) {
    const out = {};
    fs.querySelectorAll('input').forEach((i) => {
      out[i.dataset.key] = i.dataset.type === 'text' ? i.value : (i.value === '' ? NaN : Number(i.value));
    });
    return out;
  }

  // Validates one loop. When valid, its values go straight into the live configuration.
  function validateLoop(fs, apply) {
    const tag = fs.dataset.loop;
    const v = readFieldset(fs);
    const problems = [];
    if (!Number.isFinite(v.lo) || !Number.isFinite(v.hi) || v.hi <= v.lo) problems.push('a range with high above low');
    if ('sp' in v && !Number.isFinite(v.sp)) problems.push('a setpoint');
    if ('ratio' in v && !(Number.isFinite(v.ratio) && v.ratio >= 0)) problems.push('a ratio');
    if (!['direct', 'reverse'].includes(v.action)) problems.push('the action');
    if ('failPos' in v && !['open', 'closed'].includes(v.failPos)) problems.push('the fail position');
    if (!(Number.isFinite(v.kc) && v.kc >= 0)) problems.push('a gain of 0 or more');
    if (!(Number.isFinite(v.ti) && v.ti > 0)) problems.push('an integral time above 0');
    setValidity(fs, `loop:${tag}`, problems);
    if (!problems.length && apply !== false) Object.assign(current.cfg.loops[tag], v);
  }

  function validateSis(fs) {
    const tag = fs.dataset.sis;
    const v = readFieldset(fs);
    const problems = [];
    if (!Number.isFinite(v.sp)) problems.push('a trip setpoint');
    if (!v.voting) problems.push('the voting');
    setValidity(fs, `sis:${tag}`, problems);
    if (!problems.length) Object.assign(current.cfg.sis[tag], v);
  }

  function setValidity(fs, key, problems) {
    fs.classList.toggle('invalid', problems.length > 0);
    fs.querySelector('.error').textContent = problems.length ? `Still needed: ${problems.join(', ')}.` : '';
    if (problems.length) current.invalid.add(key);
    else current.invalid.delete(key);
  }

  function onGuideEdit(fs) {
    if (!current || !fs) return;
    if (fs.dataset.loop) validateLoop(fs, true);
    else if (fs.dataset.sis) validateSis(fs);
    updateRunButton();
    renderSteps();
  }

  // ---- Loop table and trend selector ----

  function buildLoopTable() {
    const body = $('loop-rows');
    body.textContent = '';
    const level = current.level;
    const tags = Object.keys(level.loops);
    const mine = tags.filter((t) => level.loops[t] === 'player');
    mine.concat(tags.filter((t) => level.loops[t] !== 'player')).forEach((tag) => {
      const tr = el('tr', level.loops[tag] === 'player' ? 'mine' : '');
      tr.dataset.loop = tag;
      const first = el('td');
      first.append(document.createTextNode(tag), el('span', 'name', Plant.LOOPS[tag].name));
      tr.append(first, el('td', '', '-'), el('td', '', '-'), el('td', '', '-'), el('td', '', '-'));
      body.append(tr);
    });
    const sis = $('sis-status');
    sis.textContent = '';
    Object.keys(level.sis || {}).forEach((tag) => {
      const chip = el('span', 'sis-chip', `${tag}: armed`);
      chip.dataset.sis = tag;
      sis.append(chip);
    });
  }

  function buildTrendSelect() {
    const sel = $('trend-loop');
    sel.textContent = '';
    const level = current.level;
    const tags = Object.keys(level.loops);
    const mine = tags.filter((t) => level.loops[t] === 'player');
    const ordered = mine.concat(tags.filter((t) => level.loops[t] !== 'player'));
    ordered.forEach((tag) => {
      const o = el('option', '', `${tag} · ${Plant.LOOPS[tag].name}`);
      o.value = tag;
      sel.append(o);
    });
    let pick = mine[0];
    if (!pick) {
      const sisVar = Object.keys(level.sis || {}).map((t) => Plant.SIS[t].pv)[0];
      const holdLoop = level.checks.find((c) => c.type === 'hold' && c.loop);
      pick = (sisVar && tags.find((t) => Plant.LOOPS[t].pv === sisVar)) || (holdLoop && holdLoop.loop) || ordered[0];
    }
    sel.value = pick;
    current.trendLoop = pick;
  }

  // ---- Run control ----

  function updateRunButton() {
    const btn = $('run');
    if (!current) return;
    btn.disabled = !current.run && current.invalid.size > 0;
    if (current.running) btn.textContent = 'Pause';
    else if (current.run && current.run.t > 0 && !Plant.isDone(current.run)) btn.textContent = 'Resume';
    else btn.textContent = 'Start';
  }

  function toggleRun() {
    if (!current) return;
    if (current.run && Plant.isDone(current.run)) restartRun();
    if (!current.run) {
      if (current.invalid.size) return;
      current.run = Plant.startRun(current.level, current.cfg);
      current.eventIdx = 0;
      $('events').textContent = '';
    }
    current.running = !current.running;
    updateRunButton();
  }

  function restartRun() {
    if (!current) return;
    current.run = null;
    current.running = false;
    current.acc = 0;
    $('events').textContent = '';
    current.pid.setLive(null);
    updateRunButton();
    draw(true);
  }

  function setSpeed(speed) {
    if (!current) return;
    current.speed = speed;
    document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === speed));
  }

  function updateHintButton() {
    const btn = $('hint');
    btn.disabled = current.hintsUsed >= current.level.hints.length;
    btn.textContent = btn.disabled ? 'No more hints' : 'Show hint (-1 star)';
  }

  function showHint() {
    if (!current || current.hintsUsed >= current.level.hints.length) return;
    current.hintsUsed += 1;
    const box = $('hint-box');
    box.textContent = '';
    current.level.hints.slice(0, current.hintsUsed).forEach((t) => box.append(el('p', '', t)));
    box.hidden = false;
    updateHintButton();
  }

  function finish() {
    if (!current || !current.run) return;
    current.running = false;
    const { run, level, index, hintsUsed } = current;
    const result = Plant.evaluate(run, hintsUsed);
    const before = builtUnits();
    const old = progress.best[level.id] ? progress.best[level.id].points : 0;
    const pts = result.pass ? result.stars * POINTS_PER_STAR : 0;
    if (result.pass && pts > old) {
      progress.best[level.id] = { stars: result.stars, points: pts };
      saveProgress();
    }
    updateHeader();
    if (result.pass) {
      current.passed = true;
      renderSteps();
      if (view) {
        const active = new Set(level.units);
        view.setScene(builtUnits(), active, active, areaInfo());
        const fresh = level.units.filter((u) => !before.has(u));
        view.celebrate(fresh.length ? fresh : level.units);
      }
    }
    showResult(result, level, index, Math.max(0, pts - old));
    updateRunButton();
  }

  function showResult(result, level, index, earned) {
    $('result-title').textContent = result.pass ? 'Job complete' : 'Not there yet';
    $('result-stars').textContent = starText(result.stars);
    const list = $('result-checks');
    list.textContent = '';
    result.checks.forEach((c) => {
      const li = el('li', c.ok ? 'ok' : '', c.label);
      if (!c.ok && c.detail) li.append(el('span', 'detail', ` (${c.detail})`));
      list.append(li);
    });
    const parts = [];
    if (level.par) parts.push(`Settled ${result.settleTime.toFixed(0)} s after the upset, overshoot ${result.overshootPct.toFixed(1)}%.`);
    parts.push(earned > 0 ? `+${earned} points.` : 'No new points this time.');
    if (!result.pass) parts.push('Look at the event log and the trend: which alarm came first, and did a valve slam to 0% or 100%? Then go back to Configure.');
    $('result-points').textContent = parts.join(' ');
    $('result-learned').textContent = result.pass ? `You practised: ${level.study.title.toLowerCase()}. Your refinery below has been updated.` : '';
    $('result-see').hidden = !result.pass || !view;
    const next = $('result-next');
    next.hidden = !result.pass;
    next.textContent = index + 1 < LEVELS.length ? 'Next job' : 'Back to the refinery';
    $('result').hidden = false;
  }

  function closeResult(action) {
    $('result').hidden = true;
    if (!current) return;
    if (action === 'next') {
      if (current.index + 1 < LEVELS.length) openLevel(current.index + 1);
      else backToLevels();
    } else if (action === 'see') {
      document.querySelector('.plant3d-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      restartRun();
      goStep('config');
    }
  }

  function backToLevels() {
    current = null;
    $('result').hidden = true;
    renderLevels();
    updateHeader();
    showView('levels');
  }

  // ---- Live display ----

  const fmt = (v, unit) => {
    if (!Number.isFinite(v)) return '-';
    const a = Math.abs(v);
    const dp = a >= 100 ? 0 : a >= 10 ? 1 : 2;
    return `${v.toFixed(dp)}${unit ? ' ' + unit : ''}`;
  };

  function updateTable(run) {
    const level = current.level;
    document.querySelectorAll('#loop-rows tr').forEach((tr) => {
      const tag = tr.dataset.loop;
      const L = Plant.LOOPS[tag];
      const d = Plant.VARS[L.pv];
      const cells = tr.children;
      if (!run) {
        [1, 2, 3, 4].forEach((i) => { cells[i].textContent = '-'; });
        tr.classList.remove('alarming');
        return;
      }
      const st = run.loops[tag];
      cells[1].textContent = fmt(st.pv, d.unit);
      cells[2].textContent = fmt(st.sp, d.unit);
      cells[3].textContent = `${st.out.toFixed(0)}%`;
      cells[4].textContent = Plant.isMaster(level, tag) ? 'cascade' : `${run.valves[L.valve].toFixed(0)}%`;
      const x = run.x[L.pv];
      tr.classList.toggle('alarming', (d.hh !== null && x >= d.hh) || (d.ll !== null && x <= d.ll));
    });
    document.querySelectorAll('#sis-status .sis-chip').forEach((chip) => {
      const st = run && run.sis[chip.dataset.sis];
      chip.classList.toggle('tripped', Boolean(st && st.tripped));
      chip.textContent = `${chip.dataset.sis}: ${st && st.tripped ? `TRIPPED at ${st.at.toFixed(0)} s` : 'armed'}`;
    });
    $('clock').textContent = `${run ? run.t.toFixed(0) : 0} / ${level.duration} s`;
  }

  function updateEvents(run) {
    if (!run) return;
    const list = $('events');
    while (current.eventIdx < run.events.length) {
      const e = run.events[current.eventIdx];
      current.eventIdx += 1;
      const li = el('li', `${e.kind}-ev`);
      li.append(el('span', 't', `${e.t.toFixed(0)} s`), document.createTextNode(e.text));
      list.prepend(li);
      if (e.kind === 'sp' && e.loop) {
        const input = document.querySelector(`#config fieldset[data-loop="${e.loop}"] input[data-key="sp"]`);
        if (input) input.value = current.cfg.loops[e.loop].sp;
      }
    }
  }

  function activeAlarm(run) {
    const tripped = Object.keys(run.sis).find((t) => run.sis[t].tripped);
    if (tripped) return `${tripped} TRIPPED: ${Plant.SIS[tripped].action}.`;
    for (const k of Plant.activeVars(run)) {
      const d = Plant.VARS[k];
      if (d.hh !== null && run.x[k] >= d.hh) return `HIGH ALARM: ${d.label} ${fmt(run.x[k], d.unit)}`;
      if (d.ll !== null && run.t > 2 && run.x[k] <= d.ll) return `LOW ALARM: ${d.label} ${fmt(run.x[k], d.unit)}`;
    }
    if (!run.airOk) return 'Instrument air header low: pneumatic valves at fail position.';
    const air = run.level.airTest;
    if (air && run.t >= air.start && run.t < air.end) return `Air lost to ${air.valves ? air.valves.join(', ') : 'all valves'}: they go to their fail position.`;
    if (run.pumpTrip) return 'P-201 tripped on low suction level.';
    return '';
  }

  function fitCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawTrend(run) {
    const { ctx, w, h } = fitCanvas($('trend'));
    if (!w) return;
    const level = current.level;
    const tag = current.trendLoop;
    const L = Plant.LOOPS[tag];
    const d = Plant.VARS[L.pv];
    const [lo, hi] = d.range;
    const muted = cssVar('--muted');
    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px system-ui, sans-serif';

    const left = 42;
    const right = w - 34;
    const top = 14;
    const bottom = h - 20;
    const dur = level.duration;
    const xOf = (t) => left + (t / dur) * (right - left);
    const yV = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
    const yP = (p) => bottom - (p / 100) * (bottom - top);

    if (level.airTest) {
      ctx.fillStyle = cssVar('--alarm');
      ctx.globalAlpha = 0.1;
      ctx.fillRect(xOf(level.airTest.start), top, xOf(level.airTest.end) - xOf(level.airTest.start), bottom - top);
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.strokeStyle = muted;
    ctx.setLineDash([2, 4]);
    (level.events || []).concat(level.spChanges || []).forEach((e) => line(ctx, xOf(e.at), top, xOf(e.at), bottom));
    ctx.restore();

    level.checks.filter((c) => c.type === 'hold' && (c.var || Plant.LOOPS[c.loop].pv) === L.pv).forEach((c) => {
      const target = c.target !== undefined ? c.target : Plant.finalSp(level, c.loop);
      ctx.fillStyle = cssVar('--sp');
      ctx.globalAlpha = 0.15;
      ctx.fillRect(left, yV(target + c.tol), right - left, Math.max(2, yV(target - c.tol) - yV(target + c.tol)));
      ctx.globalAlpha = 1;
    });

    ctx.strokeStyle = muted;
    ctx.fillStyle = muted;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i += 1) {
      const v = lo + (i * (hi - lo)) / 5;
      ctx.globalAlpha = 0.3;
      line(ctx, left, yV(v), right, yV(v));
      ctx.globalAlpha = 1;
      ctx.textAlign = 'right';
      ctx.fillText(fmt(v), left - 5, yV(v) + 4);
      ctx.textAlign = 'left';
      ctx.fillText(`${i * 20}`, right + 4, yP(i * 20) + 4);
    }
    const tickStep = dur > 240 ? 60 : 30;
    for (let t = 0; t <= dur; t += tickStep) ctx.fillText(`${t}s`, xOf(t) - 8, h - 5);
    ctx.fillText(`${d.label} (${d.unit})`, left + 4, top - 3);

    ctx.save();
    ctx.setLineDash([4, 4]);
    if (d.hh !== null) { ctx.strokeStyle = cssVar('--alarm'); line(ctx, left, yV(d.hh), right, yV(d.hh)); }
    if (d.ll !== null) { ctx.strokeStyle = cssVar('--warn'); line(ctx, left, yV(d.ll), right, yV(d.ll)); }
    ctx.restore();

    if (!run || run.trend.length < 2) return;
    const pts = run.trend;
    const plot = (fn, color, dash, width) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      pts.forEach((p, i) => {
        const y = fn(p);
        if (i === 0) ctx.moveTo(xOf(p.t), y);
        else ctx.lineTo(xOf(p.t), y);
      });
      ctx.stroke();
      ctx.restore();
    };
    const clampY = (y) => Math.min(bottom, Math.max(top, y));
    plot((p) => yP(p.v[tag]), cssVar('--valve'), [2, 3], 1.5);
    plot((p) => clampY(yV(p.sp[tag])), cssVar('--sp'), [6, 4], 2);
    plot((p) => yV(p.x[L.pv]), cssVar('--level'), [], 2.5);

    Object.keys(run.sis).forEach((s) => {
      const st = run.sis[s];
      if (!st.tripped) return;
      ctx.strokeStyle = cssVar('--alarm');
      ctx.lineWidth = 2;
      line(ctx, xOf(st.at), top, xOf(st.at), bottom);
      ctx.fillStyle = cssVar('--alarm');
      ctx.fillText(`${s} trip`, xOf(st.at) + 4, top + 12);
    });
  }

  function viewState(run) {
    if (run) return { x: run.x, flows: Plant.flows(run), sis: run.sis };
    const x = {};
    Object.keys(Plant.VARS).forEach((k) => { x[k] = Plant.VARS[k].init; });
    return { x, flows: Plant.NORMAL_FLOWS, sis: {} };
  }

  function draw(force) {
    if (!current || current.step !== 'run') return;
    const run = current.run;
    const now = performance.now();
    if (force || now - lastTable > 120) {
      lastTable = now;
      updateTable(run);
      updateEvents(run);
      current.pid.setLive(run);
      const alarm = run ? activeAlarm(run) : '';
      $('alarm').hidden = !alarm;
      $('alarm').textContent = alarm;
      drawTrend(run);
    }
  }

  // ---- Main loop ----

  function frame(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.25);
    lastFrame = now;
    if (current && current.running && current.run) {
      current.acc += dt * current.speed;
      let steps = 0;
      while (current && current.running && current.acc >= Plant.DT && steps < 400) {
        Plant.step(current.run);
        current.acc -= Plant.DT;
        steps += 1;
        if (Plant.isDone(current.run)) {
          draw(true);
          finish();
          break;
        }
      }
    }
    const playing = current && !$('play-view').hidden;
    if (playing) draw(false);
    if (view && (playing || !$('levels-view').hidden)) view.update(viewState(playing ? current.run : null));
    window.requestAnimationFrame(frame);
  }

  // ---- Wiring ----

  const speeds = $('speeds');
  SPEEDS.forEach((s) => {
    const b = el('button', '', `${s}x`);
    b.type = 'button';
    b.dataset.speed = s;
    b.addEventListener('click', () => setSpeed(s));
    speeds.append(b);
  });

  $('job-next').addEventListener('click', () => goStep('install'));
  $('pin-toggle').addEventListener('click', () => setPinCollapsed(!pinCollapsed));
  setPinCollapsed(pinCollapsed);
  $('pid-next').addEventListener('click', nextFromPid);
  $('config-next').addEventListener('click', () => {
    if (current.invalid.size) {
      const first = document.querySelector('#config fieldset.invalid');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    goStep('run');
  });
  $('run').addEventListener('click', toggleRun);
  $('check').addEventListener('click', () => { if (current && current.run) finish(); });
  $('restart').addEventListener('click', restartRun);
  $('hint').addEventListener('click', showHint);
  $('back').addEventListener('click', backToLevels);
  $('config').addEventListener('input', (e) => onGuideEdit(e.target.closest('fieldset')));
  $('config').addEventListener('submit', (e) => e.preventDefault());
  $('trend-loop').addEventListener('change', (e) => {
    current.trendLoop = e.target.value;
    draw(true);
  });
  $('result-retry').addEventListener('click', () => closeResult('retry'));
  $('result-see').addEventListener('click', () => closeResult('see'));
  $('result-next').addEventListener('click', () => closeResult('next'));
  $('reset-progress').addEventListener('click', () => {
    if (!window.confirm('Reset all stars and points on this device?')) return;
    progress = { best: {} };
    saveProgress();
    renderLevels();
    updateHeader();
  });
  window.addEventListener('resize', () => {
    if (view) view.resize();
    if (current && current.pid) current.pid.fit();
  });

  renderGlossary();
  renderLevels();
  updateHeader();
  showView('levels');
  window.requestAnimationFrame((now) => {
    lastFrame = now;
    window.requestAnimationFrame(frame);
  });
})();
