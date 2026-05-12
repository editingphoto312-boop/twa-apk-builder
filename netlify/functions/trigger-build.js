// netlify/functions/trigger-build.js
// ─────────────────────────────────────────────────────────────────────────────
// Required Netlify Environment Variables (Site → Site configuration → Env vars):
//   GH_TOKEN  → GitHub Personal Access Token with "repo" scope
//   GH_OWNER  → Your GitHub username or org  (e.g. "john-doe")
//   GH_REPO   → Your GitHub repo name        (e.g. "twa-apk-generator")
// ─────────────────────────────────────────────────────────────────────────────

const axios = require("axios");

// CORS headers returned on every response
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// ── Helper: send JSON response ──────────────────────────────────────────────
const reply = (statusCode, body) => ({
  statusCode,
  headers: CORS,
  body: JSON.stringify(body),
});

// ── Main handler ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // Pre-flight CORS request (browser sends this before POST)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return reply(405, { error: "Method Not Allowed. Use POST." });
  }

  // ── 1. Parse & validate request body ──────────────────────────────────────
  let url, appName, packageId;
  try {
    ({ url, appName, packageId } = JSON.parse(event.body || "{}"));
  } catch {
    return reply(400, { error: "Invalid JSON body." });
  }

  if (!url || typeof url !== "string") {
    return reply(400, { error: "url is required." });
  }
  if (!appName || typeof appName !== "string") {
    return reply(400, { error: "appName is required." });
  }

  // Validate URL format
  let parsed;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    return reply(400, { error: "url must be a valid http/https URL." });
  }

  // Trim whitespace
  url     = url.trim();
  appName = appName.trim();

  // App name: max 30 chars, alphanumeric + spaces
  if (appName.length > 30) {
    return reply(400, { error: "appName must be 30 characters or fewer." });
  }

  // ── 2. Read environment config ─────────────────────────────────────────────
  const { GH_TOKEN, GH_OWNER, GH_REPO } = process.env;

  if (!GH_TOKEN || !GH_OWNER || !GH_REPO) {
    console.error("Missing env vars: GH_TOKEN, GH_OWNER, or GH_REPO");
    return reply(500, {
      error: "Server misconfiguration. Contact the site administrator.",
    });
  }

  // ── 3. Fire repository_dispatch to GitHub Actions ─────────────────────────
  const dispatchUrl =
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/dispatches`;

  try {
    await axios.post(
      dispatchUrl,
      {
        event_type: "build-apk",
        client_payload: {
          url,
          appName,
          packageId: packageId || "", // optional; auto-generated if blank
        },
      },
      {
        headers: {
          Authorization:       `Bearer ${GH_TOKEN}`,
          Accept:              "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type":      "application/json",
        },
        timeout: 10_000, // 10 s
      }
    );
  } catch (err) {
    const status  = err.response?.status;
    const message = err.response?.data?.message;

    console.error("GitHub API error:", status, message);

    if (status === 401 || status === 403) {
      return reply(500, {
        error: "GitHub authentication failed. Check the GH_TOKEN secret.",
      });
    }
    if (status === 404) {
      return reply(500, {
        error: "GitHub repo not found. Check GH_OWNER and GH_REPO.",
      });
    }
    if (status === 422) {
      return reply(500, {
        error:
          "GitHub rejected the dispatch. Make sure the workflow file exists " +
          "and uses `repository_dispatch` as a trigger.",
      });
    }

    return reply(500, {
      error: "Failed to contact GitHub. Please try again in a moment.",
    });
  }

  // ── 4. Success ─────────────────────────────────────────────────────────────
  const actionsUrl = `https://github.com/${GH_OWNER}/${GH_REPO}/actions`;

  return reply(200, {
    success: true,
    message: "Build triggered! Your APK will be ready in ~5–10 minutes.",
    actionsUrl,
    hint:
      "Open the Actions link, click the latest workflow run, then download " +
      "the APK from the Artifacts section at the bottom of the page.",
  });
};
