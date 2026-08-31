"use client";

import type {
  OperationsDashboardResponse,
  OperationsLogEntry,
  OperationsSeriesPoint,
  OperationsTimeRange,
} from "@fitai/contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BrandLockup } from "@/components/BrandLockup";
import { apiRequest } from "@/lib/api";
import styles from "./OperationsDashboard.module.css";

type IconName = "pulse" | "coins" | "activity" | "clock" | "bell" | "server" | "database" | "brain" | "voice" | "refresh" | "search" | "arrow" | "terminal";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    pulse: <><path d="M3 12h4l2-7 4 14 2-7h6" /></>,
    coins: <><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></>,
    activity: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    server: <><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01"/></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></>,
    brain: <><path d="M9.5 4a3 3 0 0 0-5 3 3 3 0 0 0 0 5 3 3 0 0 0 2 5.5A3 3 0 0 0 12 19V5.5A3 3 0 0 0 9.5 4ZM14.5 4a3 3 0 0 1 5 3 3 3 0 0 1 0 5 3 3 0 0 1-2 5.5A3 3 0 0 1 12 19"/></>,
    voice: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M18 9a7 7 0 0 0-12-2l-2 5M6 15a7 7 0 0 0 12 2l2-5"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    terminal: <><path d="m4 7 5 5-5 5M11 17h9"/></>,
  };
  return <svg aria-hidden="true" className={styles.icon} viewBox="0 0 24 24">{paths[name]}</svg>;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function bytes(value: number) {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

function duration(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  if (days) return `${days}d ${hours}h`;
  const minutes = Math.floor(seconds / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function relativeTime(value: string) {
  const difference = Date.now() - new Date(value).getTime();
  if (difference < 60_000) return "just now";
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)}m ago`;
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)}h ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function UsageChart({ points }: { points: OperationsSeriesPoint[] }) {
  const width = 760;
  const height = 220;
  const inset = 18;
  const max = Math.max(1, ...points.map((point) => point.tokens));
  const coordinates = points.map((point, index) => {
    const x = inset + (index / Math.max(1, points.length - 1)) * (width - inset * 2);
    const y = height - inset - (point.tokens / max) * (height - inset * 2);
    return { x, y, point };
  });
  const line = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const area = coordinates.length
    ? `M ${coordinates[0].x} ${height - inset} L ${coordinates.map(({ x, y }) => `${x} ${y}`).join(" L ")} L ${coordinates.at(-1)?.x} ${height - inset} Z`
    : "";

  return (
    <div className={styles.chartWrap}>
      <svg aria-label="Estimated token usage over time" className={styles.chart} role="img" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id="ops-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#b7f34a" stopOpacity=".35"/><stop offset="1" stopColor="#b7f34a" stopOpacity="0"/></linearGradient>
        </defs>
        {[0, .25, .5, .75, 1].map((value) => <line className={styles.gridLine} key={value} x1={inset} x2={width - inset} y1={inset + value * (height - inset * 2)} y2={inset + value * (height - inset * 2)} />)}
        <path d={area} fill="url(#ops-area)" />
        <polyline className={styles.chartLine} points={line} />
        {coordinates.map(({ x, y, point }) => <circle className={styles.chartDot} cx={x} cy={y} key={point.timestamp} r={3}><title>{`${point.label}: ${point.tokens.toLocaleString()} tokens`}</title></circle>)}
      </svg>
      <div className={styles.chartLabels}>{points.map((point, index) => <span key={point.timestamp} style={{ display: index % Math.max(1, Math.ceil(points.length / 6)) === 0 || index === points.length - 1 ? "block" : "none" }}>{point.label}</span>)}</div>
    </div>
  );
}

function BudgetRing({ value, limit, label }: { value: number; limit: number; label: string }) {
  const percent = Math.min(100, Math.round((value / Math.max(1, limit)) * 100));
  return (
    <div className={styles.budgetItem}>
      <div className={styles.ring} style={{ "--ring-value": `${percent * 3.6}deg` } as React.CSSProperties}><span><b>{percent}%</b><small>used</small></span></div>
      <div><b>{label}</b><span>{compactNumber(value)} / {compactNumber(limit)}</span></div>
    </div>
  );
}

function LogRow({ log }: { log: OperationsLogEntry }) {
  return (
    <tr>
      <td><span className={styles.logLevel} data-level={log.level}>{log.level}</span></td>
      <td><time dateTime={log.timestamp}>{relativeTime(log.timestamp)}</time></td>
      <td><b className={styles.method}>{log.method}</b></td>
      <td><code>{log.route}</code></td>
      <td><span className={styles.statusCode} data-error={log.statusCode >= 400}>{log.statusCode}</span></td>
      <td>{log.durationMs} ms</td>
    </tr>
  );
}

export function OperationsDashboard({ user }: { user: { name: string; email: string } }) {
  const [range, setRange] = useState<OperationsTimeRange>("7d");
  const [data, setData] = useState<OperationsDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [logLevel, setLogLevel] = useState<"all" | OperationsLogEntry["level"]>("all");
  const [query, setQuery] = useState("");
  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      setData(await apiRequest<OperationsDashboardResponse>(`/v1/operations/dashboard?range=${range}`));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Operations data could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const filteredLogs = useMemo(() => data?.logs.filter((log) => {
    const matchesLevel = logLevel === "all" || log.level === logLevel;
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = !normalizedQuery || `${log.method} ${log.route} ${log.statusCode}`.toLowerCase().includes(normalizedQuery);
    return matchesLevel && matchesQuery;
  }) ?? [], [data?.logs, logLevel, query]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="forgefit.space home"><BrandLockup /></Link>
        <span className={styles.productName}>Forge Operations <i>live</i></span>
        <nav><Link href="/studio">Forge Studio</Link><Link href="/signout">Sign out</Link><b>{initials}</b></nav>
      </header>

      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.sideIntro}><span>Control room</span><h2>System intelligence</h2><p>Usage, reliability and budget signals for your ForgeFit workspace.</p></div>
          <nav aria-label="Operations sections">
            <a href="#overview" className={styles.activeNav}><Icon name="pulse"/>Overview</a>
            <a href="#usage"><Icon name="coins"/>Usage & credits</a>
            <a href="#health"><Icon name="server"/>System health</a>
            <a href="#performance"><Icon name="activity"/>Performance</a>
            <a href="#logs"><Icon name="terminal"/>Backend logs</a>
          </nav>
          <div className={styles.sideStatus} data-status={data?.runtime.status ?? "loading"}><i/><div><b>{data?.runtime.status === "healthy" ? "All core systems normal" : data ? "Attention recommended" : "Connecting…"}</b><span>{data ? `Checked ${relativeTime(data.generatedAt)}` : "Reading telemetry"}</span></div></div>
          <Link className={styles.backLink} href="/studio">← Back to Forge Studio</Link>
        </aside>

        <section className={styles.content}>
          <section className={styles.hero} id="overview">
            <div><span className={styles.eyebrow}>Workspace operations</span><h1>Know what your system is <em>doing.</em></h1><p>Live usage, budget signals, API health, provider readiness and backend performance in one place.</p></div>
            <div className={styles.heroActions}>
              <div className={styles.rangeControl}>{(["24h", "7d", "30d"] as const).map((item) => <button data-active={range === item} key={item} onClick={() => setRange(item)} type="button">{item}</button>)}</div>
              <button aria-label="Refresh operations data" className={styles.refreshButton} data-spinning={refreshing} onClick={() => void load(true)} type="button"><Icon name="refresh"/></button>
            </div>
          </section>

          {error && <div className={styles.error} role="alert"><b>Telemetry unavailable</b><span>{error}</span><button onClick={() => void load()} type="button">Try again</button></div>}
          {loading && !data ? <div className={styles.loading}><i/><span>Reading system telemetry…</span></div> : data && <>
            <section className={styles.kpis} aria-label="Key metrics">
              <article><div className={styles.kpiIcon}><Icon name="pulse"/></div><span>Estimated tokens</span><strong>{compactNumber(data.usage.totalTokens)}</strong><small data-positive={(data.usage.tokenChangePercent ?? 0) <= 0}>{data.usage.tokenChangePercent == null ? "First measured period" : `${data.usage.tokenChangePercent > 0 ? "+" : ""}${data.usage.tokenChangePercent}% vs prior period`}</small></article>
              <article><div className={styles.kpiIcon}><Icon name="coins"/></div><span>AI credits</span><strong>{data.usage.estimatedCredits.toLocaleString()}</strong><small>1 credit = 1K estimated tokens</small></article>
              <article><div className={styles.kpiIcon}><Icon name="activity"/></div><span>API requests</span><strong>{compactNumber(data.traffic.requests)}</strong><small data-warning={data.traffic.errorRate >= 5}>{data.traffic.errorRate}% error rate</small></article>
              <article><div className={styles.kpiIcon}><Icon name="clock"/></div><span>System uptime</span><strong>{duration(data.runtime.uptimeSeconds)}</strong><small>{data.runtime.environment} · release {data.runtime.release}</small></article>
            </section>

            <section className={styles.dashboardGrid}>
              <article className={`${styles.panel} ${styles.usagePanel}`} id="usage">
                <header><div><span className={styles.eyebrow}>Consumption</span><h2>Token usage</h2></div><div className={styles.legend}><i/>Estimated text tokens</div></header>
                <UsageChart points={data.series}/>
                <footer><span><b>{compactNumber(data.usage.inputTokens)}</b> input</span><span><b>{compactNumber(data.usage.outputTokens)}</b> output</span><span><b>{data.usage.conversations}</b> AI responses</span><span><b>{data.usage.liveSessions}</b> live sessions</span></footer>
              </article>

              <article className={`${styles.panel} ${styles.budgetPanel}`}>
                <header><div><span className={styles.eyebrow}>Monthly allowance</span><h2>Budget guardrails</h2></div></header>
                <div className={styles.budgets}><BudgetRing label="Token estimate" limit={data.usage.monthlyTokenLimit} value={data.usage.monthlyTokens}/><BudgetRing label="Normalized credits" limit={data.usage.monthlyCreditLimit} value={data.usage.monthlyCredits}/></div>
                <div className={styles.researchBudget}><div><span>Grounded research today</span><b>{data.usage.researchRequestsToday} / {data.usage.researchDailyLimit}</b></div><strong><i style={{ width: `${Math.min(100, data.usage.researchRequestsToday / Math.max(1, data.usage.researchDailyLimit) * 100)}%` }}/></strong><small>Resets daily at 00:00 UTC</small></div>
              </article>

              <article className={`${styles.panel} ${styles.alertPanel}`}>
                <header><div><span className={styles.eyebrow}>Attention queue</span><h2>Alerts</h2></div><span className={styles.count}>{data.alerts.length}</span></header>
                <div className={styles.alerts}>{data.alerts.map((item) => <div data-severity={item.severity} key={item.id}><i><Icon name="bell"/></i><span><b>{item.title}</b><small>{item.message}</small></span><strong>{item.value}</strong></div>)}</div>
              </article>

              <article className={`${styles.panel} ${styles.healthPanel}`} id="health">
                <header><div><span className={styles.eyebrow}>Live dependencies</span><h2>System health</h2></div><span className={styles.liveBadge}><i/>Live</span></header>
                <div className={styles.services}>{data.services.map((service) => <div key={service.id}><i className={styles.serviceIcon}>{service.id === "database" ? <Icon name="database"/> : service.id === "ai" ? <Icon name="brain"/> : service.id === "voice" ? <Icon name="voice"/> : <Icon name="server"/>}</i><span><b>{service.name}</b><small>{service.detail}</small></span><strong data-status={service.status}><i/>{service.status}</strong>{service.latencyMs != null && <em>{service.latencyMs} ms</em>}</div>)}</div>
                <footer><span>Memory <b>{data.runtime.memoryUsedMb} / {compactNumber(data.runtime.memoryLimitMb)} MB</b></span><span>Node <b>{data.runtime.nodeVersion}</b></span></footer>
              </article>
            </section>

            <section className={styles.lowerGrid} id="performance">
              <article className={`${styles.panel} ${styles.performancePanel}`}>
                <header><div><span className={styles.eyebrow}>Route analytics</span><h2>API performance</h2></div><div className={styles.perfSummary}><span>P50 <b>{data.traffic.p50LatencyMs} ms</b></span><span>P95 <b>{data.traffic.p95LatencyMs} ms</b></span></div></header>
                {data.performance.length ? <div className={styles.tableScroll}><table><thead><tr><th>Route</th><th>Requests</th><th>Avg</th><th>P95</th><th>Errors</th></tr></thead><tbody>{data.performance.map((row) => <tr key={row.route}><td><code>{row.route}</code></td><td>{row.requests}</td><td>{row.averageLatencyMs} ms</td><td>{row.p95LatencyMs} ms</td><td><span data-error={row.errorRate >= 5}>{row.errorRate}%</span></td></tr>)}</tbody></table></div> : <p className={styles.empty}>Performance rows will appear after authenticated API traffic is recorded.</p>}
                <footer><span>Ingress <b>{bytes(data.traffic.requestBytes)}</b></span><span>Egress <b>{bytes(data.traffic.responseBytes)}</b></span><span>Average <b>{data.traffic.averageLatencyMs} ms</b></span></footer>
              </article>

              <article className={`${styles.panel} ${styles.modelPanel}`}>
                <header><div><span className={styles.eyebrow}>AI workload</span><h2>Model mix</h2></div></header>
                {data.usage.models.length ? <div className={styles.models}>{data.usage.models.map((model) => <div key={model.model}><i/><span><b>{model.model}</b><small>{model.provider} · {model.requests} responses</small></span><strong>{compactNumber(model.totalTokens)}<small>tokens</small></strong></div>)}</div> : <p className={styles.empty}>Model usage appears after an AI response is stored.</p>}
              </article>
            </section>

            <section className={`${styles.panel} ${styles.logsPanel}`} id="logs">
              <header><div><span className={styles.eyebrow}>Request metadata</span><h2>Backend logs</h2></div><div className={styles.logTools}><label><Icon name="search"/><input aria-label="Search backend logs" onChange={(event) => setQuery(event.target.value)} placeholder="Filter route or status…" value={query}/></label><div>{(["all", "info", "warning", "error"] as const).map((level) => <button data-active={logLevel === level} key={level} onClick={() => setLogLevel(level)} type="button">{level}</button>)}</div></div></header>
              {filteredLogs.length ? <div className={styles.tableScroll}><table><thead><tr><th>Level</th><th>Time</th><th>Method</th><th>Route</th><th>Status</th><th>Duration</th></tr></thead><tbody>{filteredLogs.map((log) => <LogRow key={`${log.id}-${log.timestamp}`} log={log}/>)}</tbody></table></div> : <p className={styles.empty}>No logs match this filter. Request payloads and prompt contents are never stored here.</p>}
              <footer><span>Showing {filteredLogs.length} of {data.logs.length} recent events</span><span>User-scoped metadata only</span></footer>
            </section>

            <section className={styles.updatesSection}>
              <div><span className={styles.eyebrow}>Runtime configuration</span><h2>System updates</h2></div>
              <div className={styles.updates}>{data.updates.map((update) => <article key={update.id}><i data-status={update.status}/><span><b>{update.title}</b><small>{update.detail}</small></span><em>{update.status}</em></article>)}</div>
            </section>

            <footer className={styles.disclaimer}><p><b>About these numbers.</b> {data.notes.tokenEstimate}</p><p>{data.notes.creditDefinition}</p><p>{data.notes.retention}</p><span>Last refreshed {new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · automatic refresh every 60 seconds</span></footer>
          </>}
        </section>
      </div>
    </main>
  );
}
