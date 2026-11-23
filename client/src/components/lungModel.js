import * as THREE from "three";
import { createLungFoliage } from "./lungFoliage.js";

const TORSO_PROFILE = [
  [-2.87, 0.02, 0.03], [-2.78, 3.12, 0.53], [-2.54, 3.18, 0.76],
  [-2.13, 3.24, 0.88], [-1.51, 3.08, 0.94], [-0.89, 2.94, 0.96],
  [-0.38, 2.88, 0.96], [0.34, 2.78, 0.85], [0.84, 2.50, 0.70],
  [1.13, 2.05, 0.63], [1.34, 1.40, 0.56], [1.58, 0.88, 0.47],
  [1.79, 0.77, 0.45], [2.07, 0.76, 0.46], [2.22, 0.72, 0.43],
  [2.29, 0.57, 0.34], [2.33, 0.02, 0.03],
];

const HEAD_PROFILE = [
  [1.89, 0.03, 0.12], [1.94, 0.32, 0.34], [2.10, 0.61, 0.60],
  [2.27, 0.86, 0.76], [2.50, 1.03, 0.87], [2.83, 1.12, 0.91],
  [3.12, 1.16, 0.92], [3.47, 1.10, 0.86], [3.79, 0.91, 0.72],
  [4.04, 0.63, 0.56], [4.19, 0.36, 0.33], [4.25, 0.02, 0.02],
];

const SCULPTURE_VERTEX = /* glsl */ `
  varying vec3 surfaceNormal;
  varying vec3 viewPosition;
  varying vec3 modelPosition;

  void main() {
    modelPosition = position;
    surfaceNormal = normalize(normalMatrix * normal);
    vec4 point = modelViewMatrix * vec4(position, 1.0);
    viewPosition = -point.xyz;
    gl_Position = projectionMatrix * point;
  }
`;

const MANNEQUIN_FRAGMENT = /* glsl */ `
  uniform bool isHead;
  uniform float visibility;
  varying vec3 surfaceNormal;
  varying vec3 viewPosition;
  varying vec3 modelPosition;

  void main() {
    vec3 normal = normalize(surfaceNormal);
    vec3 eye = normalize(viewPosition);
    float facing = max(0.0, dot(normal, eye));
    float rim = pow(1.0 - facing, 1.74);
    float softLight = max(0.0, dot(normal, normalize(vec3(-0.38, 0.72, 0.77))));
    float y = modelPosition.y;

    vec3 blue = mix(vec3(0.061, 0.265, 0.675), vec3(0.118, 0.588, 0.836), smoothstep(-1.64, 2.15, y));
    float shoulder = smoothstep(1.3, 2.95, abs(modelPosition.x));
    blue = mix(blue, vec3(0.162, 0.718, 0.890), shoulder * 0.74);
    blue = mix(blue, vec3(0.22, 0.72, 0.91), softLight * 0.19);
    float chest = exp(-pow(modelPosition.x / 1.58, 2.0)) * smoothstep(-2.45, -1.46, y) * (1.0 - smoothstep(0.10, 0.95, y));
    blue = mix(blue, vec3(0.133, 0.145, 0.621), chest * 0.82);
    float fade = smoothstep(-2.73, -1.94, y) * (1.0 - smoothstep(1.90, 2.14, y));
    float alpha = 0.72 + rim * 0.26;

    if (isHead) {
      float front = smoothstep(0.48, 0.88, modelPosition.z);
      float mouth = exp(-pow(modelPosition.x / 0.25, 2.0) - pow((y - 2.66) / 0.053, 2.0));
      float nose = exp(-pow(modelPosition.x / 0.18, 2.0) - pow((y - 2.85) / 0.085, 2.0));
      blue = mix(blue, vec3(0.03, 0.27, 0.66), front * (mouth * 0.21 + nose * 0.12));
      fade = 1.0 - smoothstep(3.08, 3.82, y);
      alpha = 0.54 + rim * 0.45;
    }
    blue = mix(blue, vec3(0.81, 0.985, 1.0), rim * 0.96);

    gl_FragColor = vec4(blue, alpha * fade * visibility);
    #include <colorspace_fragment>
  }
`;

