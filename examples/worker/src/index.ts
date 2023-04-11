import { trace } from '@opentelemetry/api'
import { instrument, PartialTraceConfig, waitUntilTrace } from '../../../src/index'

export interface Env {
	OTEL_TEST: KVNamespace
}

const handler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		await fetch('https://cloudflare.com')

		const cache = await caches.open('stuff')
		const promises = [env.OTEL_TEST.get('non-existant'), cache.match(new Request('https://no-exist.com'))]
		await Promise.all(promises)

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
	bindings: {
		kv: {
			sanitiseKeys({ key }) {
				return key.toUpperCase()
			},
		},
	},
}

export default instrument(handler, config)
