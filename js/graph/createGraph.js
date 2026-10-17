import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WEEKS, DAYS_PER_WEEK, CELL_SIZE, CELL_STEP, ZERO_HEIGHT, MAX_VISIBLE_HEIGHT, DEFAULT_GROW_DURATION, THEME_PALETTES, THEME_SCENE_COLORS } from '../config.js';
import { getContributionLevel } from '../data/contributions.js';
import { formatDate } from '../utils/dates.js';

export function createGraph() {
  const container = document.querySelector("#scene-container");
  const tooltip = document.querySelector("#tooltip");
  const loading = document.querySelector("#loading");
  const loadingMessage = document.querySelector("#loading-message");
  const axisLabels = document.querySelector("#axis-labels");
  const replayButton = document.querySelector("#replay-button");
  const resetButton = document.querySelector("#reset-button");
  const durationInput = document.querySelector("#animation-duration");
  const durationOutput = document.querySelector("#animation-duration-value");
  const paletteButtons = document.querySelectorAll("button[data-palette]");
  const animateInput = document.querySelector("#animate-bars");
  const loopInput = document.querySelector("#loop-animation");
  const yearTabs = document.querySelector("#year-tabs");
  let growDuration = DEFAULT_GROW_DURATION;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let activeTheme = 'dark';
  let activePalette = 'forest';
  let animateBars = true;
  let loopEnabled = false;
  let maxContributionCount = 1;
  let isFetching = false;
  const labels = [];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(THEME_SCENE_COLORS.forest);

  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 180);
  const initialCameraPosition = new THREE.Vector3(10, 30, 35);
  camera.position.copy(initialCameraPosition);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 16;
  controls.maxDistance = 120;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.target.set(0, 1.8, 0);
  controls.update();
  controls.saveState();

  const ambientLight = new THREE.HemisphereLight(0xffffff, 0xb8bcb5, 1.2);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(-12, 28, 16);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -32;
  keyLight.shadow.camera.right = 32;
  keyLight.shadow.camera.top = 20;
  keyLight.shadow.camera.bottom = -20;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 70;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.45);
  rimLight.position.set(18, 12, -22);
  scene.add(rimLight);

  let gridWidth = (WEEKS - 1) * CELL_STEP + CELL_SIZE;
  const gridDepth = (DAYS_PER_WEEK - 1) * CELL_STEP + CELL_SIZE;

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(gridWidth + 5, gridDepth + 5),
    new THREE.MeshStandardMaterial({
      color: 0xf4f6f0,
      roughness: 0.95,
      metalness: 0.04,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.035;
  floor.receiveShadow = true;
  scene.add(floor);
  floor.visible = false;

  const frame = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-gridWidth / 2 - 0.35, 0, -gridDepth / 2 - 0.35),
      new THREE.Vector3(gridWidth / 2 + 0.35, 0, -gridDepth / 2 - 0.35),
      new THREE.Vector3(gridWidth / 2 + 0.35, 0, gridDepth / 2 + 0.35),
      new THREE.Vector3(-gridWidth / 2 - 0.35, 0, gridDepth / 2 + 0.35),
    ]),
    new THREE.LineBasicMaterial({ color: 0x899184, transparent: true, opacity: 0.25 }),
  );
  frame.position.y = 0.005;
  scene.add(frame);
  frame.visible = false;

  const graphGroup = new THREE.Group();
  scene.add(graphGroup);

  const sharedGeometry = new THREE.BoxGeometry(CELL_SIZE, 1, CELL_SIZE);
  const materials = THEME_PALETTES.forest.map(
    (color, index) =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: index === 0 ? 0.92 : 0.68,
        metalness: index === 0 ? 0.02 : 0.08,
      }),
  );

  const hoverMaterial = new THREE.MeshStandardMaterial({
    color: 0x86c232,
    emissive: 0x61892f,
    emissiveIntensity: 0.45,
    roughness: 0.55,
    metalness: 0.1,
  });


  let contributions = [];
  const blocks = [];
  let hovered = null;
  let animationStartedAt = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(99, 99);
  applyTheme();
  if (prefersReducedMotion) {
    animateInput.checked = false;
    animateInput.disabled = true;
    loopInput.disabled = true;
    document.querySelector('#motion-status').hidden = false;
  }
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerleave", clearHover);
  replayButton.addEventListener("click", replayGrowth);
  durationInput.addEventListener("input", () => {
    growDuration = Number(durationInput.value);
    durationOutput.textContent = `${(growDuration / 1000).toFixed(1)}s`;
  });
  durationInput.addEventListener("change", replayGrowth);
  resetButton.addEventListener("click", resetView);
  for (const button of paletteButtons) {
    button.addEventListener("click", () => {
      activePalette = button.dataset.palette;
      activeTheme = activePalette === "daylight" ? "light" : "dark";
      applyTheme();
    });
  }
  animateInput.addEventListener("change", () => {
    animateBars = animateInput.checked;
    replayGrowth();
  });
  loopInput.addEventListener("change", () => {
    loopEnabled = loopInput.checked;
    if (loopEnabled) replayGrowth();
    else if (animationStartedAt > performance.now()) animationStartedAt = null;
  });

  window.addEventListener('resize', resizeRenderer);
  resizeRenderer();
  requestAnimationFrame(renderLoop);
  return { buildGraph, setSceneLoading, get isFetching() { return isFetching; } };

  function renderLoop(now) {
    if (animationStartedAt !== null && now >= animationStartedAt) {
      animateGrowth(now - animationStartedAt);
    }

    raycaster.setFromCamera(pointer, camera);
    const hit = isFetching ? null : raycaster.intersectObjects(blocks, false)[0];
    setHovered(hit?.object ?? null);

    controls.update();
    updateAxisLabels();
    renderer.render(scene, camera);
    requestAnimationFrame(renderLoop);
  }

  function animateGrowth(elapsed) {
    let allDone = true;

    for (const block of blocks) {
      const progress = THREE.MathUtils.clamp(elapsed / growDuration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentHeight = ZERO_HEIGHT + (block.userData.targetHeight - ZERO_HEIGHT) * eased;

      block.scale.y = currentHeight;
      block.position.y = currentHeight / 2;

      if (progress < 1) allDone = false;
    }

    if (allDone) {
      animationStartedAt = loopEnabled && animateBars && !prefersReducedMotion && !isFetching
        ? performance.now() + 700 : null;
    }
  }

  function buildGraph(data) {
    setHovered(null);
    for (const block of blocks) graphGroup.remove(block);
    blocks.length = 0;
    contributions = data;
    gridWidth = Math.max(0, ...data.map(day => day.week)) * CELL_STEP + CELL_SIZE;
    maxContributionCount = Math.max(1, ...data.map((item) => item.count));

    for (const day of contributions) {
      const level = getContributionLevel(day.count);
      const targetHeight = getHeightForCount(day.count);
      const mesh = new THREE.Mesh(sharedGeometry, materials[level]);
      const x = day.week * CELL_STEP - gridWidth / 2 + CELL_SIZE / 2;
      const z = day.weekday * CELL_STEP - gridDepth / 2 + CELL_SIZE / 2;

      mesh.position.set(x, prefersReducedMotion ? targetHeight / 2 : ZERO_HEIGHT / 2, z);
      mesh.scale.y = prefersReducedMotion ? targetHeight : ZERO_HEIGHT;
      mesh.castShadow = day.count > 0;
      mesh.receiveShadow = true;
      mesh.userData = {
        ...day,
        level,
        targetHeight,
        baseMaterial: materials[level],
      };
      graphGroup.add(mesh);
      blocks.push(mesh);
    }

    buildAxisLabels(data);
    fitCameraToGraph();
    replayGrowth();
  }

  function buildAxisLabels(data) {
    for (const label of labels) {
      scene.remove(label.sprite);
      label.sprite.material.map.dispose();
      label.sprite.material.dispose();
    }
    axisLabels.replaceChildren();
    labels.length = 0;
    function addLabel(text, x, z, kind) {
      const element = document.createElement("span");
      element.className = "sr-only";
      element.textContent = text;
      axisLabels.appendChild(element);
      const canvas = document.createElement("canvas");
      canvas.width = 192;
      canvas.height = 64;
      const context = canvas.getContext("2d");
      context.font = "48px Arial, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = "#ffffff";
      context.fillText(text, 96, 32);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({
        map: texture, transparent: true, depthTest: true, depthWrite: false,
        color: activePalette === "daylight" ? "#5a6d48" : activePalette === "midnight" ? "#b1a6c9" : "#a4b292",
      });
      const sprite = new THREE.Sprite(material);
      const anchor = new THREE.Vector3(x, 0.12, z);
      sprite.position.copy(anchor);
      scene.add(sprite);
      labels.push({ element, sprite, anchor, projected: new THREE.Vector3(), kind });
    }
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let previousMonth = null;
    for (const day of data) {
      if (day.isOutsideYear) continue;
      const monthKey = day.date.slice(0, 7);
      if (monthKey === previousMonth) continue;
      previousMonth = monthKey;
      addLabel(months[Number(day.date.slice(5, 7)) - 1],
        day.week * CELL_STEP - gridWidth / 2 + CELL_SIZE / 2,
        gridDepth / 2 + 1.1, "month-label");
    }
    for (const [weekday, text] of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].entries()) {
      addLabel(text, gridWidth / 2 + 1.6,
        weekday * CELL_STEP - gridDepth / 2 + CELL_SIZE / 2, "weekday-label");
    }
  }

  function updateAxisLabels() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const visibleMonths = [];
    for (const label of labels) {
      label.projected.copy(label.anchor).project(camera);
      const x = (label.projected.x + 1) * width / 2;
      const y = (1 - label.projected.y) * height / 2;
      let visible = label.projected.z >= -1 && label.projected.z <= 1
        && x >= 20 && x <= width - 20 && y >= 10 && y <= height - 10;
      if (visible && label.kind === "month-label") {
        visible = !visibleMonths.some(point => Math.abs(point.x - x) < 36 && Math.abs(point.y - y) < 18);
        if (visible) visibleMonths.push({ x, y });
      }
      label.sprite.visible = visible;
      const labelHeight = 12;
      const worldHeight = labelHeight * 2 * camera.position.distanceTo(label.anchor)
        * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(1, height);
      label.sprite.scale.set(worldHeight * 3, worldHeight, 1);
    }
  }

  function setSceneLoading(pending) {
    isFetching = pending;
    loading.classList.toggle("hidden", !pending);
    loading.setAttribute("aria-hidden", String(!pending));
    container.setAttribute("aria-busy", String(pending));
    controls.enabled = !pending;
    for (const control of [replayButton, resetButton, durationInput, ...yearTabs.querySelectorAll("button")]) {
      control.disabled = pending;
    }
    if (pending) {
      loadingMessage.textContent = "Loading contributions…";
      clearHover();
    }
  }

  function applyTheme() {
    const palette = THEME_PALETTES[activePalette];
    document.documentElement.dataset.theme = activeTheme;
    document.documentElement.dataset.palette = activePalette;
    for (const label of labels) {
      label.sprite.material.color.set(activePalette === "daylight" ? "#5a6d48" : activePalette === "midnight" ? "#b1a6c9" : "#a4b292");
    }
    for (const button of paletteButtons) {
      button.setAttribute("aria-pressed", String(button.dataset.palette === activePalette));
    }

    materials.forEach((material, index) => material.color.set(palette[index]));
    hoverMaterial.color.set(palette[3]);
    hoverMaterial.emissive.set(palette[2]);

    const sceneColor = THEME_SCENE_COLORS[activePalette];
    scene.background.set(sceneColor);
    floor.material.color.set(sceneColor);
    const dark = activeTheme === "dark";
    frame.material.color.set(dark ? "#8b949e" : "#899184");
    ambientLight.groundColor.set(dark ? "#41484f" : "#b8bcb5");
    ambientLight.intensity = dark ? 1.1 : 1.2;
    keyLight.intensity = dark ? 1.8 : 2.4;
    rimLight.color.set("#ffffff");
    document.querySelector('meta[name="color-scheme"]').content = activeTheme;
  }

  function replayGrowth() {
    if (prefersReducedMotion || !animateBars) {
      animationStartedAt = null;
      for (const block of blocks) {
        block.scale.y = block.userData.targetHeight;
        block.position.y = block.userData.targetHeight / 2;
      }
      return;
    }

    for (const block of blocks) {
      block.scale.y = ZERO_HEIGHT;
      block.position.y = ZERO_HEIGHT / 2;
    }
    animationStartedAt = performance.now();
  }

  function resetView() {
    fitCameraToGraph(initialCameraPosition.clone().normalize());
  }

  function fitCameraToGraph(direction = camera.position.clone().sub(controls.target).normalize()) {
    const center = new THREE.Vector3(0, MAX_VISIBLE_HEIGHT / 2, 0);
    const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanHorizontal = tanVertical * camera.aspect;
    let distance = 0;
    for (const x of [-gridWidth / 2 - 3, gridWidth / 2 + 3]) {
      for (const y of [-0.5, MAX_VISIBLE_HEIGHT + 0.5]) {
        for (const z of [-gridDepth / 2 - 2, gridDepth / 2 + 2]) {
          const offset = new THREE.Vector3(x, y, z).sub(center);
          const depth = offset.dot(direction);
          distance = Math.max(distance,
            depth + Math.abs(offset.dot(right)) / tanHorizontal,
            depth + Math.abs(offset.dot(up)) / tanVertical);
        }
      }
    }
    distance *= 1.15;
    controls.maxDistance = Math.max(120, distance * 2);
    camera.far = Math.max(180, distance * 3);
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.target.copy(center);
    camera.updateProjectionMatrix();
    controls.update();
    controls.saveState();
  }

  function onPointerMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    tooltip.style.left = `${event.clientX - rect.left}px`;
    tooltip.style.top = `${event.clientY - rect.top}px`;
  }

  function setHovered(mesh) {
    if (hovered === mesh) return;

    if (hovered) {
      hovered.material = hovered.userData.baseMaterial;
      hovered.scale.x = 1;
      hovered.scale.z = 1;
    }

    hovered = mesh;

    if (!hovered) {
      tooltip.classList.remove("visible");
      return;
    }

    hovered.material = hoverMaterial;
    hovered.scale.x = 1.12;
    hovered.scale.z = 1.12;

    const count = hovered.userData.count;
    const date = formatDate(hovered.userData.date);
    tooltip.innerHTML = `<strong>${count} contribution${count === 1 ? "" : "s"}</strong><br>${date}`;
    tooltip.classList.add("visible");
  }

  function clearHover() {
    pointer.set(99, 99);
    setHovered(null);
  }

  function resizeRenderer() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 600 ? 58 : 43;
    camera.updateProjectionMatrix();
    fitCameraToGraph();
  }

  function getHeightForCount(count) {
    if (count === 0) return ZERO_HEIGHT;
    const normalized = Math.log1p(count) / Math.log1p(maxContributionCount);
    return 0.24 + normalized * (MAX_VISIBLE_HEIGHT - 0.24);
  }
}
