export async function solve({ dateKey, seed = "rodada-dev", sourceRef = "db4239a0aa42a8c4a65c47c7eaf2f68cce17217d", fetcher = fetch }) {
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
    rainhas10: "games/rainhas/data/10.json"
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
  const [start, end] = pick(pairs, "rota");
  const back = dist(end);
  const route = [start];
  while (route.at(-1) !== end) {
    const current = route.at(-1);
    const next = [...data.borders[current]].sort().find(n => back.get(n) === back.get(current) - 1);
    if (!next) throw new Error("Falha ao calcular Rota");
    route.push(next);
  }
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
    mundo: data.countries.map(c => c.name)
  };
  return guesses;
}
