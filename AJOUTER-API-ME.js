const fs = require("fs");
const path = require("path");

const root = fs.existsSync(path.join(process.cwd(), "package.json"))
  ? process.cwd()
  : path.join(process.cwd(), "..");

const candidates = ["server.js", "app.js", "index.js", path.join("server", "index.js"), path.join("src", "server.js")];
const file = candidates.map((f) => path.join(root, f)).find((f) => fs.existsSync(f));

function injectBridge() {
  const pub = path.join(root, "public");
  const tag = '<script src="afripoks-bridge.js"></script>';
  for (const name of ["connexion.html", "inscription.html", "index.html", "mot-de-passe-oublie.html"]) {
    const p = path.join(pub, name);
    if (!fs.existsSync(p)) continue;
    let html = fs.readFileSync(p, "utf8");
    if (html.includes("afripoks-bridge.js")) continue;
    if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, tag + "\n</body>");
    else html += "\n" + tag;
    fs.writeFileSync(p, html);
    console.log("Pont ajoute dans", name);
  }
}

injectBridge();

if (!file) {
  console.log("server.js introuvable — le pont des pages est deja pose.");
  process.exit(0);
}

let src = fs.readFileSync(file, "utf8");
if (!src.includes("/api/me")) {
  const hook = `
// --- Afripoks : session + compte ---
app.get("/api/me", (req, res) => {
  const s = req.session || {};
  const u = s.user || s.joueur || s.player || s.compte || req.user || null;
  if (!u) return res.status(401).json({ ok: false, user: null });
  res.json({ ok: true, user: u });
});
app.post("/api/logout", (req, res) => {
  if (req.session) req.session.destroy(() => res.json({ ok: true }));
  else res.json({ ok: true });
});
app.post("/api/account", (req, res) => {
  if (!req.session) return res.status(401).json({ ok: false });
  req.session.user = Object.assign({}, req.session.user || req.session.joueur || {}, req.body || {});
  res.json({ ok: true, user: req.session.user });
});
`;
  if (/app\.listen\s*\(/.test(src)) src = src.replace(/app\.listen\s*\(/, hook + "\napp.listen(");
  else if (/server\.listen\s*\(/.test(src)) src = src.replace(/server\.listen\s*\(/, hook + "\nserver.listen(");
  else src += "\n" + hook;
  fs.writeFileSync(file, src);
  console.log("API /api/me ajoutee dans", file);
} else {
  console.log("OK : /api/me existe deja");
}
console.log("Redemarre le serveur (ferme la fenetre noire, puis npm start).");
console.log("Puis reconnecte-toi une fois via connexion.html");
