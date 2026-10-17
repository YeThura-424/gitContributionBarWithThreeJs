const { test } = require('node:test');
const assert = require('node:assert/strict');

test('profile controller connects API data, year controls, and graph loading', async (t) => {
  const { initializeProfile } = await import('../js/ui/profile.js');
  const year = new Date().getFullYear();
  const elements = new Map();
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      value: 'test-user', textContent: '', dataset: {},
      firstChild: { textContent: '' }, lastChild: { textContent: '' },
      listeners: {}, addEventListener(event, handler) { this.listeners[event] = handler; },
      querySelectorAll() { return []; },
    });
    return elements.get(selector);
  }
  const previousDocument = global.document;
  const previousFetch = global.fetch;
  t.after(() => { global.document = previousDocument; global.fetch = previousFetch; });
  global.document = { querySelector: element };
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      total: { [year]: 5, [year - 1]: 3 },
      contributions: [
        { date: `${year}-01-01`, count: 5 },
        { date: `${year - 1}-01-01`, count: 3 },
      ],
    }),
  });
  const loadingStates = [];
  const graphs = [];
  const graph = {
    isFetching: false,
    setSceneLoading(pending) { graph.isFetching = pending; loadingStates.push(pending); },
    buildGraph(data) { graphs.push(data); },
  };
  initializeProfile(graph);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(loadingStates, [true, false]);
  assert.equal(graphs.length, 2);
  assert.equal(element('#total-contributions').textContent, '5');
  assert.equal(element('#profile-status').dataset.status, 'success');
  assert.equal(element('#graph-title').textContent, 'test-user');
  assert.ok(element('#year-tabs').innerHTML.includes('aria-selected:text-accent'));

  element('#year-tabs').listeners.click({
    target: { closest: () => ({ dataset: { year: String(year - 1) }, getAttribute: () => 'false' }) },
  });
  assert.equal(graphs.length, 3);
  assert.equal(element('#total-contributions').textContent, '3');
  assert.match(element('#date-range').textContent, new RegExp(`^${year - 1}-01-01`));
});
