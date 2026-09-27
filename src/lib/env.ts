/** Server env, whichever way the runtime hands it over (Vite's import.meta.env locally, process.env on Vercel). */
export function readEnv(name: string): string {
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return meta?.[name] ?? process.env[name] ?? '';
}
