/**
 * In-process pipeline metrics: per-stage latencies, token usage and cost,
 * escalation/fact-check/cache rates. Reported in /api/v1/health (db status +
 * metrics snapshot) and used to fill PERF.md with real numbers.
 */
interface UsageEntry {
  stage: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estCostUsd: number;
}

class Metrics {
  private latencies = new Map<string, number[]>();
  counters: Record<string, number> = {};
  private usage: UsageEntry[] = [];

  record(stage: string, ms: number) {
    const arr = this.latencies.get(stage) ?? [];
    arr.push(ms);
    if (arr.length > 500) arr.shift();
    this.latencies.set(stage, arr);
  }

  bump(counter: string, by = 1) {
    this.counters[counter] = (this.counters[counter] ?? 0) + by;
  }

  addUsage(entry: UsageEntry) {
    this.usage.push(entry);
    if (this.usage.length > 1000) this.usage.shift();
  }

  snapshot() {
    const stages: Record<string, { count: number; p50: number; p95: number; avgMs: number }> = {};
    for (const [stage, arr] of this.latencies) {
      const sorted = [...arr].sort((a, b) => a - b);
      stages[stage] = {
        count: arr.length,
        p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
        p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        avgMs: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
      };
    }
    const totalCost = this.usage.reduce((a, u) => a + u.estCostUsd, 0);
    const totalCacheRead = this.usage.reduce((a, u) => a + u.cacheReadTokens, 0);
    const totalInput = this.usage.reduce((a, u) => a + u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens, 0);
    const generations = this.counters.generation_ok ?? 0;
    return {
      stages,
      counters: this.counters,
      escalationRate:
        generations > 0 ? (this.counters.escalation ?? 0) / generations : 0,
      promptCacheHitRate: totalInput > 0 ? totalCacheRead / totalInput : 0,
      estTotalCostUsd: +totalCost.toFixed(4),
      estCostPerGameUsd: generations > 0 ? +(totalCost / generations).toFixed(4) : 0,
    };
  }
}

export const metrics = new Metrics();
