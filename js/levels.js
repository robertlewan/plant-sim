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
      situation: [
        'Crude oil arrives from a ship and flows into storage tank TK-101. It leaves the bottom of the tank by gravity through a control valve called LV-101 and goes on to the rest of the plant.',
        'At the moment nothing controls how full the tank is. If more crude comes in than goes out, the tank overflows; if more goes out, it runs dry. You will build an automatic level control loop: a level transmitter (LT-101) measures how full the tank is, a level controller (LIC-101) compares that with the level you want, and the controller opens or closes LV-101 to keep the level steady.',
        'The tank starts almost empty, at 1.0 m of liquid. You want it to fill up to 3.0 m and then stay there.',
      ],
      timeline: [
        'Crude keeps arriving at a steady 1.0 m³/s for the whole run. (m³/s means cubic metres per second; one cubic metre is 1,000 litres.)',
      ],
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
      situation: [
        'You are setting up the TK-101 level loop again. This time it has to cope with a change in how fast crude arrives.',
        'When more crude flows in, the level starts to rise. The controller must notice and open LV-101 further so that more crude flows out, until in and out are equal again and the level is back at 3.0 m. A sudden change like this, which the controller did not cause, is called a disturbance.',
      ],
      timeline: [
        'For the first 40 seconds crude arrives at 1.0 m³/s and the tank is steady at 3.0 m.',
        'At 40 seconds the ship speeds up its pumps: crude now arrives at 1.4 m³/s (40% more) and stays at that rate.',
      ],
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
      situation: [
        'Control valves like LV-101 are moved by compressed air (called instrument air) pushing against a spring. If the air is lost, the spring pushes the valve all the way to one end: fully closed or fully open. That end is called the fail position, and it is chosen when the valve is bought.',
        'In this job a maintenance crew will accidentally cut the air to LV-101 for 30 seconds. While the air is off, the controller cannot move the valve. You must choose the fail position that keeps TK-101 safe during those 30 seconds.',
      ],
      timeline: [
        'Crude arrives at a steady 1.0 m³/s for the whole run.',
        'From 30 to 60 seconds the air to LV-101 is cut. The valve goes to its fail position, whatever the controller wants.',
        'At 60 seconds the air comes back. The controller takes over again and must bring the level back to 3.0 m.',
      ],
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
      situation: [
        'A new level transmitter has been fitted to TK-101, but it was mounted 1 m above the bottom of the tank. It cannot see the bottom metre of liquid: when the tank is empty it reads 1.0 m, and its 4–20 mA signal covers 1.0 m to 7.0 m instead of 0 to 6 m. This is called an elevated zero.',
        'The control system does not know this unless you type it in. If you enter the wrong range, the controller will hold the wrong level while the screen shows the right number. Set up the loop with the transmitter\'s real range and hold the tank at 4.0 m.',
      ],
      timeline: [
        'The tank starts at 2.0 m.',
        'Crude arrives at a steady 1.0 m³/s for the whole run.',
      ],
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
      situation: [
        'Your TK-101 level loop works, but operations want it to react faster. When the crude flow changes, the level should get back to target quickly and must not swing past it.',
        'This job is about tuning: choosing the controller\'s gain (Kc) and integral time (Ti). Any settings that hold the level will pass. For the bonus star, the level must settle within 30 seconds of the change and overshoot by less than 1%.',
      ],
      timeline: [
        'The tank starts steady at 3.0 m with crude arriving at 1.0 m³/s.',
        'At 20 seconds the crude flow rises to 1.3 m³/s and stays there.',
      ],
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
      situation: [
        'Pump P-201 sends crude from storage to the processing unit. This flow is called the charge, and it must be steady, because the units after it are designed for a fixed flow.',
        'You will build a flow loop: a flow transmitter (FT-201) measures the charge flow, a flow controller (FIC-201) compares it with the target, and control valve FV-201 opens or closes to adjust it. The target is 1.2 m³/s.',
      ],
      timeline: [
        'The flow starts at 0.9 m³/s, below the target.',
        'At 40 seconds the pressure at the pump inlet drops. With the same valve opening, less crude now gets through, so the controller must open FV-201 further to keep 1.2 m³/s.',
      ],
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
      situation: [
        'Now pump P-201 takes its crude straight from tank TK-101. In this job there is no level controller on the tank, only your flow controller FIC-201.',
        'That means the tank level depends entirely on the balance between crude coming in (1.2 m³/s from the ship) and crude going out (whatever FIC-201 sends). If the two are not equal, the tank slowly fills or drains. If it drains below 0.3 m, the pump loses suction and trips (stops).',
        'Set FIC-201 so the charge exactly matches the incoming crude, and keep the tank level between 2.4 m and 3.6 m for the whole run.',
      ],
      timeline: [
        'Crude arrives at a steady 1.2 m³/s for the whole run.',
        'The tank starts at 3.0 m and the charge flow starts at 0.9 m³/s, so the tank begins to fill until your loop takes over.',
      ],
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
      situation: [
        'In the last job the tank was only safe because the charge happened to match the incoming crude. In a real plant the ship\'s rate changes, so the tank level must decide the charge flow. This is done with a cascade.',
        'In a cascade, the level controller LIC-101 (the master) does not move a valve. Its output becomes the setpoint of the flow controller FIC-201 (the slave), and FIC-201 moves the valve. If the tank level rises, LIC-101 asks for more charge flow, and FIC-201 makes it happen.',
        'Build both loops and connect them. Hold the tank at 3.0 m while the ship speeds up.',
      ],
      timeline: [
        'Crude arrives at 1.2 m³/s for the first 60 seconds.',
        'At 60 seconds it rises to 1.5 m³/s. The level starts to rise, so LIC-101 must raise the charge flow to 1.5 m³/s as well.',
      ],
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
      situation: [
        'Last night, after maintenance work on the control system, the level in TK-101 ran away and nearly caused a spill. The operator switched the loops off and called you.',
        'Both loops, LIC-101 and FIC-201, are already installed and wired. One setting was changed by mistake during the maintenance. Before you start the plant, open the Configure step, check every setting of both loops against what you have learned, find the wrong one and correct it.',
      ],
      timeline: [
        'Crude arrives at 1.2 m³/s for the first 30 seconds.',
        'At 30 seconds it rises to 1.35 m³/s.',
      ],
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
      situation: [
        'Crude oil contains salt, which corrodes pipes and equipment. In the desalter D-401, water is mixed into the crude to wash the salt out. The water then settles to the bottom of the vessel, because it is heavier than oil.',
        'The boundary between the water at the bottom and the oil above it is called the interface. If it gets too high, water goes on with the crude into the hot heater; if it gets too low, oil goes out with the waste water. You will build the interface level loop: LT-401 measures the interface as a percentage of the vessel height, LIC-401 compares it with 50%, and valve LV-401 drains the water.',
      ],
      timeline: [
        'Until 60 seconds the wash water is 6% of the crude flow.',
        'At 60 seconds operations raise the wash water to 9%, so water collects faster and the interface starts to rise.',
      ],
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
      situation: [
        'Before the crude goes to the heater, it is warmed up in exchanger E-301 by the hot residue coming out of the bottom of the tower. This saves fuel.',
        'To control how hot the crude gets, part of it can go around the exchanger through a bypass valve, TV-301. Opening the bypass means less crude is heated, so the outlet temperature falls. You will build the temperature loop: TT-301 measures the crude temperature after the exchanger, TIC-301 compares it with 130 °C, and moves TV-301.',
      ],
      timeline: [
        'At 60 seconds less hot residue reaches the exchanger, so the crude starts to come out cooler. TIC-301 must close the bypass to send more crude through the exchanger.',
      ],
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
      situation: [
        'The charge loops, the desalter and the preheat are connected in a line: a change at the start affects everything after it.',
        'This time the level cascade on TK-101 is already working. You set up the desalter interface loop (LIC-401) and the preheat temperature loop (TIC-301) again, and both must hold their targets while the charge rate goes up.',
      ],
      timeline: [
        'At 30 seconds the ship speeds up from 1.2 to 1.5 m³/s, and the level cascade raises the charge flow to match.',
        'More crude means more wash water in the desalter (it is a fixed percentage of the crude) and less heating for each litre in the exchanger. Both of your loops will feel the change.',
      ],
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
      situation: [
        'Charge heater H-501 burns fuel gas to heat the crude to about 350 °C before it enters the distillation tower. The outlet temperature decides how much of the crude turns to vapour in the tower, so it must be steady.',
        'You will build the temperature loop: TT-501 measures the crude temperature at the heater outlet, TIC-501 compares it with 350 °C, and moves the fuel gas valve FV-502. More fuel means a hotter outlet. Temperature responds slowly, so this loop will be slower than the level and flow loops.',
      ],
      timeline: [
        'At 60 seconds the pressure in the fuel gas supply drops. The same valve opening now lets less fuel through and the heater starts to cool, so TIC-501 must open FV-502 further.',
      ],
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
      situation: [
        'The fuel gas valve FV-502 is the most important valve on the heater. If it fails open, the burners fire at full power with nothing controlling them, and the heater tubes can overheat and burst.',
        'In this job the air to FV-502 is cut for 30 seconds. Set up TIC-501 again and choose the safe fail position for FV-502. The heater is allowed to cool down while the air is off, but its outlet must never go above the high alarm of 400 °C.',
      ],
      timeline: [
        'From 40 to 70 seconds the air to FV-502 is cut and the valve goes to its fail position.',
        'At 70 seconds the air comes back and TIC-501 must bring the temperature back to 350 °C.',
      ],
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
      situation: [
        'In job L13, when the fuel gas pressure dropped, the heater cooled for a while before TIC-501 noticed and opened the valve. Temperature is slow, so the correction came late.',
        'A cascade fixes this. You add a flow loop on the fuel gas (FT-502 and FIC-502) that holds the fuel flow steady. TIC-501 becomes the master: its output sets the fuel flow target of FIC-502. If the gas pressure drops, FIC-502 sees the flow fall within a second and opens the valve, before the temperature has time to change.',
      ],
      timeline: [
        'At 60 seconds the fuel gas pressure drops sharply, to 70% of normal.',
      ],
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
      situation: [
        'The heater is ready to be lit again after a shutdown. Before any fuel goes to the burners, the shift engineer asks you to check the heater control loops, TIC-501 and FIC-502. Both are installed and wired.',
        'Two settings are wrong. One of them only causes trouble if the instrument air fails, and a short air dip will happen during the run. Open the Configure step, check every setting of both loops, fix the two errors, then start up.',
      ],
      timeline: [
        'From 90 to 100 seconds the air to FV-502 dips and the valve goes to its fail position.',
      ],
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
      situation: [
        'The hot crude from the heater enters the atmospheric distillation tower C-601. Inside, the lighter parts of the crude turn to vapour and rise; the heaviest part, called residue, stays liquid and collects at the bottom.',
        'The liquid level at the bottom of the tower must be held steady: too high and it floods the lowest trays, too low and the bottoms pump loses suction. You will build the bottoms level loop: LT-601 measures the level, LIC-601 compares it with 2.0 m, and valve LV-601 controls the flow of residue out. The tower pressure loop PIC-602 is already running.',
      ],
      timeline: [
        'At 60 seconds the ship speeds up and the charge to the tower rises from 1.2 to 1.4 m³/s, so more liquid reaches the bottom of the tower.',
      ],
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
      situation: [
        'The vapour leaving the top of the tower goes to a condenser through valve PV-602. The tower pressure must be steady, because pressure changes the temperature at which each product boils.',
        'You will build the pressure loop: PT-602 measures the pressure at the top of the tower, PIC-602 compares it with 1.5 bar, and moves PV-602. Opening PV-602 lets more vapour out, so the pressure falls.',
      ],
      timeline: [
        'At 60 seconds a lighter crude arrives with more gas in it. About 35% more vapour goes to the top of the tower, and the pressure starts to rise.',
      ],
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
      situation: [
        'If the air to PV-602 is lost, the valve goes to its fail position. If it closes, vapour is trapped in the tower and the pressure climbs until the safety relief valve opens to the flare. If it opens, the vapour goes to the condenser and the pressure falls, which upsets the products but is safe.',
        'Set up PIC-602 again and choose the fail position for PV-602.',
      ],
      timeline: [
        'From 40 to 60 seconds the air to PV-602 is cut.',
        'At 60 seconds the air comes back and PIC-602 must bring the pressure back to 1.5 bar.',
      ],
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
      situation: [
        'The heater and the tower work as one system. A lower heater outlet temperature means less of the crude turns to vapour: the tower pressure falls and more liquid reaches the bottom.',
        'You own both tower loops this time: the bottoms level (LIC-601) and the overhead pressure (PIC-602). Hold both on target while operations change the heater temperature and a gas surge arrives.',
      ],
      timeline: [
        'At 60 seconds the operator lowers the heater outlet setpoint from 350 to 320 °C.',
        'At 150 seconds a lighter crude sends extra gas to the top of the tower.',
      ],
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
      situation: [
        'The vapour from the top of the tower is cooled in a condenser and turns back into liquid, called naphtha. The naphtha collects in the reflux drum D-701.',
        'From the drum, part of the naphtha goes back into the top of the tower (the reflux), and the rest leaves as product through valve LV-701. You will build the drum level loop: LT-701 measures the level, LIC-701 compares it with 1.5 m, and moves LV-701. The reflux flow loop FIC-702 is already running.',
      ],
      timeline: [
        'At 60 seconds a lighter crude sends more vapour overhead, so more liquid condenses into the drum.',
      ],
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
      situation: [
        'Reflux is naphtha sent back into the top of the tower. It washes the rising vapour and makes the separation sharper, so the products are cleaner. Operators adjust the reflux flow to control product quality.',
        'You will build the reflux flow loop: FT-702 measures the reflux, FIC-702 compares it with the setpoint, and moves FV-702. Operations will raise the setpoint during the run, and your loop must follow it quickly. The drum level loop LIC-701 is already running.',
      ],
      timeline: [
        'At 60 seconds the operator raises the reflux setpoint from 0.40 to 0.50 m³/s. More reflux drains the drum faster, and LIC-701 has to respond.',
      ],
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
      situation: [
        'The control room screen shows the reflux drum D-701 at its 1.5 m setpoint. But the field operator looking at the gauge glass on the drum says the real level is much lower.',
        'All loops are installed and running. Something in the drum level loop is set up wrong, so the controller holds the wrong level while the screen looks fine. Check LIC-701 against the data sheet, find the error and fix it.',
      ],
      timeline: [
        'Nothing changes in the process during this run. The problem is in the measurement.',
      ],
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
      situation: [
        'Diesel is taken out of the tower halfway up, from a tray where the liquid has the right boiling range. Pump P-801 draws it off through valve FV-801.',
        'You will build the diesel flow loop: FT-801 measures the draw, FIC-801 compares it with the setpoint, and moves FV-801. Operations will ask for more diesel during the run. Taking more diesel leaves less liquid falling to the bottom of the tower, so the bottoms level loop will react too.',
      ],
      timeline: [
        'At 60 seconds the operator raises the diesel setpoint from 0.30 to 0.35 m³/s.',
      ],
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
      situation: [
        'When the charge rate changes, the diesel draw should change in proportion. Instead of a fixed setpoint, FIC-801 gets a ratio: its setpoint is always 0.25 times the charge flow. With 1.2 m³/s of charge the diesel target is 0.30 m³/s; with 1.4 m³/s it becomes 0.35 m³/s.',
        'Set up FIC-801 as a ratio controller. Wire the charge flow transmitter FT-201 into FIC-801 as well, so the controller knows the charge flow.',
      ],
      timeline: [
        'At 60 seconds the ship speeds up. The level cascade raises the charge from 1.2 to 1.4 m³/s, and the diesel target follows automatically to 0.35 m³/s.',
      ],
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
      situation: [
        'Diesel flows into storage tank TK-802 and residue into TK-803. From there the products are pumped out (dispatched) to ships and trucks through valves LV-802 and LV-803.',
        'The tanks are not at their normal level: TK-802 is low (3 m) and TK-803 is high (7 m). Build both level loops and bring each tank to 5 m. Big tanks change level slowly, so the controllers need patience, which means a long integral time.',
      ],
      timeline: [
        'Diesel and residue keep flowing in at their normal rates for the whole run.',
      ],
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
      situation: [
        'Every air-operated valve in the plant takes its air from the instrument air header, which is supplied by compressor K-1101. If the header pressure falls below 4 bar, all those valves go to their fail positions at the same time.',
        'You will build the header pressure loop: PT-1101 measures the header pressure, PIC-1101 compares it with 7 bar, and moves PV-1101, which sets how hard the compressor works. PV-1101 has an electric actuator, so it keeps working even if the air fails.',
      ],
      timeline: [
        'At 60 seconds the plant starts using 30% more air, because more valves are moving.',
      ],
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
      situation: [
        'The plant has two air compressors. During this run one of them trips (stops), and the remaining one has to make up the difference.',
        'Set up PIC-1101 so the remaining compressor is loaded up fast enough. The header pressure must never fall below 6 bar.',
      ],
      timeline: [
        'At 60 seconds the compressor capacity drops by 30%. PIC-1101 must load the remaining compressor quickly.',
      ],
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
      situation: [
        'Control loops keep the plant on target, but they can fail. A separate safety instrumented system (SIS) protects the plant when they do. For TK-101 there is a high-level trip called LSHH-101: three independent level transmitters (LT-101A, LT-101B and LT-101C) watch the tank, and if enough of them read above the trip setpoint, valve XV-101 closes and stops the crude coming in.',
        'You choose the trip setpoint and the voting, which is how many of the three transmitters must agree before it trips. Two of the transmitters will fail during the run, one reading too high and one stuck low. The trip must not happen falsely, but it must happen when the tank really gets too full.',
      ],
      timeline: [
        'At 20 seconds LT-101B fails and reads 5.8 m, which is falsely high.',
        'At 40 seconds LT-101C fails and stays stuck at 2.0 m, which is falsely low.',
        'At 60 seconds the ship surges to 2.6 m³/s, more than the charge pump can take, and the tank really starts to fill. The tank overflows at 6 m.',
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
      situation: [
        'During this run the heater\'s control transmitter TT-501 will fail and read 200 °C. TIC-501 will think the heater is cold and open the fuel valve fully. The real temperature will then climb toward the point where the heater tubes are damaged, 430 °C.',
        'The safety trip TSHH-501 protects the heater. It has its own two temperature transmitters, TT-501A and TT-501B, separate from the control loop. If enough of them read above the trip setpoint, valve XV-502 closes and shuts off the fuel. Choose the trip setpoint and the voting. The trip must act after the failure and keep the heater below 430 °C.',
      ],
      timeline: [
        'The heater runs normally at 350 °C.',
        'At 60 seconds the control transmitter TT-501 fails and reads 200 °C.',
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
      situation: [
        'This is the same failure as the last job, but this time one of the two safety transmitters, TT-501B, has been broken since before start-up and reads 0 °C. Nobody noticed.',
        'Choose a voting that still trips the heater with only one working sensor, and a trip setpoint that protects it.',
      ],
      timeline: [
        'TT-501B reads 0 °C for the whole run.',
        'At 60 seconds the control transmitter TT-501 fails and reads 200 °C.',
      ],
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
      situation: [
        'The whole unit is built and running, except the hot section: the heater controls and the tower bottoms level. You commission them now, with every other loop already working.',
        'Set up the heater temperature cascade (TIC-501 as the master, FIC-502 as the slave) and the tower bottoms level loop LIC-601. Everything is connected, so a change in one place spreads through the plant.',
      ],
      timeline: [
        'At 60 seconds the ship speeds up from 1.2 to 1.4 m³/s.',
        'At 150 seconds the fuel gas pressure drops.',
      ],
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
      situation: [
        'After a turnaround (a planned maintenance shutdown), the plant has restarted on a heavier crude, and two loops are behaving badly. Two configuration errors were made during the turnaround.',
        'All loops are installed and running. Check every commissioned loop against the data sheet and what you have learned, then find and fix both errors.',
      ],
      timeline: [
        'At 60 seconds less hot residue reaches the preheat exchanger, because the heavier crude behaves differently.',
      ],
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
      situation: [
        'This is the whole crude unit on stream. Crude arrives, is pumped, washed, preheated, heated, and split in the tower into naphtha, diesel and residue, with utilities and safety systems around it.',
        'You are responsible for the instrument air header (PIC-1101), the heater fuel cascade (TIC-501 and FIC-502) and both safety trips (LSHH-101 and TSHH-501). Three upsets arrive one after another. Keep the plant on target with no alarms. The safety trips must not trip, because nothing dangerous happens if your loops do their job.',
      ],
      timeline: [
        'At 60 seconds the ship speeds up from 1.2 to 1.4 m³/s.',
        'At 140 seconds the fuel gas pressure drops.',
        'At 220 seconds one of the air compressors trips.',
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
