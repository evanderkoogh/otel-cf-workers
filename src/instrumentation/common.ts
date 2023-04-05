const unwrapSymbol = Symbol('unwrap')

export function sanitiseURL(url: string): string {
	const u = new URL(url)
	return `${u.protocol}//${u.host}${u.pathname}${u.search}`
}

type Wrapped<T> = { [unwrapSymbol]: T } & T

export function isWrapped<T>(item: T): item is Wrapped<T> {
	return !!(item as Wrapped<T>)[unwrapSymbol]
}

export function wrap<T extends object>(item: T, handler: ProxyHandler<T>): T {
	if (isWrapped(item)) {
		throw new Error("Can't wrap an object twice")
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
	return new Proxy(item, proxyHandler)
}

export function unwrap<T extends object>(item: T): T {
	if (isWrapped(item)) {
		return item[unwrapSymbol]
	} else {
		return item
	}
}
