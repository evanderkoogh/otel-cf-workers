# otel-cf-workers

An OpenTelemetry compatible library for instrumenting and exporting traces from Cloudflare Workers.

## Getting started

```typescript
import { trace } from '@opentelemetry/api'
import { instrument, ResolveConfigFn } from '@microlabs/otel-cf-workers'

export interface Env {
	HONEYCOMB_API_KEY: string
	OTEL_TEST: KVNamespace
}

const handler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		await fetch('https://cloudflare.com')

		const greeting = "G'day World"
		trace.getActiveSpan()?.setAttribute('greeting', greeting)
		ctx.waitUntil(fetch('https://workers.dev'))
		return new Response(`${greeting}!`)
	},
}

const config: ResolveConfigFn = (env: Env, _trigger) => {
	return {
		exporter: {
			url: 'https://api.honeycomb.io/v1/traces',
			headers: { 'x-honeycomb-team': env.HONEYCOMB_API_KEY },
		},
		service: { name: 'greetings' },
	}
}

export default instrument(handler, config)
```

## Auto-instrumentation

### Workers

Wrapping your exporter handler with the `instrument` function is all you need to do to automatically have not just the functions of you handler auto-instrumented, but also the global `fetch` and `caches` and all of the supported bindings in your environment such as KV.

See the quick start code sample for an example of how it works.

### Durable Objects

Instrumenting Durable Objects work very similar to the regular Worker auto-instrumentation. Instead of wrapping the handler in an `instrument` call, you wrap the Durable Object class with the `instrumentDO` function.

```typescript
import { instrumentDO, PartialTraceConfig } from '@microlabs/otel-cf-workers'

const config: ResolveConfigFn = (env: Env, _trigger) => {
	return {
		exporter: {
			url: 'https://api.honeycomb.io/v1/traces',
			headers: { 'x-honeycomb-team': env.HONEYCOMB_API_KEY },
		},
		service: { name: 'greetings-do' },
	}
}

class OtelDO implements DurableObject {
	async fetch(request: Request): Promise<Response> {
		return new Response('Hello World!')
	}
}

const TestOtelDO = instrumentDO(OtelDO, doConfig)

export { TestOtelDO }
```

## Creating custom spans

While auto-instrumenting should take care of a lot of the information that you would want to add, there will always be application specific information you want to send along.

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
		const tracer = trace.getTracer('my_own_tracer_name')
		return tracer.startActiveSpan('name', (span) => {
			const response = await doSomethingAwesome
			span.end()
			return response
		})
	},
}
```

## Configuration

You can refer to confiiguration [here](docs/config.md)

## Distributed Tracing

One of the advantages of using Open Telemetry is that it makes it easier to do distributed tracing through multiple different services. This library will automatically inject the W3C Trace Context headers when making calls to Durable Objects or outbound fetch calls.

## Limitations

- The worker runtime does not expose accurate timing information to protect against side-channel attacks such as Spectre and will only update the clock on IO, so any CPU heavy processing will look like it takes 0 milliseconds.
- Not everything is auto-instrumented yet. See the lists below for what is and isn't.

Triggers:

- [x] HTTP (`handler.fetch`)
- [x] Queue (`handler.queue`)
- [ ] Cron (`handler.scheduled`)
- [x] Durable Objects
- [x] waitUntil (`ctx.waitUntil`)

Globals/built-ins:

- [x] Fetch
- [x] Caches
- [x] Durable Object Storage

Bindings:

- [x] KV
- [x] Queue
- [x] Durable Objects
- [ ] R2
- [ ] D1
- [ ] Worker Bindings
- [ ] Workers for Platform Dispatch
