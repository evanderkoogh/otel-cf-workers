const unwrapSymbol = Symbol('unwrap')

type Wrapped<T> = { [unwrapSymbol]: T } & T

export function isWrapped<T>(item: T): item is Wrapped<T> {
	return item && !!(item as Wrapped<T>)[unwrapSymbol]
}

function isProxyable(item: any) {
	return typeof item === 'object' || typeof item === 'function'
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
				return () => receiver
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
	const value = Reflect.get(unwrap(target), prop)
	if (typeof value === 'function') {
		thisArg = thisArg || unwrap(target)
		const bound = value.bind(thisArg)
		return bound
	} else {
		return value
	}
}
