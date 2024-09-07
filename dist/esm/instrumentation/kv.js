import { SpanKind, trace } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { wrap } from '../wrap.js';
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
    const tracer = trace.getTracer('KV');
    const fnHandler = {
        apply: (target, thisArg, argArray) => {
            const attributes = {
                binding_type: 'KV',
                [SemanticAttributes.DB_NAME]: name,
                [SemanticAttributes.DB_SYSTEM]: dbSystem,
                [SemanticAttributes.DB_OPERATION]: operation,
            };
            const options = {
                kind: SpanKind.CLIENT,
                attributes,
            };
            return tracer.startActiveSpan(`KV ${name} ${operation}`, options, async (span) => {
                const result = await Reflect.apply(target, thisArg, argArray);
                const extraAttrsFn = KVAttributes[operation];
                const extraAttrs = extraAttrsFn ? extraAttrsFn(argArray, result) : {};
                span.setAttributes(extraAttrs);
                if (operation === 'list') {
                    const opts = argArray[0] || {};
                    const { prefix } = opts;
                    span.setAttribute(SemanticAttributes.DB_STATEMENT, `${operation} ${prefix || undefined}`);
                }
                else {
                    span.setAttribute(SemanticAttributes.DB_STATEMENT, `${operation} ${argArray[0]}`);
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
            });
        },
    };
    return wrap(fn, fnHandler);
}
export function instrumentKV(kv, name) {
    const kvHandler = {
        get: (target, prop, receiver) => {
            const operation = String(prop);
            const fn = Reflect.get(target, prop, receiver);
            return instrumentKVFn(fn, name, operation);
        },
    };
    return wrap(kv, kvHandler);
}
//# sourceMappingURL=kv.js.map