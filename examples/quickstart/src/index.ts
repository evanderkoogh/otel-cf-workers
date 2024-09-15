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
