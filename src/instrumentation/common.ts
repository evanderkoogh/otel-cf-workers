const unwrapSymbol = Symbol('unwrap')

type Wrapped<T> = { [unwrapSymbol]: T } & T

function isWrapped<T>(item: T): item is Wrapped<T> {
	return !!(item as Wrapped<T>)[unwrapSymbol]
}

export function wrap<T extends object>(item: T, handler: ProxyHandler<T>): T {
	const proxyHandler = Object.assign({}, handler)
	proxyHandler.get = (target, prop, receiver) => {
		if (prop === unwrapSymbol) {
			console.log('Unwrapping!')
			return item
		} else {
			if (handler.get) {
				return handler.get(target, prop, receiver)
			}
		}
	}
	return new Proxy(item, proxyHandler)
}

export function unwrap<T extends object>(item: T): T {
	if (isWrapped(item)) {
		return item[unwrapSymbol]
	} else {
		return item
	}
}
