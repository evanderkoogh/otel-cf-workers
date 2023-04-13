import { Attributes } from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'

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

export function gatherRequestAttributes(request: Request): Attributes {
	const attrs: Record<string, string | number> = {}
	const headers = request.headers
	// attrs[SemanticAttributes.HTTP_CLIENT_IP] = '1.1.1.1'
	attrs[SemanticAttributes.HTTP_METHOD] = request.method
	attrs[SemanticAttributes.HTTP_URL] = sanitiseURL(request.url)
	attrs[SemanticAttributes.HTTP_USER_AGENT] = headers.get('user-agent')!
	attrs[SemanticAttributes.HTTP_REQUEST_CONTENT_LENGTH] = headers.get('content-length')!
	attrs['http.request_content-type'] = headers.get('content-type')!
	attrs['http.accepts'] = headers.get('accepts')!
	return attrs
}

export function gatherResponseAttributes(response: Response): Attributes {
	const attrs: Record<string, string | number> = {}
	attrs[SemanticAttributes.HTTP_STATUS_CODE] = response.status
	attrs[SemanticAttributes.HTTP_RESPONSE_CONTENT_LENGTH] = response.headers.get('content-length')!
	attrs['http.response_content-type'] = response.headers.get('content-type')!
	return attrs
}
