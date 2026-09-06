import type { RequestHandler } from "express";

type Metric = { count: number; totalMs: number };
const requests = new Map<string, Metric>();

export function metricsMiddleware(): RequestHandler {
  return (req, res, next) => {
    const start = performance.now();
    res.on("finish", () => {
      const key = `${req.method} ${req.route?.path ?? req.path} ${res.statusCode}`;
      const metric = requests.get(key) ?? { count: 0, totalMs: 0 };
      metric.count += 1;
      metric.totalMs += performance.now() - start;
      requests.set(key, metric);
    });
    next();
  };
}

/** Safe Prometheus-style metrics: no request bodies, tokens, case IDs, or evidence. */
export function renderMetrics(): string {
  const lines = ["# HELP cashnet_http_requests_total Completed HTTP requests", "# TYPE cashnet_http_requests_total counter", "# HELP cashnet_http_request_duration_ms_sum Total HTTP request duration in milliseconds", "# TYPE cashnet_http_request_duration_ms_sum counter"];
  for (const [key, value] of requests) {
    const [method, ...rest] = key.split(" "); const status = rest.pop()!; const route = rest.join(" ").replace(/\\/g, "_").replace(/\"/g, "");
    lines.push(`cashnet_http_requests_total{method="${method}",route="${route}",status="${status}"} ${value.count}`);
    lines.push(`cashnet_http_request_duration_ms_sum{method="${method}",route="${route}",status="${status}"} ${value.totalMs.toFixed(3)}`);
  }
  return `${lines.join("\n")}\n`;
}