const LUNG_FRAGMENT = /* glsl */ `
  uniform float health;
  varying vec3 surfaceNormal;
  varying vec3 viewPosition;
  varying vec3 modelPosition;

  void main() {
    vec3 normal = normalize(surfaceNormal);
    vec3 eye = normalize(viewPosition);
    float facing = max(0.0, dot(normal, eye));
    float rim = pow(1.0 - facing, 1.42);
    vec3 light = normalize(vec3(-0.34, 0.66, 0.84));
    float diffuse = clamp(dot(normal, light) * 0.45 + 0.55, 0.0, 1.0);
    float specular = pow(max(0.0, dot(normal, normalize(light + eye))), 19.0);
    float lower = 1.0 - smoothstep(-1.76, -0.88, modelPosition.y);
    float upper = smoothstep(0.12, 1.18, modelPosition.y);
    float side = smoothstep(1.13, 2.12, abs(modelPosition.x));
    vec3 rose = mix(vec3(0.71, 0.129, 0.231), vec3(1.0, 0.359, 0.421), diffuse);
    rose = mix(rose, vec3(1.0, 0.48, 0.22), lower * 0.44);
    rose = mix(rose, vec3(1.0, 0.67, 0.753), upper * 0.37);
    float blend = smoothstep(0.24, 0.96, health);
    float skyLight = clamp(dot(normal, normalize(vec3(0.0, 0.92, 0.48))) * 0.5 + 0.5, 0.0, 1.0);
    float lit = smoothstep(0.19, 0.94, skyLight * 0.67 + diffuse * 0.18 + upper * 0.15);
    vec3 green = mix(vec3(0.023, 0.246, 0.026), vec3(0.136, 0.54, 0.045), lit);
    float sunshine = smoothstep(-1.55, 0.78, modelPosition.y);
    green = mix(green, vec3(0.48, 0.80, 0.073), sunshine * (0.29 + lit * 0.49));
    vec2 root = (vec2(abs(modelPosition.x), modelPosition.y) - vec2(1.49, -0.33)) * vec2(2.9, 2.8);
    green *= 1.0 - 0.22 * exp(-dot(root, root));
    vec3 pinkEdge = mix(vec3(1.0, 0.895, 0.965), vec3(1.0, 0.97, 0.34), lower);
    vec3 greenEdge = mix(vec3(0.70, 1.0, 0.40), vec3(0.93, 1.0, 0.61), lower);
    vec3 turning = mix(rose, vec3(0.92, 0.55, 0.19), smoothstep(0.18, 0.58, health) * 0.6);
    vec3 color = mix(turning, green, blend);
    float rimWeight = rim * (0.83 + side * 0.26) + lower * 0.15;
    rimWeight = mix(rimWeight, pow(1.0 - facing, 3.25) * 1.08 + lower * 0.045, blend);
    color = mix(color, mix(pinkEdge, greenEdge, blend), clamp(rimWeight, 0.0, 1.0));
    color += mix(vec3(0.17, 0.12, 0.11), vec3(0.06, 0.09, 0.025), blend) * specular;

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

function profileGeometry(profile, isHead) {
  const curve = new THREE.CatmullRomCurve3(profile.map(([y, width, depth]) =>
    new THREE.Vector3(width, y, depth)
  ));
  const positions = [];
  const indices = [];
  const rings = 88;
  const sides = 96;

  for (let row = 0; row <= rings; row++) {
    const { x: width, y, z: depth } = curve.getPoint(row / rings);
    for (let i = 0; i < sides; i++) {
      const angle = i / sides * Math.PI * 2;
      const lateral = Math.sin(angle);
      const front = Math.cos(angle);
      const x = lateral * width;
      const armCrease =
        Math.exp(-Math.pow((Math.abs(lateral) - 0.75) / 0.11, 2)) *
        (1 - THREE.MathUtils.smoothstep(y, -1.76, -0.51)) * 0.25;
      const nose = Math.exp(-Math.pow(x / 0.15, 2) - Math.pow((y - 2.88) / 0.17, 2));
      const z = isHead
        ? depth * front + 0.13 + nose * Math.pow(Math.max(front, 0), 5) * 0.12
        : depth * front * (1 - armCrease);
      positions.push(x, y, z);

      if (row < rings) {
        const a = row * sides + i;
        const b = row * sides + (i + 1) % sides;
        indices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  }

  return meshGeometry(positions, indices);
}

function meshGeometry(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function lobeGeometry() {
  const contour = new THREE.Shape();
  contour.moveTo(0.30, 0.88);
  contour.bezierCurveTo(0.44, 1.21, 0.71, 1.24, 1.13, 0.98);
  contour.bezierCurveTo(1.62, 0.67, 1.92, 0.11, 2.01, -0.56);
  contour.bezierCurveTo(2.10, -1.25, 2.12, -1.83, 1.74, -1.84);
  contour.bezierCurveTo(1.54, -1.85, 1.26, -1.66, 0.89, -1.62);
  contour.bezierCurveTo(0.36, -1.57, 0.18, -1.48, 0.16, -1.02);
  contour.bezierCurveTo(0.11, -0.48, 0.18, 0.57, 0.30, 0.88);

  const outline = contour.getSpacedPoints(76).slice(0, -1);
  if (THREE.ShapeUtils.isClockWise(outline)) outline.reverse();
  const centerX = 1.06;
  const centerY = -0.48;
  const centerZ = 0.39;
  const positions = [centerX, centerY, centerZ + 0.69];
  const indices = [];
  const rows = 40;
  const sides = outline.length;

  for (let row = 1; row < rows; row++) {
    const angle = row / rows * Math.PI;
    const spread = Math.sin(angle);
    const thickness = Math.cos(angle);
    for (const edge of outline) {
      const x = THREE.MathUtils.lerp(centerX, edge.x, spread);
      const y = THREE.MathUtils.lerp(centerY, edge.y, spread);
      const depth = thickness > 0 ? 0.69 : 0.65;
      const z = centerZ + thickness * depth - (y - centerY) ** 2 * 0.09;
      positions.push(x, y, z);
    }
  }

  const backPole = positions.length / 3;
  positions.push(centerX, centerY, centerZ - 0.65);

  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    indices.push(0, i + 1, next + 1);
    for (let row = 1; row < rows - 1; row++) {
      const a = 1 + (row - 1) * sides + i;
      const b = 1 + (row - 1) * sides + next;
      indices.push(a, a + sides, b, b, a + sides, b + sides);
    }
    const lastRing = 1 + (rows - 2) * sides;
    indices.push(lastRing + i, backPole, lastRing + next);
  }

  return meshGeometry(positions, indices);
}

function taperedTube(points, start, end, material) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const segments = points.length * 5;
  const sides = 18;
  const geometry = new THREE.TubeGeometry(curve, segments, 1, sides);
  const vertices = geometry.attributes.position;
  const vertex = new THREE.Vector3();

  for (let row = 0; row <= segments; row++) {
    const u = row / segments;
    const center = curve.getPointAt(u);
    const radius = THREE.MathUtils.lerp(start, end, u) * Math.sqrt(THREE.MathUtils.smoothstep(1 - u, 0, 0.065));
    for (let side = 0; side <= sides; side++) {
      const index = row * (sides + 1) + side;
      vertex.fromBufferAttribute(vertices, index).sub(center).multiplyScalar(radius).add(center);
      vertices.setXYZ(index, vertex.x, vertex.y, vertex.z);
    }
  }

  return new THREE.Mesh(geometry, material);
}

const BRANCHES = [
  [0.151, 0.042, [[0, 0.48, 0.61], [0.27, 0.21, 0.84], [0.67, -0.12, 1.08], [0.94, -0.49, 1.16], [1.14, -0.9, 1.06], [1.20, -1.31, 0.91]]],
  [0.094, 0.023, [[0.61, -0.09, 1.06], [0.91, 0.10, 1.10], [1.05, 0.32, 1.00], [1.07, 0.55, 0.91]]],
  [0.047, 0.016, [[0.99, 0.24, 1.07], [1.29, 0.19, 1.04], [1.49, 0.10, 0.93]]],
  [0.030, 0.010, [[1.27, 0.19, 1.04], [1.42, 0.26, 0.96], [1.51, 0.27, 0.89]]],
  [0.033, 0.011, [[1.05, 0.41, 0.98], [1.15, 0.54, 0.89], [1.23, 0.57, 0.83]]],
  [0.063, 0.015, [[0.74, -0.23, 1.13], [1.08, -0.19, 1.13], [1.33, -0.28, 1.09], [1.52, -0.35, 1.01]]],
  [0.036, 0.011, [[1.26, -0.25, 1.10], [1.48, -0.20, 1.03], [1.65, -0.24, 0.94]]],
  [0.080, 0.020, [[0.91, -0.45, 1.16], [1.24, -0.47, 1.15], [1.51, -0.53, 1.07], [1.73, -0.64, 0.96]]],
  [0.044, 0.012, [[1.45, -0.52, 1.10], [1.61, -0.45, 1.02], [1.76, -0.46, 0.93]]],
  [0.045, 0.013, [[1.65, -0.59, 1.00], [1.72, -0.73, 0.97], [1.80, -0.83, 0.90]]],
  [0.067, 0.020, [[1.04, -0.70, 1.13], [1.30, -0.89, 1.09], [1.54, -1.15, 0.94], [1.63, -1.31, 0.84]]],
  [0.035, 0.011, [[1.39, -0.99, 1.04], [1.64, -1.01, 0.91], [1.78, -1.11, 0.80]]],
  [0.045, 0.012, [[1.16, -1.02, 1.04], [1.30, -1.22, 0.91], [1.36, -1.44, 0.79]]],
  [0.052, 0.015, [[1.00, -0.60, 1.16], [0.85, -0.86, 1.10], [0.85, -1.09, 0.99]]],
  [0.028, 0.010, [[0.85, -0.89, 1.09], [0.74, -1.00, 1.03], [0.72, -1.14, 0.95]]],
];

function createTrachea() {
  const trachea = new THREE.Group();
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.178, 0.185, 1.42, 32),
    new THREE.MeshPhysicalMaterial({ color: 0xf69785, emissive: 0xef896f, emissiveIntensity: 0.19, roughness: 0.47 })
  );
  tube.position.set(0, 1.10, 0.59);
  trachea.add(tube);
  const ringGeometry = new THREE.TorusGeometry(0.148, 0.051, 14, 40);
  const ringMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffa295, emissive: 0xfa8e78, emissiveIntensity: 0.23, roughness: 0.43 });
  for (let i = 0; i < 10; i++) {
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(0, 0.57 + i * 0.129, 0.59);
    ring.rotation.x = Math.PI / 2;
    trachea.add(ring);
  }

  const collar = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 20),
    new THREE.MeshPhysicalMaterial({ color: 0xa5e7fa, emissive: 0x86d5e9, emissiveIntensity: 0.24, roughness: 0.38 })
  );
  collar.scale.set(0.24, 0.10, 0.235);
  collar.position.set(0, 1.83, 0.59);
  trachea.add(collar);
  trachea.position.y = -0.08;

  const colors = [
    [tube.material, 0xd89441],
    [ringMaterial, 0xf3b851],
    [collar.material, 0x99d95b],
  ].map(([material, healthy]) => ({
    material,
    initial: material.color.clone(),
    initialGlow: material.emissive.clone(),
    healthy: new THREE.Color(healthy),
  }));
  return {
    mesh: trachea,
    update(health) {
      const warmth = THREE.MathUtils.smoothstep(health, 0.43, 0.99);
      for (const { material, initial, initialGlow, healthy } of colors) {
        material.color.lerpColors(initial, healthy, warmth);
        material.emissive.lerpColors(initialGlow, healthy, warmth);
      }
    },
  };
}

function createRecoveryGlow() {
  const path = new THREE.CatmullRomCurve3(Array.from({ length: 49 }, (_, index) => {
    const t = index / 48;
    const turn = (t * 2.38 - 0.74) * Math.PI;
    return new THREE.Vector3(Math.sin(turn) * 2.46, -1.45 - 0.73 * t, Math.cos(turn) * 1.48);
  }));
  const glow = new THREE.Group();
  const intensity = { value: 0 };
  const layers = [[0.011, 0.53, 0xe8ffac], [0.052, 0.20, 0x9fff79]];
  for (const [radius, strength, color] of layers) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        intensity,
        strength: { value: strength },
        tint: { value: new THREE.Color(color) },
      },
      vertexShader: /* glsl */ `
        varying float along;
        varying vec3 viewNormal;
        void main() {
          along = uv.x;
          viewNormal = normalMatrix * normal;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float intensity;
        uniform float strength;
        uniform vec3 tint;
        varying float along;
        varying vec3 viewNormal;
        void main() {
          float ends = smoothstep(0.0, 0.19, along) * (1.0 - smoothstep(0.75, 1.0, along));
          float edge = pow(abs(normalize(viewNormal).z), 2.0);
          gl_FragColor = vec4(tint, strength * intensity * ends * edge);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const layer = new THREE.Mesh(new THREE.TubeGeometry(path, 100, radius, 8), material);
    layer.renderOrder = 3;
    glow.add(layer);
  }
  return {
    mesh: glow,
    update(health, visible) {
      intensity.value = THREE.MathUtils.smoothstep(health, 0.79, 0.99);
      glow.visible = visible && intensity.value > 0.001;
    },
  };
}

