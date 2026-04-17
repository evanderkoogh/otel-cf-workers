const unwrapSymbol = Symbol('unwrap')

type Wrapped<T> = { [unwrapSymbol]: T } & T

export function isWrapped<T>(item: T): item is Wrapped<T> {
	return item && !!(item as Wrapped<T>)[unwrapSymbol]
}

export function isProxyable(item: any) {
	return (item !== null && typeof item === 'object') || typeof item === 'function'
}

export function wrap<T extends object>(item: T, handler: ProxyHandler<T>, autoPassthrough: boolean = true): T {
	if (isWrapped(item) || !isProxyable(item)) {
		return item
	}
	const proxyHandler = Object.assign({}, handler)
	proxyHandler.get = (target, prop, receiver) => {
		if (prop === unwrapSymbol) {
			return item
		} else {
			if (handler.get) {
				return handler.get(target, prop, receiver)
			} else if (prop === 'bind') {
				// Honor Function.prototype.bind semantics. SDKs bind fetch to
				// globalThis (e.g. WorkOS, Stripe) to satisfy Cloudflare's
				// this-strict native fetch. Returning `() => receiver` silently
				// drops the thisArg, so later invocations with `this.fn(...)`
				// forward the caller's `this` to native fetch and it throws
				// "Illegal invocation". Return a proper bound call that forwards
				// to the proxy's apply trap with the requested thisArg.
				return (thisArg: unknown, ...boundArgs: unknown[]) =>
					(...callArgs: unknown[]) =>
						Reflect.apply(receiver as (...args: unknown[]) => unknown, thisArg, [...boundArgs, ...callArgs])
			} else if (autoPassthrough) {
				return passthroughGet(target, prop)
			}
		}
	}
	proxyHandler.apply = (target, thisArg, argArray) => {
		if (handler.apply) {
			return handler.apply(unwrap(target), unwrap(thisArg), argArray)
		}
	}
	return new Proxy(item, proxyHandler)
}

export function unwrap<T extends object>(item: T): T {
	if (item && isWrapped(item)) {
		return item[unwrapSymbol]
	} else {
		return item
	}
}

export function passthroughGet(target: any, prop: string | symbol, thisArg?: any) {
	const unwrappedTarget = unwrap(target)
	thisArg = unwrap(thisArg) || unwrappedTarget
	const value = Reflect.get(unwrappedTarget, prop)
	if (typeof value === 'function') {
		if (value.constructor.name === 'RpcProperty') {
			return (...args: unknown[]) => unwrappedTarget[prop](...args)
		}
		return value.bind(thisArg)
	} else {
		return value
	}
}
