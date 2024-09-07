const unwrapSymbol = Symbol('unwrap');
export function isWrapped(item) {
    return item && !!item[unwrapSymbol];
}
export function isProxyable(item) {
    return (item !== null && typeof item === 'object') || typeof item === 'function';
}
export function wrap(item, handler, autoPassthrough = true) {
    if (isWrapped(item) || !isProxyable(item)) {
        return item;
    }
    const proxyHandler = Object.assign({}, handler);
    proxyHandler.get = (target, prop, receiver) => {
        if (prop === unwrapSymbol) {
            return item;
        }
        else {
            if (handler.get) {
                return handler.get(target, prop, receiver);
            }
            else if (prop === 'bind') {
                return () => receiver;
            }
            else if (autoPassthrough) {
                return passthroughGet(target, prop);
            }
        }
    };
    proxyHandler.apply = (target, thisArg, argArray) => {
        if (handler.apply) {
            return handler.apply(unwrap(target), unwrap(thisArg), argArray);
        }
    };
    return new Proxy(item, proxyHandler);
}
export function unwrap(item) {
    if (item && isWrapped(item)) {
        return item[unwrapSymbol];
    }
    else {
        return item;
    }
}
export function passthroughGet(target, prop, thisArg) {
    const unwrappedTarget = unwrap(target);
    const value = Reflect.get(unwrappedTarget, prop);
    if (typeof value === 'function') {
        if (value.constructor.name === 'RpcProperty') {
            return (...args) => unwrappedTarget[prop](...args);
        }
        thisArg = thisArg || unwrappedTarget;
        return value.bind(thisArg);
    }
    else {
        return value;
    }
}
//# sourceMappingURL=wrap.js.map