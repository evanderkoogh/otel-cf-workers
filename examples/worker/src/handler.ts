import { trace } from '@opentelemetry/api'
import { withNextSpan } from '../../../src/index'

export interface Env {
	OTEL_TEST: KVNamespace
	Test_Otel_DO: DurableObjectNamespace
	'otel.exporter.headers.x-honeycomb-team': string
}

const handleDO = async (request: Request, env: Env): Promise<Response> => {
	const ns = env.Test_Otel_DO
	const id = ns.idFromName('testing')
	const stub = ns.get(id)
	trace.getActiveSpan()?.setAttribute('http.route', '/do')
	return await stub.fetch('https://does-not-exist.com/blah')
}

const handleRest = async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
	trace.getActiveSpan()?.setAttribute('http.route', '/*')
	withNextSpan({ destination: 'cloudflare' })
	await fetch('https://cloudflare.com')

	const cache = await caches.open('stuff')
	const promises = [env.OTEL_TEST.get('non-existant'), cache.match(new Request('https://no-exist.com'))]
	await Promise.all(promises)

	const greeting = "G'day World"
	trace.getActiveSpan()?.setAttribute('greeting', greeting)
	withNextSpan({ waitUntil: true })
	ctx.waitUntil(fetch('https://workers.dev'))
	return new Response(`${greeting}!`)
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const pathname = new URL(request.url).pathname
		if (pathname === '/do') {
			return handleDO(request, env)
		} else if (pathname === '/error') {
			throw new Error('You asked for it!')
		} else {
			return handleRest(request, env, ctx)
		}
	},
}

export class OtelDO implements DurableObject {
	constructor(
		protected state: DurableObjectState,
		protected env: Env,
	) {
		state.blockConcurrencyWhile(async () => {
			await this.state.storage.getAlarm()
		})
	}
	async fetch(request: Request): Promise<Response> {
		await fetch('https://cloudflare.com')
		await this.state.storage.put('something', 'else')
		await this.state.storage.setAlarm(Date.now() + 1000)
		return new Response('Hello World!')
	}
	async alarm(): Promise<void> {
		console.log('ding ding!')
		await this.state.storage.get('something')
		await this.state.storage.get('something_else')
	}
}
