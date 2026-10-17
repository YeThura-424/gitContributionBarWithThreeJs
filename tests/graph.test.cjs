const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = ['js/graph/createGraph.js', 'js/ui/profile.js', 'js/data/contributions.js', 'js/utils/dates.js']
  .map(file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    .replace(/^  /gm, '').replace(/^export /gm, ''))
  .join('\n');

function element() {
  const classes = new Set();
  return {
    textContent: '', firstChild: {textContent: ''}, disabled: false, style: {}, dataset: {}, children: [], attributes: {},
    classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }, contains(name) { return classes.has(name); } },
    setAttribute(name, value) { this.attributes[name] = value; },
    appendChild(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    querySelectorAll() { return this.children; },
  };
}

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function: ${name}`);
  const open = source.indexOf('{', start);
  let depth = 1;
  let end = open + 1;
  while (depth && end < source.length) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
    end++;
  }
  return source.slice(start, end);
}

function runtime() {
  const context = {
    document: { createElement: tag => tag === 'canvas' ? {getContext: () => ({fillText() {}})} : element() },
    THREE: {
      Vector3: class { constructor(x, y, z) { Object.assign(this, {x, y, z}); } },
      CanvasTexture: class { dispose() {} },
      SpriteMaterial: class { constructor(options) { Object.assign(this, options); } dispose() {} },
      Sprite: class { constructor(material) { this.material = material; this.position = {copy() {}}; } },
    },
    scene: {add() {}, remove() {}}, activePalette: 'forest',
    axisLabels: element(), labels: [], gridWidth: 49.66, gridDepth: 6.42,
    CELL_STEP: 0.94, CELL_SIZE: 0.78,
    loading: element(), loadingMessage: element(), container: element(), controls: {},
    replayButton: element(), resetButton: element(), durationInput: element(), yearTabs: element(),
    loadButton: element(), usernameInput: {value: 'test-user'}, profileStatus: element(),
    isFetching: false, requestId: 0, activeUsername: '', selectedYear: '', allContributions: null,
    clearHover() {}, renderYearTabs() {}, normalizeContributionData: data => data,
    buildGraph(data) { context.graphData = data; }, updateProfileHeader() {}, Date,
  };
  vm.createContext(context);
  for (const name of ['buildAxisLabels', 'setSceneLoading', 'loadUserContributions']) {
    const code = functionSource(name);
    vm.runInContext((name === 'loadUserContributions' ? 'async ' : '') + code, context);
  }
  return context;
}

function loadFunctions(context, names) {
  vm.createContext(context);
  for (const name of names) {
    vm.runInContext(functionSource(name), context);
  }
  return context;
}

test('disabling animation immediately restores final bar heights', () => {
  const c = loadFunctions({
    blocks: [1, 4, 10.5].map(targetHeight => ({userData: {targetHeight}, scale: {}, position: {x: 8,z: 2}})),
    prefersReducedMotion: false, animateBars: false, animationStartedAt: 100,
  }, ['replayGrowth']);
  c.replayGrowth();
  assert.equal(c.animationStartedAt, null);
  for (const block of c.blocks) {
    assert.equal(block.scale.y, block.userData.targetHeight);
    assert.equal(block.position.y, block.userData.targetHeight / 2);
    assert.equal(block.position.x, 8);
  }
});

test('looping schedules another simultaneous growth and respects reduced motion', () => {
  const c = loadFunctions({
    blocks: [{userData: {targetHeight: 4}, scale: {}, position: {}}],
    THREE: {MathUtils: {clamp: (x,a,b) => Math.max(a,Math.min(b,x))}},
    ZERO_HEIGHT: 0.08, growDuration: 2400, loopEnabled: true, animateBars: true,
    prefersReducedMotion: false, isFetching: false, performance: {now: () => 5000},
    animationStartedAt: 0,
  }, ['animateGrowth']);
  c.animateGrowth(1200);
  assert.equal(c.animationStartedAt, 0);
  assert.equal(c.blocks[0].scale.y, 0.08 + (4 - 0.08) * 0.875);
  c.animateGrowth(2400);
  assert.equal(c.animationStartedAt, 5700);
  c.prefersReducedMotion = true;
  c.animateGrowth(2400);
  assert.equal(c.animationStartedAt, null);
});

test('a selected contribution year contains both January 1 and December 31', () => {
  const c = loadFunctions({Date, WEEKS: 53, DAYS_PER_WEEK: 7}, ['normalizeContributionData', 'getWeeksForYear', 'startOfWeek', 'startOfDay', 'toLocalDateKey']);
  for (const year of [2024, 2026, 2028]) {
    const data = c.normalizeContributionData([{date: `${year}-01-01`,count:3}, {date: `${year}-12-31`,count:7}], year);
    assert.equal(data.find(d => d.date === `${year}-01-01`).count, 3);
    assert.equal(data.find(d => d.date === `${year}-12-31`)?.count, 7);
  }
});

test('month labels track month boundaries and all weekdays sit to the right', () => {
  const c = runtime();
  c.buildAxisLabels([
    {date: '2025-12-31', week: 0}, {date: '2026-01-01', week: 0},
    {date: '2026-01-02', week: 0}, {date: '2026-02-01', week: 5},
  ]);
  assert.deepEqual(Array.from(c.labels, l => l.element.textContent), ['Dec', 'Jan', 'Feb', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  const days = Array.from(c.labels.slice(-7));
  assert.ok(c.labels.every(label => label.sprite.material.depthTest === true && label.sprite.material.depthWrite === false));
  assert.ok(days.every(l => l.anchor.x > c.gridWidth / 2));
  assert.ok(Math.abs(days[1].anchor.z - days[0].anchor.z - c.CELL_STEP) < 1e-10);
  c.buildAxisLabels([{date: '2026-06-01', week: 0}]);
  assert.equal(c.axisLabels.children.length, 8);
  assert.equal(c.labels[0].element.textContent, 'Jun');
});

test('API loading covers the scene until response parsing finishes', async () => {
  const c = runtime();
  let finish;
  c.fetch = () => new Promise(resolve => { finish = resolve; });
  const pending = c.loadUserContributions({preventDefault() {}});
  assert.equal(c.container.attributes['aria-busy'], 'true');
  assert.equal(c.loading.classList.contains('hidden'), false);
  assert.equal(c.controls.enabled, false);
  assert.equal(c.replayButton.disabled, true);
  finish({ok: true, json: async () => ({contributions: [{count: 3}], total: {2026: 3}})});
  await pending;
  assert.equal(c.graphData[0].count, 3);
  assert.equal(c.container.attributes['aria-busy'], 'false');
  assert.equal(c.loading.classList.contains('hidden'), true);
  assert.equal(c.loading.attributes['aria-hidden'], 'true');
  assert.equal(c.controls.enabled, true);
  assert.equal(c.replayButton.disabled, false);
});

test('the default profile can fetch on startup without a form event', async () => {
  const c = runtime();
  c.usernameInput.value = 'yethura-424';
  let requestedUrl;
  c.fetch = async url => {
    requestedUrl = url;
    return {ok: true, json: async () => ({contributions: [{count: 5}], total: {2026: 5}})};
  };
  await c.loadUserContributions();
  assert.equal(requestedUrl, 'https://github-contributions-api.jogruber.de/v4/yethura-424?y=all');
  assert.equal(c.graphData[0].count, 5);
  assert.equal(c.isFetching, false);
});

test('failed API requests dismiss loading and retain the existing graph', async () => {
  const c = runtime();
  c.graphData = [{count: 7}];
  c.fetch = async () => { throw new Error('Offline'); };
  await c.loadUserContributions({preventDefault() {}});
  assert.equal(c.profileStatus.textContent, 'Offline');
  assert.equal(c.graphData[0].count, 7);
  assert.equal(c.loading.classList.contains('hidden'), true);
  assert.equal(c.loadButton.disabled, false);
});

test('an older response cannot dismiss the current request loading state', async () => {
  const c = runtime();
  const responses = [];
  c.fetch = () => new Promise(resolve => responses.push(resolve));
  const event = {preventDefault() {}};
  const first = c.loadUserContributions(event);
  c.usernameInput.value = 'second-user';
  const second = c.loadUserContributions(event);
  responses[0]({ok: true, json: async () => ({contributions: [{count: 1}]})});
  await first;
  assert.equal(c.isFetching, true);
  assert.equal(c.loading.classList.contains('hidden'), false);
  responses[1]({ok: true, json: async () => ({contributions: [{count: 2}]})});
  await second;
  assert.equal(c.graphData[0].count, 2);
  assert.equal(c.isFetching, false);
});
