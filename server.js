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
let couleursCategories = {};

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

  let allPlayers = [];

  for (const cat in classements) {
    classements[cat].forEach(player => {
      allPlayers.push({
        categorie: cat,
        pseudo: player.pseudo,
        score: player.score
      });
    });
  }

  allPlayers.sort((a, b) => b.score - a.score);

  let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Leaderboard</title>

<style>

body{
  margin:0;
  background:#0f0f0f;
  color:white;
  font-family:Arial;
  padding:20px;
}

h1{
  text-align:center;
  margin-bottom:30px;
  font-size:40px;
}

.search{
  width:100%;
  max-width:700px;
  margin:0 auto 10px auto;
  display:block;
  padding:12px;
  border:none;
  border-radius:10px;
  background:#1f1f1f;
  color:white;
  font-size:16px;
}

/* indications colonnes */
.columns{
  max-width:900px;
  margin:0 auto 15px auto;
  display:grid;
  grid-template-columns:80px 1fr 120px;
  align-items:center;
  padding:0 15px;
  opacity:0.7;
  font-size:14px;
  text-transform:uppercase;
  letter-spacing:1px;
}

.column-rank{
  text-align:left;
}

.column-player{
  text-align:left;
}

.column-score{
  text-align:right;
}

.board{
  max-width:900px;
  margin:auto;
}

.row{
  display:flex;
  justify-content:space-between;
  align-items:center;
  background:#1a1a1a;
  margin-bottom:10px;
  padding:15px;
  border-radius:10px;
  border-left:6px solid transparent;
  transition:0.2s;
}

.row:hover{
  transform:scale(1.01);
}

.left{
  display:flex;
  flex-direction:column;
}

.rank{
  font-size:15px;
  font-weight:bold;
  opacity:0.7;
}

.pseudo{
  font-size:15px;
  font-weight:bold;
}

/* catégorie en gros + couleur */
.category{
  margin-top:5px;
  font-size:18px;
  font-weight:bold;
  text-transform:uppercase;
  padding:4px 10px;
  border-radius:8px;
  width:fit-content;
}

</style>
</head>

<body>

<h1>🏆 Leaderboard sidrungame</h1>

<input
  id="search"
  class="search"
  placeholder="Rechercher pseudo, catégorie ou score..."
  oninput="filterBoard()"
/>

<!-- indications colonnes -->
<div class="columns">

  <div class="column-rank">
    Position
  </div>

  <div class="column-player">
    Joueur / Catégorie
  </div>

  <div class="column-score">
    Scores
  </div>

</div>

<div class="board" id="board">
`;

  allPlayers.forEach((p, i) => {

    html += `
<div class="row searchable">

  <div class="left">

    <div class="rank">
      #${i + 1}
    </div>

    <div class="pseudo">
      ${p.pseudo}
    </div>

    <div
  class="category"
  style="background:${couleursCategories[p.categorie] || '#222'};"
>
  ${p.categorie}
</div>

  </div>

  <div class="score">
    ${p.score}
  </div>

</div>
`;

  });

  html += `
</div>

<script>

function filterBoard(){

  const value =
    document.getElementById("search")
    .value
    .toLowerCase();

  const rows =
    document.querySelectorAll(".searchable");

  rows.forEach(row => {

    if(row.innerText.toLowerCase().includes(value)){
      row.style.display = "flex";
    } else {
      row.style.display = "none";
    }

  });
}

// refresh toutes les 2 minutes
setTimeout(() => {
  location.reload();
}, 120000);

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
  
// =========================
// CCL|category/color
// =========================
if (message.startsWith("CCL|")) {

  const [cat, color] = message.slice(4).split("/");

  if (!cat || !color) {
    ws.send("format error");
    return;
  }

  couleursCategories[cat] = color;

  ws.send("color updated");
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
