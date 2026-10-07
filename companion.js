/* Little Sophie: a quiet, optional illustrated companion. No tracking or chat service. */
(() => {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function clampPoint(point, width, height) {
    return { x: clamp(point.x, 12, Math.max(12, width - 96)), y: clamp(point.y, 12, Math.max(12, height - 132)) };
  }
  function choosePerch(perches, height) {
    return perches.filter(perch => perch.visible !== false && perch.top >= 0 && perch.bottom <= height)
      .sort((a, b) => Math.abs(a.top - height * .6) - Math.abs(b.top - height * .6))[0];
  }
  if (typeof module !== 'undefined') module.exports = { clampPoint, choosePerch };
  if (typeof document === 'undefined') return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = motion.matches;
  let hidden = false;
  let current = null;
  let moving = null;
  let scrollTimer;
  let gestureTimer;
  let wanderTimer;
  try {
    hidden = sessionStorage.getItem('sophie-companion-hidden') === 'yes';
    paused ||= sessionStorage.getItem('sophie-companion-paused') === 'yes';
  } catch { /* Storage is optional. */ }

  const perches = [];
  const locations = [
    ['.hero-image-wrap', 'hero', 'Always room for one more at the table.'],
    ['.sidebar-tools', 'sidebar', 'Looking for a good meal? I can pick a story for you.'],
    ['.section-heading', 'journal', 'A few good meals, and all the little details.'],
    ['.newsletter', 'letters', 'Want a little note when there’s a new entry?'],
    ['.about-margin', 'about', 'Thanks for stopping by my little corner.'],
    ['.article-letter', 'article', 'That was a good one. Shall we read another?'],
  ];
  for (const [selector, name, message] of locations) {
    const host = document.querySelector(selector);
    if (!host) continue;
    const perch = document.createElement('span');
    perch.className = `companion-perch companion-perch-${name}`;
    perch.setAttribute('aria-hidden', 'true');
    host.classList.add(`companion-stage-${name}`);
    host.append(perch);
    perches.push({ element: perch, name, message });
  }
  if (!perches.length) return;

  const companion = document.createElement('div');
  companion.className = 'sophie-companion';
  companion.innerHTML = `
    <div class="companion-panel" id="companion-panel" hidden>
      <button class="companion-close" aria-label="Close Sophie's note">×</button>
      <p class="companion-hello">Hi, I’m little Sophie ♡</p>
      <p class="companion-message"></p>
      <div class="companion-actions">
        <button data-action="wave">Do a happy hop ✧</button>
        <a class="companion-surprise" href="/#journal">Pick a story for me →</a>
        <a href="/#subscribe">Letters from my table →</a>
      </div>
      <div class="companion-settings"><button data-action="pause"></button><button data-action="hide">Hide Sophie</button></div>
    </div>
    <button class="companion-avatar" aria-label="Say hello to little Sophie" aria-expanded="false" aria-controls="companion-panel">
      <span class="companion-sparkle" aria-hidden="true">✧</span>
      <svg class="companion-character" viewBox="0 0 84 100" aria-hidden="true">
        <ellipse class="companion-shadow" cx="42" cy="94" rx="24" ry="4" fill="#c9c6b7" opacity=".45"/>
        <g class="companion-person" stroke="#484a3c" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <g class="companion-leg companion-leg-left"><path d="M34 75v13" fill="none" stroke="#b78062" stroke-width="6"/><path d="M34 86l-9 3q-3 5 4 5h10v-7" fill="#a45d48"/></g>
          <g class="companion-leg companion-leg-right"><path d="M50 75v13" fill="none" stroke="#b78062" stroke-width="6"/><path d="M50 86l9 3q3 5-4 5H45v-7" fill="#a45d48"/></g>
          <path d="M23 24Q22 7 42 7t19 19l-1 25q-5 4-10-1H31q-5 5-9 0Z" fill="#252622"/>
          <path d="M33 43h18l3 13 7 23q-19 7-38 0l7-23Z" fill="#c0cdae"/>
          <path d="M33 43q9 12 18 0M31 57h22" fill="none" stroke="#798f69"/>
          <g stroke="none" fill="#fff7e9"><path d="M33 67l1-3 1 3 3 1-3 1-1 3-1-3-3-1Z"/><path d="M47 59l1-3 1 3 3 1-3 1-1 3-1-3-3-1Z"/><path d="M49 75l1-3 1 3 3 1-3 1-1 3-1-3-3-1Z"/></g>
          <path d="M26 51l-7 17" fill="none" stroke="#dbac88" stroke-width="7"/>
          <g class="companion-arm"><path d="M56 52l10-8 1-13" fill="none" stroke="#dbac88" stroke-width="7"/><path d="M63 30l2-5m3 5 2-5" fill="none" stroke="#dbac88" stroke-width="3"/></g>
          <ellipse cx="42" cy="29" rx="16" ry="18" fill="#e6b795"/>
          <path d="M26 25q-1-18 16-18t16 18q-6 2-9-2t-7-10q-3 8-7 8t-9 4Z" fill="#252622"/>
          <path d="M42 10v4m-2 0q-2 7-6 8m10-8q2 7 6 8" fill="none" stroke="#57574b" stroke-width="1"/>
          <g class="companion-eyes" stroke-width="2.7"><path d="M36 29v1m12-1v1"/></g>
          <path d="M39 36q3 3 6 0" fill="none"/>
          <path d="M30 34h3m18 0h3" stroke="#cc857a" stroke-width="3"/>
          <path d="M58 14l5-2-1 7-4-2-4 2v-7Z" fill="#a45d48"/>
        </g>
      </svg>
      <span class="companion-label">little Sophie</span>
    </button>`;
  const restore = document.createElement('button');
  restore.className = 'companion-restore';
  restore.textContent = 'Show little Sophie ♡';
  document.body.append(companion, restore);
  const avatar = companion.querySelector('.companion-avatar');
  const panel = companion.querySelector('.companion-panel');
  const message = companion.querySelector('.companion-message');
  const pauseButton = companion.querySelector('[data-action="pause"]');

  function preferences() {
    companion.hidden = hidden;
    restore.hidden = !hidden;
    pauseButton.textContent = motion.matches ? 'Reduced motion is on' : paused ? 'Let Sophie roam' : 'Pause roaming';
    pauseButton.disabled = motion.matches;
    pauseButton.setAttribute('aria-pressed', String(paused));
    companion.classList.toggle('is-paused', paused || motion.matches);
  }
  function setOpen(open) {
    panel.hidden = !open;
    avatar.setAttribute('aria-expanded', String(open));
    if (open) {
      stopMovement();
      message.textContent = current?.message || 'Pull up a chair. There’s always a story to share.';
      pickStory();
      layoutPanel();
    }
  }
  function layoutPanel() {
    const anchor = companion.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const below = anchor.top < box.height + 22;
    const desiredTop = below ? anchor.bottom + 22 : anchor.top - box.height - 15;
    panel.style.top = `${clamp(desiredTop, 8, Math.max(8, innerHeight - box.height - 8)) - anchor.top}px`;
    panel.style.left = `${clamp(anchor.left + 84 - box.width, 8, Math.max(8, innerWidth - box.width - 8)) - anchor.left}px`;
    panel.style.bottom = 'auto';
    panel.style.right = 'auto';
    companion.classList.toggle('panel-below', below);
  }
  function stopMovement() {
    if (moving) {
      const transform = getComputedStyle(companion).transform;
      moving.cancel();
      companion.style.transform = transform;
      moving = null;
    }
    companion.classList.remove('is-running');
  }
  function pickStory() {
    const posts = (window.POSTS || []).filter(post => `/posts/${encodeURIComponent(post.id)}` !== location.pathname);
    const link = companion.querySelector('.companion-surprise');
    if (posts.length) {
      const post = posts[Math.floor(Math.random() * posts.length)];
      link.href = `/posts/${encodeURIComponent(post.id)}`;
    }
  }
  function position(wander = false) {
    if (hidden || !panel.hidden) return;
    const candidates = perches.map(perch => ({ ...perch, ...rectangle(perch.element) }));
    // The heading is a mobile-only perch; the desktop sidebar has a dedicated spot.
    const visible = candidates.filter(perch => !(perch.name === 'journal' && innerWidth > 850));
    const target = choosePerch(visible, innerHeight);
    if (!target) {
      companion.style.visibility = 'hidden';
      return;
    }
    companion.style.visibility = 'visible';
    current = target;
    const point = clampPoint({ x: target.left + (wander ? (Math.random() - .5) * 52 : 0), y: target.top }, innerWidth, innerHeight);
    const destination = `translate(${point.x}px, ${point.y}px)`;
    const old = companion.getBoundingClientRect();
    const distance = Math.hypot(point.x - old.left, point.y - old.top);
    stopMovement();
    const start = companion.style.transform;
    companion.classList.toggle('faces-left', point.x < old.left);
    const animate = start && !paused && !motion.matches && distance > 4;
    if (!animate) {
      companion.style.transform = destination;
    } else {
      companion.classList.add('is-running');
      const duration = clamp(distance * 2, 450, 1100);
      moving = companion.animate([
        { transform: start },
        { transform: `translate(${(old.left + point.x) / 2}px, ${Math.min(old.top, point.y) - 22}px)`, offset: .5 },
        { transform: destination },
      ], { duration, easing: 'ease-in-out', fill: 'forwards' });
      const active = moving;
      moving.finished.then(() => {
        if (moving !== active) return;
        companion.style.transform = destination;
        active.cancel();
        moving = null;
        companion.classList.remove('is-running');
      }).catch(() => {});
    }
    // Keep the note safely inside the viewport, even at the top or left edge.
    companion.classList.toggle('panel-below', point.y < 245);
    companion.classList.toggle('panel-right', point.x < 240);
  }
  function rectangle(element) {
    const box = element.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, left: box.left, visible: box.width > 0 && box.height > 0 };
  }
  function hop() {
    clearTimeout(gestureTimer);
    companion.classList.remove('is-hopping');
    if (motion.matches) {
      message.textContent = 'A little happy hello from me to you ♡';
      return;
    }
    // Restart the small gesture for repeated, deliberate user clicks.
    void avatar.offsetWidth;
    companion.classList.add('is-hopping');
    gestureTimer = setTimeout(() => companion.classList.remove('is-hopping'), 850);
  }
  avatar.addEventListener('click', () => { setOpen(panel.hidden); if (!panel.hidden) hop(); });
  companion.querySelector('.companion-close').addEventListener('click', () => { setOpen(false); avatar.focus(); position(); });
  companion.querySelector('[data-action="wave"]').addEventListener('click', hop);
  pauseButton.addEventListener('click', () => {
    paused = !paused;
    stopMovement();
    preferences();
    try { sessionStorage.setItem('sophie-companion-paused', paused ? 'yes' : 'no'); } catch {}
  });
  companion.querySelector('[data-action="hide"]').addEventListener('click', () => {
    hidden = true;
    setOpen(false);
    stopMovement();
    preferences();
    try { sessionStorage.setItem('sophie-companion-hidden', 'yes'); } catch {}
    restore.focus();
  });
  restore.addEventListener('click', () => {
    hidden = false;
    preferences();
    try { sessionStorage.removeItem('sophie-companion-hidden'); } catch {}
    position();
    avatar.focus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { setOpen(false); avatar.focus(); position(); }
  });
  document.addEventListener('click', event => {
    if (!panel.hidden && !companion.contains(event.target)) { setOpen(false); position(); }
  });
  function queuePosition() {
    if (!panel.hidden) setOpen(false);
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => position(), 140);
  }
  window.addEventListener('scroll', queuePosition, { passive: true });
  window.addEventListener('resize', queuePosition);
  motion.addEventListener('change', () => { if (motion.matches) paused = true; stopMovement(); preferences(); position(); });
  function wander() {
    if (!document.hidden && !hidden && !paused && !motion.matches && panel.hidden) position(true);
    wanderTimer = setTimeout(wander, 14000);
  }
  // Don't keep animation timers alive when this page is leaving or in the back-forward cache.
  window.addEventListener('pagehide', () => { clearTimeout(wanderTimer); clearTimeout(scrollTimer); clearTimeout(gestureTimer); stopMovement(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { position(); wander(); } });
  preferences();
  position();
  window.addEventListener('load', () => position(), { once: true });
  wanderTimer = setTimeout(wander, 14000);
})();
