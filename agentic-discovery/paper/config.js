/* The Agentic Probe — paper reader, runtime config (classic script, loaded first in <head>).
 *
 * Copied from agentic-articles/phd-tapio/public-viewer (the thesis reader) on 2026-10-13 and adapted:
 * English UI, own site tag, the 13 October 2026 edition of the paper. talk/tools/build.mjs copies this
 * folder to dist/paper/ and the PDF next to it. No secrets here: the Google client id and the MyPA
 * endpoint are public by design.
 */
window.PHD_VIEWER_CONFIG = {
  // The paper edition, next to index.html in dist/paper/ (built from paper/editions/2026-10-13/).
  pdfUrl: './agentic-probe-2026-10-13.pdf',
  title: 'The Agentic Probe — paper, 13 October 2026',
  edition: '2026-10-13',

  // ---- Feedback + analytics (the existing MyPublicAnalytics Cloudflare Worker) ----
  // Comments POST as event:'feedback' with this site; readers' actions (page_view, page_dwell, zoom,
  // search, links, comments, sign-in, heartbeat, engagement_end) go to the same site via activity.js.
  // The player and the slides use the same site tag with extra.page = 'player' / 'slides'.
  site: 'Agentic-Probe',
  collectEndpoint: 'https://mypa.longshoreforrest.workers.dev/collect',
  analytics: true,

  // ---- Google Sign-In (Google Identity Services) ----
  // Same client id the MyPA Worker verifies. REQUIRES this page's origin under the client's
  // "Authorized JavaScript origins" in Google Cloud Console: https://mypages.longshore.fi
  googleClientId: '605639423178-s3pu2m6mkf9r50u69709u0mhchf0ha97.apps.googleusercontent.com',
  identityKey: 'unitas:identity',
  requireSignIn: true,
  // Owner view (🗂): these accounts see every reader's comment. The Worker enforces the same rule once
  // 'Agentic-Probe' is in FEEDBACK_PRIVATE_SITES.
  ownerEmails: ['longshoreforrest@gmail.com'],
  feedbackEndpoint: 'https://mypa.longshoreforrest.workers.dev/feedback',

  dictationLang: 'en-US',
  audioEndpoint: '',

  buildVersion: '2026-10-13.mv62bmat',
};
