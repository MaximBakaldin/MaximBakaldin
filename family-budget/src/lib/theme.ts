export type Theme = "system" | "light" | "dark";
export function readTheme(): Theme {
  try {
    const value = localStorage.getItem("family-budget.theme");
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}
export function applyTheme(theme = readTheme()) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#111916" : "#f5f8f6");
}
export function watchTheme() {
  const system = window.matchMedia?.("(prefers-color-scheme: dark)");
  const update = () => applyTheme();
  update();
  system?.addEventListener("change", update);
  window.addEventListener("storage", update);
  return () => {
    system?.removeEventListener("change", update);
    window.removeEventListener("storage", update);
  };
}
