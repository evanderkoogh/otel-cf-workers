type ContextAndTracker = { ctx: ExecutionContext; tracker: PromiseTracker }

export class PromiseTracker {
	_outstandingPromises: Promise<unknown>[] = []

	get outstandingPromiseCount() {
		return this._outstandingPromises.length
	}

	track(promise: Promise<unknown>): void {
		this._outstandingPromises.push(promise)
	}

	async wait() {
		await Promise.all(this._outstandingPromises)
	}
}

export function proxyExecutionContext(context: ExecutionContext): ContextAndTracker {
	const tracker = new PromiseTracker()
	const ctx = new Proxy(context, {
		get(target, prop) {
			if (prop === 'waitUntil') {
				const fn = Reflect.get(target, prop)
				return new Proxy(fn, {
					apply(target, thisArg, argArray) {
						tracker.track(argArray[0])
						return Reflect.apply(target, context, argArray)
					},
				})
			}
		},
	})
	return { ctx, tracker }
}
