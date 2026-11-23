import * as THREE from "three";

const CANOPY = [
  // Position and radius of each bough, from the inner edge to the outer tip.
  [-0.52, 1.27, 0.06, 0.39],
  [-0.28, 1.54, -0.16, 0.43],
  [0.10, 1.74, -0.05, 0.46],
  [0.49, 1.68, -0.14, 0.43],
  [0.82, 1.52, -0.08, 0.42],
  [1.01, 1.27, 0.04, 0.37],
  [0.57, 1.34, 0.36, 0.39],
  [0.10, 1.39, 0.32, 0.40],
];

const BRANCHES = [
  [0.124, 0.029, [[0, 0, 0], [0.16, 0.16, 0.07], [0.28, 0.43, 0.08], [0.30, 0.80, 0.06], [0.25, 1.18, 0], [0.15, 1.62, 0]]],
  [0.070, 0.012, [[0.27, 0.51, 0.08], [0.03, 0.73, 0.11], [-0.28, 0.94, 0.12], [-0.52, 1.32, 0.09]]],
  [0.033, 0.009, [[-0.24, 0.91, 0.12], [-0.20, 1.18, -0.01], [-0.29, 1.57, -0.16]]],
  [0.075, 0.015, [[0.30, 0.70, 0.06], [0.53, 0.85, 0.01], [0.81, 1.06, 0.02], [1.00, 1.35, 0.03]]],
  [0.058, 0.012, [[0.49, 0.84, 0.02], [0.60, 1.17, -0.10], [0.77, 1.54, -0.10]]],
  [0.040, 0.010, [[0.29, 0.92, 0.04], [0.35, 1.16, 0.19], [0.56, 1.40, 0.36]]],
  [0.035, 0.010, [[0.04, 0.73, 0.09], [0.04, 1.03, 0.19], [0.13, 1.41, 0.30]]],
  [0.071, 0.008, [[0.12, 0.13, 0.06], [-0.05, 0.05, 0.15], [-0.25, -0.05, 0.19], [-0.47, -0.16, 0.16]]],
];

const SPRIGS = [
  [0.52, 0.62, 0.16, 0.0], [0.82, 0.69, 0.15, -0.6], [1.16, 0.43, 0.19, -0.7],
  [0.43, 0.29, 0.13, 0.8], [0.51, -0.45, 0.17, 0.55], [0.60, -1.18, 0.17, 0.9],
  [1.03, -1.39, 0.22, 0.3], [1.37, -1.23, 0.21, -0.6], [1.68, -1.07, 0.24, -1.0],
  [1.71, -0.63, 0.19, -0.35], [1.50, -0.38, 0.34, -0.8], [1.29, -0.26, 0.27, 0.36],
  [1.55, -0.07, 0.19, -0.7], [1.37, -0.73, 0.16, -0.2], [0.83, -0.97, 0.13, 0.9],
  [0.38, -0.93, 0.17, 0.3], [1.13, 0.10, 0.15, 0.65], [1.76, -1.44, 0.18, -0.55],
];

const FLOWERS = {
  left: [[0.78, -1.02, 0.20], [0.56, -1.27, 0.12], [0.73, 0.60, 0.101], [1.66, -1.37, 0.09]],
  right: [[1.65, -0.83, 0.17], [1.79, -1.03, 0.115], [0.77, 0.47, 0.115], [0.48, -1.15, 0.10]],
};

