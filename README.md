# Plant Simulator

Learn instrumentation and process control by building a crude distillation unit, one loop at a time. It runs in any browser, on a phone or a PC.

**Play it: https://robertlewan.github.io/plant-sim/**

Each job has five steps:

1. **Job**: read the problem and the data sheet.
2. **Install**: drag transmitters, controllers and control valves onto the P&ID.
3. **Wire**: connect the signals (transmitter → controller → valve).
4. **Configure**: range, setpoint, controller action, valve fail position and PID tuning, with plain-language explanations.
5. **Start up**: run the plant, watch the live P&ID and trend, and see the unit appear in the 3D refinery.

There are 34 jobs in 10 areas: crude receiving, charge pumps, desalter and preheat, charge heater, atmospheric tower, overhead and reflux, side draws and products, utilities, safety system, and the whole refinery on stream.

## Run it

Needs [Node.js](https://nodejs.org/). No other dependencies.

```bash
node server.js
```

Open http://localhost:8080. To play on a phone on the same Wi-Fi, open `http://<your-PC-IP>:8080`.

The 3D view loads three.js from a CDN, so it needs an internet connection. The rest works offline.

## Tests

```bash
node tests/plant.test.js
```

Runs every job with the correct settings (all must pass) and a set of wrong answers (all must fail).

## Files

- `js/plant.js`: process model, control loops and safety trips
- `js/levels.js`: the jobs, study notes and glossary
- `js/pid.js`: the P&ID drawing, install and wiring
- `js/view3d.js`: the 3D refinery
- `js/app.js`: screens and game flow
- `server.js`: small static web server

Progress is saved in your browser only.
