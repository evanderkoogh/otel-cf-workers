# otel-cf-workers

An OpenTelemetry compatible library for instrumenting and exporting traces from Cloudflare Workers.

> **Warning**
> This documentation describes the latest "stable" release. The `1.0.0-alpha.*` packages have slightly different configuration options that might not be backwards compatible with the `0.9` or earlier configurations.
> Once the alpha release is considered stable enough to be a proper release candidate, we will switch over the documentation here.

> **Warning**
> This package is still in beta. It is relatively new, but used in production in a few applications already. Most of the core parts of the Worker platform are auto-instrumented already. The biggest feature that is still missing is sampling, so that you don't have to send every single trace to your tracing backend.

## Getting started

```typescript
import { trace } from '@opentelemetry/api'
import { instrument, PartialTraceConfig, waitUntilTrace } from '@microlabs/otel-cf-workers'

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
	service: { name: 'greetings' },
}

export default instrument(handler, config)
```

If you need to send an API token to your Open Telemetry provider of your choice, you can either add a `headers` object in the exporter part of the configuration (not recommended), or set it was an environment secret in the form: `otel.exporter.headers.<header_name>` with the API token as the value.

So for Honeycomb for example, the environment variable would be: `otel.exporter.headers.x-honeycomb-team`.
Any other headers that you need to send through can be configured in either the config object or through environment variables.

## Auto-instrumentation

### Workers

Wrapping your exporter handler with the `instrument` function is all you need to do to automatically have not just the functions of you handler auto-instrumented, but also the global `fetch` and `caches` and all of the supported bindings in your environment such as KV.

```typescript
import { instrument, PartialTraceConfig } from '@microlabs/otel-cf-workers'

const handler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return new Response("G'day world!")
	},
}

const config: PartialTraceConfig = {
	exporter: { url: 'https://api.honeycomb.io/v1/traces' },
	service: { name: 'greetings' },
}

export default instrument(handler, config)
```

#### WaitUntil

In Cloudflare Workers it is possible to keep the Worker running after the `Response` has been returned to the client. This can be very useful to asynchrously handle things after returning a `Response`. (This is how we send the traces to the exporter without slowing down your Worker.)

If you want to trace any logic in here, you need to wrap your `Promise` that you pass into `ctx.waitUntil` with a `waitUntilTrace`.

```typescript
import { instrument, PartialTraceConfig, waitUntilTrace } from '@microlabs/otel-cf-workers'

const handler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		ctx.waitUntil(waitUntilTrace(() => fetch('https://workers.dev')))
		return new Response("G'day world!")
	},
}
```

### Durable Objects

Instrumenting Durable Objects work very similar to the regular Worker auto-instrumentation. Instead of wrapping the handler in an `instrument` call, you wrap the Durable Object class with the `instrumentDO` function.

```typescript
import { instrumentDO, PartialTraceConfig } from '@microlabs/otel-cf-workers'

const doConfig: PartialTraceConfig = {
	exporter: { url: 'https://api.honeycomb.io/v1/traces' },
	service: { name: 'greetings-do' },
}

class OtelDO implements DurableObject {
	async fetch(request: Request): Promise<Response> {
		return new Response('Hello World!')
	}
}

const TestOtelDO = instrumentDO(OtelDO, doConfig)

export { TestOtelDO }
```

## Supported triggers/globals/bindings

While the plan is to support all types of triggers (such as `fetch`, cron trigger and queues) and bindings (such as Durable Objects and KV), the currently supported components are:

Triggers:

- [x] HTTP (`handler.fetch`)
- [x] Queue (`handler.queue`)
- [ ] Cron (`handler.scheduled`)
- [x] Durable Objects
- [x] waitUntil (`ctx.waitUntil`)
- [ ] Trace (`handler.trace`)

Globals/built-ins:

- [x] Fetch
- [x] Caches
- [ ] Durable Object Storage

Bindings:

- [x] KV
- [x] Queue
- [x] Durable Objects
- [ ] R2
- [ ] D1
- [ ] Worker Bindings
- [ ] Workers for Platform Dispatch

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
