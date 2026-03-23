import "./styles.css";

import { renderDesktopApp } from "./bootstrap/renderDesktopApp";

const container = document.getElementById("root");

if (!container) {
  throw new Error('Desktop app root container "#root" was not found.');
}

renderDesktopApp(container);
