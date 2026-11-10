// The hilt: a machined "energy épée" with knuckle bow, crystal cage, heat-sink fins and emitter cup,
// held in an armoured gauntlet. Local space: blade axis = +Y, emitter mouth at y = 0, +Z faces the player.
import * as THREE from 'three';

function canvasTex(size, draw, { repeat = [1, 1], srgb = false } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

function knurlNormal() {
  return canvasTex(128, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const h = (x, y) => {
      const u = ((x + y) / s * 8) % 1, v = ((x - y + s * 8) / s * 8) % 1;
      return Math.min(1, Math.min(Math.min(u, 1 - u), Math.min(v, 1 - v)) * 4.2);
    };
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * 2.2, dy = (h(x, y + 1) - h(x, y - 1)) * 2.2;
      const l = Math.hypot(dx, dy, 1), i = (y * s + x) * 4;
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: [5, 7] });
}

function brushedRough() {
  // lathe-turned: fine rings around the circumference -> rows of varying roughness
  return canvasTex(256, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      const row = 0.55 + Math.random() * 0.4;
      for (let x = 0; x < s; x++) {
        const v = Math.min(1, row + (Math.random() - 0.5) * 0.12), i = (y * s + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: [1, 3] });
}

const lathe = (pts, mat, seg = 48) => {
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
  return m;
};
// position on the surface at angle phi (0 = +Z, toward player)
const radial = (r, y, phi) => new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r);

