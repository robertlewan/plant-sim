// Run with: node tests/plant.test.js            (all levels)
//           node tests/plant.test.js L13 L15    (some levels, with details)
const assert = require('assert');
const Plant = require('../js/plant.js');
const { LEVELS } = require('../js/levels.js');

function simulate(level, cfg) {
  const run = Plant.startRun(level, cfg);
  while (!Plant.isDone(run)) Plant.step(run);
  return { run, result: Plant.evaluate(run, 0) };
}

const only = process.argv.slice(2);
let failures = 0;
for (const level of LEVELS) {
  if (only.length && !only.includes(level.id)) continue;
  const { run, result } = simulate(level, Plant.referenceConfig(level));
  const line = `${level.id.padEnd(4)} ${result.pass ? 'PASS' : 'FAIL'} ${'*'.repeat(result.stars).padEnd(3)} settle ${result.settleTime.toFixed(0).padStart(4)}s os ${result.overshootPct.toFixed(1).padStart(5)}%  ${level.title}`;
  console.log(line);
  if (!result.pass || result.stars < 3 || only.length) {
    result.checks.forEach((c) => console.log(`      ${c.ok ? 'ok ' : 'BAD'} ${c.label}${c.detail ? ' (' + c.detail + ')' : ''}`));
    if (only.length) {
      const s = run.stats;
      Object.keys(s.min).forEach((k) => console.log(`      ${k.padEnd(9)} min ${s.min[k].toFixed(2)} max ${s.max[k].toFixed(2)} end ${run.x[k].toFixed(2)}`));
      run.events.forEach((e) => console.log(`      t=${e.t} ${e.text}`));
    }
  }
  if (!result.pass) failures += 1;

  // Commissioned-with-faults or blank player config must not pass.
  const start = simulate(level, fillBlank(level, Plant.initialConfig(level))).result;
  if (start.pass && Object.values(level.loops).includes('player') === false && level.faults && level.faults.cfg) {
    console.log(`      planted fault did not fail the level`);
    failures += 1;
  }
}

// Blank player loops get placeholder numbers so the run can start.
function fillBlank(level, cfg) {
  Object.values(cfg.loops).forEach((c) => { if (c.sp === null) c.sp = 0; });
  Object.values(cfg.sis).forEach((c) => { if (c.sp === null) c.sp = 1e9; });
  return cfg;
}

// Specific wrong answers must fail for the reason the level teaches.
function wrong(id, patch) {
  const level = LEVELS.find((l) => l.id === id);
  const cfg = Plant.referenceConfig(level);
  patch(cfg);
  return simulate(level, cfg).result.pass;
}
if (!only.length) {
  const cases = [
    ['L1 reverse action', () => wrong('L1', (c) => { c.loops['LIC-101'].action = 'reverse'; })],
    ['L3 fail closed', () => wrong('L3', (c) => { c.loops['LIC-101'].failPos = 'closed'; })],
    ['L4 wrong range', () => wrong('L4', (c) => { c.loops['LIC-101'].lo = 0; c.loops['LIC-101'].hi = 6; })],
    ['L14 fuel fail open', () => wrong('L14', (c) => { c.loops['TIC-501'].failPos = 'open'; })],
    ['L19 vent fail closed', () => wrong('L19', (c) => { c.loops['PIC-602'].failPos = 'closed'; })],
    ['L29 1oo3 spurious', () => wrong('L29', (c) => { c.sis['LSHH-101'].voting = '1oo3'; })],
    ['L29 3oo3 never trips', () => wrong('L29', (c) => { c.sis['LSHH-101'].voting = '3oo3'; })],
    ['L31 2oo2 dead sensor', () => wrong('L31', (c) => { c.sis['TSHH-501'].voting = '2oo2'; })],
    ['L25 ratio wrong', () => wrong('L25', (c) => { c.loops['FIC-801'].ratio = 0.3; })],
  ];
  cases.forEach(([name, fn]) => {
    const passed = fn();
    console.log(`${passed ? 'BAD ' : 'ok  '} wrong answer fails: ${name}`);
    if (passed) failures += 1;
  });
}

console.log(failures ? `${failures} problem(s)` : 'all good');
process.exitCode = failures ? 1 : 0;
