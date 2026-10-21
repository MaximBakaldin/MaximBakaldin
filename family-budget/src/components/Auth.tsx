import { useState } from "react";
import { client } from "../db";
import { appUrl } from "../lib/urls";
import { InstallApp } from "./InstallApp";
export function Auth({
  recovery = false,
  onRecovered,
}: {
  recovery?: boolean;
  onRecovered?: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const auth = client().auth;
      const result = recovery
        ? await auth.updateUser({ password })
        : mode === "reset"
          ? await auth.resetPasswordForEmail(email, {
              redirectTo: appUrl(),
            })
          : mode === "signup"
            ? await auth.signUp({
                email,
                password,
                options: { emailRedirectTo: appUrl() },
              })
            : await auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setPassword("");
      if (recovery) onRecovered?.();
      else if (mode === "reset")
        setNotice(
          "Если аккаунт существует, письмо для сброса пароля отправлено.",
        );
      else if (mode === "signup")
        setNotice(
          "Регистрация отправлена. Проверьте почту, если требуется подтверждение.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить запрос");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="shell auth">
      <div className="brand">СЕМЕЙНЫЙ БЮДЖЕТ</div>
      <h1>
        {recovery
          ? "Новый пароль"
          : mode === "signup"
            ? "Начнём вместе"
            : mode === "reset"
              ? "Восстановить доступ"
              : "Рада вас видеть"}
      </h1>
      <p>Общие расходы, понятные планы и больше спокойствия.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {!recovery && (
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        {(recovery || mode !== "reset") && (
          <label>
            Пароль
            <input
              type="password"
              minLength={recovery || mode === "signup" ? 8 : undefined}
              required
              autoComplete={
                mode === "login" && !recovery
                  ? "current-password"
                  : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        <button disabled={busy}>
          {busy
            ? "Подождите…"
            : recovery
              ? "Сохранить пароль"
              : mode === "login"
                ? "Войти"
                : mode === "signup"
                  ? "Создать аккаунт"
                  : "Отправить письмо"}
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!recovery && (
        <div className="authlinks">
          <button
            className="ghost"
            onClick={() => {
              setMode(mode === "signup" ? "login" : "signup");
              setError("");
            }}
          >
            {mode === "signup" ? "Уже есть аккаунт" : "Создать аккаунт"}
          </button>
          <button
            className="ghost"
            onClick={() => setMode(mode === "reset" ? "login" : "reset")}
          >
            {mode === "reset" ? "Вернуться ко входу" : "Забыли пароль?"}
          </button>
        </div>
      )}
      <InstallApp />
    </main>
  );
}
