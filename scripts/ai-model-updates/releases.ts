import type { ModelConfig, ModelSelection } from "../ai-models/index.ts";
import type { Candidate, Discovery } from "./index.ts";
import { digest, hashText } from "./evidence.ts";

const urls = {
  openai: {
    models: "https://developers.openai.com/api/docs/models.md",
    releases: "https://developers.openai.com/api/docs/changelog.md",
    account: "https://api.openai.com/v1/models",
  },
  anthropic: {
    models: "https://platform.claude.com/docs/en/models/overview",
    releases: "https://platform.claude.com/docs/en/release-notes/overview",
    account: "https://api.anthropic.com/v1/models?limit=1000",
  },
};

function plain(value: string): string {
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function modelPosition(text: string, id: string): number {
  return (text.match(/[a-zA-Z0-9][a-zA-Z0-9._-]*/g) ?? []).findIndex(
    (token) => token.replace(/\.$/, "") === id,
  );
}

async function source(
  url: string,
  headers: Record<string, string> = {},
): Promise<Discovery["sources"][number]> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("discovery_unavailable");
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error("discovery_unavailable");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 4_000_000) throw new Error("discovery_unavailable");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  const body = Buffer.concat(chunks).toString("utf8");
  return { url, body, sha256: hashText(body) };
}

function pricing(text: string, selection: ModelSelection): Candidate {
  const input =
    /(?:\|\s*Input\s*\|\s*\$([\d.]+)\s*\|\s*1M tokens|Input\s*(?:tokens\s*)?\$([\d.]+))/i.exec(
      text,
    );
  const output =
    /(?:\|\s*Output\s*\|\s*\$([\d.]+)\s*\|\s*1M tokens|Output\s*(?:tokens\s*)?\$([\d.]+))/i.exec(
      text,
    );
  if (!input || !output) throw new Error("pricing_unavailable");
  return {
    selection,
    inputUsdPerMillion: Number(input[1] ?? input[2]),
    outputUsdPerMillion: Number(output[1] ?? output[2]),
  };
}

export async function discoverCandidates(
  config: ModelConfig,
  now = new Date(),
): Promise<Discovery> {
  if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY)
    throw new Error("setup_required");
  const discovery: Discovery = { candidates: [], prices: [], sources: [] };
  for (const provider of ["openai", "anthropic"] as const) {
    const endpoint = urls[provider];
    const headers =
      provider === "openai"
        ? { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
        : { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" };
    const account = await source(endpoint.account, headers);
    const overview = await source(endpoint.models);
    const release = await source(endpoint.releases);
    discovery.sources.push(account, overview, release);
    let listed: { data?: { id?: unknown }[]; has_more?: boolean };
    try {
      listed = JSON.parse(account.body);
    } catch {
      throw new Error("discovery_unavailable");
    }
    if (
      !Array.isArray(listed.data) ||
      listed.has_more === true ||
      listed.data.some((item) => typeof item?.id !== "string")
    )
      throw new Error("discovery_unavailable");
    const ids = listed.data.map((item) => String(item.id));
    const guidance = plain(overview.body);
    if (!/coding|reasoning/i.test(guidance) || plain(release.body).length < 100)
      throw new Error("discovery_unavailable");
    const advertised = ids.filter(
      (id) => /^[a-zA-Z0-9._-]{1,128}$/.test(id) && modelPosition(guidance, id) >= 0,
    );
    advertised.sort((a, b) => modelPosition(guidance, a) - modelPosition(guidance, b));
    const current = Object.values(config.roles).filter((item) => item.provider === provider);
    const unconfigured = advertised.filter((id) => current.every((item) => item.model !== id));
    const pool = unconfigured.length
      ? unconfigured
      : advertised.filter((id) => current.some((item) => item.model !== id));
    const day = Math.floor(now.getTime() / 86_400_000);
    const id = pool[((day % pool.length) + pool.length) % pool.length];
    if (!id) throw new Error("discovery_unavailable");
    const candidate: ModelSelection = { provider, model: id, effort: "high" };
    const selections = [
      ...new Map(
        [...current, candidate].map((selection) => [digest(selection), selection]),
      ).values(),
    ];
    for (const selection of selections) {
      if (!ids.includes(selection.model)) throw new Error("compatibility_unavailable");
      let url: string;
      if (provider === "openai")
        url = `https://developers.openai.com/api/docs/models/${selection.model}.md`;
      else {
        const links = [
          ...overview.body.matchAll(/(?:href=["']|\]\()([^"')\s]*\/models\/[^"')\s]+\/overview)/g),
        ].map((match) => match[1]!);
        const pages = [...new Set(links)].slice(0, 8);
        let found: Discovery["sources"][number] | undefined;
        for (const path of pages) {
          const pageUrl = new URL(path, endpoint.models);
          if (pageUrl.origin !== "https://platform.claude.com" || pageUrl.search || pageUrl.hash)
            continue;
          const page = await source(pageUrl.toString());
          if (modelPosition(plain(page.body), selection.model) >= 0) {
            found = page;
            break;
          }
        }
        if (!found) throw new Error("discovery_unavailable");
        discovery.sources.push(found);
        discovery.prices.push(pricing(plain(found.body), selection));
        continue;
      }
      const page = await source(url);
      discovery.sources.push(page);
      if (
        !page.body.includes(selection.model) ||
        !/structured_outputs|structured outputs/i.test(page.body) ||
        !page.body.includes(`\`${selection.effort}\``)
      )
        throw new Error("compatibility_unavailable");
      discovery.prices.push(pricing(page.body, selection));
    }
    discovery.candidates.push(
      discovery.prices.find((item) => digest(item.selection) === digest(candidate))!,
    );
  }
  return discovery;
}
