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
exports.instrumentStorage = instrumentStorage;
const api_1 = require("@opentelemetry/api");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const wrap_js_1 = require("../wrap.js");
const dbSystem = 'Cloudflare DO';
function isDurableObjectCommonOptions(options) {
    return (typeof options === 'object' &&
        ('allowConcurrency' in options || 'allowUnconfirmed' in options || 'noCache' in options));
}
/** Applies attributes for common Durable Objects options:
 * `allowConcurrency`, `allowUnconfirmed`, and `noCache`
 */
function applyOptionsAttributes(attrs, options) {
    if ('allowConcurrency' in options) {
        attrs['db.cf.do.allow_concurrency'] = options.allowConcurrency;
    }
    if ('allowUnconfirmed' in options) {
        attrs['db.cf.do.allow_unconfirmed'] = options.allowUnconfirmed;
    }
    if ('noCache' in options) {
        attrs['db.cf.do.no_cache'] = options.noCache;
    }
}
const StorageAttributes = {
    delete(argArray, result) {
        const args = argArray;
        let attrs = {};
        if (Array.isArray(args[0])) {
            const keys = args[0];
            attrs = {
                // todo: Maybe set db.cf.do.keys to the whole array here?
                'db.cf.do.key': keys[0],
                'db.cf.do.number_of_keys': keys.length,
                'db.cf.do.keys_deleted': result,
            };
        }
        else {
            attrs = {
                'db.cf.do.key': args[0],
                'db.cf.do.success': result,
            };
        }
        if (args[1]) {
            applyOptionsAttributes(attrs, args[1]);
        }
        return attrs;
    },
    deleteAll(argArray) {
        const args = argArray;
        let attrs = {};
        if (args[0]) {
            applyOptionsAttributes(attrs, args[0]);
        }
        return attrs;
    },
    get(argArray) {
        const args = argArray;
        let attrs = {};
        if (Array.isArray(args[0])) {
            const keys = args[0];
            attrs = {
                // todo: Maybe set db.cf.do.keys to the whole array here?
                'db.cf.do.key': keys[0],
                'db.cf.do.number_of_keys': keys.length,
            };
        }
        else {
            attrs = {
                'db.cf.do.key': args[0],
            };
        }
        if (args[1]) {
            applyOptionsAttributes(attrs, args[1]);
        }
        return attrs;
    },
    list(argArray, result) {
        const args = argArray;
        const attrs = {
            'db.cf.do.number_of_results': result.size,
        };
        if (args[0]) {
            const options = args[0];
            applyOptionsAttributes(attrs, options);
            if ('start' in options) {
                attrs['db.cf.do.start'] = options.start;
            }
            if ('startAfter' in options) {
                attrs['db.cf.do.start_after'] = options.startAfter;
            }
            if ('end' in options) {
                attrs['db.cf.do.end'] = options.end;
            }
            if ('prefix' in options) {
                attrs['db.cf.do.prefix'] = options.prefix;
            }
            if ('reverse' in options) {
                attrs['db.cf.do.reverse'] = options.reverse;
            }
            if ('limit' in options) {
                attrs['db.cf.do.limit'] = options.limit;
            }
        }
        return attrs;
    },
    put(argArray) {
        const args = argArray;
        const attrs = {};
        if (typeof args[0] === 'string') {
            attrs['db.cf.do.key'] = args[0];
            if (args[2]) {
                applyOptionsAttributes(attrs, args[2]);
            }
        }
        else {
            const keys = Object.keys(args[0]);
            // todo: Maybe set db.cf.do.keys to the whole array here?
            attrs['db.cf.do.key'] = keys[0];
            attrs['db.cf.do.number_of_keys'] = keys.length;
            if (isDurableObjectCommonOptions(args[1])) {
                applyOptionsAttributes(attrs, args[1]);
            }
        }
        return attrs;
    },
    getAlarm(argArray) {
        const args = argArray;
        const attrs = {};
        if (args[0]) {
            applyOptionsAttributes(attrs, args[0]);
        }
        return attrs;
    },
    setAlarm(argArray) {
        const args = argArray;
        const attrs = {};
        if (args[0] instanceof Date) {
            attrs['db.cf.do.alarm_time'] = args[0].getTime();
        }
        else {
            attrs['db.cf.do.alarm_time'] = args[0];
        }
        if (args[1]) {
            applyOptionsAttributes(attrs, args[1]);
        }
        return attrs;
    },
    deleteAlarm(argArray) {
        const args = argArray;
        const attrs = {};
        if (args[0]) {
            applyOptionsAttributes(attrs, args[0]);
        }
        return attrs;
    },
};
function instrumentStorageFn(fn, operation) {
    const tracer = api_1.trace.getTracer('do_storage');
    const fnHandler = {
        apply: (target, thisArg, argArray) => {
            const attributes = {
                [semantic_conventions_1.SemanticAttributes.DB_SYSTEM]: dbSystem,
                [semantic_conventions_1.SemanticAttributes.DB_OPERATION]: operation,
                [semantic_conventions_1.SemanticAttributes.DB_STATEMENT]: `${operation} ${argArray[0]}`,
            };
            const options = {
                kind: api_1.SpanKind.CLIENT,
                attributes: Object.assign(Object.assign({}, attributes), { operation }),
            };
            return tracer.startActiveSpan(`Durable Object Storage ${operation}`, options, (span) => __awaiter(this, void 0, void 0, function* () {
                const result = yield Reflect.apply(target, thisArg, argArray);
                const extraAttrsFn = StorageAttributes[operation];
                const extraAttrs = extraAttrsFn ? extraAttrsFn(argArray, result) : {};
                span.setAttributes(extraAttrs);
                span.setAttribute('db.cf.do.has_result', !!result);
                span.end();
                return result;
            }));
        },
    };
    return (0, wrap_js_1.wrap)(fn, fnHandler);
}
function instrumentStorage(storage) {
    const storageHandler = {
        get: (target, prop, receiver) => {
            const operation = String(prop);
            const fn = Reflect.get(target, prop, receiver);
            return instrumentStorageFn(fn, operation);
        },
    };
    return (0, wrap_js_1.wrap)(storage, storageHandler);
}
//# sourceMappingURL=do-storage.js.map