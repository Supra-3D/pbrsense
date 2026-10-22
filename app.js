const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
function createMatrix(root, group) {
const $ = (s, scope = root) => scope.querySelector(s.replace(/^#([\w-]+)$/, '[data-control="$1"]'));
const $$ = (s, scope = root) => [...scope.querySelectorAll(s)];
const labels = { albedo: 'Albedo', metallic: 'Metallic', roughness: 'Roughness', normal: 'Normal' };
let cells = [], renderedMethods = [], channel = 'albedo', splitValue = 50, zoom = 1;
let epoch = 0, controller;
function node(tag, className, text) { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; }
function pressed(buttons, match) { buttons.forEach(b => { const active = match(b); b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); }); }
function status(text) { const e = $('#matrix-status');e.textContent = text;e.hidden = !text; }
function available(cell) { return !!cell.maps[channel]; }
function channelMethods() { return group.methods_by_channel?.[channel] ?? group.methods; }
function loadImage(src, signal) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    const cleanup = () => { im.onload = im.onerror = null; signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); im.removeAttribute('src'); reject(new DOMException('Selection changed', 'AbortError')); };
    im.onload = () => { cleanup(); resolve(im); };
    im.onerror = () => { cleanup(); reject(new Error('Image unavailable')); };
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); else im.src = src;
  });
}
function cellMessage(cell, text, error = false) { cell.message.textContent = text; cell.message.hidden = !text; cell.message.classList.toggle('error', error); }
function cellSplit(cell, value) { cell.value = Math.max(0, Math.min(100, Number(value))); cell.frame.style.setProperty('--split', cell.value + '%'); cell.frame.setAttribute('aria-valuenow', String(Math.round(cell.value))); }
function globalSplit(value) { splitValue = Number(value); cells.forEach(c => cellSplit(c, splitValue)); }
function setZoom(value) { zoom = Math.max(1, Math.min(2.5, value)); root.style.setProperty('--zoom', zoom); $('#zoom-value').value = Math.round(zoom * 100) + '%'; $('#zoom-out').disabled = zoom === 1; $('#zoom-in').disabled = zoom === 2.5; }
function buildCell(item, method) {
  const td = node('td', method === 'PBRSense' ? 'ours-cell' : '');
  const wrap = node('div', 'matrix-cell');wrap.dataset.item = item.id;wrap.dataset.method = method;
  const frame = node('div', 'cell-frame'); frame.setAttribute('aria-label', `${item.label}: input RGB versus ${method}`);
  const resultLayer = node('div', 'cell-transform'), result = new Image();
  result.className = 'cell-result'; result.draggable = false;
  resultLayer.append(result);
  const originalLayer = node('div', 'cell-original'), originalTransform = node('div', 'cell-transform'), original = new Image();
  original.src = item.input; original.alt = `${item.label} input RGB`; original.draggable = false;
  originalTransform.append(original); originalLayer.append(originalTransform);
  const divider = node('div', 'cell-divider');divider.setAttribute('aria-hidden', 'true');divider.append(node('span', '', '↔'));
  const rgbLabel = node('span', 'cell-tag tag-rgb', 'RGB'), targetLabel = node('span', 'cell-tag tag-map', labels[channel]);
  const message = node('div', 'cell-message', 'Loading…'); message.setAttribute('role', 'status');
  frame.append(resultLayer, originalLayer, divider, rgbLabel, targetLabel, message);
  frame.tabIndex = 0;frame.setAttribute('role', 'slider');frame.setAttribute('aria-valuemin', '0');frame.setAttribute('aria-valuemax', '100');
  wrap.append(frame);td.append(wrap);
  const cell = { item, method, maps: item.methods[method] ?? {}, td, wrap, frame, result, originalLayer, divider, rgbLabel, targetLabel, message, value: splitValue };
  cellSplit(cell, splitValue);
  frame.addEventListener('keydown', e => {
    if (!cell.message.hidden || !available(cell)) return;
    const values = { ArrowLeft: cell.value - 5, ArrowRight: cell.value + 5, Home: 0, End: 100 };
    if (e.key in values) { e.preventDefault();globalSplit(values[e.key]); }
  });
  let pointer = null;
  const drag = e => { if (pointer !== e.pointerId) return; const r = frame.getBoundingClientRect(); globalSplit((e.clientX - r.left) / r.width * 100); };
  frame.addEventListener('pointerdown', e => { if (e.button !== 0 || !cell.message.hidden || !available(cell)) return; pointer = e.pointerId; frame.setPointerCapture(pointer); drag(e); });
  frame.addEventListener('pointermove', drag);
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) frame.addEventListener(event, () => { pointer = null; });
  cells.push(cell);return td;
}
function buildMatrix(nextGroup) {
  const previousSplits = new Map(cells.map(c => [JSON.stringify([c.item.id, c.method]), c.value]));
  controller?.abort();group = nextGroup;cells = [];
  renderedMethods = [...channelMethods()];
  root.dataset.group = group.id;
  const table = $('.comparison-matrix');table.style.setProperty('--method-count', renderedMethods.length);
  const hr = node('tr');const first = node('th', 'item-heading', 'Item');first.scope = 'col';hr.append(first);
  for (const m of renderedMethods) { const h = node('th', m === 'PBRSense' ? 'method-heading ours-heading' : 'method-heading', m === 'PBRSense' ? 'PBRSense (Ours)' : m);h.scope = 'col';hr.append(h); }
  $('thead', table).replaceChildren(hr);
  $('tbody', table).replaceChildren(...group.items.map(item => { const tr = node('tr');tr.dataset.item = item.id;const th = node('th', 'item-heading');th.scope = 'row';const image = new Image();image.src = item.input;image.alt = '';th.append(image, node('strong', '', item.label));tr.append(th, ...renderedMethods.map(m => buildCell(item, m)));return tr; }));
  cells.forEach(c => cellSplit(c, previousSplits.get(JSON.stringify([c.item.id, c.method])) ?? splitValue));
  updateChannel(channel);
}
async function updateChannel(value) {
  channel = value;
  const methods = channelMethods();
  if (methods.length !== renderedMethods.length || methods.some((m, i) => m !== renderedMethods[i])) { buildMatrix(group);return; }
  controller?.abort();controller = new AbortController();const signal = controller.signal, ticket = ++epoch;
  root.dataset.channel = channel;root.dataset.ready = 'false';
  pressed($$('[data-channel]'), b => b.dataset.channel === channel);
    for (const cell of cells) {
    cell.targetLabel.textContent = labels[channel];cell.result.alt = `${cell.item.label}, ${cell.method}: ${labels[channel]}`;
    const ok = available(cell);cell.wrap.dataset.available = String(ok);
    cell.frame.tabIndex = ok ? 0 : -1;cell.frame.setAttribute('aria-disabled', String(!ok));cell.originalLayer.hidden = !ok;cell.divider.hidden = !ok;cell.rgbLabel.hidden = !ok;cell.targetLabel.hidden = !ok;
    cell.result.hidden = true;
    cell.message.classList.toggle('is-unavailable', !ok);
    cellMessage(cell, ok ? 'Loading…' : `${labels[channel]} unavailable`);
  }
  const visible = cells.filter(available);
  status(`Loading ${labels[channel].toLowerCase()} comparisons…`);
  let failed = 0;
  await Promise.all(visible.map(async cell => {
    try {
      await Promise.all([loadImage(cell.item.input, signal), loadImage(cell.maps[channel], signal)]);
      if (ticket !== epoch) return;
      cell.result.src = cell.maps[channel];cell.result.hidden = false;cellMessage(cell, '');
    } catch (error) { if (error.name !== 'AbortError' && ticket === epoch) { failed++;cellMessage(cell, 'Image could not load.\nChoose another channel to retry.', true); } }
  }));
  if (ticket === epoch) { root.dataset.ready = 'true';status(failed ? `${failed} images could not load. Select another attribute to retry.` : ''); }
}
$$('[data-channel]').forEach(b => b.addEventListener('click', () => updateChannel(b.dataset.channel)));
$('#zoom-in').addEventListener('click', () => setZoom(zoom + .25));$('#zoom-out').addEventListener('click', () => setZoom(zoom - .25));$('#zoom-reset').addEventListener('click', () => setZoom(1));
$('#reset-matrix').addEventListener('click', () => { globalSplit(50);setZoom(1);updateChannel('albedo'); });
window.addEventListener('pagehide', () => {controller?.abort();});
window.addEventListener('pageshow', e => {if(e.persisted&&group)buildMatrix(group);});
setZoom(1);buildMatrix(group);
}
// Native modal dialog supplies Escape handling, focus trapping, and restoration.
const box = $('.lightbox');
$$('[data-lightbox], .method-grid .media-card img, .app-intro .media-card img').forEach(b => {
  if (b.tagName === 'IMG') { b.tabIndex = 0; b.setAttribute('role', 'button'); }
  b.addEventListener('click', () => {
    const im = b.matches('img') ? b : $('img', b); $('img', box).src = b.dataset.lightbox || im.src; $('img', box).alt = im.alt;
    $('p', box).textContent = b.dataset.caption || im.alt; box.showModal();
  });
  if (b.tagName === 'IMG') b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); b.click(); } });
});
$('.lightbox-close').addEventListener('click', () => box.close());
box.addEventListener('click', e => { if (e.target === box) { const r = box.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) box.close(); } });
const observer = new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) $$('nav a').forEach(a => a.classList.toggle('active', a.hash === '#' + entry.target.id)); }); }, { rootMargin: '-15% 0px -60% 0px' });
$$('section[id]').forEach(s => observer.observe(s));
fetch('assets/matrix.json?v=qwen46k-opaque-marigold-20261016').then(r => {if(!r.ok)throw Error('Matrix unavailable');return r.json();}).then(groups => {
  if(!Array.isArray(groups)||!groups.length)throw Error('No comparison groups');
  $$('[data-matrix]').forEach(root => {
    const group = groups.find(g => g.id === root.dataset.group);
    if (!group) throw Error('Comparison group missing');
    createMatrix(root, group);
  });
}).catch(()=>$$('.matrix-status').forEach(e => {e.hidden=false;e.textContent='Comparison images could not be loaded. Please reload the page; the paper figures below remain available.';}));

