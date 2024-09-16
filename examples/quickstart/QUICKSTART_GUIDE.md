# Quickstart Guide

This is a very simple example of how to get started with the OpenTelemetry cf-worker package.

It wraps your worker in an OpenTelemetry span and sends it to Honeycomb.
You just need to provide your Honeycomb API key as a secret.

## Installation

```bash
npm install @microlabs/otel-cf-workers @opentelemetry/api
npx wrangler secret put HONEYCOMB_API_KEY
```

And set the Node Compatibility flag by adding `compatibility_flags = [ "nodejs_compat" ]`
in your `wrangler.toml`

## Example

```typescript
import { instrument, ResolveConfigFn } from '@microlabs/otel-cf-workers'
import { trace } from '@opentelemetry/api'

export interface Env {
	HONEYCOMB_API_KEY: string
}

const handler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Get the URL of the origin server
		const url = new URL(request.url)
		const originUrl = `https://${url.hostname}${url.pathname}${url.search}`

		// Create a new request to the origin server
		const originRequest = new Request(originUrl, {
			method: request.method,
			headers: request.headers,
			body: request.body,
		})

		// Add tracing information
		trace.getActiveSpan()?.setAttribute('origin_url', originUrl)

		// Fetch from the origin server
		// Return the response from the origin server
		return await fetch(originRequest)
	},
}

const config: ResolveConfigFn = (env: Env, _trigger: any) => {
	return {
		exporter: {
			url: 'https://api.honeycomb.io/v1/traces',
			headers: { 'x-honeycomb-team': env.HONEYCOMB_API_KEY },
		},
		service: { name: 'my-service-name' },
	}
}

export default instrument(handler, config)
```

With this setup, you can run your worker as usual with `wrangler dev` or `wrangler run src/index.ts`.
