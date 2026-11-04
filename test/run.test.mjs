import assert from "node:assert/strict";
import { test } from "node:test";
import { configFromEnv, dateKeyInBrasilia, run, validateReceipt } from "../src/run.mjs";

const secret = "x".repeat(32);
const slugs = [
  "palavra", "dupla", "quadra", "bandeira", "pais", "capital", "mosaico", "rota",
  "calor", "mundo", "elo", "sentido", "colmeia", "rainhas", "rainhas-9", "rainhas-10",
];

test("usa a data de Brasilia mesmo perto da virada UTC", () => {
  assert.equal(dateKeyInBrasilia(new Date("2026-11-05T02:01:00Z")), "2026-11-04");
  assert.equal(dateKeyInBrasilia(new Date("2026-11-05T03:01:00Z")), "2026-11-05");
});

test("recusa segredo curto e URL sem HTTPS", () => {
  assert.throws(() => configFromEnv({ RODADA_AUTOMATION_SECRET: "short" }), /32 caracteres/);
  assert.throws(() => configFromEnv({ RODADA_AUTOMATION_SECRET: secret, RODADA_AUTOMATION_URL: "http://rodada.io/api/automation/daily" }), /HTTPS/);
});

test("envia uma chamada para o dia, autentica e exige os 16 resultados", async () => {
  const now = new Date("2026-11-05T03:01:00Z");
  let calls = 0;
  const result = await run({
    env: { RODADA_AUTOMATION_SECRET: secret, RODADA_AUTOMATION_URL: "https://rodada.io/api/automation/daily" },
    now,
    fetcher: async (url, options) => {
      calls++;
      assert.equal(url, "https://rodada.io/api/automation/daily");
      assert.equal(options.headers.Authorization, `Bearer ${secret}`);
      assert.equal(options.headers["Idempotency-Key"], "rodada-2026-11-05");
      assert.deepEqual(JSON.parse(options.body), { dateKey: "2026-11-05" });
      return Response.json({ dateKey: "2026-11-05", results: slugs.map((slug) => ({ slug, state: "created" })) });
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { dateKey: "2026-11-05", created: 16, existing: 0 });
});

test("nao relata sucesso se um jogo falhar ou faltar", () => {
  assert.throws(() => validateReceipt({ dateKey: "2026-11-05", results: slugs.slice(1).map((slug) => ({ slug, state: "created" })) }, "2026-11-05"), /incompleta/);
  assert.throws(() => validateReceipt({ dateKey: "2026-11-05", results: slugs.map((slug) => ({ slug, state: "failed" })) }, "2026-11-05"), /Resultado invalido|Resultado inválido/);
});
