// One automatic title sequence, then pointer-driven material exploration.
// Neither mode intercepts scrolling or changes the title geometry.
const story = document.querySelector('[data-material-story]');
if (story) {
  const layers = [...story.querySelectorAll('[data-story-layer]')];
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const maskSupported = CSS.supports('mask-image', 'linear-gradient(to bottom left, black, transparent)') || CSS.supports('-webkit-mask-image', 'linear-gradient(to bottom left, black, transparent)');
  const clamp = value => Math.max(0, Math.min(1, value));
  let frame = 0, elapsed = 0, previousTime = null, finished = false, pair = '';
  const duration = 3000;
  const surface = story.querySelector('.material-wordmark-right');
  let hovering = false, pointerPosition = 0, position = 0, velocity = 0;
  let interactionFrame = 0, transition = null, hiddenAt = null;
  // CSS cubic-bezier(.65, 0, .35, 1): ease-in-out across the entire three-second
  // sequence, with a slow opening and finish rather than a pause at every map.
  function easeInOut(progress) {
    const x = clamp(progress);
    if (x === 0 || x === 1) return x;
    let low = 0, high = 1;
    for (let i = 0; i < 18; i++) {
      const t = (low + high) / 2, u = 1 - t;
      const curveX = 3 * u * u * t * .65 + 3 * u * t * t * .35 + t * t * t;
      if (curveX < x) low = t; else high = t;
    }
    const t = (low + high) / 2;
    return 3 * (1 - t) * t * t + t * t * t;
  }
  const order = [0, 1, 2, 3, 4, 0];
  function show(index) {
    layers.forEach((image, i) => {
      image.hidden = i !== index;
      image.style.maskImage = image.style.webkitMaskImage = 'none';
      image.style.zIndex = '0';
    });
    pair = '';
    story.dataset.channel = layers[index].dataset.storyLayer;
  }
  function reveal(from, to, progress) {
    const key = `${from}:${to}`;
    if (pair !== key) {
      pair = key;
      layers.forEach((image, i) => {
        image.hidden = i !== from && i !== to;
        image.style.maskImage = image.style.webkitMaskImage = 'none';
        image.style.zIndex = i === to ? '1' : '0';
      });
    }
    const blend = clamp(progress), edge = -2 + blend * 104;
    const mask = `linear-gradient(to bottom left, #000 ${edge - 2}%, transparent ${edge + 2}%)`;
    layers[to].style.maskImage = layers[to].style.webkitMaskImage = mask;
    story.dataset.channel = layers[blend < .5 ? from : to].dataset.storyLayer;
  }
  function drawPosition(value) {
    position = Math.max(0, Math.min(order.length - 1, value));
    story.dataset.position = position.toFixed(4);
    if (!maskSupported || motion.matches) { show(order[Math.round(position)]); return; }
    const index = Math.min(order.length - 2, Math.floor(position));
    if (position === Math.round(position)) show(order[position]);
    else reveal(order[index], order[index + 1], position - index);
  }
  function resetRGB() {
    cancelAnimationFrame(interactionFrame); interactionFrame = 0;
    transition = null; velocity = 0;
    drawPosition(0);
  }
  // Cubic Bezier in material-position space. Carry the current velocity into
  // each retarget, so rapid pointer movement and reversals never reset the image.
  function sampleTransition(now) {
    if (!transition) return;
    const { start, from, control, to, length } = transition;
    const t = clamp((now - start) / length), u = 1 - t;
    drawPosition(u * u * u * from + 3 * u * u * t * control +
      3 * u * t * t * to + t * t * t * to);
    velocity = (3 * u * u * (control - from) + 6 * u * t * (to - control)) / length;
    if (t === 1) {
      transition = null; velocity = 0;
      if (to === 0 || to === order.length - 1) resetRGB();
    }
  }
  function interactionTick(now) {
    interactionFrame = 0;
    sampleTransition(now);
    if (transition && !document.hidden) interactionFrame = requestAnimationFrame(interactionTick);
  }
  function moveTo(target, length) {
    if (!finished || story.dataset.ready !== 'true') return;
    const now = performance.now();
    sampleTransition(now);
    if (motion.matches) {
      transition = null; velocity = 0;
      if (target === 0 || target === order.length - 1) resetRGB();
      else drawPosition(target);
      return;
    }
    // Both endpoints are the same image. Keep idle state at zero, but use
    // the equivalent right endpoint to approach right-side attributes smoothly.
    if (!transition && position === 0) {
      if (target === order.length - 1) return;
      if (target > (order.length - 1) / 2) drawPosition(order.length - 1);
    }
    if (transition?.to === target || (!transition && Math.abs(position - target) < .0001)) return;
    transition = {
      start: now, from: position, to: target, length,
      control: Math.max(0, Math.min(order.length - 1, position + velocity * length / 3))
    };
    if (!interactionFrame && !document.hidden) interactionFrame = requestAnimationFrame(interactionTick);
  }
  function trackPointer(event) {
    if (event.pointerType === 'touch') return;
    const entering = !hovering;
    hovering = true;
    const rect = surface.getBoundingClientRect();
    // Reserve 12% at each edge for a stable RGB endpoint.
    const deadZone = .12;
    const horizontal = (event.clientX - rect.left) / rect.width;
    if (horizontal <= deadZone || horizontal >= 1 - deadZone) {
      pointerPosition = 0;
      if (finished) resetRGB();
      return;
    }
    pointerPosition = clamp((horizontal - deadZone) / (1 - 2 * deadZone)) * (order.length - 1);
    moveTo(pointerPosition, entering ? 650 : 260);
  }
  surface.addEventListener('pointerenter', trackPointer);
  surface.addEventListener('pointermove', trackPointer);
  function nearestRGB() {
    sampleTransition(performance.now());
    const end = order.length - 1;
    return position <= end / 2 ? 0 : end;
  }
  const leave = () => { hovering = false; moveTo(nearestRGB(), 800); };
  surface.addEventListener('pointerleave', leave);
  surface.addEventListener('pointercancel', leave);
  function finish() {
    finished = true; cancelAnimationFrame(frame); frame = 0;
    drawPosition(0); story.dataset.playback = 'complete';
    if (hovering) moveTo(pointerPosition, 700);
  }
  function tick(now) {
    if (finished) return;
    if (previousTime !== null) elapsed += now - previousTime;
    previousTime = now;
    if (elapsed >= duration) { finish(); return; }
    const position = easeInOut(elapsed / duration) * (order.length - 1);
    const index = Math.min(order.length - 2, Math.floor(position));
    reveal(order[index], order[index + 1], position - index);
    frame = requestAnimationFrame(tick);
  }
  // A background tab pauses playback; returning to it does not skip the entire reveal.
  document.addEventListener('visibilitychange', () => {
    if (finished) {
      if (document.hidden) {
        hiddenAt = performance.now();
        cancelAnimationFrame(interactionFrame); interactionFrame = 0;
      } else {
        if (transition && hiddenAt !== null) transition.start += performance.now() - hiddenAt;
        hiddenAt = null;
        if (transition && !interactionFrame) interactionFrame = requestAnimationFrame(interactionTick);
      }
      return;
    }
    if (story.dataset.playback !== 'playing') return;
    cancelAnimationFrame(frame); previousTime = null;
    if (!document.hidden) frame = requestAnimationFrame(tick);
  });
  motion.addEventListener('change', () => {
    if (!motion.matches) return;
    if (!finished) finish();
    else moveTo(hovering ? pointerPosition : nearestRGB(), 0);
  });
  show(0);
  Promise.all([...story.querySelectorAll('img')].map(image => image.decode())).then(() => {
    story.dataset.ready = 'true';
    if (motion.matches || !maskSupported || finished) { finish(); return; }
    story.dataset.playback = 'playing';
    if (!document.hidden) frame = requestAnimationFrame(tick);
  }).catch(() => {
    finish(); story.dataset.ready = 'error';
  });
}
