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
  function movementPlan(from, to) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    // Walking belongs to a little patch of ground, not a flight across the reading text.
    if (distance < 4) return { kind: 'still', duration: 0 };
    if (distance > 150 || Math.abs(to.y - from.y) > 45) return { kind: 'arrive', duration: 650 };
    return { kind: 'walk', duration: clamp(distance / 78 * 1000, 750, 1900) };
  }
  if (typeof module !== 'undefined') module.exports = { clampPoint, choosePerch, movementPlan };
  if (typeof document === 'undefined') return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = motion.matches;
  let hidden = false;
  let current = null;
  let moving = null;
  let scrollTimer;
  let gestureTimer;
  let wanderTimer;
  let viewportChanging = false;
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
    <div class="companion-panel" id="companion-panel" role="region" aria-label="Little Sophie's note" hidden>
      <button class="companion-close" aria-label="Close Sophie's note">×</button>
      <p class="companion-hello">Hi, I’m little Sophie ♡</p>
      <p class="companion-message"></p>
      <div class="companion-actions">
        <button data-action="wave">Do a happy hop ✧</button>
        <button data-action="stroll">Take a little stroll →</button>
        <a class="companion-surprise" href="/#journal">Pick a story for me →</a>
        <a href="/#subscribe">Letters from my table →</a>
      </div>
      <div class="companion-settings"><button data-action="pause"></button><button data-action="hide">Hide Sophie</button></div>
    </div>
    <button class="companion-avatar" aria-label="Say hello to little Sophie" aria-expanded="false" aria-controls="companion-panel">
      <span class="companion-sparkle" aria-hidden="true">✧</span>
      <svg class="companion-character" viewBox="0 0 84 100" aria-hidden="true">
        <defs>
          <linearGradient id="sophie-skin" x1="0" y1="0" x2="0.7" y2="1"><stop stop-color="#ffe0c6"/><stop offset="1" stop-color="#e9bda3"/></linearGradient>
          <linearGradient id="sophie-dress" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d4e4c7"/><stop offset="1" stop-color="#9cb98d"/></linearGradient>
          <linearGradient id="sophie-hair" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#44434e"/><stop offset=".5" stop-color="#252731"/><stop offset="1" stop-color="#353440"/></linearGradient>
        </defs>
        <ellipse class="companion-shadow" cx="42" cy="96" rx="21" ry="3" fill="#969985" opacity=".25"/>
        <g class="companion-facing">
        <g class="companion-person" stroke="#66594f" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
          <g class="companion-leg companion-leg-left">
            <path d="M35 75v10" stroke="#edc3a7" stroke-width="6"/>
            <g class="companion-shin companion-shin-left"><path d="M35 84v7" stroke="#edc3a7" stroke-width="5.7"/><g class="companion-foot companion-foot-left"><path d="M32 90q3 2 6 0l1 5H27q-3-4 5-5Z" fill="#cb9388"/><path d="M30 93h6" stroke="#fce1d5"/></g></g>
          </g>
          <g class="companion-leg companion-leg-right">
            <path d="M49 75v10" stroke="#edc3a7" stroke-width="6"/>
            <g class="companion-shin companion-shin-right"><path d="M49 84v7" stroke="#edc3a7" stroke-width="5.7"/><g class="companion-foot companion-foot-right"><path d="M46 90q3 2 6 0 8 1 5 5H45Z" fill="#cb9388"/><path d="M48 93h6" stroke="#fce1d5"/></g></g>
          </g>
          <g class="companion-torso">
            <path class="companion-hair-back" d="M22 28Q20 6 42 6t20 22l-1 21q-7 6-13-1H33q-8 5-11 0Z" fill="url(#sophie-hair)" stroke="#34333d"/>
            <g class="companion-arm companion-arm-left"><path d="M29 51l-6 10" stroke="#edc3a7" stroke-width="5.5"/><g class="companion-forearm-left"><path d="M23 60l-1 9" stroke="#edc3a7" stroke-width="5.5"/><ellipse cx="22" cy="70" rx="3" ry="3.5" fill="#f0c6ac" stroke="none"/></g></g>
            <g class="companion-arm companion-arm-right"><path d="M55 51l6 10" stroke="#edc3a7" stroke-width="5.5"/><g class="companion-forearm-right"><path d="M61 60l1 9" stroke="#edc3a7" stroke-width="5.5"/><ellipse cx="62" cy="70" rx="3" ry="3.5" fill="#f0c6ac" stroke="none"/></g></g>
            <path d="M38 42v7q4 5 8 0v-7" fill="url(#sophie-skin)"/>
            <path d="M31 47l7-1q4 5 8 0l7 1 1 12H30Z" fill="url(#sophie-dress)" stroke="#788e6d"/>
            <path d="M30 47q-5 1-5 8l7 2m22-10q5 1 5 8l-7 2" fill="#d8e6cb" stroke="#788e6d"/>
            <g class="companion-skirt"><path d="M30 58h24l8 21q-20 9-40 0Z" fill="url(#sophie-dress)" stroke="#788e6d"/><path d="M32 63l-4 14m13-14v15m11-15 4 14" fill="none" stroke="#829b77" opacity=".4"/><path d="M25 79q17 6 34 0" fill="none" stroke="#f7f4df" stroke-width="2"/>
              <g stroke="none" fill="#fffdf0"><path d="M32 66q-4-4-5 0-1 3 3 3-2 4 2 4 4 0 2-4 4 0 3-3-1-4-5 0Z"/><path d="M48 69q-4-4-5 0-1 3 3 3-2 4 2 4 4 0 2-4 4 0 3-3-1-4-5 0Z"/><circle cx="32" cy="68" r="1.1" fill="#deb877"/><circle cx="48" cy="71" r="1.1" fill="#deb877"/></g>
            </g>
            <path d="M39 57l3 2 3-2m-3 2-2 5m2-5 2 5" fill="none" stroke="#f5f0dd" stroke-width="1.5"/>
            <g class="companion-head">
              <ellipse cx="42" cy="28" rx="18" ry="19.5" fill="url(#sophie-skin)" stroke="#c69881"/>
              <ellipse cx="29" cy="35" rx="4" ry="2.4" fill="#e79a95" opacity=".48" stroke="none"/><ellipse cx="55" cy="35" rx="4" ry="2.4" fill="#e79a95" opacity=".48" stroke="none"/>
              <path d="M30 24q3-2 6 0m12 0q3-2 6 0" fill="none" stroke="#51423e" stroke-width="1.2"/>
              <g class="companion-eyes" stroke="none">
                <ellipse cx="33" cy="29.5" rx="3.5" ry="4.3" fill="#fff8ef"/><ellipse cx="51" cy="29.5" rx="3.5" ry="4.3" fill="#fff8ef"/>
                <ellipse cx="33.5" cy="30" rx="2.4" ry="3.2" fill="#403c42"/><ellipse cx="50.5" cy="30" rx="2.4" ry="3.2" fill="#403c42"/>
                <circle cx="32.7" cy="28.6" r="1" fill="white"/><circle cx="49.7" cy="28.6" r="1" fill="white"/>
                <path d="M29.7 27.5l-1.5-1m25.5 1 1.5-1" stroke="#51423e" stroke-width="1.1"/>
              </g>
              <path d="M41 33q1 1.2 2 0" fill="none" stroke="#cb987f"/>
              <path class="companion-smile" d="M38.5 37q3.5 3 7 0" fill="none" stroke="#a36563" stroke-width="1.4"/>
              <path class="companion-happy-mouth" d="M38.5 36.5q3.5 1.5 7 0c0 6-7 6-7 0Z" fill="#a56566" stroke="none"/>
              <g class="companion-bangs"><path d="M42 10C33 5 22 12 23 28q8-1 12-8 3-1 7-10c4 9 7 9 9 12q4 5 10 5C61 12 52 5 42 10Z" fill="url(#sophie-hair)" stroke="#34333d"/><path d="M40 12q-5 0-9 7m13-7q5 1 9 8" fill="none" stroke="#76707d" opacity=".45"/><path d="M42 11v3" stroke="#d7af96" stroke-width=".8"/></g>
              <path d="M58 16q5-5 8 0l-4 3q6 4 2 6l-6-6-4 4q-5-3 1-7Z" fill="#d9a09a" stroke="#ad7876" stroke-width=".8"/><circle cx="59" cy="18.5" r="1.6" fill="#f4cbc1" stroke="none"/>
            </g>
          </g>
        </g>
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
  // Forward Tab order is trigger → note controls, without trapping page navigation.
  companion.append(panel);

  function focusWithoutScrolling(element) {
    element.focus({ preventScroll: true });
  }

  function preferences() {
    companion.hidden = hidden;
    restore.hidden = !hidden;
    pauseButton.textContent = motion.matches ? 'Reduced motion is on' : paused ? 'Let Sophie roam' : 'Pause roaming';
    pauseButton.disabled = motion.matches;
    companion.querySelector('[data-action="stroll"]').disabled = motion.matches;
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
    companion.style.opacity = '1';
    companion.classList.remove('is-running', 'is-arriving');
  }
  function pickStory() {
    const posts = (window.POSTS || []).filter(post => `/posts/${encodeURIComponent(post.id)}` !== location.pathname);
    const link = companion.querySelector('.companion-surprise');
    if (posts.length) {
      const post = posts[Math.floor(Math.random() * posts.length)];
      link.href = `/posts/${encodeURIComponent(post.id)}`;
    }
  }
  function position(wander = false, stroll = false) {
    if (hidden || !panel.hidden || viewportChanging) return;
    const candidates = perches.map(perch => ({ ...perch, ...rectangle(perch.element) }));
    // The heading is a mobile-only perch; the desktop sidebar has a dedicated spot.
    const visible = candidates.filter(perch => !(perch.name === 'journal' && innerWidth > 850));
    const target = choosePerch(visible, innerHeight);
    if (!target) {
      stopMovement();
      companion.style.visibility = 'hidden';
      return;
    }
    const wasVisible = getComputedStyle(companion).visibility === 'visible';
    companion.style.visibility = 'visible';
    current = target;
    const offset = stroll ? (companion.getBoundingClientRect().left >= target.left ? -24 : 24) : wander ? (Math.random() - .5) * 52 : 0;
    const point = clampPoint({ x: target.left + offset, y: target.top }, innerWidth, innerHeight);
    const destination = `translate(${point.x}px, ${point.y}px)`;
    const old = companion.getBoundingClientRect();
    const plan = movementPlan({ x: old.left, y: old.top }, point);
    stopMovement();
    const start = companion.style.transform;
    if (plan.kind === 'walk') companion.classList.toggle('faces-left', point.x < old.left);
    const animate = start && (!paused || stroll) && !motion.matches && plan.kind !== 'still';
    if (!animate) {
      companion.style.transform = destination;
    } else {
      const walking = wasVisible && plan.kind === 'walk';
      companion.classList.add(walking ? 'is-running' : 'is-arriving');
      // Local walks stay grounded. Distant perches use a soft exit/arrival instead
      // of making Sophie glide or sprint through the middle of an article.
      const frames = walking ? [{ transform: start }, { transform: destination }] : [
        { transform: start, opacity: wasVisible ? 1 : 0, offset: 0 },
        { transform: start, opacity: 0, offset: .4 },
        { transform: destination, opacity: 0, offset: .45 },
        { transform: destination, opacity: 1, offset: 1 },
      ];
      moving = companion.animate(frames, { duration: walking ? plan.duration : 650, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      const active = moving;
      moving.finished.then(() => {
        if (moving !== active) return;
        companion.style.transform = destination;
        active.cancel();
        moving = null;
        companion.classList.remove('is-running', 'is-arriving');
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
    gestureTimer = setTimeout(() => companion.classList.remove('is-hopping'), 1300);
  }
  avatar.addEventListener('click', () => { setOpen(panel.hidden); if (!panel.hidden) hop(); });
  companion.querySelector('.companion-close').addEventListener('click', () => { setOpen(false); focusWithoutScrolling(avatar); position(); });
  companion.querySelector('[data-action="wave"]').addEventListener('click', hop);
  companion.querySelector('[data-action="stroll"]').addEventListener('click', () => {
    if (motion.matches) return;
    clearTimeout(gestureTimer);
    companion.classList.remove('is-hopping');
    setOpen(false);
    focusWithoutScrolling(avatar);
    position(false, true);
  });
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
    focusWithoutScrolling(restore);
  });
  restore.addEventListener('click', () => {
    hidden = false;
    preferences();
    try { sessionStorage.removeItem('sophie-companion-hidden'); } catch {}
    position();
    focusWithoutScrolling(avatar);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { setOpen(false); focusWithoutScrolling(avatar); position(); }
  });
  document.addEventListener('click', event => {
    if (!panel.hidden && !companion.contains(event.target)) { setOpen(false); position(); }
  });
  function queuePosition() {
    if (!panel.hidden) setOpen(false);
    // Fixed-position artwork must not stay over scrolling text at its old perch.
    viewportChanging = true;
    stopMovement();
    companion.style.visibility = 'hidden';
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => { viewportChanging = false; position(); }, 140);
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
  window.addEventListener('pageshow', event => { if (event.persisted) { viewportChanging = false; position(); wander(); } });
  preferences();
  position();
  window.addEventListener('load', () => position(), { once: true });
  wanderTimer = setTimeout(wander, 14000);
})();
