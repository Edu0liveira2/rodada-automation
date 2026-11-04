import { pathToFileURL } from "node:url";

const EXPECTED_SLUGS = [
  "palavra", "dupla", "quadra", "bandeira", "pais", "capital", "mosaico", "rota",
  "calor", "mundo", "elo", "sentido", "colmeia", "rainhas", "rainhas-9", "rainhas-10",
];

export function dateKeyInBrasilia(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function configFromEnv(env = process.env) {
  const secret = env.RODADA_AUTOMATION_SECRET;
  if (!secret || secret.length < 32) throw new Error("RODADA_AUTOMATION_SECRET deve ter pelo menos 32 caracteres");

  const rawUrl = env.RODADA_AUTOMATION_URL || "https://rodada.io/api/automation/daily";
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error("RODADA_AUTOMATION_URL inválida"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("RODADA_AUTOMATION_URL deve usar HTTPS");
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/api/automation/daily") {
    throw new Error("RODADA_AUTOMATION_URL deve apontar para /api/automation/daily sem credenciais ou parâmetros");
  }
  return { secret, url: url.toString() };
}

export function validateReceipt(receipt, dateKey) {
  if (!receipt || receipt.dateKey !== dateKey || !Array.isArray(receipt.results)) {
    throw new Error("Resposta do Rodada inválida ou de outro dia");
  }
  const slugs = new Set();
  for (const result of receipt.results) {
    if (!result || !EXPECTED_SLUGS.includes(result.slug) || slugs.has(result.slug)) {
      throw new Error("Resposta do Rodada contém jogo desconhecido ou repetido");
    }
    if (!["created", "existing"].includes(result.state)) {
      throw new Error(`Resultado inválido para ${result.slug}`);
    }
    slugs.add(result.slug);
  }
  if (slugs.size !== EXPECTED_SLUGS.length) {
    throw new Error(`Rodada incompleta: ${slugs.size}/${EXPECTED_SLUGS.length} jogos`);
  }
  return receipt.results;
}

export async function run({ env = process.env, fetcher = fetch, now = new Date() } = {}) {
  const { secret, url } = configFromEnv(env);
  const dateKey = dateKeyInBrasilia(now);
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Idempotency-Key": `rodada-${dateKey}`,
    },
    body: JSON.stringify({ dateKey }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Rodada respondeu HTTP ${response.status}`);
  const receipt = await response.json().catch(() => null);
  const results = validateReceipt(receipt, dateKey);
  return { dateKey, created: results.filter((item) => item.state === "created").length, existing: results.filter((item) => item.state === "existing").length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { url } = configFromEnv();
    if (process.argv.includes("--check")) {
      console.log(JSON.stringify({ ok: true, url, dateKey: dateKeyInBrasilia() }));
    } else {
      console.log(JSON.stringify(await run()));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
