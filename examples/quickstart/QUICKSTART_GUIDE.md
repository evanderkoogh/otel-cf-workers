# Quickstart Guide

This is a very simple example of how to get started with the OpenTelemetry cf-worker package.

It wraps your worker in an OpenTelemetry span and sends it to Honeycomb.
You just need to provide your Honeycomb API key and dataset name.

## Installation

```bash
npm install @microlabs/otel-cf-workers @opentelemetry/api
```

## Example

```typescript
import { instrument, ResolveConfigFn } from '@microlabs/otel-cf-workers'
import { trace } from '@opentelemetry/api'

export interface Env {
	HONEYCOMB_API_KEY: string
	HONEYCOMB_SERVICE_NAME: string
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

const config: ResolveConfigFn = (env: Env, _trigger) => {
	return {
		exporter: {
			url: 'https://api.honeycomb.io/v1/traces',
			headers: { 'x-honeycomb-team': env.HONEYCOMB_API_KEY },
		},
		service: { name: env.HONEYCOMB_SERVICE_NAME },
	}
}

export default instrument(handler, config)
```

With this setup, you can run your worker as usual with `wrangler dev` or `wrangler run src/index.ts`.
This gets you most of the way there, but you'll need to add the env variables to send the tracing information to Honeycomb.

## Issues

Some versions of this package will have various issues. I had the most success with rc.45
