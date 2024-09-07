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
exports.instrumentKV = instrumentKV;
const api_1 = require("@opentelemetry/api");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const wrap_js_1 = require("../wrap.js");
const dbSystem = 'Cloudflare KV';
const KVAttributes = {
    delete(_argArray) {
        return {};
    },
    get(argArray) {
        const attrs = {};
        const opts = argArray[1];
        if (typeof opts === 'string') {
            attrs['db.cf.kv.type'] = opts;
        }
        else if (typeof opts === 'object') {
            attrs['db.cf.kv.type'] = opts.type;
            attrs['db.cf.kv.cache_ttl'] = opts.cacheTtl;
        }
        return attrs;
    },
    getWithMetadata(argArray, result) {
        const attrs = {};
        const opts = argArray[1];
        if (typeof opts === 'string') {
            attrs['db.cf.kv.type'] = opts;
        }
        else if (typeof opts === 'object') {
            attrs['db.cf.kv.type'] = opts.type;
            attrs['db.cf.kv.cache_ttl'] = opts.cacheTtl;
        }
        attrs['db.cf.kv.metadata'] = true;
        const { cacheStatus } = result;
        if (typeof cacheStatus === 'string') {
            attrs['db.cf.kv.cache_status'] = cacheStatus;
        }
        return attrs;
    },
    list(argArray, result) {
        const attrs = {};
        const opts = argArray[0] || {};
        const { cursor, limit } = opts;
        attrs['db.cf.kv.list_request_cursor'] = cursor || undefined;
        attrs['db.cf.kv.list_limit'] = limit || undefined;
        const { list_complete, cacheStatus } = result;
        attrs['db.cf.kv.list_complete'] = list_complete || undefined;
        if (!list_complete) {
            attrs['db.cf.kv.list_response_cursor'] = cursor || undefined;
        }
        if (typeof cacheStatus === 'string') {
            attrs['db.cf.kv.cache_status'] = cacheStatus;
        }
        return attrs;
    },
    put(argArray) {
        const attrs = {};
        if (argArray.length > 2 && argArray[2]) {
            const { expiration, expirationTtl, metadata } = argArray[2];
            attrs['db.cf.kv.expiration'] = expiration;
            attrs['db.cf.kv.expiration_ttl'] = expirationTtl;
            attrs['db.cf.kv.metadata'] = !!metadata;
        }
        return attrs;
    },
};
function instrumentKVFn(fn, name, operation) {
    const tracer = api_1.trace.getTracer('KV');
    const fnHandler = {
        apply: (target, thisArg, argArray) => {
            const attributes = {
                binding_type: 'KV',
                [semantic_conventions_1.SemanticAttributes.DB_NAME]: name,
                [semantic_conventions_1.SemanticAttributes.DB_SYSTEM]: dbSystem,
                [semantic_conventions_1.SemanticAttributes.DB_OPERATION]: operation,
            };
            const options = {
                kind: api_1.SpanKind.CLIENT,
                attributes,
            };
            return tracer.startActiveSpan(`KV ${name} ${operation}`, options, (span) => __awaiter(this, void 0, void 0, function* () {
                const result = yield Reflect.apply(target, thisArg, argArray);
                const extraAttrsFn = KVAttributes[operation];
                const extraAttrs = extraAttrsFn ? extraAttrsFn(argArray, result) : {};
                span.setAttributes(extraAttrs);
                if (operation === 'list') {
                    const opts = argArray[0] || {};
                    const { prefix } = opts;
                    span.setAttribute(semantic_conventions_1.SemanticAttributes.DB_STATEMENT, `${operation} ${prefix || undefined}`);
                }
                else {
                    span.setAttribute(semantic_conventions_1.SemanticAttributes.DB_STATEMENT, `${operation} ${argArray[0]}`);
                    span.setAttribute('db.cf.kv.key', argArray[0]);
                }
                if (operation === 'getWithMetadata') {
                    const hasResults = !!result && !!result.value;
                    span.setAttribute('db.cf.kv.has_result', hasResults);
                }
                else {
                    span.setAttribute('db.cf.kv.has_result', !!result);
                }
                span.end();
                return result;
            }));
        },
    };
    return (0, wrap_js_1.wrap)(fn, fnHandler);
}
function instrumentKV(kv, name) {
    const kvHandler = {
        get: (target, prop, receiver) => {
            const operation = String(prop);
            const fn = Reflect.get(target, prop, receiver);
            return instrumentKVFn(fn, name, operation);
        },
    };
    return (0, wrap_js_1.wrap)(kv, kvHandler);
}
//# sourceMappingURL=kv.js.map