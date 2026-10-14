/* Slides reader — reading analytics (ES module), ported from the PhD public reader
 * (phd-tapio/public-viewer/activity.js).
 *
 * Sends reader behaviour to MyPublicAnalytics through viewer.html's track()
 * (window.mypa.send → Worker /collect → D1, site 'agentic-discovery-deck').
 * One PDF page is one slide, so every event carries the slide too:
 *   page  = printed page number (the dashboard's per-session reader view keys on it)
 *   slide = slide id (same in FI and EN, so the two editions can be summed), title
 *
 * Events (all with surface 'deck-pdf', doc 'fi' | 'en'):
 *   page_view       reader settled on a slide (≥ SETTLE_MS)           {page, slide, title, from, method}
 *   page_dwell      left a slide after ≥ DWELL_MIN_MS                 {page, slide, title, ms, active_ms, scroll_ms}
 *   nav             explicit navigation                               {method: next|prev|key|input|link|search|deeplink, page, from}
 *   zoom            zoom changed                                      {zoom}
 *   signin / signout
 *   heartbeat       every HEARTBEAT_MS while visible and active       {page, active_ms, pages_seen, max_page, …}
 *   engagement_end  tab hidden / page closed                          {visible_ms, active_ms, scroll_ms, pages_seen, max_page,
 *                                                                      last_page, zooms, num_pages, reason}
 * The viewer's own events (viewer_open, viewer_download, viewer_search, comment_* …) are unchanged.
 */
export function initActivity(R, CFG, track) {
  if (!CFG || CFG.analytics === false || typeof track !== 'function') return null;
  const SETTLE_MS = 800, DWELL_MIN_MS = 2500, HEARTBEAT_MS = 60000, IDLE_MS = 15000, SCROLL_GAP_MS = 1200;
  const stage = document.getElementById('stage');

  const now = () => Date.now();
  const t = {
    start: now(), lastActivity: now(), lastVisible: now(), visibleMs: 0, activeMs: 0,
    scrollMs: 0, scrollEvents: 0, lastScroll: 0,
    page: R.currentPage() || 1, pageSince: now(), pageActiveMs: 0, pageScrollMs: 0,
    pagesSeen: new Set(), maxPage: 1, zooms: 0, settleTimer: 0,
  };

  // page → {slide, title} from the edition's labels (slide-id anchors written by publish_public.mjs)
  function slideOf(phys) {
    const L = R.labels || {}, pr = R.printed(phys);
    for (const k in L) if (L[k] && L[k].page === pr) return { slide: k, title: String(L[k].title || '').slice(0, 80) };
    return {};
  }
  const send = (ev, extra) => track(ev, Object.assign({ surface: 'deck-pdf' }, extra || {}));
  const pageInfo = (phys) => Object.assign({ page: R.printed(phys) }, slideOf(phys));

  /* ---- activity / visibility accounting ---- */
  function tick() {
    const n = now();
    if (document.visibilityState === 'visible') {
      t.visibleMs += n - t.lastVisible;
      if (n - t.lastActivity < IDLE_MS) { t.activeMs += n - t.lastVisible; t.pageActiveMs += n - t.lastVisible; }
    }
    t.lastVisible = n;
  }
  for (const e of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'])
    window.addEventListener(e, () => { t.lastActivity = now(); }, { passive: true, capture: true });
  setInterval(tick, 1000);

  if (stage) stage.addEventListener('scroll', () => {
    const n = now();
    t.scrollEvents++;
    if (t.lastScroll && n - t.lastScroll < SCROLL_GAP_MS) { t.scrollMs += n - t.lastScroll; t.pageScrollMs += n - t.lastScroll; }
    t.lastScroll = n;
  }, { passive: true });

  /* ---- slide dwell ---- */
  // Only the slide the reader SETTLES on (SETTLE_MS without change) gets a page_view,
  // attributed to the pending navigation method; intermediate slides passed while
  // scrolling never reach DWELL_MIN_MS.
  let settled = t.page, pendingMethod = null, pendingUntil = 0;
  function leavePage(next) {
    tick();
    const ms = now() - t.pageSince;
    if (ms >= DWELL_MIN_MS) send('page_dwell', Object.assign(pageInfo(t.page), { ms, active_ms: t.pageActiveMs, scroll_ms: t.pageScrollMs }));
    t.page = next; t.pageSince = now(); t.pageActiveMs = 0; t.pageScrollMs = 0;
    t.maxPage = Math.max(t.maxPage, next);
    clearTimeout(t.settleTimer);
    t.settleTimer = setTimeout(() => {
      const method = (pendingMethod && now() < pendingUntil) ? pendingMethod : 'scroll';
      pendingMethod = null;
      const from = settled; settled = next; t.pagesSeen.add(next);
      if (from !== next) send('page_view', Object.assign(pageInfo(next), { from: R.printed(from), method }));
    }, SETTLE_MS);
  }
  t.pagesSeen.add(t.page);
  send('page_view', Object.assign(pageInfo(t.page), { from: null, method: 'load' }));
  R.on('nav', (d) => { pendingMethod = d.method; pendingUntil = now() + 2500; send('nav', { method: d.method, page: R.printed(d.from || t.page), from: R.printed(d.from || t.page) }); });
  R.on('page', (d) => { if (d.page !== t.page) leavePage(d.page); });
  R.on('zoom', (d) => { t.zooms++; send('zoom', { zoom: d.zoom }); });
  window.addEventListener('cf-auth-change', (e) => send(e.detail && e.detail.signedIn ? 'signin' : 'signout', {}));

  /* ---- heartbeat + engagement_end ---- */
  function summary(reason) {
    tick();
    return {
      reason, page: R.printed(t.page), visible_ms: t.visibleMs, active_ms: t.activeMs, total_ms: now() - t.start,
      scroll_ms: t.scrollMs, scroll_events: t.scrollEvents, pages_seen: t.pagesSeen.size, max_page: R.printed(t.maxPage),
      last_page: R.printed(t.page), zooms: t.zooms, num_pages: R.numPages || 0,
    };
  }
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (now() - t.lastActivity > HEARTBEAT_MS * 2) return;   // idle tab: stay quiet
    send('heartbeat', summary('heartbeat'));
  }, HEARTBEAT_MS);
  let hiddenSent = false;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (!hiddenSent) {
        hiddenSent = true; tick();
        const ms = now() - t.pageSince;   // close the current slide's dwell too
        if (ms >= DWELL_MIN_MS) send('page_dwell', Object.assign(pageInfo(t.page), { ms, active_ms: t.pageActiveMs, scroll_ms: t.pageScrollMs }));
        t.pageSince = now(); t.pageActiveMs = 0; t.pageScrollMs = 0;
        send('engagement_end', summary('hidden'));
      }
    } else { hiddenSent = false; t.lastVisible = now(); t.lastActivity = now(); }
  });
  window.addEventListener('pagehide', () => { if (!hiddenSent) { hiddenSent = true; send('engagement_end', summary('pagehide')); } });

  return { summary };
}
