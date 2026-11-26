// Solo in sviluppo: i metadati OAuth per gli assistenti IA stanno sul server
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(createProxyMiddleware("/.well-known", { target: "http://localhost:8001", changeOrigin: false, xfwd: true }));
};
