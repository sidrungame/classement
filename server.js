const express = require("express");
const WebSocket = require("ws");
const axios = require("axios");

const app = express();
app.use(express.json());

// ==========================
// CORS
// ==========================
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "*");
  next();
});

// ==========================
// ENV
// ==========================
const GITHUB_USER = process.env.GITHUB_USER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// ==========================
// DATA
// ==========================
let classements = {};

// ==========================
// GITHUB HELPERS
// ==========================
function encode(str) {
  return Buffer.from(str, "utf-8").toString("base64");
}

function decode(str) {
  return Buffer.from(str, "base64").toString("utf-8");
}

// ==========================
// LOAD CLASSEMENTS (STARTUP)
// ==========================
async function loadClassements() {
  try {
    const res = await axios.get(
      `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/classements.txt`,
      { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
    );

    const content = decode(res.data.content);
    classements = JSON.parse(content);

    console.log("Classements chargés depuis GitHub");
  } catch (err) {
    console.log("Aucun fichier existant, départ à vide");
    classements = {};
  }
}

// ==========================
// SAVE CLASSEMENTS (GITHUB)
// ==========================
async function saveClassements() {
  try {
    const content = JSON.stringify(classements, null, 2);

    const getRes = await axios.get(
      `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/classements.txt`,
      { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
    ).catch(() => null);

    const sha = getRes?.data?.sha;

    await axios.put(
      `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/classements.txt`,
      {
        message: "Update leaderboard",
        content: encode(content),
        ...(sha ? { sha } : {})
      },
      { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
    );

    console.log("Leaderboard sauvegardé GitHub");
  } catch (err) {
    console.error("Erreur save GitHub:", err.message);
  }
}

// ==========================
// LEADERBOARD PAGE
// ==========================
app.get("/leaderboard", (req, res) => {

  let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Leaderboard</title>
<style>
body { font-family: Arial; background:#0f0f0f; color:white; padding:20px; }
h1 { text-align:center; }
.cat { max-width:600px; margin:20px auto; background:#1a1a1a; padding:15px; border-radius:10px; }
.row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #333; }
</style>
</head>
<body>
<h1>🏆 Leaderboard</h1>
`;

  for (const cat in classements) {
    html += `<div class="cat"><h2>${cat}</h2>`;

    classements[cat]
      .slice(0, 20)
      .forEach((e, i) => {
        html += `
          <div class="row">
            <span>${i + 1}. ${e.pseudo}</span>
            <b>${e.score}</b>
          </div>
        `;
      });

    html += `</div>`;
  }

  html += `
<script>
setTimeout(() => location.reload(), 3000);
</script>
</body>
</html>
`;

  res.send(html);
});

// ==========================
// HEALTHCHECK
// ==========================
app.get("/", (req, res) => {
  res.send("Leaderboard server OK");
});

// ==========================
// SERVER
// ==========================
const server = app.listen(process.env.PORT || 8080, () => {
  console.log("Server started");
});

// ==========================
// WEBSOCKET
// ==========================
const wss = new WebSocket.Server({ server });

wss.on("connection", ws => {

  ws.on("message", msg => {

    const message = msg.toString().trim();

    // =========================
    // CL|category/score/pseudo
    // =========================
    if (message.startsWith("CL|")) {

      const [cat, score, pseudo] = message.slice(3).split("/");

      if (!cat || !pseudo || isNaN(score)) {
        ws.send("format error");
        return;
      }

      if (!classements[cat]) classements[cat] = [];

      let list = classements[cat];

      const existing = list.find(e => e.pseudo === pseudo);

      if (existing) {
        if (parseInt(score) > existing.score) {
          existing.score = parseInt(score);
        }
      } else {
        list.push({ pseudo, score: parseInt(score) });
      }

      list.sort((a, b) => b.score - a.score);
      classements[cat] = list.slice(0, 20);

      ws.send("ok");
      return;
    }

    // =========================
    // CLDEL|category/pseudo
    // =========================
    if (message.startsWith("CLDEL|")) {

      const [cat, pseudo] = message.slice(6).split("/");

      if (!classements[cat]) {
        ws.send("no category");
        return;
      }

      classements[cat] = classements[cat]
        .filter(e => e.pseudo !== pseudo);

      ws.send("deleted");
      return;
    }

    ws.send("unknown command");
  });
});

// ==========================
// INIT LOAD
// ==========================
loadClassements();

// ==========================
// AUTO SAVE EVERY 5 MIN
// ==========================
setInterval(() => {
  saveClassements();
}, 5 * 60 * 1000);
