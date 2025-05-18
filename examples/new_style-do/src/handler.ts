import { DurableObject } from 'cloudflare:workers';

export class MyDurableObject extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async sayHello(name: string): Promise<string> {
		await this.ctx.storage.get('something');
		return `Hello, ${name}!`;
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const id: DurableObjectId = env.MY_DURABLE_OBJECT.idFromName('foo');

		const stub = env.MY_DURABLE_OBJECT.get(id);

		const greeting = await stub.sayHello('world');

		return new Response(greeting);
	},
} satisfies ExportedHandler<Env>;
