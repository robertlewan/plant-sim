// Work orders. The refinery is built in the order crude flows through it:
// tank, charge pump, desalter, preheat, heater, tower, overhead, side draws,
// products, utilities, safety system, and finally the whole unit on stream.
// Every level reuses the loops you commissioned before ("given") and adds the
// new ones you own ("player").
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PlantLevels = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---- Helpers ----
  const stepAt = (at, before, after) => (t) => (t >= at ? after : before);
  const pulse = (start, end, normal, during) => (t) => (t >= start && t < end ? during : normal);
  const hold = (loop, tol, holdS) => ({ type: 'hold', loop, tol, hold: holdS || 20 });
  const holdVar = (v, target, tol, holdS) => ({ type: 'hold', var: v, target, tol, hold: holdS || 20 });
  const NO_ALARMS = { type: 'noAlarms' };
  const own = (...tags) => tags.reduce((o, t) => Object.assign(o, { [t]: 'player' }), {});
  const merge = (...parts) => Object.assign({}, ...parts);

  // Units, in the order they are built.
  const U_TANK = ['TK101'];
  const U_CHARGE = [...U_TANK, 'P201'];
  const U_DESALT = [...U_CHARGE, 'D401'];
  const U_PREHEAT = [...U_DESALT, 'E301'];
  const U_HEATER = [...U_PREHEAT, 'H501'];
  const U_TOWER = [...U_HEATER, 'C601'];
  const U_OVHD = [...U_TOWER, 'D701'];
  const U_SIDE = [...U_OVHD, 'P801'];
  const U_PRODUCTS = [...U_SIDE, 'TK802', 'TK803'];
  const U_ALL = [...U_PRODUCTS, 'K1101'];

  // Commissioned loops at each stage, and their cascade/ratio modes.
  const G_CHARGE = { 'LIC-101': 'given', 'FIC-201': 'given' };
  const M_CHARGE = { 'FIC-201': { cascadeFrom: 'LIC-101' } };
  const G_DESALT = merge(G_CHARGE, { 'LIC-401': 'given' });
  const G_PREHEAT = merge(G_DESALT, { 'TIC-301': 'given' });
  const G_HEATER_SIMPLE = merge(G_PREHEAT, { 'TIC-501': 'given' });
  const G_HEATER = merge(G_PREHEAT, { 'TIC-501': 'given', 'FIC-502': 'given' });
  const M_HEATER = merge(M_CHARGE, { 'FIC-502': { cascadeFrom: 'TIC-501' } });
  const G_TOWER = merge(G_HEATER, { 'LIC-601': 'given', 'PIC-602': 'given' });
  const G_OVHD = merge(G_TOWER, { 'LIC-701': 'given', 'FIC-702': 'given' });
  const G_SIDE = merge(G_OVHD, { 'FIC-801': 'given' });
  const M_SIDE = merge(M_HEATER, { 'FIC-801': { ratioTo: 'FT201.F' } });
  const R_SIDE = { 'FIC-801': 0.25 };
  const G_PRODUCTS = merge(G_SIDE, { 'LIC-802': 'given', 'LIC-803': 'given' });
  const G_ALL = merge(G_PRODUCTS, { 'PIC-1101': 'given' });

  const AREAS = [
    'Crude receiving',
    'Charge pumps and flow',
    'Desalter and preheat',
    'Charge heater',
    'Atmospheric tower',
    'Overhead and reflux',
    'Side draws and products',
    'Utilities',
    'Safety system',
    'The refinery on stream',
  ];

  const LEVELS = [
    // ---------------- 1. Crude receiving ----------------
    {
      id: 'L1', area: AREAS[0], title: 'First tank',
      brief: 'Crude enters tank TK-101 and leaves by gravity through LV-101. Scale LT-101 and run the level loop.',
      workOrder: ['Crude receipt: 1.0 m³/s', 'Hold the level for 20 s'],
      units: U_TANK, loops: own('LIC-101'), warmup: false,
      init: { 'TK101.L': 1.0 }, loads: { crude: 1.0 },
      duration: 120, measureFrom: 0,
      checks: [NO_ALARMS, hold('LIC-101', 0.1)],
      par: { settle: 45, overshoot: 3 },
      study: {
        title: 'The level loop',
        body: [
          'A control loop has three parts: a transmitter that measures (LT-101), a controller that decides (LIC-101), and a final element that acts (the valve LV-101).',
          'The transmitter sends 4–20 mA. 4 mA is the bottom of its calibrated range, 20 mA the top. The DCS converts the current back to metres using the range you type in.',
          'Controller action: LV-101 drains the tank, so opening it lowers the level. When the level is above the setpoint the output must rise. That is direct action.',
        ],
      },
      hints: ['Opening the outlet valve lowers the level, so use direct action.', 'Type the setpoint in metres, the same unit as the range.'],
    },
    {
      id: 'L2', area: AREAS[0], title: 'Feed step',
      brief: 'The ship pumps faster at 40 s. The loop must absorb the step and return the level to target.',
      workOrder: ['Crude receipt rises from 1.0 to 1.4 m³/s at 40 s'],
      units: U_TANK, loops: own('LIC-101'), warmup: false,
      loads: { crude: stepAt(40, 1.0, 1.4) },
      events: [{ at: 40, text: 'Crude receipt rises to 1.4 m³/s.' }],
      duration: 150, measureFrom: 40,
      checks: [NO_ALARMS, hold('LIC-101', 0.15)],
      par: { settle: 60, overshoot: 4 },
      study: {
        title: 'Disturbances and integral action',
        body: [
          'A disturbance is anything that moves the process that the controller does not decide: here, the crude receipt rate.',
          'Proportional action alone leaves an offset: to pass more crude the valve must stay more open, and P-only can only hold it open with an error.',
          'Integral action keeps moving the output while any error remains, so the level returns exactly to setpoint. Ti is the time it takes to repeat the proportional action.',
        ],
      },
      hints: ['More crude in needs a more open outlet valve: the controller must find a new output.', 'A large Ti makes recovery slow. Try 20–30 s.'],
    },
    {
      id: 'L3', area: AREAS[0], title: 'Air failure',
      brief: 'Instrument air to LV-101 is lost from 30 s to 60 s. Choose the fail position that keeps the tank safe.',
      workOrder: ['Air to LV-101 is cut from 30 s to 60 s', 'Crude receipt keeps arriving at 1.0 m³/s'],
      units: U_TANK, loops: own('LIC-101'), warmup: false,
      loads: { crude: 1.0 }, airTest: { start: 30, end: 60 },
      events: [{ at: 30, text: 'Instrument air to LV-101 lost.' }, { at: 60, text: 'Instrument air restored.' }],
      duration: 150, measureFrom: 60,
      checks: [NO_ALARMS, hold('LIC-101', 0.15)],
      par: { settle: 80, overshoot: 10 },
      study: {
        title: 'Fail-safe valves',
        body: [
          'Pneumatic valves are moved by air against a spring. Lose the air and the spring drives the valve to its fail position: fail open (FO) or fail closed (FC).',
          'The fail position is chosen for safety, not for control. Ask: if this valve goes fully open or fully closed, which outcome is safe?',
          'Here crude keeps arriving. A closed outlet means the tank fills and overflows; an open outlet lets it drain, which the next unit can handle.',
        ],
      },
      hints: ['Closed outlet + crude still coming in = overflow.', 'Fail open drains the tank but keeps it above the low alarm.'],
    },
    {
      id: 'L4', area: AREAS[0], title: 'Elevated zero',
      brief: 'LT-101 is mounted so that it reads 1.0 m at empty. Scale it with the range on its data sheet, not 0–6 m.',
      workOrder: ['Watch the trend: the setpoint line shows where the controller thinks the level is'],
      units: U_TANK, loops: own('LIC-101'), warmup: false,
      ranges: { 'LIC-101': [1, 7] }, sp: { 'LIC-101': 4 },
      init: { 'TK101.L': 2.0 }, loads: { crude: 1.0 },
      duration: 120, measureFrom: 0,
      checks: [NO_ALARMS, hold('LIC-101', 0.1)],
      par: { settle: 60, overshoot: 4 },
      study: {
        title: 'Zero, span and scaling',
        body: [
          'LRV (lower range value) is what the transmitter reads at 4 mA; URV (upper range value) is what it reads at 20 mA. Span = URV − LRV.',
          'Level transmitters measure pressure at the bottom of the tank. Mounting the tap above or below the tank bottom shifts the zero: an elevated or suppressed zero.',
          'If the DCS range does not match the transmitter, the controller holds a wrong level while the screen looks perfect. Always check the data sheet first.',
          'mA to value: value = LRV + (mA − 4) / 16 × span. 12 mA is always 50% of span.',
        ],
      },
      hints: ['Use 1.0 to 7.0 m as the DCS range.', 'If the screen says 4.0 m but the tank is not there, the range is wrong.'],
    },
    {
      id: 'L5', area: AREAS[0], title: 'Tune for speed',
      brief: 'Receipt steps up at 20 s. Tune LIC-101 to settle fast with almost no overshoot.',
      workOrder: ['Crude receipt rises from 1.0 to 1.3 m³/s at 20 s', 'Target: settle within 30 s, overshoot under 1%'],
      units: U_TANK, loops: own('LIC-101'), warmup: false,
      loads: { crude: stepAt(20, 1.0, 1.3) },
      events: [{ at: 20, text: 'Crude receipt rises to 1.3 m³/s.' }],
      duration: 150, measureFrom: 20,
      checks: [NO_ALARMS, hold('LIC-101', 0.1)],
      par: { settle: 30, overshoot: 1 },
      study: {
        title: 'PI tuning by feel',
        body: [
          'Kc (gain) sets how hard the output reacts to the error right now. Ti (integral time) sets how fast the leftover error is removed.',
          'Too much gain: the loop oscillates. Too short Ti: it overshoots and rings. Too long Ti: it creeps back slowly.',
          'A practical method: raise Kc until the loop just starts to oscillate, halve it, then shorten Ti until the overshoot is what you can accept.',
          'Level loops are integrating (the tank just keeps filling), so they tolerate high gain but dislike short Ti.',
        ],
      },
      hints: ['Level loops like high gain: try Kc 5 or more.', 'Use a long Ti (60 s or more) so integral action does not cause overshoot.'],
    },

    // ---------------- 2. Charge pumps and flow ----------------
    {
      id: 'L6', area: AREAS[1], title: 'Charge flow loop',
      brief: 'P-201 pumps crude to the unit through FV-201. Hold the charge flow while the suction head falls at 40 s.',
      workOrder: ['Suction head drops at 40 s: the same valve opening now passes less flow'],
      units: ['P201'], loops: own('FIC-201'), warmup: false,
      init: { 'FT201.F': 0.9 }, loads: { head: stepAt(40, 1.0, 0.8) },
      events: [{ at: 40, text: 'Suction head drops.' }],
      duration: 120, measureFrom: 40,
      checks: [NO_ALARMS, hold('FIC-201', 0.05)],
      par: { settle: 30, overshoot: 4 },
      study: {
        title: 'Flow loops',
        body: [
          'Flow through a valve depends on its opening and on the pressure drop across it: Q ≈ Cv × opening × √ΔP. If upstream pressure falls, flow falls at the same opening.',
          'Opening FV-201 raises the flow. When flow is below setpoint the output must rise: reverse action.',
          'The rule for action: if opening the valve raises the measurement, reverse. If opening it lowers the measurement, direct.',
          'Flow is fast (seconds). Use modest gain (around 1) and a short Ti (around 5 s).',
        ],
      },
      hints: ['Reverse action for flow.', 'Kc 1, Ti 5 s is a good start.'],
    },
    {
      id: 'L7', area: AREAS[1], title: 'Pump and tank together',
      brief: 'Now P-201 draws from TK-101. Nothing controls the tank level: the charge rate decides whether the tank fills or drains.',
      workOrder: ['Receipt is 1.2 m³/s for the whole run', 'The pump trips if TK-101 falls below 0.3 m', 'Keep TK-101 inside its alarm limits'],
      units: U_CHARGE, loops: own('FIC-201'), warmup: false,
      init: { 'FT201.F': 0.9, 'TK101.L': 3 },
      duration: 200, measureFrom: 0,
      checks: [NO_ALARMS, hold('FIC-201', 0.05), { type: 'min', var: 'TK101.L', limit: 2.4 }, { type: 'max', var: 'TK101.L', limit: 3.6 }],
      par: { settle: 20, overshoot: 4 },
      study: {
        title: 'Inventory and material balance',
        body: [
          'A tank level is the integral of (in − out). If out is fixed by a flow controller and does not equal in, the level drifts until something trips.',
          'That is why a flow loop alone cannot hold a tank: the tank needs a level controller somewhere that adjusts a flow.',
          'Pumps need suction head. Below a minimum level the pump cavitates or trips on low suction, and the whole unit downstream loses feed.',
        ],
      },
      hints: ['Set FIC-201 to exactly the receipt rate, 1.2 m³/s.', 'Any mismatch makes the tank drift, so tune for no overshoot.'],
    },
    {
      id: 'L8', area: AREAS[1], title: 'Level to flow cascade',
      brief: 'Connect LIC-101 to FIC-201: the level controller now sets the charge flow setpoint. Receipt rises at 60 s.',
      workOrder: ['LIC-101 is the master, FIC-201 is the slave', 'FIC-201 setpoint comes from LIC-101 (0–100% = the FIC-201 range)', 'Receipt rises from 1.2 to 1.5 m³/s at 60 s'],
      units: U_CHARGE, loops: own('LIC-101', 'FIC-201'), modes: M_CHARGE,
      loads: { crude: stepAt(60, 1.2, 1.5) },
      events: [{ at: 60, text: 'Crude receipt rises to 1.5 m³/s.' }],
      duration: 240, measureFrom: 60,
      checks: [NO_ALARMS, hold('LIC-101', 0.1), holdVar('FT201.F', 1.5, 0.05)],
      par: { settle: 90, overshoot: 4 },
      study: {
        title: 'Cascade control',
        body: [
          'In a cascade, the master (here level) does not move a valve. Its output becomes the setpoint of a faster slave loop (here flow).',
          'The slave fixes its own disturbances (pump head, valve sticking) before the master even sees them.',
          'Commission from the inside out: tune the slave first, then the master. The slave must be at least 3–5 times faster than the master.',
          'LIC-101 is direct (high level → more charge). FIC-201 is reverse (low flow → open more). Each loop has its own action.',
        ],
      },
      hints: ['Master LIC-101: direct. Slave FIC-201: reverse.', 'Keep the slave fast (Kc 1, Ti 5) and the master slow (Kc 2, Ti 30).'],
    },
    {
      id: 'L9', area: AREAS[1], title: 'Troubleshoot: charge runaway',
      brief: 'Night shift says the tank level ran away after a maintenance job. Inspect both loops before you start, find the error and fix it.',
      workOrder: ['Both loops were commissioned before; one setting was changed by mistake', 'You can edit commissioned loops'],
      units: U_CHARGE, loops: G_CHARGE, modes: M_CHARGE,
      faults: { cfg: { 'LIC-101': { action: 'reverse' } } },
      loads: { crude: stepAt(30, 1.2, 1.35) },
      events: [{ at: 30, text: 'Crude receipt rises to 1.35 m³/s.' }],
      duration: 200, measureFrom: 30,
      checks: [NO_ALARMS, hold('LIC-101', 0.1)],
      par: { settle: 90, overshoot: 4 },
      study: {
        title: 'Troubleshooting a loop that runs away',
        body: [
          'A loop that drives the output to 0% or 100% and pushes the PV further away is in positive feedback. The usual cause is the wrong controller action.',
          'Check in order: is the transmitter reading right (compare with a local gauge)? Is the range right? Is the action right? Does the valve move the right way (fail position, air-to-open)?',
          'Change one thing at a time and watch the trend.',
        ],
      },
      hints: ['Look at the action of each controller.', 'High level must raise the charge setpoint.'],
    },

    // ---------------- 3. Desalter and preheat ----------------
    {
      id: 'L10', area: AREAS[2], title: 'Desalter interface',
      brief: 'Wash water mixed into the crude settles at the bottom of D-401. Hold the oil/water interface with the water draw LV-401.',
      workOrder: ['Wash water rate rises from 6% to 9% of charge at 60 s', 'Opening LV-401 drains water and lowers the interface'],
      units: U_DESALT, loops: merge(G_CHARGE, own('LIC-401')), modes: M_CHARGE,
      loads: { wash: stepAt(60, 0.06, 0.09) },
      events: [{ at: 60, text: 'Wash water raised to 9%.' }],
      duration: 200, measureFrom: 60,
      checks: [NO_ALARMS, hold('LIC-401', 3)],
      par: { settle: 60, overshoot: 6 },
      study: {
        title: 'Interface level',
        body: [
          'A desalter washes salt out of crude with water and separates them with an electric field. Water is heavier and collects at the bottom.',
          'The interface level is where water meets oil. Too high: water carries over with the crude into the hot heater (it flashes to steam). Too low: oil goes to the water drain and the sewer.',
          'Interface is measured in % of the transmitter span (often a displacer or guided-wave radar). Same rules: opening the water draw lowers it, so direct action.',
        ],
      },
      hints: ['Direct action: high interface → open the water draw.', 'The range is 0–100 %, setpoint 50 %.'],
    },
    {
      id: 'L11', area: AREAS[2], title: 'Preheat bypass',
      brief: 'E-301 heats crude with hot residue. TV-301 bypasses crude around the exchanger to control the outlet temperature.',
      workOrder: ['Hot residue flow drops at 60 s', 'Opening the bypass sends more crude around E-301, so the outlet gets cooler'],
      units: U_PREHEAT, loops: merge(G_DESALT, own('TIC-301')), modes: M_CHARGE,
      loads: { hot: stepAt(60, 0.62, 0.5) },
      events: [{ at: 60, text: 'Hot residue flow to E-301 drops.' }],
      duration: 260, measureFrom: 60,
      checks: [NO_ALARMS, hold('TIC-301', 2)],
      par: { settle: 120, overshoot: 2 },
      study: {
        title: 'Temperature loops and dead time',
        body: [
          'Temperature responds slowly: heat must travel through metal and liquid. There is also dead time: nothing happens for a few seconds after the valve moves.',
          'Dead time is the enemy of control. The controller cannot see the effect of its own move yet, so aggressive tuning makes it oscillate.',
          'Rule of thumb: start with Ti close to the process time constant (here ~15 s) and raise Kc until the response is quick but not ringing.',
          'Bypass control: opening the bypass lowers the outlet temperature, so the controller is direct-acting.',
        ],
      },
      hints: ['Direct action. Range 0–300 °C.', 'Try Kc 2 and Ti 15.'],
    },
    {
      id: 'L12', area: AREAS[2], title: 'Rate change',
      brief: 'The ship increases receipt. Your level cascade raises the charge, and both the desalter and preheat feel it.',
      workOrder: ['Receipt rises from 1.2 to 1.5 m³/s at 30 s', 'You own LIC-401 and TIC-301 this time; the charge loops are commissioned'],
      units: U_PREHEAT, loops: merge(G_CHARGE, own('LIC-401', 'TIC-301')), modes: M_CHARGE,
      loads: { crude: stepAt(30, 1.2, 1.5) },
      events: [{ at: 30, text: 'Crude receipt rises to 1.5 m³/s.' }],
      duration: 300, measureFrom: 30,
      checks: [NO_ALARMS, hold('TIC-301', 3), hold('LIC-401', 3)],
      par: { settle: 200, overshoot: 3 },
      study: {
        title: 'Interaction between units',
        body: [
          'Units are connected by flows. A change in one place travels downstream: more charge means more wash water and less time for each litre of crude in the exchanger.',
          'That is why plant start-ups and rate changes are done slowly, with each loop given time to settle.',
        ],
      },
      hints: ['Same settings that worked in L10 and L11 work here.', 'More flow through E-301 cools the outlet: the bypass must close.'],
    },

    // ---------------- 4. Charge heater ----------------
    {
      id: 'L13', area: AREAS[3], title: 'Heater outlet temperature',
      brief: 'H-501 burns fuel gas to heat the charge to 350 °C. TIC-501 moves the fuel valve FV-502.',
      workOrder: ['Fuel gas header pressure drops at 60 s', 'More fuel = hotter outlet'],
      units: U_HEATER, loops: merge(G_PREHEAT, own('TIC-501')), modes: M_CHARGE,
      loads: { fuelP: stepAt(60, 1.0, 0.8) },
      events: [{ at: 60, text: 'Fuel gas header pressure drops.' }],
      duration: 300, measureFrom: 60,
      checks: [NO_ALARMS, hold('TIC-501', 4)],
      par: { settle: 150, overshoot: 1.5 },
      study: {
        title: 'Fired heaters',
        body: [
          'A fired heater is a firebox with tubes. Crude flows in the tubes; burners heat them. The outlet temperature sets how much of the crude vaporises in the tower.',
          'Opening the fuel valve raises the temperature, so TIC-501 is reverse-acting.',
          'The heater has a long time constant and dead time. Tune gently: Kc around 1, Ti around 40 s.',
          'Low charge flow is dangerous: the same fuel heats less crude, so tube temperature climbs. Heaters have low-flow trips for this reason.',
        ],
      },
      hints: ['Reverse action, range 0–500 °C, setpoint 350.', 'Kc 1, Ti 40 s.'],
    },
    {
      id: 'L14', area: AREAS[3], title: 'Fuel valve fail-safe',
      brief: 'Air to the fuel valve is lost for 30 s. Pick the fail position that cannot overheat the heater.',
      workOrder: ['Air to FV-502 is cut from 40 s to 70 s', 'The heater high alarm is 400 °C'],
      units: U_HEATER, loops: merge(G_PREHEAT, own('TIC-501')), modes: M_CHARGE,
      airTest: { start: 40, end: 70, valves: ['FV-502'] },
      events: [{ at: 40, text: 'Air to FV-502 lost.' }, { at: 70, text: 'Air restored.' }],
      duration: 300, measureFrom: 70,
      checks: [{ type: 'noHigh' }, hold('TIC-501', 4)],
      par: { settle: 150, overshoot: 13 },
      study: {
        title: 'Fail position of fuel valves',
        body: [
          'Fuel valves always fail closed. A fuel valve that fails open would fire the heater at full rate with nobody controlling it.',
          'Compare with the crude tank in L3 that needed fail open. The same question always decides it: which end position is safe for this service?',
          'Losing fuel cools the heater. That upsets the tower, but nobody gets hurt, and the operator relights or restores.',
        ],
      },
      hints: ['Fail closed.', 'The low temperature during the air loss is acceptable; only high alarms fail this level.'],
    },
    {
      id: 'L15', area: AREAS[3], title: 'Fuel gas cascade',
      brief: 'Put FIC-502 under TIC-501. The fuel flow loop fixes header pressure swings before they reach the outlet temperature.',
      workOrder: ['Fuel header pressure drops sharply at 60 s', 'TIC-501 output = FIC-502 setpoint (0–100% = FIC-502 range)'],
      units: U_HEATER, loops: merge(G_PREHEAT, own('TIC-501', 'FIC-502')), modes: M_HEATER,
      loads: { fuelP: stepAt(60, 1.0, 0.7) },
      events: [{ at: 60, text: 'Fuel gas header pressure drops sharply.' }],
      duration: 300, measureFrom: 60,
      checks: [NO_ALARMS, hold('TIC-501', 3), hold('FIC-502', 0.05)],
      par: { settle: 60, overshoot: 1 },
      study: {
        title: 'Why cascade the fuel',
        body: [
          'Without the cascade, a fuel pressure drop cuts fuel, the outlet cools (after the dead time), and only then does TIC-501 react. The temperature dips.',
          'With FIC-502 inside, the flow loop sees the pressure drop in a second and opens the valve to keep the same fuel flow. The temperature barely moves.',
          'Compare the trend with L13.',
        ],
      },
      hints: ['FIC-502 reverse, range 0–2 kg/s. TIC-501 reverse.', 'Slave Kc 1 Ti 5; master Kc 1 Ti 40.'],
    },
    {
      id: 'L16', area: AREAS[3], title: 'Troubleshoot: heater pre-start check',
      brief: 'Before relighting, the shift engineer asks you to check the heater loops. Two settings are wrong. An air dip at 90 s will expose one of them.',
      workOrder: ['Air to FV-502 dips from 90 s to 100 s', 'Find and fix two configuration errors before or during the run'],
      units: U_HEATER, loops: G_HEATER, modes: M_HEATER,
      faults: { cfg: { 'FIC-502': { action: 'direct', failPos: 'open' } } },
      airTest: { start: 90, end: 100, valves: ['FV-502'] },
      events: [{ at: 90, text: 'Air to FV-502 dips.' }, { at: 100, text: 'Air restored.' }],
      duration: 260, measureFrom: 100,
      checks: [NO_ALARMS, hold('TIC-501', 4)],
      par: { settle: 150, overshoot: 3 },
      study: {
        title: 'Pre-start checks',
        body: [
          'Before a unit starts, every loop is checked: transmitter range, controller action, valve stroke and fail position (a "loop check").',
          'A wrong fail position does nothing until the day the air fails. That is why it is checked on paper and by actually venting the actuator.',
        ],
      },
      hints: ['Check FIC-502 carefully.', 'Fuel flow loop: reverse action, fail closed.'],
    },

    // ---------------- 5. Atmospheric tower ----------------
    {
      id: 'L17', area: AREAS[4], title: 'Tower bottoms level',
      brief: 'Hot charge flashes in C-601. Liquid collects at the bottom; LV-601 sends it to E-301 and storage. Hold the bottoms level.',
      workOrder: ['Receipt rises at 60 s; your charge cascade raises the feed to the tower', 'PIC-602 already holds the overhead pressure'],
      units: U_TOWER, loops: merge(G_HEATER, { 'PIC-602': 'given' }, own('LIC-601')), modes: M_HEATER,
      loads: { crude: stepAt(60, 1.2, 1.4) },
      events: [{ at: 60, text: 'Crude receipt rises to 1.4 m³/s.' }],
      duration: 300, measureFrom: 60,
      checks: [NO_ALARMS, hold('LIC-601', 0.1)],
      par: { settle: 120, overshoot: 4 },
      study: {
        title: 'The atmospheric tower',
        body: [
          'Crude is a mix of many hydrocarbons. Heated to ~350 °C, the light ones vaporise and rise; the heavy ones stay liquid and fall to the bottom.',
          'Trays inside the tower separate the vapour into cuts by boiling point: gas and naphtha at the top, kerosene and diesel as side draws, residue at the bottom.',
          'The bottoms level is an inventory, like TK-101. The bottoms pump sends hot residue through E-301 (heat recovery) to storage.',
          'Note the connection: bottoms flow is the heating medium of E-301. Changing LV-601 changes the preheat temperature.',
        ],
      },
      hints: ['Direct action, range 0–4 m, setpoint 2 m.', 'Kc 2, Ti 30.'],
    },
    {
      id: 'L18', area: AREAS[4], title: 'Overhead pressure',
      brief: 'PV-602 lets vapour to the condenser. Hold the tower pressure when a lighter crude sends a surge of gas overhead.',
      workOrder: ['At 60 s a lighter crude adds 0.25 m³/s of gas overhead (about +35%)'],
      units: U_TOWER, loops: merge(G_HEATER, { 'LIC-601': 'given' }, own('PIC-602')), modes: M_HEATER,
      loads: { lights: stepAt(60, 0, 0.25) },
      events: [{ at: 60, text: 'Lighter crude: gas surge overhead.' }],
      duration: 300, measureFrom: 60,
      checks: [NO_ALARMS, hold('PIC-602', 0.05)],
      par: { settle: 120, overshoot: 4 },
      study: {
        title: 'Tower pressure',
        body: [
          'Pressure decides boiling points. If the tower pressure swings, every cut changes, so pressure is held tight.',
          'Vapour in raises pressure; opening the vent/condenser path lowers it. Direct action.',
          'More vapour (a lighter crude, or a hotter heater outlet) raises the pressure within seconds. The controller must open the vent path before the high alarm.',
        ],
      },
      hints: ['Direct action, range 0–3 bar, setpoint 1.5.', 'Kc 2, Ti 20.'],
    },
    {
      id: 'L19', area: AREAS[4], title: 'Overhead vent fail position',
      brief: 'Air to PV-602 is lost for 20 s. Choose the fail position that protects the tower.',
      workOrder: ['Air to PV-602 is cut from 40 s to 60 s', 'High pressure alarm at 2.5 bar'],
      units: U_TOWER, loops: merge(G_HEATER, { 'LIC-601': 'given' }, own('PIC-602')), modes: M_HEATER,
      airTest: { start: 40, end: 60, valves: ['PV-602'] },
      events: [{ at: 40, text: 'Air to PV-602 lost.' }, { at: 60, text: 'Air restored.' }],
      duration: 240, measureFrom: 60,
      checks: [NO_ALARMS, hold('PIC-602', 0.05)],
      par: { settle: 30, overshoot: 12 },
      study: {
        title: 'Pressure relief and fail positions',
        body: [
          'A pressure valve that fails closed traps vapour: pressure climbs until the safety relief valve lifts to the flare.',
          'Fail open lets the vapour go to the condenser. Pressure drops, which upsets the separation, but it is safe.',
          'Relief valves and the flare are the last line of defence. Good fail positions keep them from lifting.',
        ],
      },
      hints: ['Fail open.', 'Keep the tuning from L18.'],
    },
    {
      id: 'L20', area: AREAS[4], title: 'Heater and tower together',
      brief: 'Operations cut the heater outlet temperature, then a gas surge hits the overhead. You own both tower loops this time.',
      workOrder: ['TIC-501 setpoint goes from 350 to 320 °C at 60 s: less vapour, more bottoms liquid', 'Gas surge overhead at 150 s'],
      units: U_TOWER, loops: merge(G_HEATER, own('LIC-601', 'PIC-602')), modes: M_HEATER,
      spChanges: [{ at: 60, loop: 'TIC-501', sp: 320 }],
      loads: { lights: stepAt(150, 0, 0.2) },
      events: [{ at: 150, text: 'Gas surge overhead.' }],
      duration: 300, measureFrom: 60,
      checks: [NO_ALARMS, hold('LIC-601', 0.1), hold('PIC-602', 0.05)],
      par: { settle: 150, overshoot: 5 },
      study: {
        title: 'One move, many responses',
        body: [
          'The heater temperature is a lever on the whole tower: it sets the vapour/liquid split.',
          'Lower temperature → less vapour overhead (pressure falls, PIC-602 closes) and more liquid to the bottoms (LIC-601 opens).',
          'Operators make these moves in small steps and wait for the tower to settle before the next one.',
        ],
      },
      hints: ['Same settings as L17 and L18.', 'Bottoms level: direct. Pressure: direct.'],
    },

    // ---------------- 6. Overhead and reflux ----------------
    {
      id: 'L21', area: AREAS[5], title: 'Reflux drum level',
      brief: 'Overhead vapour condenses into D-701. Naphtha product leaves through LV-701. Hold the drum level.',
      workOrder: ['At 60 s a lighter crude sends more vapour overhead: more liquid condenses into the drum', 'FIC-702 already holds the reflux'],
      units: U_OVHD, loops: merge(G_TOWER, { 'FIC-702': 'given' }, own('LIC-701')), modes: M_HEATER,
      loads: { lights: stepAt(60, 0, 0.2) },
      events: [{ at: 60, text: 'Lighter crude: more vapour overhead.' }],
      duration: 300, measureFrom: 60,
      checks: [NO_ALARMS, hold('LIC-701', 0.1)],
      par: { settle: 120, overshoot: 5 },
      study: {
        title: 'The overhead system',
        body: [
          'Vapour leaving the top of the tower is condensed in an air cooler and collects in the reflux drum.',
          'Part of the liquid returns to the tower top as reflux; the rest is the naphtha product.',
          'The drum level is an inventory: it absorbs differences between what condenses and what leaves. Distillate draw is direct-acting on level.',
        ],
      },
      hints: ['Direct action, range 0–3 m, setpoint 1.5.', 'Kc 2, Ti 30.'],
    },
    {
      id: 'L22', area: AREAS[5], title: 'Reflux flow',
      brief: 'Operations want more reflux for a cleaner naphtha. Take FIC-702 and follow the setpoint change.',
      workOrder: ['FIC-702 setpoint goes from 0.40 to 0.50 m³/s at 60 s', 'More reflux drains the drum and adds liquid to the bottoms'],
      units: U_OVHD, loops: merge(G_TOWER, { 'LIC-701': 'given' }, own('FIC-702')), modes: M_HEATER,
      spChanges: [{ at: 60, loop: 'FIC-702', sp: 0.5 }],
      duration: 240, measureFrom: 60,
      checks: [NO_ALARMS, hold('FIC-702', 0.02), hold('LIC-701', 0.15)],
      par: { settle: 30, overshoot: 4 },
      study: {
        title: 'Reflux and product quality',
        body: [
          'Reflux is liquid sent back to wash the rising vapour. More reflux = sharper separation (cleaner products) but more heat and less product.',
          'The reflux ratio (reflux / distillate) is one of the main quality handles of any column.',
          'This is a setpoint change, not a disturbance: the loop must follow a new target quickly and without overshoot.',
        ],
      },
      hints: ['Reverse action, range 0–1 m³/s.', 'Kc 1, Ti 5.'],
    },
    {
      id: 'L23', area: AREAS[5], title: 'Troubleshoot: drum level lies',
      brief: 'The board shows D-701 at setpoint, but the field operator reports the sight glass well below. Find out why and fix it.',
      workOrder: ['LT-701 is calibrated 0–3 m', 'Hint: the trend setpoint line is in true metres'],
      units: U_OVHD, loops: G_OVHD, modes: M_HEATER,
      faults: { cfg: { 'LIC-701': { hi: 5 } } },
      duration: 240, measureFrom: 0,
      checks: [NO_ALARMS, hold('LIC-701', 0.1)],
      par: { settle: 120, overshoot: 5 },
      study: {
        title: 'When the board and the field disagree',
        body: [
          'If the DCS reading disagrees with a local gauge or sight glass, suspect the measurement chain before the process.',
          'Check the transmitter range against its data sheet, and the DCS scaling against the transmitter. A mismatch shifts every reading by a fixed ratio.',
          'Here the DCS was scaled 0–5 m for a 0–3 m transmitter: 50% current reads as 2.5 m instead of 1.5 m.',
        ],
      },
      hints: ['Open the commissioned loops and compare each range with its transmitter.', 'LIC-701 range should be 0–3 m.'],
    },

    // ---------------- 7. Side draws and products ----------------
    {
      id: 'L24', area: AREAS[6], title: 'Diesel side draw',
      brief: 'P-801 pulls diesel from a tray halfway up C-601. Take FIC-801 and raise the draw.',
      workOrder: ['FIC-801 setpoint goes from 0.30 to 0.35 m³/s at 60 s', 'A larger side draw means less liquid reaches the bottoms'],
      units: U_SIDE, loops: merge(G_OVHD, own('FIC-801')), modes: M_HEATER,
      spChanges: [{ at: 60, loop: 'FIC-801', sp: 0.35 }],
      duration: 240, measureFrom: 60,
      checks: [NO_ALARMS, hold('FIC-801', 0.02)],
      par: { settle: 20, overshoot: 4 },
      study: {
        title: 'Side draws',
        body: [
          'Between the top and the bottom, liquid on each tray has a different boiling range. Drawing liquid from a middle tray gives kerosene or diesel.',
          'Drawing more diesel takes liquid that would otherwise fall to the bottoms: the bottoms level controller sees less flow and closes LV-601.',
        ],
      },
      hints: ['Reverse action, range 0–1 m³/s.', 'Kc 1, Ti 5.'],
    },
    {
      id: 'L25', area: AREAS[6], title: 'Ratio control',
      brief: 'Diesel draw should follow the charge rate. Set FIC-801 as a ratio of FT-201: its setpoint = ratio × charge flow.',
      workOrder: ['Ratio: 0.25 (diesel draw per unit of charge)', 'Receipt rises at 60 s, your level cascade raises the charge, and the diesel draw must follow'],
      units: U_SIDE, loops: merge(G_OVHD, own('FIC-801')), modes: M_SIDE, ratio: R_SIDE,
      loads: { crude: stepAt(60, 1.2, 1.4) },
      events: [{ at: 60, text: 'Crude receipt rises to 1.4 m³/s.' }],
      duration: 300, measureFrom: 60,
      checks: [NO_ALARMS, holdVar('FT801.F', 0.35, 0.02)],
      par: { settle: 30, overshoot: 5 },
      study: {
        title: 'Ratio control',
        body: [
          'A ratio controller keeps one flow in proportion to another (the "wild" flow it does not control). SP = ratio × wild flow.',
          'Used for blending, wash water, fuel/air in burners, and draws that should scale with throughput.',
          'When the charge goes from 1.2 to 1.4 m³/s, a 0.25 ratio moves the diesel setpoint from 0.30 to 0.35 m³/s automatically.',
        ],
      },
      hints: ['Ratio 0.25, reverse action, range 0–1.', 'Kc 1, Ti 5.'],
    },
    {
      id: 'L26', area: AREAS[6], title: 'Product tanks',
      brief: 'Diesel goes to TK-802 and residue to TK-803. Bring both tanks back to 5 m and hold them with the dispatch valves.',
      workOrder: ['TK-802 starts at 3 m, TK-803 at 7 m', 'Tanks are large and slow: be patient with Ti'],
      units: U_PRODUCTS, loops: merge(G_SIDE, own('LIC-802', 'LIC-803')), modes: M_SIDE, ratio: R_SIDE,
      init: { 'TK802.L': 3, 'TK803.L': 7 },
      duration: 400, measureFrom: 0,
      checks: [NO_ALARMS, hold('LIC-802', 0.2), hold('LIC-803', 0.2)],
      par: { settle: 300, overshoot: 5 },
      study: {
        title: 'Storage and dispatch',
        body: [
          'Product tanks buffer the unit from the market: the unit runs steadily while ships and trucks take product in batches.',
          'Big tanks have a small level change per m³, so the loop needs a long Ti (60 s or more) to avoid slow, large oscillations.',
          'Opening the dispatch valve lowers the level: direct.',
        ],
      },
      hints: ['Direct, range 0–10 m, setpoint 5.', 'Kc 2, Ti 60.'],
    },

    // ---------------- 8. Utilities ----------------
    {
      id: 'L27', area: AREAS[7], title: 'Instrument air header',
      brief: 'Every pneumatic valve in the plant runs on instrument air from K-1101. Hold the header at 7 bar while demand rises.',
      workOrder: ['Air demand rises 30% at 60 s', 'Below 4 bar every pneumatic valve goes to its fail position', 'PV-1101 is electric: it does not need air'],
      units: U_ALL, loops: merge(G_PRODUCTS, own('PIC-1101')), modes: M_SIDE, ratio: R_SIDE,
      loads: { airDemand: stepAt(60, 1.0, 1.3) },
      events: [{ at: 60, text: 'Instrument air demand rises 30%.' }],
      duration: 240, measureFrom: 60,
      checks: [NO_ALARMS, hold('PIC-1101', 0.2)],
      par: { settle: 60, overshoot: 3 },
      study: {
        title: 'Utilities',
        body: [
          'Utilities serve the whole refinery: instrument air, steam, cooling water, nitrogen, power. Lose one and every unit is affected at once.',
          'Instrument air is the most critical: lose it and every pneumatic valve goes to its fail position. That is why fail positions must be right everywhere.',
          'Opening the compressor load valve raises header pressure: reverse action.',
        ],
      },
      hints: ['Reverse action, range 0–10 bar, setpoint 7.', 'Kc 2, Ti 20.'],
    },
    {
      id: 'L28', area: AREAS[7], title: 'Compressor trip',
      brief: 'One of two air compressors trips at 60 s. Tune PIC-1101 so the header never falls into its low alarm.',
      workOrder: ['Compressor capacity drops 30% at 60 s', 'The header must stay above 4.5 bar'],
      units: U_ALL, loops: merge(G_PRODUCTS, own('PIC-1101')), modes: M_SIDE, ratio: R_SIDE,
      loads: { airCap: stepAt(60, 2, 1.4) },
      events: [{ at: 60, text: 'Air compressor K-1101B tripped.' }],
      duration: 240, measureFrom: 60,
      checks: [NO_ALARMS, hold('PIC-1101', 0.2), { type: 'min', var: 'PT1101.P', limit: 6 }],
      par: { settle: 60, overshoot: 4 },
      study: {
        title: 'Disturbance rejection speed',
        body: [
          'When supply is lost, pressure falls at a rate set by the imbalance and the header volume. The controller has only seconds to react.',
          'A faster loop (higher Kc, shorter Ti) recovers before the header drops too far. Too fast and it oscillates in normal operation.',
          'Real plants add standby compressors that start automatically on low pressure.',
        ],
      },
      hints: ['Try Kc 4 and Ti 10.', 'Watch the minimum header pressure on the trend.'],
    },

    // ---------------- 9. Safety system ----------------
    {
      id: 'L29', area: AREAS[8], title: 'High-level trip 2oo3',
      brief: 'LSHH-101 protects TK-101 from overflow with three level switches. Set the trip point and the voting. Two sensors will fail during the run.',
      workOrder: [
        'At 20 s LT-101B fails high (reads 5.8 m)',
        'At 40 s LT-101C fails low (stuck at 2.0 m)',
        'At 60 s the ship surges to 2.6 m³/s, more than the charge pump can take',
        'Tank overflows at 6 m; it must not exceed 5.6 m',
      ],
      units: U_CHARGE, loops: G_CHARGE, modes: M_CHARGE,
      sis: { 'LSHH-101': 'player' }, sisRef: { 'LSHH-101': { sp: 5.0, voting: '2oo3' } },
      faults: { sensors: { 'LSHH-101': { 'LT-101B': { at: 20, value: 5.8 }, 'LT-101C': { at: 40, value: 2.0 } } } },
      loads: { crude: stepAt(60, 1.2, 2.6) },
      events: [{ at: 20, text: 'LT-101B failed high.' }, { at: 40, text: 'LT-101C stuck at 2.0 m.' }, { at: 60, text: 'Crude receipt surges to 2.6 m³/s.' }],
      duration: 200, measureFrom: 60,
      checks: [
        { type: 'tripped', sis: 'LSHH-101', after: 60 },
        { type: 'max', var: 'TK101.L', limit: 5.6 },
        { type: 'min', var: 'TK101.L', limit: 0.5 },
      ],
      study: {
        title: 'Safety instrumented systems',
        body: [
          'The control system (BPCS) keeps the plant on target. The safety instrumented system (SIS) is separate: its own sensors, its own logic, its own valves. It only acts to take the plant to a safe state.',
          'Voting MooN: the trip happens when M of N sensors agree. 1oo3 trips on any one sensor (safe but spurious trips). 3oo3 needs all three (rarely trips, even when it should). 2oo3 balances both and tolerates one failed sensor.',
          'The trip point sits above the high alarm (operator warning) and below the damage limit, with margin for how fast the level rises.',
        ],
      },
      hints: ['Voting 2oo3 tolerates one sensor failing either way.', 'A trip point around 5.0 m leaves margin below overflow.'],
    },
    {
      id: 'L30', area: AREAS[8], title: 'Heater high-temperature trip',
      brief: 'TT-501, the control transmitter, will fail low at 60 s. TIC-501 will think the heater is cold and pile on fuel. TSHH-501 must stop it.',
      workOrder: [
        'TSHH-501 uses its own sensors TT-501A and TT-501B, independent of the control loop',
        'Tube damage above 430 °C',
        'Normal operation must not trip (350 °C, with swings)',
      ],
      units: U_HEATER, loops: G_HEATER, modes: M_HEATER,
      sis: { 'TSHH-501': 'player' }, sisRef: { 'TSHH-501': { sp: 390, voting: '1oo2' } },
      faults: { pv: { 'TIC-501': { at: 60, value: 200 } } },
      events: [{ at: 60, text: 'TT-501 (control transmitter) failed low.' }],
      duration: 240, measureFrom: 60,
      checks: [
        { type: 'tripped', sis: 'TSHH-501', after: 60 },
        { type: 'max', var: 'H501.T', limit: 430 },
      ],
      study: {
        title: 'Independence of protection layers',
        body: [
          'The failure that creates the hazard (a control transmitter failing low) must not also blind the protection. That is why the SIS has its own sensors.',
          'Layers of protection: process design → BPCS control → alarms and operator → SIS trip → relief valves → emergency response. Each must be independent of the others.',
          'Trip point: high enough to ride through normal swings, low enough to act before damage, accounting for how fast temperature climbs.',
        ],
      },
      hints: ['A trip point near 390 °C sits between normal and damage.', 'Either voting works while both SIS sensors are healthy.'],
    },
    {
      id: 'L31', area: AREAS[8], title: 'Trip with a dead sensor',
      brief: 'Same failure as L30, but TT-501B has been dead (reading 0 °C) since before start-up. Choose a voting that still protects the heater.',
      workOrder: ['TT-501B reads 0 °C for the whole run', 'TT-501 control transmitter fails low at 60 s'],
      units: U_HEATER, loops: G_HEATER, modes: M_HEATER,
      sis: { 'TSHH-501': 'player' }, sisRef: { 'TSHH-501': { sp: 390, voting: '1oo2' } },
      faults: { pv: { 'TIC-501': { at: 60, value: 200 } }, sensors: { 'TSHH-501': { 'TT-501B': { at: 0, value: 0 } } } },
      events: [{ at: 60, text: 'TT-501 (control transmitter) failed low.' }],
      duration: 240, measureFrom: 60,
      checks: [
        { type: 'tripped', sis: 'TSHH-501', after: 60 },
        { type: 'max', var: 'H501.T', limit: 430 },
      ],
      study: {
        title: 'Fail-safe vs fail-to-danger sensors',
        body: [
          'A sensor that fails low on a high trip is a dangerous failure: it will never vote to trip.',
          'With 2oo2 voting, one dangerous failure disables the whole function. 1oo2 still trips on the healthy sensor.',
          'Real SIS logic detects dead sensors (out-of-range diagnostics) and degrades voting automatically, e.g. 2oo3 → 1oo2.',
        ],
      },
      hints: ['2oo2 needs both sensors: one is dead.', 'Use 1oo2.'],
    },

    // ---------------- 10. The refinery on stream ----------------
    {
      id: 'L32', area: AREAS[9], title: 'Commission the hot section',
      brief: 'The whole unit is built. Commission the heater cascade and the tower bottoms; everything else is running.',
      workOrder: ['Receipt rises at 60 s', 'Fuel header pressure drops at 150 s'],
      units: U_ALL, loops: merge(G_ALL, own('TIC-501', 'FIC-502', 'LIC-601')), modes: M_SIDE, ratio: R_SIDE,
      loads: { crude: stepAt(60, 1.2, 1.4), fuelP: stepAt(150, 1, 0.8) },
      events: [{ at: 60, text: 'Crude receipt rises to 1.4 m³/s.' }, { at: 150, text: 'Fuel header pressure drops.' }],
      duration: 360, measureFrom: 60,
      checks: [NO_ALARMS, hold('TIC-501', 4), hold('LIC-601', 0.15)],
      par: { settle: 260, overshoot: 4 },
      study: {
        title: 'Running a whole unit',
        body: [
          'In a running unit every loop is coupled. A good operator watches trends across units, not one loop at a time.',
          'Order of priorities: safety (no trips, no relief), then stability (no oscillations), then targets (temperatures and rates), then optimisation.',
        ],
      },
      hints: ['Use the settings from the heater and tower areas.', 'Fuel: cascade, slave reverse; master reverse; bottoms direct.'],
    },
    {
      id: 'L33', area: AREAS[9], title: 'Troubleshoot: crude switch',
      brief: 'After a crude switch, two loops behave badly. Inspect the commissioned loops, find both errors, and keep the unit out of alarm.',
      workOrder: ['A heavier crude arrives: less residue heat at 60 s', 'Two configuration errors were made during the turnaround'],
      units: U_ALL, loops: G_ALL, modes: M_SIDE, ratio: R_SIDE,
      faults: { cfg: { 'TIC-301': { action: 'reverse' }, 'LIC-803': { hi: 5 } } },
      loads: { hot: stepAt(60, 0.62, 0.5) },
      events: [{ at: 60, text: 'Crude switch: heavier crude in the tank.' }],
      duration: 360, measureFrom: 60,
      checks: [NO_ALARMS, hold('TIC-301', 3), hold('LIC-803', 0.2)],
      par: { settle: 240, overshoot: 4 },
      study: {
        title: 'Systematic troubleshooting',
        body: [
          'Start from symptoms: which PV is wrong, and which output is saturated at 0% or 100%?',
          'A saturated output with a PV moving away = wrong action. A PV steady at "setpoint" while the field disagrees = wrong range.',
          'Fix one thing, watch the trend, then move to the next.',
        ],
      },
      hints: ['Check TIC-301 action and every tank range.', 'Bypass control is direct; TK-803 is 0–10 m.'],
    },
    {
      id: 'L34', area: AREAS[9], title: 'The refinery on stream',
      brief: 'Final job: the whole refinery under your control. A ship surge, a fuel dip and an air compressor trip arrive one after another. Keep it all on target with no alarms and no trips.',
      workOrder: [
        'You own the air header, the heater fuel cascade and both safety functions',
        '60 s: receipt rises to 1.4 m³/s',
        '140 s: fuel header pressure drops',
        '220 s: one air compressor trips',
      ],
      units: U_ALL, loops: merge(G_ALL, own('PIC-1101', 'TIC-501', 'FIC-502')), modes: M_SIDE, ratio: R_SIDE,
      sis: { 'LSHH-101': 'player', 'TSHH-501': 'player' },
      sisRef: { 'LSHH-101': { sp: 5.0, voting: '2oo3' }, 'TSHH-501': { sp: 390, voting: '1oo2' } },
      loads: { crude: stepAt(60, 1.2, 1.4), fuelP: stepAt(140, 1, 0.8), airCap: stepAt(220, 2, 1.4) },
      events: [
        { at: 60, text: 'Crude receipt rises to 1.4 m³/s.' },
        { at: 140, text: 'Fuel header pressure drops.' },
        { at: 220, text: 'Air compressor K-1101B tripped.' },
      ],
      duration: 420, measureFrom: 60,
      checks: [
        NO_ALARMS,
        hold('TIC-501', 4),
        hold('PIC-1101', 0.2),
        { type: 'notTripped', sis: 'LSHH-101' },
        { type: 'notTripped', sis: 'TSHH-501' },
      ],
      par: { settle: 330, overshoot: 4 },
      study: {
        title: 'The refinery on stream',
        body: [
          'Crude arrives, is pumped, washed, preheated with its own residue, fired to 350 °C, and split by boiling point into naphtha, diesel and residue.',
          'Every loop you have built is still running: inventories (levels), throughputs (flows), energy (temperatures) and pressure, with utilities and safety around them.',
          'A plant on stream is not a set of separate loops. It is one system, and you just ran it.',
        ],
      },
      hints: ['Air header: reverse, Kc 4, Ti 10. Fuel: cascade as in L15.', 'Trips: LSHH 5.0 m 2oo3, TSHH 390 °C 1oo2. They must not trip in normal operation.'],
    },
  ];

  // Short definitions for the Glossary panel.
  const GLOSSARY = [
    ['PV, SP, MV', 'Process variable (measured), setpoint (wanted), manipulated variable (controller output to the valve, 0–100%).'],
    ['4–20 mA', 'Standard analogue signal. 4 mA = bottom of range (LRV), 20 mA = top (URV). A live zero: 0 mA means a broken wire, not a zero reading.'],
    ['LRV / URV / span', 'Lower and upper range values of a transmitter. Span = URV − LRV. The DCS must be scaled to the same range.'],
    ['Direct / reverse action', 'Direct: output rises when PV rises above SP. Reverse: output rises when PV falls below SP. Pick by asking what opening the valve does to the PV.'],
    ['Gain (Kc)', 'How strongly the output reacts to the error. High gain = fast but oscillatory.'],
    ['Integral time (Ti)', 'Seconds to repeat the proportional action. Removes steady error. Short Ti = fast but overshoots.'],
    ['Dead time', 'Delay before the PV starts to respond to the output. Common in temperature loops. Forces gentler tuning.'],
    ['Cascade', 'A master controller sets the setpoint of a faster slave controller that moves the valve.'],
    ['Ratio control', 'A flow setpoint equal to a ratio times another (wild) flow.'],
    ['Fail open / fail closed', 'Valve position on loss of air or signal, chosen for process safety.'],
    ['P&ID / ISA tags', 'Piping and instrumentation diagram. Tag letters: first = measured variable (L level, F flow, P pressure, T temperature), then function (I indicate, C control, T transmit, V valve, S switch). LIC = level indicating controller.'],
    ['Alarm H / HH / L / LL', 'Warnings to the operator. HH/LL are the outer limits, often tied to trips.'],
    ['BPCS', 'Basic process control system (the DCS): runs the control loops.'],
    ['SIS / SIF', 'Safety instrumented system / function: independent sensors, logic and valves that trip the plant to a safe state.'],
    ['MooN voting', 'M out of N sensors must agree to trip. 1oo2 = safe, more spurious trips. 2oo2 = fewer trips, less safe. 2oo3 = balance, tolerates one failure.'],
    ['Interlock / trip', 'Automatic action that forces equipment to a safe state, usually latched until reset.'],
  ];

  return { LEVELS, GLOSSARY, AREAS };
});
