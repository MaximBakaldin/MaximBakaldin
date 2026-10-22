export type Theme = "system" | "light" | "dark";
export const styles = [
  { id: "classic", name: "Классический" },
  { id: "blue", name: "Графит и синий" },
  { id: "sand", name: "Тёплый песок" },
  { id: "plum", name: "Слива" },
  { id: "forest", name: "Хвойный" },
] as const;
export type ColorStyle = (typeof styles)[number]["id"];
export type AppearancePreferences = { theme: Theme; style: ColorStyle };
const changedEvent = "family-budget:appearance";
const key = (user: string) => `family-budget.appearance.${user}`;
export function readAppearance(user: string): AppearancePreferences {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(user)) ?? "null");
    const saved = raw && typeof raw === "object" ? raw : {};
    // Preserve the pre-palette theme until this account makes its own choice.
    const theme =
      "theme" in saved
        ? saved.theme
        : localStorage.getItem("family-budget.theme");
    const style = "style" in saved ? saved.style : "classic";
    return {
      theme: theme === "light" || theme === "dark" ? theme : "system",
      style: styles.some((s) => s.id === style)
        ? (style as ColorStyle)
        : "classic",
    };
  } catch {
    return { theme: "system", style: "classic" };
  }
}
export function saveAppearance(user: string, value: AppearancePreferences) {
  localStorage.setItem(key(user), JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(changedEvent, { detail: user }));
}
export function subscribeAppearance(user: string, update: () => void) {
  const storage = (e: StorageEvent) => {
    if (e.key === null || e.key === key(user)) update();
  };
  const changed = (e: Event) => {
    if ((e as CustomEvent<string>).detail === user) update();
  };
  window.addEventListener("storage", storage);
  window.addEventListener(changedEvent, changed);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(changedEvent, changed);
  };
}
export function applyTheme({ theme, style }: AppearancePreferences) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.style = style;
  const background = getComputedStyle(document.documentElement)
    .getPropertyValue("--bg")
    .trim();
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", background || (dark ? "#111916" : "#f5f8f6"));
}
export function watchTheme(user: string) {
  const system = window.matchMedia?.("(prefers-color-scheme: dark)");
  const update = () => applyTheme(readAppearance(user));
  update();
  const unsubscribe = subscribeAppearance(user, update);
  system?.addEventListener("change", update);
  return () => {
    system?.removeEventListener("change", update);
    unsubscribe();
  };
}
