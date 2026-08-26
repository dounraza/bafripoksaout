const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = 3000;
const here = __dirname;
const root = fs.existsSync(path.join(here, "public"))
  ? path.join(here, "public")
  : (path.basename(here) === "public" ? here : here);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = http.createServer(function (req, res) {
  let url = decodeURIComponent((req.url || "/").split("?")[0]);
  if (url === "/") url = "/lobby.html";
  const file = path.normalize(path.join(root, url));
  if (file.indexOf(root) !== 0) {
    res.writeHead(403);
    return res.end("interdit");
  }
  fs.readFile(file, function (err, data) {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Introuvable : " + url);
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", function () {
  console.log("");
  console.log("  ========================================");
  console.log("   Afripoks pret pour le telephone");
  console.log("  ========================================");
  console.log("  Sur le PC :     http://localhost:" + PORT + "/lobby.html");
  const ifs = os.networkInterfaces();
  Object.keys(ifs).forEach(function (name) {
    ifs[name].forEach(function (n) {
      if (n.family === "IPv4" && !n.internal) {
        console.log("  Sur le tel :    http://" + n.address + ":" + PORT + "/lobby.html");
      }
    });
  });
  console.log("  Laisse cette fenetre ouverte.");
  console.log("");
});