"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.instrumentGlobalCache = instrumentGlobalCache;
const api_1 = require("@opentelemetry/api");
const wrap_js_1 = require("../wrap.js");
const tracer = api_1.trace.getTracer('cache instrumentation');
function sanitiseURL(url) {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}${u.search}`;
}
function instrumentFunction(fn, cacheName, op) {
    const handler = {
        apply(target, thisArg, argArray) {
            return __awaiter(this, void 0, void 0, function* () {
                const attributes = {
                    'cache.name': cacheName,
                    'http.url': argArray[0].url ? sanitiseURL(argArray[0].url) : undefined,
                    'cache.operation': op,
                };
                const options = { kind: api_1.SpanKind.CLIENT, attributes };
                return tracer.startActiveSpan(`Cache ${cacheName} ${op}`, options, (span) => __awaiter(this, void 0, void 0, function* () {
                    const result = yield Reflect.apply(target, thisArg, argArray);
                    if (op === 'match') {
                        span.setAttribute('cache.hit', !!result);
                    }
                    span.end();
                    return result;
                }));
            });
        },
    };
    return (0, wrap_js_1.wrap)(fn, handler);
}
function instrumentCache(cache, cacheName) {
    const handler = {
        get(target, prop) {
            if (prop === 'delete' || prop === 'match' || prop === 'put') {
                const fn = Reflect.get(target, prop).bind(target);
                return instrumentFunction(fn, cacheName, prop);
            }
            else {
                return Reflect.get(target, prop);
            }
        },
    };
    return (0, wrap_js_1.wrap)(cache, handler);
}
function instrumentOpen(openFn) {
    const handler = {
        apply(target, thisArg, argArray) {
            return __awaiter(this, void 0, void 0, function* () {
                const cacheName = argArray[0];
                const cache = yield Reflect.apply(target, thisArg, argArray);
                return instrumentCache(cache, cacheName);
            });
        },
    };
    return (0, wrap_js_1.wrap)(openFn, handler);
}
function _instrumentGlobalCache() {
    const handler = {
        get(target, prop) {
            if (prop === 'default') {
                const cache = target.default;
                return instrumentCache(cache, 'default');
            }
            else if (prop === 'open') {
                const openFn = Reflect.get(target, prop).bind(target);
                return instrumentOpen(openFn);
            }
            else {
                return Reflect.get(target, prop);
            }
        },
    };
    //@ts-ignore
    globalThis.caches = (0, wrap_js_1.wrap)(caches, handler);
}
function instrumentGlobalCache() {
    return _instrumentGlobalCache();
}
//# sourceMappingURL=cache.js.map