function createAlveoli() {
  const sacs = new THREE.Group();
  const geometry = new THREE.SphereGeometry(1, 26, 20);
  const colors = [0xc17deb, 0xe9a7ee, 0xf7b8e4, 0xb490ee].map(
    (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.34, clearcoat: 0.22 })
  );
  const stemMaterial = new THREE.MeshStandardMaterial({ color: 0xeea6cb, roughness: 0.45 });
  const layout = [
    [0.22, 0.08, 0.02, 0.32], [-0.02, 0.34, -0.04, 0.28], [-0.34, 0.16, 0.06, 0.29],
    [-0.34, -0.20, 0.02, 0.30], [-0.13, -0.39, 0.04, 0.32], [0.22, -0.39, -0.07, 0.30],
    [0.40, -0.14, 0.10, 0.28], [-0.09, -0.03, 0.35, 0.34], [0.17, -0.19, 0.34, 0.30],
    [-0.04, -0.09, -0.30, 0.37],
  ];

  for (const side of [-1, 1]) {
    const cluster = new THREE.Group();
    cluster.position.set(side * 0.94, -0.64, 0.91);
    cluster.rotation.z = side * 0.18;
    for (const [i, [x, y, z, r]] of layout.entries()) {
      const sac = new THREE.Mesh(geometry, colors[i % colors.length]);
      sac.position.set(x, y, z);
      sac.scale.set(r, r * 0.92, r);
      cluster.add(sac);
    }
    sacs.add(cluster, taperedTube([
      [0, 0.49, 0.59], [side * 0.34, 0.22, 0.78],
      [side * 0.62, 0.02, 0.92], [side * 0.9, -0.48, 0.91],
    ], 0.105, 0.065, stemMaterial));
  }
  return sacs;
}

