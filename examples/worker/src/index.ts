import { trace } from '@opentelemetry/api'
import { instrument, PartialTraceConfig, waitUntilTrace } from '../../../src/index'

export interface Env {
	OTEL_TEST: KVNamespace
	Test_Otel_DO: DurableObjectNamespace
}

const handleDO = async (request: Request, env: Env): Promise<Response> => {
	const ns = env.Test_Otel_DO
	const id = ns.idFromName('testing')
	console.log({ id })
	const stub = ns.get(id)
	console.log({ stub })
	return await stub.fetch('https://does-not-exist.com/blah')
}

const handleRest = async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
	await fetch('https://cloudflare.com')

	const cache = await caches.open('stuff')
	const promises = [env.OTEL_TEST.get('non-existant'), cache.match(new Request('https://no-exist.com'))]
	await Promise.all(promises)

	const greeting = "G'day World"
	trace.getActiveSpan()?.setAttribute('greeting', greeting)
	ctx.waitUntil(waitUntilTrace(() => fetch('https://workers.dev')))
	return new Response(`${greeting}!`)
}

const handler = {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const pathname = new URL(request.url).pathname
		if (pathname === '/do') {
			return handleDO(request, env)
		} else {
			return handleRest(request, env, ctx)
		}
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

export class TestOtelDO implements DurableObject {
	async fetch(request: Request): Promise<Response> {
		return new Response('Hello World!')
	}
	async alarm(): Promise<void> {
		throw new Error('Method not implemented.')
	}
}

export default instrument(handler, config)
