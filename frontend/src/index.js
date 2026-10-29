import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// PWA service worker — auto-update quando arriva una nuova versione
if ("serviceWorker" in navigator) {
  // Snapshot del controller PRIMA della registrazione: se null al load vuol
  // dire che e' la prima installazione; evita il reload extra causato da
  // clients.claim() quando il SW prende il controllo per la prima volta.
  const hadControllerAtLoad = Boolean(navigator.serviceWorker.controller);

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Quando il SW trova una nuova versione, attivala subito senza aspettare
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              sw.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch((err) => console.warn("SW registration failed:", err));

    // Quando il SW prende il controllo, ricarica per usare gli asset nuovi.
    // Al primo install (nessun controller precedente) NON ricarichiamo:
    // il reload sarebbe inutile e confonderebbe l'utente.
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing || !hadControllerAtLoad) {
        refreshing = true;
        return;
      }
      refreshing = true;
      window.location.reload();
    });
  });
}