export function buildHilt() {
  const g = new THREE.Group();
  const rough = brushedRough();
  const M = {
    steel: new THREE.MeshStandardMaterial({ color: 0xc4c9d2, metalness: 1, roughness: 0.42, roughnessMap: rough, envMapIntensity: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1e24, metalness: 0.95, roughness: 0.5, roughnessMap: rough, envMapIntensity: 0.7 }),
    grip: new THREE.MeshStandardMaterial({ color: 0x0a0b0d, metalness: 0.15, roughness: 0.72, normalMap: knurlNormal(), normalScale: new THREE.Vector2(1.1, 1.1), envMapIntensity: 0.5 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd09a55, metalness: 1, roughness: 0.34, roughnessMap: rough, envMapIntensity: 0.9 }),
    crystal: new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.16, envMapIntensity: 1.5, depthWrite: false }),
    throat: new THREE.MeshStandardMaterial({ color: 0x08090b, metalness: 0.8, roughness: 0.6, emissive: 0x000000, side: THREE.DoubleSide, envMapIntensity: 0.3 }),
    stud: new THREE.MeshStandardMaterial({ color: 0x220806, metalness: 0.3, roughness: 0.4, emissive: 0x000000 }),
    pip: new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }),
    glove: new THREE.MeshStandardMaterial({ color: 0x15171c, metalness: 0.55, roughness: 0.5, envMapIntensity: 0.45 }),
    gloveSoft: new THREE.MeshStandardMaterial({ color: 0x08090b, metalness: 0.05, roughness: 0.9, envMapIntensity: 0.2 }),
    seam: new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }),
  };

  // --- pommel
  g.add(lathe([[0, -0.304], [0.012, -0.304], [0.0205, -0.298], [0.0228, -0.290], [0.0228, -0.283], [0.0196, -0.277], [0.0196, -0.270], [0.0176, -0.268]], M.dark));
  g.add(lathe([[0.0231, -0.2885], [0.0240, -0.2865], [0.0231, -0.2845]], M.brass));
  // --- grip (knurled) with two steel bands
  g.add(lathe([[0.0176, -0.268], [0.0182, -0.266], [0.0182, -0.152], [0.0176, -0.150]], M.grip));
  for (const y of [-0.262, -0.156]) g.add(lathe([[0.0183, y - 0.003], [0.0192, y - 0.002], [0.0192, y + 0.002], [0.0183, y + 0.003]], M.steel));
  // --- mid collar (stud + integrity pips live here)
  g.add(lathe([[0.0176, -0.150], [0.0200, -0.148], [0.0210, -0.145], [0.0210, -0.123], [0.0200, -0.120], [0.0160, -0.118]], M.steel));
  g.add(lathe([[0.0211, -0.1405], [0.0216, -0.1395], [0.0211, -0.1385]], M.dark));
  g.add(lathe([[0.0211, -0.1295], [0.0216, -0.1285], [0.0211, -0.1275]], M.dark));
  // activation stud
  const studPhi = -0.62;
  const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0046, 0.005, 20), M.stud);
  stud.position.copy(radial(0.0222, -0.134, studPhi));
  stud.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radial(1, 0, studPhi));
  g.add(stud);
  const studRing = new THREE.Mesh(new THREE.TorusGeometry(0.0056, 0.0009, 8, 24), M.brass);
  studRing.position.copy(radial(0.0211, -0.134, studPhi));
  studRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), radial(1, 0, studPhi));
  g.add(studRing);
  // integrity pips
  const pips = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.0019, 10, 8), M.pip.clone());
    p.position.copy(radial(0.0212, -0.1265 - i * 0.0075, 0.32));
    g.add(p); pips.push(p);
  }
  // --- crystal cage
  const crystal = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.034, 6), M.crystal);
  crystal.position.y = -0.100; g.add(crystal);
  for (const y of [-0.116, -0.084]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.004, 24), M.brass); cap.position.y = y; g.add(cap); }
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0132, 0.0132, 0.034, 32, 1, true), M.glass);
  tube.position.y = -0.100; tube.renderOrder = 2; g.add(tube);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.0042, 0.040, 0.0052), M.steel);
    const phi = Math.PI / 4 + i * Math.PI / 2;
    s.position.copy(radial(0.0172, -0.100, phi)); s.rotation.y = phi;
    g.add(s);
  }
  // --- upper collar (brass)
  g.add(lathe([[0.0150, -0.083], [0.0196, -0.082], [0.0204, -0.079], [0.0204, -0.073], [0.0196, -0.071], [0.0140, -0.070]], M.brass));
  // --- heat-sink fins
  g.add(lathe([[0.0140, -0.071], [0.0140, -0.033]], M.dark, 24));
  const fins = [];
  for (let i = 0; i < 5; i++) {
    const y = -0.066 + i * 0.0068;
    const f = lathe([[0.0140, y - 0.0016], [0.0218, y - 0.0016], [0.0222, y], [0.0218, y + 0.0016], [0.0140, y + 0.0016]], M.dark.clone());
    g.add(f); fins.push(f);
  }
  // --- emitter shroud + inner cup
  g.add(lathe([[0.0150, -0.034], [0.0205, -0.030], [0.0232, -0.014], [0.0246, -0.002], [0.0240, 0.0008], [0.0222, 0.0012], [0.0205, -0.002]], M.steel));
  const throat = lathe([[0.0205, -0.002], [0.0185, -0.010], [0.0150, -0.020], [0.0060, -0.024], [0.0, -0.024]], M.throat, 32);
  g.add(throat);
  // three emitter claws
  for (let i = 0; i < 3; i++) {
    const phi = i * (Math.PI * 2 / 3) + 0.5;
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.0052, 0.026, 0.0034), M.dark);
    c.position.copy(radial(0.0247, -0.008, phi)); c.rotation.y = phi; c.rotateX(-0.12);
    g.add(c);
  }
  // --- knuckle bow (the épée signature)
  const kd = new THREE.Vector3(0.42, 0, -0.91).normalize();
  const P = (out, y) => kd.clone().multiplyScalar(out).setY(y);
  const curve = new THREE.CatmullRomCurve3([P(0.018, -0.079), P(0.040, -0.092), P(0.060, -0.135), P(0.064, -0.200), P(0.052, -0.262), P(0.030, -0.288), P(0.018, -0.290)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.0030, 10), M.steel));
  const bowPlate = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([P(0.0625, -0.150), P(0.0655, -0.185), P(0.0625, -0.225)]), 12, 0.0052, 10), M.dark);
  g.add(bowPlate);

  // --- gauntlet: a closed fist around the grip. Fingers wrap the far side, thumb locks over them, heel of the palm faces the player.
  const hand = new THREE.Group();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const kAng = Math.atan2(kd.z, kd.x);
  const tor = new THREE.TorusGeometry(0.0268, 0.0086, 12, 26, 4.25); tor.rotateX(Math.PI / 2);
  const plateG = new THREE.TorusGeometry(0.0268, 0.0098, 8, 8, 0.52); plateG.rotateX(Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const y = -0.170 - i * 0.0200, sc = 1 - i * 0.03;
    const f = new THREE.Mesh(tor, M.gloveSoft); f.position.y = y; f.rotation.y = 2.125 - kAng; f.scale.setScalar(sc); hand.add(f);
    // three armour segments per finger (proximal, middle, tip) so the wrap reads as jointed, not as a hoop
    for (const off of [-0.95, -0.28, 0.42]) {
      const p = new THREE.Mesh(plateG, M.glove); p.position.y = y; p.rotation.y = -kAng - off + 0.26; p.scale.set(sc, 0.82, sc); hand.add(p);
    }
  }
  const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.040, 0.084, 20, 1, true, 0, 1.25), M.dark);
  knuckle.position.y = -0.200; knuckle.rotation.y = Math.PI / 2 - kAng - 0.625; knuckle.material = M.dark; hand.add(knuckle);
  const palmG = new THREE.CapsuleGeometry(0.019, 0.050, 8, 16);
  const palm = new THREE.Mesh(palmG, M.gloveSoft); palm.scale.set(1.45, 1, 0.95); palm.position.set(0.002, -0.2015, 0.021); hand.add(palm);
  const backPlate = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.044, 6, 12), M.glove);
  backPlate.scale.set(0.7, 1, 1.5); backPlate.position.set(0.034, -0.200, 0.006); hand.add(backPlate);
  const th1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.026, 6, 12), M.gloveSoft);
  th1.position.set(-0.020, -0.174, 0.030); th1.rotation.set(0.5, 0, 0.75); hand.add(th1);
  const th2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0098, 0.024, 6, 12), M.glove);
  th2.position.set(-0.031, -0.158, 0.012); th2.rotation.set(1.25, 0, 0.35); hand.add(th2);
  const fdir = new THREE.Vector3(0.20, -0.42, 0.88).normalize();
  const palmC = new THREE.Vector3(0.006, -0.214, 0.026);
  const wristJ = new THREE.Mesh(new THREE.SphereGeometry(0.0285, 18, 12), M.gloveSoft);
  wristJ.scale.set(1.15, 1, 0.9); wristJ.position.copy(palmC).addScaledVector(fdir, 0.026); hand.add(wristJ);
  g.add(hand);
  // forearm vambrace (attached to the camera by the sword; +Y runs wrist -> elbow). Overlapping plates, lit seams.
  const arm = new THREE.Group();
  const seg = (r0, r1, y0, y1, mat) => { const geo = new THREE.CylinderGeometry(r1, r0, y1 - y0, 28); geo.translate(0, (y0 + y1) / 2, 0); const m = new THREE.Mesh(geo, mat); m.scale.set(1.12, 1, 0.84); arm.add(m); return m; };
  const seamAt = (r, y) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0016, 8, 44), M.seam); m.rotation.x = Math.PI / 2; m.position.y = y; m.scale.set(1.12, 0.84, 1); arm.add(m); };
  seg(0.027, 0.030, 0.0, 0.05, M.gloveSoft);
  seg(0.034, 0.041, 0.035, 0.125, M.glove); seamAt(0.0415, 0.128);
  seg(0.039, 0.047, 0.118, 0.235, M.glove); seamAt(0.0475, 0.238);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.19, 0.012), M.dark); ridge.position.set(0, 0.14, 0.036); arm.add(ridge);
  const foreG = new THREE.CylinderGeometry(0.064, 0.045, 1, 28); foreG.translate(0, 0.5, 0);
  const fore = new THREE.Mesh(foreG, M.glove); fore.position.y = 0.228; fore.scale.set(1.12, 1, 0.84); arm.add(fore);
  const wrist = palmC.clone().addScaledVector(fdir, 0.03);

  return { group: g, M, stud, studPhi, pips, fins, throat, crystal, hand, arm, fore, wrist };
}
