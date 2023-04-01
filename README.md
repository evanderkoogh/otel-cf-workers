# otel-cf-workers

An OpenTelemetry compatible library for instrumenting and exporting traces from Cloudflare Workers.

> **Warning**
> This package is still in alpha. It has not been tested extensively, optimisations have not yet been made, and the API interface and the configuration options are subject to change.

## Getting started

```typescript
import { trace } from '@opentelemetry/api'
import { instrument, WorkerTraceConfig } from '@microlabs/otel-cf-worker'

const handler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		trace.getActiveSpan()?.setAttribute('greeting', greeting)
		return new Response(`G'day World!`)
	},
}

const config: WorkerTraceConfig = {
	exporter: { url: 'https://api.honeycomb.io/v1/traces' },
	serviceName: 'greetings',
	serviceVersion: '0.1',
}

export default instrument(handler, config)
```

If you need to send an API token to your Open Telemetry provider of your choice, you can either add a `headers` object in the exporter part of the configuration (not recommended), or set it was an environment secret in the form: `otel.headers.<header_name>` with the API token as the value.

So for Honeycomb for example, the environment variable would be: `otel.headers.x-honeycomb-team`.
Any other headers that you need to send through can be configured in either the config object or through environment variables.

## Auto-instrumentation

Currently only the fetch handler, outgoing `fetch` and KV bindings are auto-instrumented. The plan is to add support for all handlers (such as cron triggers or queue messages) and binding types (such as Durable Objects)

## Distributed Tracing

One of the advantages of using Open Telemetry is that it makes it easier to do distributed tracing through multiple different services. This library will automatically inject the W3C Trace Context headers when making outbound fetch calls.

## Sampling

Sampling is currently not supported.