export function createLungModel() {
  const figure = new THREE.Group();
  const shellMaterials = [false, true].map((isHead) => new THREE.ShaderMaterial({
    uniforms: { isHead: { value: isHead }, visibility: { value: 1 } },
    vertexShader: SCULPTURE_VERTEX,
    fragmentShader: MANNEQUIN_FRAGMENT,
    transparent: true,
    depthWrite: false,
    stencilWrite: true,
    stencilWriteMask: 0,
    stencilRef: 1,
    stencilFunc: THREE.NotEqualStencilFunc,
  }));
  const torso = new THREE.Mesh(profileGeometry(TORSO_PROFILE, false), shellMaterials[0]);
  const head = new THREE.Mesh(profileGeometry(HEAD_PROFILE, true), shellMaterials[1]);
  const trachea = createTrachea();
  torso.renderOrder = 1;
  head.renderOrder = 2;
  figure.add(torso, head, trachea.mesh);

  const lobes = new THREE.Group();
  const tissue = new THREE.ShaderMaterial({
    uniforms: { health: { value: 0 } },
    vertexShader: SCULPTURE_VERTEX,
    fragmentShader: LUNG_FRAGMENT,
  });
  const lobe = lobeGeometry();
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(lobe, tissue);
    mesh.scale.x = side;
    lobes.add(mesh);
  }

  const bronchi = new THREE.Group();
  const branchMaterial = new THREE.MeshPhysicalMaterial({ roughness: 0.36, clearcoat: 0.24, emissiveIntensity: 0.26 });
  const carina = new THREE.Mesh(new THREE.SphereGeometry(0.16, 26, 18), branchMaterial);
  carina.position.set(0, 0.465, 0.61);
  const airway = new THREE.Group();
  const surface = new THREE.Mesh(lobe, tissue);
  const rayDirection = new THREE.Vector3(0, 0, -1);
  const rayOrigin = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const surfaceAt = (x, y) => {
    ray.set(rayOrigin.set(x, y, 3), rayDirection);
    return ray.intersectObject(surface, false)[0];
  };
  for (const [start, end, nodes] of BRANCHES) {
    const fitted = nodes.map(([x, y, z], index) => {
      const depth = surfaceAt(x, y)?.point.z;
      const radius = THREE.MathUtils.lerp(start, end, index / (nodes.length - 1));
      return [x, y, depth === undefined ? z : depth + radius * 0.57];
    });
    airway.add(taperedTube(fitted, start, end, branchMaterial));
  }
  const mirroredAirway = airway.clone();
  mirroredAirway.scale.x = -1;
  bronchi.add(carina, airway, mirroredAirway);

  const alveoli = createAlveoli();
  const breathingPivot = new THREE.Group();
  const anatomy = new THREE.Group();
  breathingPivot.position.y = 0.49;
  anatomy.position.y = -0.49;
  const plants = createLungFoliage(surfaceAt, taperedTube);
  const glow = createRecoveryGlow();
  anatomy.add(lobes, bronchi, alveoli, plants.foliage, glow.mesh);
  breathingPivot.add(anatomy);
  figure.add(breathingPivot);

  // Keep the anatomy visible through the mannequin from every angle.
  figure.traverse((object) => {
    if (!object.isMesh || object.material.transparent) return;
    object.material.stencilWrite = true;
    object.material.stencilRef = 1;
    object.material.stencilZPass = THREE.ReplaceStencilOp;
  });

  const warmBronchi = new THREE.Color(0xffbb80);
  const healthyBronchi = new THREE.Color(0xe1aa53);
  return {
    figure,
    update(health, expansion, view) {
      tissue.uniforms.health.value = health;
      trachea.update(health);
      branchMaterial.color.copy(warmBronchi).lerp(healthyBronchi, health);
      branchMaterial.emissive.copy(branchMaterial.color);
      breathingPivot.scale.set(1 + expansion, 1 + expansion * 0.65, 1 + expansion * 0.92);
      lobes.visible = view === "lungs";
      plants.update(health, lobes.visible);
      glow.update(health, lobes.visible);
      bronchi.visible = view !== "alveoli";
      alveoli.visible = view === "alveoli";
      shellMaterials[0].uniforms.visibility.value = view === "lungs" ? 1 : 0.71;
    },
  };
}
