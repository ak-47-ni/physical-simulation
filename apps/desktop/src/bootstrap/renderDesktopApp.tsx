import { createRoot, type Root } from "react-dom/client";

import { App } from "../App";

export function renderDesktopApp(container: HTMLElement): Root {
  const root = createRoot(container);

  root.render(<App />);

  return root;
}
