import assert from "node:assert/strict";
import { test } from "node:test";
import { configFromEnv, dateKeyInBrasilia, run } from "../src/run.mjs";
import { GAME_SLUGS } from "../src/solve.mjs";

const env = { RODADA_COOKIE: "better-auth.session_token=token-de-teste", RODADA_EXPECTED_EMAIL: "teste@example.com" };
const now = new Date("2026-11-05T03:01:00Z");

test("usa a data de Brasília na virada UTC", () => {
  assert.equal(dateKeyInBrasilia(new Date("2026-11-05T02:01:00Z")), "2026-11-04");
  assert.equal(dateKeyInBrasilia(now), "2026-11-05");
});

test("exige cookie e URL HTTPS", () => {
  assert.throws(() => configFromEnv({}), /RODADA_COOKIE/);
  assert.throws(() => configFromEnv({ ...env, RODADA_COOKIE: "better-auth.session_token=abc…xyz" }), /caractere inválido/);
  assert.throws(() => configFromEnv({ ...env, RODADA_BASE_URL: "http://rodada.io" }), /HTTPS/);
  assert.throws(() => configFromEnv({ ...env, RODADA_SOURCE_REF: "db4239a0aa42a8c4a65c47c7eaf2f68cce17217d" }), /antigo/);
});

test("joga os 21 pela API pública usando a sessão existente", async () => {
  const calls = [];
  const result = await run({ env, now, solver: async () => Object.fromEntries(GAME_SLUGS.map((slug) => [slug, ["resposta"]])), fetcher: async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, options });
    if (path === "/api/me") return Response.json({ email: "teste@example.com", records: [] });
    const body = JSON.parse(options.body);
    if (path === "/api/plays/start") return Response.json({ startedAt: new Date().toISOString() });
    const scale = ["escala", "escala-paises"].includes(body.slug);
    return Response.json({ play: { slug: body.slug, dateKey: body.dateKey, status: scale ? "done" : "won", nota: scale ? 100 : 90 } });
  } });
  assert.deepEqual(result, { dateKey: "2026-11-05", created: 21, existing: 0 });
  assert.equal(calls.filter((call) => call.path === "/api/plays").length, 21);
  assert.equal(calls.filter((call) => call.path === "/api/plays/start").length, 1);
  assert.ok(calls.every((call) => call.options.headers.Cookie === env.RODADA_COOKIE));
});

test("não envia partidas se o cookie for de outra conta", async () => {
  await assert.rejects(run({ env, now, solver: async () => { throw new Error("não deveria calcular"); }, fetcher: async () => Response.json({ email: "outro@example.com", records: [] }) }), /outra conta/);
});

test("para ao receber uma derrota", async () => {
  let sent = 0;
  await assert.rejects(run({ env, now, solver: async () => Object.fromEntries(GAME_SLUGS.map((slug) => [slug, ["resposta"]])), fetcher: async (url, options) => {
    const path = new URL(url).pathname;
    if (path === "/api/me") return Response.json({ email: "teste@example.com", records: [] });
    if (path === "/api/plays/start") return Response.json({ startedAt: new Date().toISOString() });
    sent++;
    const body = JSON.parse(options.body);
    return Response.json({ play: { slug: body.slug, dateKey: body.dateKey, status: "lost" } });
  } }), /resultado inesperado/);
  assert.equal(sent, 1);
});

test("não aceita Escala sem nota máxima", async () => {
  const already = GAME_SLUGS.filter((slug) => slug !== "escala").map((slug) => ({ slug, dateKey: "2026-11-05" }));
  await assert.rejects(run({ env, now, solver: async () => Object.fromEntries(GAME_SLUGS.map((slug) => [slug, ["resposta"]])), fetcher: async (url) => {
    if (new URL(url).pathname === "/api/me") return Response.json({ email: "teste@example.com", records: already });
    return Response.json({ play: { slug: "escala", dateKey: "2026-11-05", status: "done", nota: 99 } });
  } }), /resultado inesperado/);
});