function leafGeometry(curve, thickness) {
  const rings = 8;
  const sides = 8;
  const positions = [];
  const indices = [];
  const colors = [];
  for (let row = 0; row <= rings; row++) {
    const y = row / rings;
    const fullness = Math.max(0.015, Math.sin(Math.PI * y) ** 0.81);
    const bend = curve * Math.sin(y * Math.PI * 0.64);
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2;
      const facing = Math.cos(angle);
      positions.push(
        Math.sin(angle) * fullness * (0.34 + 0.09 * (1 - y)),
        y,
        bend + facing * fullness * thickness,
      );
      const tint = 0.83 + 0.10 * y + (side === 0 ? 0.12 : 0);
      colors.push(tint, tint, tint * 0.94);
      if (row < rings) {
        const a = row * sides + side;
        const b = row * sides + (side + 1) % sides;
        indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function seededRandom(seed) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function createCanopy(geometry, coreGeometry, material, coreMaterial, random) {
  const leavesPerBough = 62;
  const crown = new THREE.Group();
  crown.position.set(0.23, 1.46, 0.05);
  const blades = new THREE.InstancedMesh(geometry, material, CANOPY.length * leavesPerBough);
  const cores = new THREE.InstancedMesh(coreGeometry, coreMaterial, CANOPY.length);
  crown.add(cores, blades);
  const leaf = new THREE.Object3D();
  const shade = new THREE.Color(0x429f16);
  const spring = new THREE.Color(0x85ce20);
  const sunlit = new THREE.Color(0xdffa55);
  const tint = new THREE.Color();
  const normal = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const lateral = new THREE.Vector3();
  const axes = new THREE.Matrix4();

  for (const [cluster, [x, y, z, radius]] of CANOPY.entries()) {
    leaf.position.set(x, y, z).sub(crown.position);
    leaf.rotation.set(0, 0, 0);
    leaf.scale.set(radius * 0.82, radius * 0.64, radius * 0.78);
    leaf.updateMatrix();
    cores.setMatrixAt(cluster, leaf.matrix);
    cores.setColorAt(cluster, tint.lerpColors(shade, spring, (y - 1.23) * 0.81));

    for (let i = 0; i < leavesPerBough; i++) {
      const elevation = 2 * (i + 0.5) / leavesPerBough - 1;
      const azimuth = i * 2.39996 + cluster + random() * 0.25;
      const spread = Math.sqrt(1 - elevation * elevation);
      const dx = Math.cos(azimuth) * spread;
      const dz = Math.sin(azimuth) * spread;
      const height = y + elevation * radius * 0.69;
      normal.set(dx, elevation * 1.26, dz).normalize();
      direction.set(0, -1, 0).addScaledVector(normal, normal.y).normalize();
      direction.applyAxisAngle(normal, (random() - 0.5) * 2.9);
      lateral.crossVectors(direction, normal);
      leaf.quaternion.setFromRotationMatrix(axes.makeBasis(lateral, direction, normal));
      leaf.rotateX(0.02 + random() * 0.47);
      const size = 0.16 + random() * 0.125;
      leaf.scale.set(size * (0.86 + random() * 0.32), size, size);
      leaf.position.set(x + dx * radius * 0.90, height, z + dz * radius * 0.89)
        .sub(crown.position)
        .addScaledVector(direction, -size * 0.42);
      leaf.updateMatrix();

      const index = cluster * leavesPerBough + i;
      blades.setMatrixAt(index, leaf.matrix);
      const daylight = THREE.MathUtils.clamp((height - 1.13) * 0.94 + random() * 0.25, 0, 1);
      tint.lerpColors(shade, spring, THREE.MathUtils.smoothstep(daylight, 0, 0.57));
      tint.lerp(sunlit, THREE.MathUtils.smoothstep(daylight, 0.31, 0.96));
      blades.setColorAt(index, tint);
    }
  }
  return crown;
}

function plantBatch(geometry, material, plants) {
  const mesh = new THREE.InstancedMesh(geometry, material, plants.length);
  const matrix = new THREE.Matrix4();
  const size = new THREE.Vector3();
  let lastGrowth;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  plants.forEach(({ color }, i) => mesh.setColorAt(i, color));
  return {
    mesh,
    update(growth) {
      if (growth === lastGrowth) return;
      lastGrowth = growth;
      mesh.visible = growth > 0.001;
      if (!mesh.visible) return;
      plants.forEach(({ position, rotation, scale }, i) => {
        matrix.compose(position, rotation, size.copy(scale).multiplyScalar(growth));
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

function createSprigs(geometry, material, surfaceAt, random) {
  const plants = [];
  const colors = [0x63c227, 0xb9ea44, 0x88d82d, 0x4db72d, 0xc2ed47].map((hex) => new THREE.Color(hex));
  const youngLeaves = [0x64b426, 0x92d635, 0xadcf42, 0x7dc234].map((hex) => new THREE.Color(hex));
  const forward = new THREE.Vector3(0, 0, 1);
  for (const [x, y, size, heading] of SPRIGS) {
    const px = x + (random() - 0.5) * 0.085;
    const py = y + (random() - 0.5) * 0.095;
    const surface = surfaceAt(px, py);
    if (!surface) continue;
    const normal = surface.normal.clone().lerp(forward, 0.64).normalize();
    const align = new THREE.Quaternion().setFromUnitVectors(forward, normal);
    for (let i = 0; i < 5; i++) {
      const angle = heading + (i - 2) * 0.71 + (random() - 0.5) * 0.24;
      const length = size * (1.26 - Math.abs(i - 2) * 0.16 + random() * 0.20);
      plants.push({
        position: surface.point.clone().addScaledVector(normal, 0.030 + i * 0.009),
        rotation: align.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.11 + random() * 0.25, 0, angle, "ZXY"))),
        scale: new THREE.Vector3(length * 0.96, length, length),
        color: colors[i],
      });
    }
    // Smaller blades form a continuous layer around the larger, raised sprigs.
    for (let i = 0; i < 10; i++) {
      const angle = i * 2.39996 + heading;
      const spread = Math.sqrt(i / 10) * (size * 0.80 + 0.065);
      const planted = surfaceAt(px + Math.cos(angle) * spread, py + Math.sin(angle) * spread);
      if (!planted) continue;
      const direction = new THREE.Quaternion().setFromUnitVectors(forward, planted.normal.clone().lerp(forward, 0.22).normalize());
      direction.multiply(new THREE.Quaternion().setFromAxisAngle(forward, angle + random() * 0.74));
      const length = 0.058 + random() * 0.102 + size * 0.05;
      plants.push({
        position: planted.point.clone().addScaledVector(planted.normal, 0.018),
        rotation: direction,
        scale: new THREE.Vector3(length * 1.08, length, length),
        color: youngLeaves[i % youngLeaves.length],
      });
    }
  }
  return plantBatch(geometry, material, plants);
}

function createDaisies(geometry, material, surfaceAt, layout) {
  const petals = [];
  const ivory = new THREE.Color(0xfffdec);
  const pollen = new THREE.Color(0xffcc31);
  const face = new THREE.Vector3(0, 0, 1);
  for (const [x, y, size] of layout) {
    const surface = surfaceAt(x, y);
    if (!surface) continue;
    const normal = surface.normal.clone().lerp(face, 0.5).normalize();
    const petal = new THREE.Quaternion().setFromUnitVectors(face, normal);
    for (let i = 0; i < 5; i++) {
      const angle = i * 2 * Math.PI / 5;
      const radial = new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0).applyQuaternion(petal);
      petals.push({
        position: surface.point.clone().addScaledVector(normal, 0.052).addScaledVector(radial, size * 0.34),
        rotation: petal.clone().multiply(new THREE.Quaternion().setFromAxisAngle(face, angle)),
        scale: new THREE.Vector3(size * 0.235, size * 0.35, size * 0.095),
        color: ivory,
      });
    }
    petals.push({
      position: surface.point.clone().addScaledVector(normal, 0.072),
      rotation: petal,
      scale: new THREE.Vector3(size * 0.22, size * 0.22, size * 0.14),
      color: pollen,
    });
  }
  return plantBatch(geometry, material, petals);
}

export function createLungFoliage(surfaceAt, taperedTube) {
  const foliage = new THREE.Group();
  const canopyGeometry = leafGeometry(0.21, 0.085);
  const sprigGeometry = leafGeometry(0.11, 0.057);
  const coreGeometry = new THREE.SphereGeometry(1, 15, 11);
  const petalGeometry = new THREE.SphereGeometry(1, 12, 8);
  const leaves = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.43,
    emissive: 0x52671b,
    emissiveIntensity: 0.10,
  });
  const sprigLeaves = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.53,
    emissive: 0x5c8722,
    emissiveIntensity: 0.16,
  });
  const cores = new THREE.MeshStandardMaterial({ roughness: 0.75 });
  const petals = new THREE.MeshStandardMaterial({ roughness: 0.53, emissive: 0xffecc2, emissiveIntensity: 0.09 });
  const bark = new THREE.MeshStandardMaterial({ color: 0xac6926, roughness: 0.56, emissive: 0x9e6024, emissiveIntensity: 0.15 });
  const trees = [-1, 1].map((side) => {
    const random = seededRandom(side === 1 ? 29 : 145);
    const lobe = new THREE.Group();
    lobe.scale.x = side;
    foliage.add(lobe);
    const x = side === 1 ? 1.41 : 1.47;
    const y = side === 1 ? -0.30 : -0.22;
    const tree = new THREE.Group();
    tree.position.set(x, y, surfaceAt(x, y).point.z - 0.105);
    tree.rotation.y = side === 1 ? 0.10 : 0.17;
    for (const [start, end, points] of BRANCHES) {
      tree.add(taperedTube(points, start, end, bark));
    }
    const canopy = createCanopy(canopyGeometry, coreGeometry, leaves, cores, random);
    tree.add(canopy);
    const sprigs = createSprigs(sprigGeometry, sprigLeaves, surfaceAt, random);
    const daisies = createDaisies(petalGeometry, petals, surfaceAt, side === 1 ? FLOWERS.right : FLOWERS.left);
    lobe.add(tree, sprigs.mesh, daisies.mesh);
    return { tree, canopy, sprigs, daisies, start: side === 1 ? 0.61 : 0.56 };
  });

  let lastHealth;
  return {
    foliage,
    update(health, visible) {
      foliage.visible = visible;
      if (!visible || health === lastHealth) return;
      lastHealth = health;
      const newLeaves = THREE.MathUtils.smoothstep(health, 0.46, 0.93);
      const blooms = THREE.MathUtils.smoothstep(health, 0.66, 0.98);
      for (const { tree, canopy, sprigs, daisies, start } of trees) {
        sprigs.update(newLeaves);
        daisies.update(blooms);
        const growth = THREE.MathUtils.smoothstep(health, start, 0.98);
        const crownGrowth = THREE.MathUtils.smoothstep(growth, 0.18, 0.88);
        tree.visible = growth > 0.001;
        canopy.visible = crownGrowth > 0.001;
        canopy.scale.setScalar(crownGrowth);
        tree.scale.setScalar(growth);
      }
    },
  };
}
