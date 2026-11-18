// 3D refinery yard (three.js r128), drawn as a night-time isometric plant.
// Each area of the refinery sits on its own plot. Units you have not built yet
// are wireframes; built units are solid; units of the current job are ringed
// and animated with live values (liquid levels, flame, flowing pipes).
//
// Controls: drag = move (pan), right-drag / Shift-drag / two-finger twist = rotate,
// wheel / pinch = zoom. The camera stays still when you are not touching it.
(function () {
  'use strict';

  const THREE = window.THREE;

  // Unit positions in the yard (metres). Crude flows west to east.
  const POS = {
    JETTY: [-52, 0, 0],
    TK101: [-38, 0, 0],
    P201: [-26, 0, 0],
    D401: [-16, 0, -1],
    E301: [-14, 0, 9],
    H501: [2, 0, 2],
    C601: [16, 0, 0],
    D701: [27, 0, -8],
    P801: [27, 0, 8],
    TK802: [37, 0, 13],
    TK803: [48, 0, 13],
    K1101: [-34, 0, -20],
    CTRL: [-12, 0, -20],
    FLARE: [44, 0, -20],
  };

  // Which plot (area index, matching levels.js AREAS) each unit sits on.
  const PLOTS = [
    { area: 0, units: ['JETTY', 'TK101'] },
    { area: 1, units: ['P201'] },
    { area: 2, units: ['D401', 'E301'] },
    { area: 3, units: ['H501'] },
    { area: 4, units: ['C601'] },
    { area: 5, units: ['D701'] },
    { area: 6, units: ['P801', 'TK802', 'TK803'] },
    { area: 7, units: ['K1101'] },
    { area: 8, units: ['CTRL'] },
    { area: 9, units: ['FLARE'] },
  ];

  // Pipes: [owner unit, flow key, colour key, points]. The owner decides whether it is built.
  function pipeDefs() {
    const P = (u, dx, y, dz) => [POS[u][0] + (dx || 0), y, POS[u][2] + (dz || 0)];
    return [
      ['TK101', 'crude', 'crude', [P('JETTY', 3, 1), P('TK101', -5.5, 1)]],
      ['P201', 'charge', 'crude', [P('TK101', 5.5, 0.6), P('P201', -1.2, 0.6)]],
      ['D401', 'charge', 'crude', [P('P201', 1.2, 0.6), P('P201', 3, 0.6), P('P201', 3, 3.6), P('D401', -6, 3.6), P('D401', -6, 2.4)]],
      ['E301', 'charge', 'crude', [P('D401', 6, 2.4), P('D401', 7, 2.4), P('D401', 7, 1.6, 10), P('E301', 4.6, 1.6)]],
      ['H501', 'charge', 'crude', [P('E301', 4.6, 1.6), P('E301', 8, 1.6), P('H501', -3, 1.6, 7), P('H501', -3, 1.6, 0)]],
      ['C601', 'charge', 'hot', [P('H501', 3.5, 2), P('C601', -2.4, 2, 2), P('C601', -2.4, 6, 2), P('C601', -1.6, 6, 1)]],
      ['D701', 'vapor', 'gas', [P('C601', 0, 28.5), P('C601', 0, 30), P('D701', 0, 30), P('D701', 0, 12)]],
      ['D701', 'reflux', 'naphtha', [P('D701', -2, 7.5), P('D701', -6, 7.5), P('C601', 2.2, 7.5, -2), P('C601', 2.2, 26, -2), P('C601', 1.6, 26, -1)]],
      ['D701', 'naphtha', 'naphtha', [P('D701', 3.8, 7), P('D701', 8, 7), P('D701', 8, 1), P('D701', 8, 1, 10)]],
      ['P801', 'side', 'diesel', [P('C601', 2, 14), P('C601', 2.8, 14), P('C601', 2.8, 1, 8), P('P801', -1.2, 0.6)]],
      ['TK802', 'side', 'diesel', [P('P801', 1.2, 0.6), P('TK802', 0, 0.6, -5), P('TK802', 0, 0.6, -4.3)]],
      ['C601', 'bottoms', 'residue', [P('C601', 0, 0.8, 2), P('C601', 0, 0.8, 4), P('E301', 6, 0.8, -4), P('E301', 2, 0.8, -1)]],
      ['TK803', 'bottoms', 'residue', [P('E301', 0, 0.8, 1.2), P('E301', 0, 0.8, 7), P('TK803', 0, 0.8, 7), P('TK803', 0, 0.8, 4.3)]],
      ['D401', 'water', 'water', [P('D401', 0, 0.4, 1.8), P('D401', 0, 0.4, 3), P('D401', -4, 0.4, 3)]],
      ['H501', 'fuel', 'fuel', [P('H501', 0, 0.5, -7), P('H501', 0, 0.5, -3.5)]],
      ['TK802', 'dieselOut', 'diesel', [P('TK802', 0, 0.6, 4.5), P('TK802', 0, 0.6, 9)]],
      ['TK803', 'residueOut', 'residue', [P('TK803', 4.5, 0.6), P('TK803', 9, 0.6)]],
      ['K1101', 'air', 'air', [P('K1101', 3, 1.2), P('CTRL', -6, 1.2)]],
      ['K1101', 'air', 'air', [P('K1101', 0, 1.2, 2), P('K1101', 0, 4.5, 2), P('K1101', 0, 4.5, 12), P('C601', -4, 4.5, -8), P('C601', -4, 4.5, -2)]],
    ];
  }

  const COLORS = {
    bg: 0x1b1846, ground: 0x141238, road: 0x0d0b26,
    pad: 0x262260, padDone: 0x312c7a, padEdge: 0x5d55c0, padEdgeDone: 0x9a8fff,
    body: 0xdcd8f5, white: 0xf3f1ff, dark: 0x5b5794, band: 0xf5c542, teal: 0x3fb6a8,
    pipe: 0xb6b0e4, concrete: 0x4a4590, brick: 0xa8643a,
    crude: 0x3b2a1e, hot: 0xff8a3d, gas: 0xe8e4ff, naphtha: 0xf5d76e, diesel: 0xf0a43a,
    residue: 0x2a2018, water: 0x4ea8f0, fuel: 0xf5c542, air: 0x8fe3ff,
    ghost: 0x8c84d8, ring: 0x6ee7d8, flame: 0xff7a1a, ok: 0x3ccf6e, bad: 0xff4060, lamp: 0xffe08a,
  };

  function create() {
    if (!THREE) return null;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.outline = 'none';
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.bg);
    scene.fog = new THREE.Fog(COLORS.bg, 200, 360);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 800);

    scene.add(new THREE.HemisphereLight(0xc9c2ff, 0x1a1640, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(-50, 90, 40);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8f86ff, 0.35);
    fill.position.set(60, 40, -50);
    scene.add(fill);

    function mat(color, extra) {
      return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.65, metalness: 0.1 }, extra));
    }
    const ghostMat = new THREE.MeshBasicMaterial({ color: COLORS.ghost, wireframe: true, transparent: true, opacity: 0.28 });

    function at(obj, x, y, z) {
      obj.position.set(x, y, z);
      return obj;
    }

    // Ground and roads
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 170), mat(COLORS.ground));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    [[0, -31, 140, 3], [0, 26, 140, 3], [-62, 0, 3, 60], [62, 0, 3, 60]].forEach(([x, z, w, d]) => {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(COLORS.road));
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.03, z);
      scene.add(road);
    });

    // Pipe rack along the north side of the process area
    {
      const post = mat(COLORS.dark);
      const beam = mat(COLORS.pipe);
      for (let x = -46; x <= 50; x += 8) {
        scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.4), post), x, 2.5, -12));
        scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.4), post), x, 2.5, -14.5));
        scene.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 3), post), x, 5, -13.25));
      }
      [-12.4, -13.25, -14.1].forEach((z) => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 96, 8), beam);
        p.rotation.z = Math.PI / 2;
        scene.add(at(p, 2, 5.4, z));
      });
    }

    // ---- Units ----
    const units = {};

    function newUnit(id, name) {
      const group = new THREE.Group();
      group.position.set(POS[id][0], POS[id][1], POS[id][2]);
      scene.add(group);
      const u = { id, group, meshes: [], dyn: {}, label: null, ring: null, state: null, name };
      units[id] = u;
      return u;
    }

    // Adds a mesh to a unit; dynamic meshes stay hidden while the unit is a ghost.
    function add(u, geom, material, pos, opts) {
      const m = new THREE.Mesh(geom, material);
      if (pos) m.position.set(pos[0], pos[1], pos[2]);
      if (opts && opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
      m.userData.mat = material;
      m.userData.dynamic = Boolean(opts && opts.dynamic);
      u.group.add(m);
      u.meshes.push(m);
      return m;
    }

    // Unit-height geometry for liquids: scale.y sets the height.
    function liquidCylinder(r) {
      const g = new THREE.CylinderGeometry(r, r, 1, 32);
      g.translate(0, 0.5, 0);
      return g;
    }

    function tank(id, name, r, h, liquidColor) {
      const u = newUnit(id, name);
      add(u, new THREE.CylinderGeometry(r, r, h, 40, 1, true), mat(COLORS.white, { transparent: true, opacity: 0.42, side: THREE.DoubleSide }), [0, h / 2, 0]);
      add(u, new THREE.CylinderGeometry(r * 0.3, r * 1.01, 1.2, 40), mat(COLORS.body), [0, h + 0.6, 0]);
      add(u, new THREE.TorusGeometry(r * 1.01, 0.18, 8, 48), mat(COLORS.band), [0, h * 0.62, 0], { rot: [Math.PI / 2, 0, 0] });
      add(u, new THREE.CylinderGeometry(r + 0.6, r + 0.6, 0.35, 40), mat(COLORS.concrete), [0, 0.18, 0]);
      u.dyn.liquid = add(u, liquidCylinder(r * 0.96), mat(liquidColor, { roughness: 0.3 }), [0, 0.35, 0], { dynamic: true });
      u.dyn.height = h - 0.5;
      return u;
    }

    function pump(id, name) {
      const u = newUnit(id, name);
      add(u, new THREE.BoxGeometry(3.2, 0.4, 1.8), mat(COLORS.concrete), [0, 0.2, 0]);
      u.dyn.motor = add(u, new THREE.CylinderGeometry(0.55, 0.55, 1.5, 20), mat(COLORS.teal), [0.65, 0.95, 0], { rot: [0, 0, Math.PI / 2] });
      add(u, new THREE.SphereGeometry(0.65, 20, 12), mat(COLORS.body), [-0.7, 0.95, 0]);
      return u;
    }

    function horizontalVessel(id, name, r, len, y, color) {
      const u = newUnit(id, name);
      add(u, new THREE.CylinderGeometry(r, r, len, 32, 1, true), mat(color || COLORS.white, { transparent: true, opacity: 0.5, side: THREE.DoubleSide }), [0, y, 0], { rot: [0, 0, Math.PI / 2] });
      add(u, new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(COLORS.body), [len / 2, y, 0], { rot: [0, 0, -Math.PI / 2] });
      add(u, new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(COLORS.body), [-len / 2, y, 0], { rot: [0, 0, Math.PI / 2] });
      [-len / 3, len / 3].forEach((x) => add(u, new THREE.BoxGeometry(0.5, y - r + 0.2, r * 1.6), mat(COLORS.concrete), [x, (y - r) / 2, 0]));
      [-len / 4, len / 4].forEach((x) => add(u, new THREE.TorusGeometry(r * 1.01, 0.1, 6, 32), mat(COLORS.band), [x, y, 0], { rot: [0, Math.PI / 2, 0] }));
      return u;
    }

    // Crude tank and jetty
    tank('TK101', 'TK-101 Crude tank', 5.5, 8, COLORS.crude);
    const jetty = newUnit('JETTY', 'Crude receipt');
    add(jetty, new THREE.BoxGeometry(6, 0.6, 16), mat(COLORS.concrete), [0, 0.3, 0]);
    add(jetty, new THREE.BoxGeometry(4, 2.5, 10), mat(0x7a3d5c), [-6, 1.2, 0]);

    pump('P201', 'P-201 Charge pump');

    const desalter = horizontalVessel('D401', 'D-401 Desalter', 1.9, 11, 2.4);
    {
      const g = new THREE.BoxGeometry(10.5, 1, 2.2);
      g.translate(0, 0.5, 0);
      desalter.dyn.water = add(desalter, g, mat(COLORS.water, { transparent: true, opacity: 0.85 }), [0, 0.6, 0], { dynamic: true });
      desalter.dyn.waterMax = 3.4;
    }

    const exch = horizontalVessel('E301', 'E-301 Preheat', 1.0, 8, 1.6, COLORS.body);
    exch.dyn.shell = exch.meshes[0];

    // Charge heater: brick firebox with glowing windows, stack and flame
    const heater = newUnit('H501', 'H-501 Charge heater');
    add(heater, new THREE.BoxGeometry(7, 7, 7), mat(COLORS.brick, { transparent: true, opacity: 0.75 }), [0, 3.5, 0]);
    add(heater, new THREE.BoxGeometry(5, 2, 5), mat(COLORS.brick), [0, 8, 0]);
    add(heater, new THREE.BoxGeometry(3, 1.5, 3), mat(COLORS.brick), [0, 9.75, 0]);
    add(heater, new THREE.CylinderGeometry(0.7, 0.8, 10, 16), mat(COLORS.body), [0, 15.5, 0]);
    heater.dyn.glow = [];
    for (let i = -1; i <= 1; i += 1) {
      heater.dyn.glow.push(add(heater, new THREE.BoxGeometry(1.2, 1.4, 0.1), new THREE.MeshBasicMaterial({ color: COLORS.flame }), [i * 2, 1.4, 3.56], { dynamic: true }));
    }
    {
      const g = new THREE.ConeGeometry(1.8, 1, 16);
      g.translate(0, 0.5, 0);
      heater.dyn.flame = add(heater, g, new THREE.MeshBasicMaterial({ color: COLORS.flame, transparent: true, opacity: 0.85 }), [0, 0.3, 0], { dynamic: true });
    }

    // Atmospheric tower with platforms and a see-through bottom section
    const tower = newUnit('C601', 'C-601 Atmospheric tower');
    add(tower, new THREE.CylinderGeometry(2, 2, 22, 32), mat(COLORS.body), [0, 17, 0]);
    add(tower, new THREE.CylinderGeometry(2, 2, 6, 32, 1, true), mat(COLORS.white, { transparent: true, opacity: 0.4, side: THREE.DoubleSide }), [0, 3, 0]);
    tower.dyn.cap = add(tower, new THREE.SphereGeometry(2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(COLORS.body), [0, 28, 0]);
    for (let y = 8; y <= 26; y += 4.5) add(tower, new THREE.TorusGeometry(2.6, 0.13, 6, 32), mat(COLORS.band), [0, y, 0], { rot: [Math.PI / 2, 0, 0] });
    tower.dyn.liquid = add(tower, liquidCylinder(1.9), mat(COLORS.residue, { roughness: 0.3 }), [0, 0.05, 0], { dynamic: true });
    tower.dyn.height = 5.8;

    // Reflux drum on a structure, with the air-cooled condenser above
    const drum = horizontalVessel('D701', 'D-701 Reflux drum', 1.3, 7, 7);
    add(drum, new THREE.BoxGeometry(8, 0.5, 5.5), mat(COLORS.dark), [0, 11.5, 0]);
    drum.dyn.fans = [];
    for (let i = -1; i <= 1; i += 1) drum.dyn.fans.push(add(drum, new THREE.BoxGeometry(2, 0.1, 0.3), mat(COLORS.white), [i * 2.6, 11.85, 0]));
    [-3.5, 3.5].forEach((x) => add(drum, new THREE.BoxGeometry(0.4, 11.5, 0.4), mat(COLORS.dark), [x, 5.75, 2.4]));
    {
      const g = new THREE.BoxGeometry(6.4, 1, 1.6);
      g.translate(0, 0.5, 0);
      drum.dyn.liquid = add(drum, g, mat(COLORS.naphtha, { transparent: true, opacity: 0.9 }), [0, 5.9, 0], { dynamic: true });
      drum.dyn.height = 2.2;
    }

    pump('P801', 'P-801 Diesel draw');
    tank('TK802', 'TK-802 Diesel', 4.2, 7, COLORS.diesel);
    tank('TK803', 'TK-803 Residue', 4.2, 7, COLORS.residue);

    // Instrument air compressors
    const comp = newUnit('K1101', 'K-1101 Instrument air');
    add(comp, new THREE.BoxGeometry(6, 3.2, 4), mat(COLORS.white), [0, 1.6, 0]);
    add(comp, new THREE.BoxGeometry(6.2, 0.4, 4.2), mat(COLORS.dark), [0, 3.4, 0]);
    add(comp, new THREE.CylinderGeometry(0.9, 0.9, 4, 20), mat(COLORS.teal), [-1.2, 1, 3.4], { rot: [0, 0, Math.PI / 2] });
    add(comp, new THREE.CylinderGeometry(0.9, 0.9, 4, 20), mat(COLORS.teal), [1.2, 1, -3.4], { rot: [0, 0, Math.PI / 2] });
    comp.dyn.light = add(comp, new THREE.SphereGeometry(0.4, 12, 8), new THREE.MeshBasicMaterial({ color: COLORS.ok }), [0, 4, 0], { dynamic: true });

    // Control room with the safety system cabinets
    const ctrl = newUnit('CTRL', 'Control room & SIS');
    add(ctrl, new THREE.BoxGeometry(12, 4.5, 7), mat(COLORS.white), [0, 2.25, 0]);
    add(ctrl, new THREE.BoxGeometry(3, 1, 3), mat(COLORS.dark), [2, 5, 0]);
    for (let i = -2; i <= 2; i += 1) add(ctrl, new THREE.BoxGeometry(1.4, 1.2, 0.1), new THREE.MeshBasicMaterial({ color: 0xffd76a }), [i * 2.2, 2.8, 3.55]);
    for (let i = -2; i <= 2; i += 1) add(ctrl, new THREE.BoxGeometry(0.8, 1.6, 0.6), mat(COLORS.body), [i * 1.4, 0.8, 5.2]);

    // Flare stack: lit once the tower runs
    const flare = newUnit('FLARE', 'Flare');
    add(flare, new THREE.CylinderGeometry(0.4, 0.7, 30, 12), mat(COLORS.body), [0, 15, 0]);
    add(flare, new THREE.CylinderGeometry(2.5, 2.5, 0.6, 16), mat(COLORS.concrete), [0, 0.3, 0]);
    flare.dyn.flame = add(flare, new THREE.SphereGeometry(1.2, 16, 12), new THREE.MeshBasicMaterial({ color: COLORS.flame, transparent: true, opacity: 0.9 }), [0, 31, 0], { dynamic: true });

    // Unit labels (fixed on-screen size) and highlight rings
    Object.values(units).forEach((u) => {
      const box = new THREE.Box3().setFromObject(u.group);
      u.box = box;
      u.label = makeLabel(u.name);
      u.label.position.set(u.group.position.x, box.max.y + 2.2, u.group.position.z);
      scene.add(u.label);
      const size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
      u.ring = new THREE.Mesh(new THREE.RingGeometry(size / 2 + 1, size / 2 + 1.5, 48), new THREE.MeshBasicMaterial({ color: COLORS.ring, transparent: true, opacity: 0.85 }));
      u.ring.rotation.x = -Math.PI / 2;
      u.ring.position.set(u.group.position.x, 0.45, u.group.position.z);
      u.ring.visible = false;
      scene.add(u.ring);
    });

    function makeLabel(text) {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 96;
      const g = c.getContext('2d');
      g.fillStyle = 'rgba(14,12,40,0.82)';
      roundRect(g, 4, 8, 504, 80, 20);
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = 'bold 40px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, 256, 50);
      const tex = new THREE.CanvasTexture(c);
      // Fixed on-screen size, so labels stay readable when zoomed out.
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: false }));
      s.scale.set(0.15, 0.028, 1);
      return s;
    }

    function roundRect(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    // ---- Area plots: a raised pad per area, its name painted on the front edge, lamps on the corners ----
    const plots = PLOTS.map((p) => {
      const box = new THREE.Box3();
      p.units.forEach((id) => box.union(units[id].box));
      const minX = box.min.x - 3;
      const maxX = box.max.x + 3;
      const minZ = box.min.z - 3;
      const maxZ = box.max.z + 4.5;
      const w = maxX - minX;
      const d = maxZ - minZ;
      const padMat = mat(COLORS.pad);
      const pad = at(new THREE.Mesh(new THREE.BoxGeometry(w, 0.4, d), padMat), (minX + maxX) / 2, 0.2, (minZ + maxZ) / 2);
      scene.add(pad);
      const edgeMat = new THREE.LineBasicMaterial({ color: COLORS.padEdge });
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(pad.geometry), edgeMat);
      edge.position.copy(pad.position);
      scene.add(edge);

      // Painted name on the pad's front strip
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 96;
      const tex = new THREE.CanvasTexture(c);
      const textW = Math.min(w - 1, 26);
      const text = new THREE.Mesh(new THREE.PlaneGeometry(textW, textW * (96 / 1024)), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      text.rotation.x = -Math.PI / 2;
      text.position.set(minX + 0.6 + textW / 2, 0.42, maxZ - 1.3);
      scene.add(text);

      // Corner lamps, lit once the area has any work done
      const lamps = [];
      [[minX + 0.6, minZ + 0.6], [maxX - 0.6, minZ + 0.6], [minX + 0.6, maxZ - 0.6], [maxX - 0.6, maxZ - 0.6]].forEach(([x, z]) => {
        scene.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), mat(COLORS.pipe)), x, 1.8, z));
        const lamp = at(new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: COLORS.lamp })), x, 3.45, z);
        scene.add(lamp);
        lamps.push(lamp);
      });
      return { area: p.area, padMat, edgeMat, canvas: c, tex, lamps, lastText: '' };
    });

    function paintPlot(plot, info) {
      const done = Boolean(info && info.total && info.done === info.total);
      plot.padMat.color.set(done ? COLORS.padDone : COLORS.pad);
      plot.edgeMat.color.set(done ? COLORS.padEdgeDone : COLORS.padEdge);
      plot.lamps.forEach((l) => { l.visible = Boolean(info && info.done > 0); });
      const name = info ? `${plot.area + 1} · ${info.name}` : `${plot.area + 1}`;
      const count = info ? `${info.done}/${info.total}` : '';
      const key = `${name}|${count}|${info && info.unlocked}`;
      if (key === plot.lastText) return;
      plot.lastText = key;
      const g = plot.canvas.getContext('2d');
      g.clearRect(0, 0, plot.canvas.width, plot.canvas.height);
      g.font = 'bold 54px system-ui, sans-serif';
      g.textBaseline = 'middle';
      g.fillStyle = info && info.unlocked ? '#ffffff' : 'rgba(255,255,255,0.45)';
      g.fillText(name, 8, 50);
      g.fillStyle = done ? '#6ee7d8' : 'rgba(110,231,216,0.7)';
      g.fillText(count, Math.min(g.measureText(name).width + 40, 900), 50);
      plot.tex.needsUpdate = true;
    }

    // ---- Pipes with moving product dots ----
    const pipeMaterial = mat(COLORS.pipe);
    const pipes = pipeDefs().map(([owner, flowKey, colorKey, pts]) => {
      const points = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      const group = new THREE.Group();
      const segs = [];
      let length = 0;
      for (let i = 0; i < points.length - 1; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        const len = a.distanceTo(b);
        if (len < 0.01) continue;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 8), pipeMaterial);
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        group.add(m);
        segs.push({ a, b, len, start: length });
        length += len;
      }
      scene.add(group);
      const dotMat = new THREE.MeshBasicMaterial({ color: COLORS[colorKey] });
      const dots = [];
      const n = Math.max(2, Math.round(length / 3));
      for (let i = 0; i < n; i += 1) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), dotMat);
        scene.add(dot);
        dots.push(dot);
      }
      return { owner, flowKey, group, segs, length, dots, offset: Math.random() * length };
    });

    function pointAt(p, s) {
      const seg = p.segs.find((g) => s >= g.start && s <= g.start + g.len) || p.segs[p.segs.length - 1];
      const f = (s - seg.start) / seg.len;
      return seg.a.clone().lerp(seg.b, Math.min(Math.max(f, 0), 1));
    }

    // ---- Camera: pan, rotate, zoom. Nothing moves unless you move it. ----
    const HOME = { theta: -0.78, phi: 0.95, radius: 165, target: new THREE.Vector3(0, 0, -2) };
    const orbit = { theta: HOME.theta, phi: HOME.phi, radius: HOME.radius, target: HOME.target.clone() };
    const goal = { theta: HOME.theta, phi: HOME.phi, radius: HOME.radius, target: HOME.target.clone() };
    let home = { theta: HOME.theta, phi: HOME.phi, radius: HOME.radius, target: HOME.target.clone() };
    const LIMITS = { minR: 18, maxR: 280, minX: -70, maxX: 70, minZ: -40, maxZ: 35 };
    const pointers = new Map();
    let gesture = null; // 'pan' | 'rotate'
    let twoFinger = null; // { dist, angle, mid }

    function clampNum(v, lo, hi) {
      return Math.min(hi, Math.max(lo, v));
    }

    // Moves the look-at point across the ground so the yard follows your finger.
    function pan(dx, dy) {
      const scale = (2 * goal.radius * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(canvas.clientHeight, 1);
      const rightX = Math.cos(goal.theta);
      const rightZ = -Math.sin(goal.theta);
      const fwdX = -Math.sin(goal.theta);
      const fwdZ = -Math.cos(goal.theta);
      const tilt = 1 / Math.max(Math.cos(goal.phi), 0.35); // ground is foreshortened when looking down at an angle
      goal.target.x = clampNum(goal.target.x - dx * scale * rightX + dy * scale * tilt * fwdX, LIMITS.minX, LIMITS.maxX);
      goal.target.z = clampNum(goal.target.z - dx * scale * rightZ + dy * scale * tilt * fwdZ, LIMITS.minZ, LIMITS.maxZ);
    }

    function rotate(dx, dy) {
      goal.theta -= dx * 0.008;
      goal.phi = clampNum(goal.phi - dy * 0.006, 0.3, 1.4);
    }

    function zoom(factor) {
      goal.radius = clampNum(goal.radius * factor, LIMITS.minR, LIMITS.maxR);
    }

    function twoFingerState() {
      const [a, b] = [...pointers.values()];
      return {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    }

    canvas.addEventListener('pointerdown', (e) => {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
      canvas.focus({ preventScroll: true });
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        const rotating = e.pointerType === 'mouse' && (e.button === 2 || e.shiftKey || e.ctrlKey || e.altKey);
        gesture = rotating ? 'rotate' : 'pan';
      } else if (pointers.size === 2) {
        twoFinger = twoFingerState();
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        if (gesture === 'rotate') rotate(dx, dy);
        else pan(dx, dy);
      } else if (pointers.size === 2 && twoFinger) {
        // Pinch to zoom, twist to rotate, slide both fingers to move.
        const now = twoFingerState();
        zoom(twoFinger.dist / now.dist);
        let dAngle = now.angle - twoFinger.angle;
        if (dAngle > Math.PI) dAngle -= Math.PI * 2;
        if (dAngle < -Math.PI) dAngle += Math.PI * 2;
        goal.theta -= dAngle;
        pan(now.mid.x - twoFinger.mid.x, now.mid.y - twoFinger.mid.y);
        twoFinger = now;
      }
    });

    const release = (e) => {
      pointers.delete(e.pointerId);
      twoFinger = pointers.size === 2 ? twoFingerState() : null;
      if (pointers.size === 1) gesture = 'pan';
      if (pointers.size === 0) gesture = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoom(1 + Math.sign(e.deltaY) * 0.12);
    }, { passive: false });

    // Keyboard once the view has focus: arrows / WASD move, Q/E rotate, +/- zoom.
    canvas.tabIndex = 0;
    canvas.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      const step = 40;
      const keys = {
        arrowleft: () => pan(step, 0), a: () => pan(step, 0),
        arrowright: () => pan(-step, 0), d: () => pan(-step, 0),
        arrowup: () => pan(0, step), w: () => pan(0, step),
        arrowdown: () => pan(0, -step), s: () => pan(0, -step),
        q: () => { goal.theta += Math.PI / 8; },
        e: () => { goal.theta -= Math.PI / 8; },
        '+': () => zoom(0.85), '=': () => zoom(0.85), '-': () => zoom(1.18),
      };
      if (keys[k]) {
        keys[k]();
        e.preventDefault();
      }
    });

    // On-screen buttons, mainly for phones.
    const tools = document.createElement('div');
    tools.className = 'v3d-tools';
    [
      ['⟲', 'Rotate left', () => { goal.theta += Math.PI / 4; }],
      ['⟳', 'Rotate right', () => { goal.theta -= Math.PI / 4; }],
      ['+', 'Zoom in', () => zoom(0.75)],
      ['−', 'Zoom out', () => zoom(1.33)],
      ['⌂', 'Reset view', () => resetView()],
    ].forEach(([sym, label, fn]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = sym;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', fn);
      tools.appendChild(b);
    });

    function resetView() {
      goal.theta = home.theta;
      goal.phi = home.phi;
      goal.radius = home.radius;
      goal.target.copy(home.target);
    }

    // ---- Public API ----
    let host = null;
    let lastTime = performance.now();

    function mount(el) {
      host = el;
      if (canvas.parentNode !== el) el.appendChild(canvas);
      if (tools.parentNode !== el) el.appendChild(tools);
      resize();
    }

    function resize() {
      if (!host) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    // built: Set of unit ids that exist (others are wireframe construction sites);
    // active: units of the current job (ringed);
    // focus: units to frame (or null for the whole yard); areas: [{name, done, total, unlocked}].
    function setScene(built, active, focus, areas) {
      Object.values(units).forEach((u) => {
        const isBuilt = u.id === 'JETTY' || built.has(u.id);
        u.state = isBuilt ? 'built' : 'ghost';
        u.meshes.forEach((m) => {
          m.material = isBuilt ? m.userData.mat : ghostMat;
          if (m.userData.dynamic) m.visible = isBuilt;
        });
        u.label.material.opacity = isBuilt ? 1 : 0.4;
        u.ring.visible = active.has(u.id);
      });
      pipes.forEach((p) => {
        p.built = built.has(p.owner);
        p.group.children.forEach((c) => { c.material = p.built ? pipeMaterial : ghostMat; });
      });
      plots.forEach((p) => paintPlot(p, areas && areas[p.area]));

      // Frame the job, or the whole yard. That framing is what "reset view" returns to.
      home = { theta: HOME.theta, phi: HOME.phi, radius: HOME.radius, target: HOME.target.clone() };
      const ids = focus && focus.size ? [...focus] : null;
      if (ids) {
        const box = new THREE.Box3();
        ids.forEach((id) => box.union(units[id].box));
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        home.target.set(c.x, 0, c.z);
        home.radius = clampNum(Math.max(size.x, size.z) * 2.2 + 45, 50, 170);
      }
      resetView();
    }

    // state: { x: process values, flows, sis: {tag: {tripped}} }
    function update(state) {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      const X = state.x;

      setLevel(units.TK101, X['TK101.L'] / 6);
      setLevel(units.TK802, X['TK802.L'] / 10);
      setLevel(units.TK803, X['TK803.L'] / 10);
      setLevel(units.C601, X['C601.L'] / 4);
      setLevel(units.D701, X['D701.L'] / 3);
      units.D401.dyn.water.scale.y = Math.max(0.01, (X['D401.I'] / 100) * units.D401.dyn.waterMax);

      const hot = Math.min(Math.max((X['E301.T'] - 30) / 170, 0), 1);
      units.E301.dyn.shell.userData.mat.color.setRGB(0.75 + 0.25 * hot, 0.72 - 0.3 * hot, 0.9 - 0.6 * hot);

      const trip = state.sis && state.sis['TSHH-501'] && state.sis['TSHH-501'].tripped;
      const fuel = trip ? 0 : state.flows.fuel;
      const flick = 0.85 + 0.15 * Math.sin(now / 70) * Math.sin(now / 113);
      units.H501.dyn.flame.scale.set(0.4 + 0.6 * Math.min(fuel, 1.5), Math.max(0.01, 4.5 * fuel * flick), 0.4 + 0.6 * Math.min(fuel, 1.5));
      units.H501.dyn.glow.forEach((g) => {
        g.userData.mat.color.setRGB(1, 0.35 + 0.25 * Math.min(fuel, 1) * flick, 0.1);
        g.visible = units.H501.state === 'built' && fuel > 0.05;
      });

      const p = X['C601.P'];
      units.C601.dyn.cap.userData.mat.color.set(p > 2.2 ? COLORS.bad : p < 0.8 ? 0x6fa8dc : COLORS.body);
      units.K1101.dyn.light.userData.mat.color.set(X['PT1101.P'] >= 4.5 ? COLORS.ok : COLORS.bad);
      units.FLARE.dyn.flame.visible = units.FLARE.state === 'built' && units.C601.state === 'built';
      units.FLARE.dyn.flame.scale.setScalar(0.6 + 0.4 * flick + (p > 2.2 ? 1.5 : 0));
      units.P201.dyn.motor.rotation.x += dt * 10 * state.flows.charge;
      drum.dyn.fans.forEach((f) => { f.rotation.y += dt * 6; });

      pipes.forEach((pp) => {
        const flow = pp.built ? state.flows[pp.flowKey] || 0 : 0;
        const show = flow > 0.01;
        pp.offset = (pp.offset + dt * (2 + flow * 6)) % pp.length;
        const spacing = pp.length / pp.dots.length;
        pp.dots.forEach((d, i) => {
          d.visible = show;
          if (show) d.position.copy(pointAt(pp, (pp.offset + i * spacing) % pp.length));
        });
      });

      Object.values(units).forEach((u) => {
        if (!u.grow) return;
        const k = Math.min((now - u.grow) / 1600, 1);
        const ease = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
        u.group.scale.y = Math.max(0.02, ease);
        u.ring.visible = true;
        u.ring.material.opacity = 0.85 * (0.5 + 0.5 * Math.sin(now / 120));
        if (k >= 1) { u.grow = null; u.group.scale.y = 1; u.ring.material.opacity = 0.85; }
      });

      // Ease the camera towards where you moved it; it stops when it gets there.
      orbit.theta += (goal.theta - orbit.theta) * 0.2;
      orbit.phi += (goal.phi - orbit.phi) * 0.2;
      orbit.radius += (goal.radius - orbit.radius) * 0.15;
      orbit.target.lerp(goal.target, 0.2);
      camera.position.set(
        orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
        orbit.target.y + orbit.radius * Math.cos(orbit.phi),
        orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta),
      );
      camera.lookAt(orbit.target);
      if (host && (host.clientWidth !== canvas.clientWidth || host.clientHeight !== canvas.clientHeight)) resize();
      renderer.render(scene, camera);
    }

    // Units just built rise out of the ground.
    function celebrate(ids) {
      const now = performance.now();
      ids.forEach((id) => { if (units[id]) units[id].grow = now; });
    }

    function setLevel(u, frac) {
      u.dyn.liquid.scale.y = Math.max(0.01, Math.min(frac, 1) * u.dyn.height);
    }

    return { mount, resize, setScene, update, celebrate };
  }

  window.Plant3D = { create };
})();
