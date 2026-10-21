import { useEffect, useState } from "react";
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const check = () =>
      setInstalled(
        media.matches ||
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          ),
      );
    const before = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const after = () => {
      setInstalled(true);
      setPrompt(null);
      setHelp(false);
    };
    check();
    media.addEventListener("change", check);
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", after);
    return () => {
      media.removeEventListener("change", check);
      window.removeEventListener("beforeinstallprompt", before);
      window.removeEventListener("appinstalled", after);
    };
  }, []);
  async function install() {
    if (!prompt) {
      setHelp((value) => !value);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
    } catch {
      setError("Установите приложение через меню браузера.");
      setHelp(true);
      setPrompt(null);
    } finally {
      setBusy(false);
    }
  }
  if (installed) return null;
  return (
    <aside className="install-app" aria-label="Установка приложения">
      <div className="install-title">
        <div>
          <b>Бюджет под рукой</b>
          <small>Добавьте на главный экран телефона</small>
        </div>
        <button
          className="secondary"
          disabled={busy}
          aria-expanded={help}
          onClick={() => void install()}
        >
          {busy ? "Подождите…" : prompt ? "Установить" : "Как установить"}
        </button>
      </div>
      {help && (
        <div className="install-help">
          <p>
            <b>Android · Chrome</b>
            <br />
            Меню ⋮ → «Установить приложение» или «Добавить на главный экран».
          </p>
          <p>
            <b>iPhone · Safari</b>
            <br />
            «Поделиться» → «На экран Домой». Если есть «Открывать как
            веб-приложение», включите его и нажмите «Добавить».
          </p>
          <small>
            Откройте опубликованную HTTPS-ссылку в браузере телефона. Для общего
            бюджета нужен интернет.
          </small>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}
