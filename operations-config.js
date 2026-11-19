// Public service location. An empty string uses this site's own Cloudflare API.
window.READY_SETCO = Object.freeze({
  apiBase: location.hostname === "auraofintelligence.github.io"
    ? "https://ready-setco.auraofintelligence.workers.dev" : ""
});
