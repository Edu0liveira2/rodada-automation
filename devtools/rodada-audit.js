// Cole apenas este arquivo no Console em https://rodada.io, com uma conta de teste logada.
(async () => {
  if (location.hostname !== "rodada.io") throw new Error("Abra https://rodada.io");
  const seed = prompt("NEXT_PUBLIC_DAILY_SEED do deploy (se não configurada, use rodada-dev):", "rodada-dev");
  if (seed === null || !seed) return;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
const GAME_SLUGS = [
  "palavra", "dupla", "quadra", "bandeira", "pais", "capital", "mosaico", "rota",
  "calor", "mundo", "elo", "sentido", "colmeia", "rainhas", "rainhas-9", "rainhas-10",
  "grau", "escala", "escala-paises", "ordem", "trilha",
];

async function solve({ dateKey, seed = "rodada-dev", sourceRef = "445bb012ce63af3821d5e8117dbf1b8a552f69f7", fetcher = fetch }) {
  const root = `https://raw.githubusercontent.com/henriquegpb/rodada/${sourceRef}/`;
  const files = {
    countries: "games/_shared/geo/countries.json",
    borders: "games/_shared/geo/borders.json",
    words: "games/palavra/data/answers.json",
    tiers: "games/bandeira/data/tiers.json",
    capitals: "games/capital/data/capitals.json",
    elo: "games/elo/data/puzzles.json",
    sentido: "games/sentido/data/answers.json",
    colmeia: "games/colmeia/data/puzzles.json",
    rainhas8: "games/rainhas/data/8.json",
    rainhas9: "games/rainhas/data/9.json",
    rainhas10: "games/rainhas/data/10.json",
    animals: "games/escala/data/animals.json",
    shapes: "games/pais/data/shapes.json",
    stats: "games/ordem/data/stats.json",
    trilha: "games/trilha/data/boards.json"
  };
  const data = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => {
    const response = await fetcher(root + path);
    if (!response.ok) throw new Error(`Não consegui ler ${path}: ${response.status}`);
    return [key, await response.json()];
  })));
  const byCode = new Map(data.countries.map(c => [c.code, c]));
  const name = code => {
    const country = byCode.get(code);
    if (!country) throw new Error(`País desconhecido: ${code}`);
    return country.name;
  };
  function hash(input) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < input.length; i++) {
      const ch = input.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 ^ h1) >>> 0;
  }
  function rng(value) {
    let a = hash(value);
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(pool, random) {
    const out = [...pool];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  const day = Math.round((Date.parse(dateKey + "T00:00:00Z") - Date.parse("2026-10-22T00:00:00Z")) / 86400000);
  function pick(pool, slug) {
    const cycle = Math.floor(day / pool.length);
    const order = shuffle(pool, rng(`${seed}:${slug}:${cycle}`));
    return order[((day % pool.length) + pool.length) % pool.length];
  }
  function pickMany(pool, count, slug) {
    const perCycle = Math.floor(pool.length / count);
    const cycle = Math.floor(day / perCycle);
    const slot = ((day % perCycle) + perCycle) % perCycle;
    return shuffle(pool, rng(`${seed}:${slug}:${cycle}`)).slice(slot * count, slot * count + count);
  }
  const eligible = data.countries.filter(c => c.shapeEligible);
  const multi = (slug, size) => {
    const picked = [];
    for (let board = 0; board < size; board++) {
      let attempt = 0;
      let word = pick(data.words, `${slug}:${board}`);
      while (picked.includes(word)) word = pick(data.words, `${slug}:${board}:${++attempt}`);
      picked.push(word);
    }
    return picked;
  };
  const mix = [[1, 3], [2, 4], [3, 3]];
  const capitalAnswers = mix.flatMap(([tier, count]) => pickMany(
    data.capitals.filter(e => byCode.get(e.code)?.shapeEligible && e.tier === tier), count, `capital:${tier}`
  )).map(e => e.capital);
  const bandeiraAnswers = mix.flatMap(([tier, count]) => pickMany(data.tiers[tier], count, `bandeira:${tier}`)).map(name);
  const dist = from => {
    const seen = new Map([[from, 0]]), queue = [from];
    for (let i = 0; i < queue.length; i++) for (const next of data.borders[queue[i]] || []) {
      if (!seen.has(next)) { seen.set(next, seen.get(queue[i]) + 1); queue.push(next); }
    }
    return seen;
  };
  const codes = eligible.map(c => c.code).sort();
  const pairs = [];
  for (const a of codes) {
    const distances = dist(a);
    for (const b of codes) {
      const stops = (distances.get(b) ?? 0) - 1;
      if (a < b && stops >= 3 && stops <= 5) pairs.push([a, b]);
    }
  }
  const [a, b] = pick(pairs, "rota");
  const flip = rng(`${seed}:rota-sentido:${dateKey}`)() < 0.5;
  const [start, end] = flip ? [b, a] : [a, b];
  const back = dist(end);
  const route = [start];
  while (route.at(-1) !== end) {
    const current = route.at(-1);
    const next = [...data.borders[current]].sort().find(n => back.get(n) === back.get(current) - 1);
    if (!next) throw new Error("Falha ao calcular Rota");
    route.push(next);
  }
  const angles = Array.from({ length: 341 }, (_, i) => i + 10)
    .filter((angle) => Math.abs(angle - Math.round(angle / 90) * 90) >= 5);

  const stretched = new Set(["es", "pt", "fr", "us", "nl", "no", "ru", "dk", "fj", "ki", "ec", "gq", "ye", "cv", "st", "mu", "sc"]);
  const countrySize = (path, areaKm2) => {
    let area = 0;
    let minY = Infinity, maxY = -Infinity;
    for (const ring of path.split("Z").filter(Boolean)) {
      const points = ring.replace(/^M/, "").split(/[ML]/).map((point) => point.split(",").map(Number));
      let signed = 0;
      points.forEach(([x1, y1], i) => {
        const [x2, y2] = points[(i + 1) % points.length];
        signed += x1 * y2 - x2 * y1;
        minY = Math.min(minY, y1);
        maxY = Math.max(maxY, y1);
      });
      area += Math.abs(signed) / 2;
    }
    return Math.round((maxY - minY) * Math.sqrt(areaKm2 / area)) * 1000;
  };
  const escalaCountries = data.countries
    .filter((country) => country.shapeEligible && country.areaKm2 >= 50_000 && !stretched.has(country.code))
    .map((country) => ({ ...country, size: countrySize(data.shapes[country.code], country.areaKm2) }));

  const categories = ["area", "population", "gdp", "gdpPerCapita", "density", "lifeExpectancy"];
  const category = pick(categories, "ordem:categoria");
  const orderPool = data.countries.filter((country) => data.tiers["1"].includes(country.code) || data.tiers["2"].includes(country.code));
  const orderValue = (country) => {
    if (category === "area") return country.areaKm2;
    const stats = data.stats[country.code];
    if (!stats) return undefined;
    return category === "density" ? stats.population / country.areaKm2 : stats[category];
  };
  const pickedOrder = [];
  for (const country of shuffle(orderPool, rng(`${seed}:ordem:${dateKey}`))) {
    const value = orderValue(country);
    if (value === undefined) continue;
    if (pickedOrder.every((item) => category === "lifeExpectancy"
      ? Math.abs(item.value - value) >= 2.5
      : Math.max(item.value, value) / Math.min(item.value, value) >= 1.2)) {
      pickedOrder.push({ country, value });
    }
    if (pickedOrder.length === 5) break;
  }
  if (pickedOrder.length !== 5) throw new Error(`Ordem: não achei 5 países para ${dateKey}`);

  const trilha = pick(data.trilha, "trilha");
  let pathOffset = 1;
  const trilhaSegments = trilha.numbers.slice(1).map((target) => {
    const end = trilha.path.indexOf(target);
    if (end < pathOffset) throw new Error("Trilha: caminho inválido");
    const segment = trilha.path.slice(pathOffset, end + 1).join(",");
    pathOffset = end + 1;
    return segment;
  });
  if (pathOffset !== 49) throw new Error("Trilha: caminho incompleto");
  const guesses = {
    palavra: [pick(data.words, "palavra")],
    dupla: multi("dupla", 2),
    quadra: multi("quadra", 4),
    bandeira: bandeiraAnswers,
    pais: [name(pick(eligible, "pais").code)],
    capital: capitalAnswers,
    mosaico: [name(pick(data.countries, "mosaico").code)],
    rota: route.slice(1, -1).map(name),
    calor: [name(pick(eligible, "calor").code)],
    elo: pick(data.elo, "elo").groups.map(g => g.words.join("|")),
    sentido: [pick(data.sentido, "sentido")],
    colmeia: pick(data.colmeia, "colmeia").words,
    rainhas: pick(data.rainhas8, "rainhas").queens.map((c, row) => String(row * 8 + c)),
    "rainhas-9": pick(data.rainhas9, "rainhas-9").queens.map((c, row) => String(row * 9 + c)),
    "rainhas-10": pick(data.rainhas10, "rainhas-10").queens.map((c, row) => String(row * 10 + c)),
    mundo: data.countries.map(c => c.name),
    grau: [pick(angles, "grau:ler"), pick(angles, "grau:desenhar")].map(String),
    escala: pickMany(data.animals, 5, "escala").map((animal) => String(animal.size)),
    "escala-paises": pickMany(escalaCountries, 5, "escala-paises").map((country) => String(country.size)),
    ordem: [pickedOrder.sort((left, right) => right.value - left.value).map((item) => item.country.code).join(",")],
    trilha: trilhaSegments
  };
  return guesses;
}

  const guesses = await solve({ dateKey, seed });
  if (Object.keys(guesses).length !== GAME_SLUGS.length || GAME_SLUGS.some((slug) => !Array.isArray(guesses[slug]))) {
    throw new Error(`O cálculo não retornou os ${GAME_SLUGS.length} jogos`);
  }
  const meResponse = await fetch("/api/me", { credentials: "same-origin", cache: "no-store" });
  if (!meResponse.ok) throw new Error(`Entre em uma conta de teste antes: /api/me retornou ${meResponse.status}`);
  const me = await meResponse.json();
  const played = new Set((me.records || []).filter((play) => play.dateKey === dateKey).map((play) => play.slug));
  console.table(GAME_SLUGS.map((slug) => ({ slug, chutes: guesses[slug].length, primeiro: guesses[slug][0], jaJogado: played.has(slug) })));
  if (!confirm(`Enviar as partidas de ${dateKey} para ${GAME_SLUGS.filter((slug) => !played.has(slug)).length} jogos ainda não registrados? Isso altera o ranking da conta.`)) return;
  async function post(path, body) {
    const response = await fetch(path, {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(json)}`);
    return json;
  }
  const results = [];
  for (const slug of GAME_SLUGS) {
    if (played.has(slug)) { results.push({ slug, estado: "já jogado" }); continue; }
    try {
      if (slug === "mundo") {
        const started = await post("/api/plays/start", { slug, dateKey });
        if (Date.now() - new Date(started.startedAt).getTime() > 15 * 60_000) throw new Error("relógio já expirou");
      }
      const receipt = await post("/api/plays", { slug, dateKey, guesses: guesses[slug] });
      results.push({ slug, estado: receipt.play.status, chutes: receipt.play.count, nota: receipt.play.nota });
      const scale = slug === "escala" || slug === "escala-paises";
      const good = scale ? receipt.play.status === "done" && receipt.play.nota === 100 : receipt.play.status === "won";
      if (!good) {
        console.warn(`Pare: ${slug} não teve o resultado esperado. Confira a seed e a versão do deploy antes de continuar.`);
        break;
      }
    } catch (error) {
      results.push({ slug, estado: "erro", detalhe: String(error) });
      console.warn(`Pare: falha em ${slug}. Confira a seed e a versão do deploy antes de continuar.`);
      break;
    }
  }
  console.table(results);
  return results;
})();
