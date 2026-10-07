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
      <svg class="companion-character" viewBox="0 0 84 100" aria-hidden="true">
        <ellipse class="companion-shadow" cx="42" cy="96" rx="15" ry="2" fill="#969985" opacity=".18"/>
        <g class="companion-facing">
        <g class="companion-person" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <g class="companion-leg companion-leg-left">
            <path d="M42 70l-7 14"/>
            <g class="companion-shin companion-shin-left"><path d="M35 84v9"/><g class="companion-foot companion-foot-left"><path d="M35 93h-4"/></g></g>
          </g>
          <g class="companion-leg companion-leg-right">
            <path d="M42 70l7 14"/>
            <g class="companion-shin companion-shin-right"><path d="M49 84v9"/><g class="companion-foot companion-foot-right"><path d="M49 93h4"/></g></g>
          </g>
          <g class="companion-torso">
            <path d="M42 42v28"/>
            <g class="companion-arm companion-arm-left"><path d="M42 49l-19 11"/><g class="companion-forearm-left"><path d="M23 60l-1 9"/></g></g>
            <g class="companion-arm companion-arm-right"><path d="M42 49l19 11"/><g class="companion-forearm-right"><path d="M61 60l1 9"/></g></g>
            <g class="companion-head">
              <circle cx="42" cy="28" r="13" fill="var(--cream)"/>
              <g class="companion-eyes" fill="var(--ink)" stroke="none">
                <circle cx="38" cy="29" r=".9"/><circle cx="46" cy="29" r=".9"/>
              </g>
              <path class="companion-smile" d="M40 34q2 2 4 0" stroke-width="1.2"/>
              <path class="companion-happy-mouth" d="M39 33q3 4 6 0" stroke-width="1.2"/>
              <g class="companion-bangs"><path d="M28 26c-2-20 30-20 28 0m-14-13q-4 10-12 11m12-11q4 10 12 11M28 26v21m28-21v21"/></g>
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