// Start once the complete video is visible, below the sticky navigation.
// After playback starts, leave pause/resume decisions to the native controls.
const overviewVideo = $('#overview-video video');
if (overviewVideo) {
  const header = $('.site-header');
  let visibilityObserver, started = false;
  const tryStart = () => {
    if (started || document.hidden || overviewVideo.readyState < 3) return;
    const rect = overviewVideo.getBoundingClientRect();
    const headerBottom = header?.getBoundingClientRect().bottom ?? 0;
    if (rect.width <= 0 || rect.height <= 0 || rect.top < headerBottom ||
        rect.bottom > document.documentElement.clientHeight || rect.left < 0 ||
        rect.right > document.documentElement.clientWidth) return;
    overviewVideo.play().catch(() => {}); // Manual playback remains available if blocked.
  };
  const watchVisibility = () => {
    if (started) return;
    visibilityObserver?.disconnect();
    const inset = Math.max(0, header?.getBoundingClientRect().bottom ?? 0);
    visibilityObserver = new IntersectionObserver(tryStart, {
      threshold: 1, rootMargin: `-${inset}px 0px 0px 0px`
    });
    visibilityObserver.observe(overviewVideo);
  };
  const layoutObserver = new ResizeObserver(watchVisibility);
  layoutObserver.observe(document.documentElement);
  if (header) layoutObserver.observe(header);
  overviewVideo.addEventListener('canplay', tryStart);
  document.addEventListener('visibilitychange', tryStart);
  overviewVideo.addEventListener('playing', () => {
    started = true;
    visibilityObserver?.disconnect();
    layoutObserver.disconnect();
    overviewVideo.removeEventListener('canplay', tryStart);
    document.removeEventListener('visibilitychange', tryStart);
  }, { once: true });
  watchVisibility();
}
