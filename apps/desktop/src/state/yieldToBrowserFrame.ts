export function yieldToBrowserFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(() => {
        resolve();
      });
      return;
    }

    globalThis.setTimeout(resolve, 0);
  });
}
