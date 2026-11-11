// Pinned runtime. No automatic learner-selected package downloads.
const RUNTIME = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';
const role = new URL(self.location.href).searchParams.get('role') || 'student';
let pyodide;
async function initialize() {
  const { loadPyodide } = await import(`${RUNTIME}pyodide.mjs`);
  pyodide = await loadPyodide({ indexURL: RUNTIME, jsglobals: {} });
  const response = await fetch(new URL('./runner.py', import.meta.url));
  if (!response.ok) throw new Error('The Python exercise runner could not load.');
  pyodide.runPython(await response.text());
  self.postMessage({ type: 'ready' });
}
const ready = initialize().catch(error => {
  self.postMessage({ type: 'load-error', error: String(error.message || error) });
  throw error;
});
self.onmessage = async ({ data }) => {
  if (data.type !== 'run') return;
  try {
    if (role === 'reference' && data.request.mode !== 'reference') throw new Error('The reference worker only accepts reference runs.');
    await ready;
    const started = performance.now();
    pyodide.globals.set('_request_json', JSON.stringify(data.request));
    const raw = pyodide.runPython('json.dumps(evaluate_request(json.loads(_request_json)), allow_nan=False)');
    self.postMessage({ type: 'result', id: data.id, result: JSON.parse(raw), executionMs: performance.now() - started });
  } catch (error) {
    self.postMessage({ type: 'error', id: data.id, error: String(error.message || error).slice(-2200) });
  } finally {
    if (pyodide) pyodide.globals.delete('_request_json');
  }
};
