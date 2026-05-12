const axios = require("axios");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const reply = (statusCode, body) => ({
  statusCode,
  headers: CORS,
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return reply(405, { error: "Method Not Allowed." });

  let url, appName, packageId;
  try { ({ url, appName, packageId } = JSON.parse(event.body || "{}")); } catch { return reply(400, { error: "Invalid JSON." }); }

  const { GH_TOKEN, GH_OWNER, GH_REPO } = process.env;
  if (!GH_TOKEN || !GH_OWNER || !GH_REPO) return reply(500, { error: "Server misconfiguration." });

  const dispatchUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/dispatches`;

  try {
    await axios.post(dispatchUrl, {
      event_type: "build-apk",
      client_payload: { url, appName, packageId: packageId || "" }
    }, {
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });
  } catch (err) { return reply(500, { error: "GitHub API error." }); }

  return reply(200, { success: true, message: "Build triggered!" });
};
