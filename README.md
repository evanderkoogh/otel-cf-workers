# otel-cf-workers

An OpenTelemetry compatible library for instrumenting and exporting traces from Cloudflare Workers.

> **Warning**
> This package is still in alpha. It has not been tested extensively, optimisations have not yet been made, and the API interface and the configuration options are subject to change.

## Getting started

```typescript
import { trace } from '@opentelemetry/api'
import { instrument, PartialTraceConfig, waitUntilTrace } from '../../../src/index'

export interface Env {
	OTEL_TEST: KVNamespace
}

const handler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		await fetch('https://cloudflare.com')

		const greeting = "G'day World"
		trace.getActiveSpan()?.setAttribute('greeting', greeting)
		ctx.waitUntil(waitUntilTrace(() => fetch('https://workers.dev')))
		return new Response(`${greeting}!`)
	},
}

const config: PartialTraceConfig = {
	exporter: { url: 'https://api.honeycomb.io/v1/traces' },
	service: {
		name: 'greetings',
		version: '0.1',
	},
}

export default instrument(handler, config)
```

If you need to send an API token to your Open Telemetry provider of your choice, you can either add a `headers` object in the exporter part of the configuration (not recommended), or set it was an environment secret in the form: `otel.headers.<header_name>` with the API token as the value.

So for Honeycomb for example, the environment variable would be: `otel.headers.x-honeycomb-team`.
Any other headers that you need to send through can be configured in either the config object or through environment variables.

## Auto-instrumentation

While the plan is to support all types of triggers (such as `fetch`, cron trigger and queues) and bindings (such as Durable Objects and KV), the currently supported components are:

Triggers:

- [x] HTTP (`handler.fetch`)
- [x] Queue (`handler.queue`)
- [ ] Cron (`handler.scheduled`)
- [ ] Durable Objects
- [x] waitUntil (`ctx.waitUntil`)[^1]
- [ ] Trace (`handler.trace`)

Globals:

- [x] Fetch
- [x] Caches

Bindings:

- [x] KV
- [x] Queue
- [ ] Durable Objects
- [ ] R2
- [ ] D1
- [ ] Worker Bindings
- [ ] Workers for Platform Dispatch

[^1]: `waitUntil` can't be completely auto-instrumented and requires wrapping the promise in a `waitUntilTrace()` function.

## Creating custom spans

While auto-instrumenting should take care of a lot of the information that you would want to add, there will always be application data you want to send along.

You can get the current active span by doing:

```typescript
import {trace} from '@opentelemetry/api'

const handler = {
	async fetch(request: Request) {
		const span = trace.getActiveSpan()
		if(span) span.setAttributes('name', 'value')
		....
	}
}
```

Or if you want to create a new span:

```typescript
import { trace } from '@opentelemetry/api'

const handler = {
	async fetch(request: Request) {
		const tracer = trace.getTracer('my_own_tracer')
		return tracer.startActiveSpan('name', (span) => {
			const response = await doSomethingAwesome
			span.end()
			return response
		})
	},
}
```

## Distributed Tracing

One of the advantages of using Open Telemetry is that it makes it easier to do distributed tracing through multiple different services. This library will automatically inject the W3C Trace Context headers when making outbound fetch calls.

Once we add support for Durable Object and other Worker bindings, we will also be adding them to those calls.

## Limitations

As the library is still in alpha, there are some important limitations, including, but not limited to:

- The worker runtime does not expose accurate timing information to protect against side-channel attacks and will only update the clock on IO, so any CPU heavy processing will look like it takes 0 milliseconds.
- Not everything is auto-instrumented yet. See the lists above for what is and isn't.
- ~~Traces are sent before the Response is returned, potentially leading to longer response times for clients~~
- It is not possible yet to do any sampling or turn off auto-instrumenting. So every span is send to your tracing backend/provider.
- There is currently no way to sanitise or change how things are sampled, so if you have sensitive data, you should check what is and isn't send to your tracing endpoint. We won't automatically send values retrieved from databases or HTTP endpoints, but there could be sensitive data in keys or URLs.
