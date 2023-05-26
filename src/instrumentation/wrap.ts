const unwrapSymbol = Symbol('unwrap')

type Wrapped<T> = { [unwrapSymbol]: T } & T

export function isWrapped<T>(item: T): item is Wrapped<T> {
	return !!(item as Wrapped<T>)[unwrapSymbol]
}

export function wrap<T extends object>(item: T, handler: ProxyHandler<T>): T {
	if (isWrapped(item)) {
		return item
	}
	const proxyHandler = Object.assign({}, handler)
	proxyHandler.get = (target, prop, receiver) => {
		if (prop === unwrapSymbol) {
			return item
		} else {
			if (handler.get) {
				return handler.get(target, prop, receiver)
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
