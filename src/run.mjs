import { pathToFileURL } from "node:url";
import { solve } from "./solve.mjs";

const EXPECTED_SLUGS = [
  "palavra", "dupla", "quadra", "bandeira", "pais", "capital", "mosaico", "rota",
  "calor", "mundo", "elo", "sentido", "colmeia", "rainhas", "rainhas-9", "rainhas-10",
];

export function dateKeyInBrasilia(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function configFromEnv(env = process.env) {
  const cookie = env.RODADA_COOKIE;
  if (!cookie || !/(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/.test(cookie) || /[\r\n]/.test(cookie)) {
    throw new Error("Configure RODADA_COOKIE com o cookie de sessão da sua conta de teste");
  }
  if (/[^\x00-\xFF]/.test(cookie)) {
    throw new Error("RODADA_COOKIE contém um caractere inválido (por exemplo, …). Copie o valor completo do cookie, sem abreviações");
  }
  const base = env.RODADA_BASE_URL || "https://rodada.io";
  let url;
  try { url = new URL(base); } catch { throw new Error("RODADA_BASE_URL inválida"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("RODADA_BASE_URL deve ser a origem HTTPS do site, sem caminho ou parâmetros");
  }
  const sourceRef = env.RODADA_SOURCE_REF || "db4239a0aa42a8c4a65c47c7eaf2f68cce17217d";
  if (!/^[a-f0-9]{40}$/.test(sourceRef)) throw new Error("RODADA_SOURCE_REF deve ser um commit SHA de 40 caracteres");
  return { cookie, base: url.origin, seed: env.RODADA_SEED || "rodada-dev", sourceRef, expectedEmail: env.RODADA_EXPECTED_EMAIL };
}

export async function run({ env = process.env, fetcher = fetch, solver = solve, now = new Date() } = {}) {
  const { cookie, base, seed, sourceRef, expectedEmail } = configFromEnv(env);
  const dateKey = dateKeyInBrasilia(now);
  async function request(path, body) {
    const response = await fetcher(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Cookie: cookie, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(45_000),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}${response.status === 401 ? " (sessão expirada; renove o cookie)" : ""}`);
    return json;
  }

  const me = await request("/api/me");
  if (!me || !Array.isArray(me.records)) throw new Error("/api/me não retornou a lista de partidas");
  if (expectedEmail && me.email?.toLowerCase() !== expectedEmail.toLowerCase()) throw new Error("Cookie pertence a outra conta");
  const played = new Set(me.records.filter((record) => record.dateKey === dateKey).map((record) => record.slug));
  if (EXPECTED_SLUGS.every((slug) => played.has(slug))) return { dateKey, created: 0, existing: 16 };

  const guesses = await solver({ dateKey, seed, sourceRef, fetcher });
  if (Object.keys(guesses).length !== 16 || EXPECTED_SLUGS.some((slug) => !Array.isArray(guesses[slug]))) {
    throw new Error("O cálculo não retornou os 16 jogos");
  }
  const results = [];
  for (const slug of EXPECTED_SLUGS) {
    if (played.has(slug)) { results.push({ slug, state: "existing" }); continue; }
    if (slug === "mundo") {
      const started = await request("/api/plays/start", { slug, dateKey });
      if (!started?.startedAt || Date.now() - new Date(started.startedAt).getTime() > 15 * 60_000) throw new Error("Relógio do Mundo não iniciou corretamente");
    }
    const receipt = await request("/api/plays", { slug, dateKey, guesses: guesses[slug] });
    if (receipt?.play?.slug !== slug || receipt.play.dateKey !== dateKey || receipt.play.status !== "won") {
      throw new Error(`${slug}: partida não foi vencida; confira seed e versão dos dados`);
    }
    results.push({ slug, state: "created" });
  }
  return { dateKey, created: results.filter((item) => item.state === "created").length, existing: results.filter((item) => item.state === "existing").length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = configFromEnv();
    if (process.argv.includes("--check")) console.log(JSON.stringify({ ok: true, base: config.base, dateKey: dateKeyInBrasilia() }));
    else console.log(JSON.stringify(await run()));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
