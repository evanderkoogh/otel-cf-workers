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
exports.instrumentDOBinding = instrumentDOBinding;
exports.instrumentState = instrumentState;
exports.executeDOFetch = executeDOFetch;
exports.executeDOAlarm = executeDOAlarm;
exports.instrumentDOClass = instrumentDOClass;
const api_1 = require("@opentelemetry/api");
const semantic_conventions_1 = require("@opentelemetry/semantic-conventions");
const wrap_js_1 = require("../wrap.js");
const fetch_js_1 = require("./fetch.js");
const env_js_1 = require("./env.js");
const config_js_1 = require("../config.js");
const common_js_1 = require("./common.js");
const do_storage_js_1 = require("./do-storage.js");
function instrumentBindingStub(stub, nsName) {
    const stubHandler = {
        get(target, prop) {
            if (prop === 'fetch') {
                const fetcher = Reflect.get(target, prop);
                const attrs = {
                    name: `Durable Object ${nsName}`,
                    'do.namespace': nsName,
                    'do.id': target.id.toString(),
                    'do.id.name': target.id.name,
                };
                return (0, fetch_js_1.instrumentClientFetch)(fetcher, () => ({ includeTraceContext: true }), attrs);
            }
            else {
                return (0, wrap_js_1.passthroughGet)(target, prop);
            }
        },
    };
    return (0, wrap_js_1.wrap)(stub, stubHandler);
}
function instrumentBindingGet(getFn, nsName) {
    const getHandler = {
        apply(target, thisArg, argArray) {
            const stub = Reflect.apply(target, thisArg, argArray);
            return instrumentBindingStub(stub, nsName);
        },
    };
    return (0, wrap_js_1.wrap)(getFn, getHandler);
}
function instrumentDOBinding(ns, nsName) {
    const nsHandler = {
        get(target, prop) {
            if (prop === 'get') {
                const fn = Reflect.get(ns, prop);
                return instrumentBindingGet(fn, nsName);
            }
            else {
                return (0, wrap_js_1.passthroughGet)(target, prop);
            }
        },
    };
    return (0, wrap_js_1.wrap)(ns, nsHandler);
}
function instrumentState(state) {
    const stateHandler = {
        get(target, prop, receiver) {
            const result = Reflect.get(target, prop, (0, wrap_js_1.unwrap)(receiver));
            if (prop === 'storage') {
                return (0, do_storage_js_1.instrumentStorage)(result);
            }
            else if (typeof result === 'function') {
                return result.bind(target);
            }
            else {
                return result;
            }
        },
    };
    return (0, wrap_js_1.wrap)(state, stateHandler);
}
let cold_start = true;
function executeDOFetch(fetchFn, request, id) {
    const spanContext = (0, fetch_js_1.getParentContextFromHeaders)(request.headers);
    const tracer = api_1.trace.getTracer('DO fetchHandler');
    const attributes = {
        [semantic_conventions_1.SemanticAttributes.FAAS_TRIGGER]: 'http',
        [semantic_conventions_1.SemanticAttributes.FAAS_COLDSTART]: cold_start,
    };
    cold_start = false;
    Object.assign(attributes, (0, fetch_js_1.gatherRequestAttributes)(request));
    Object.assign(attributes, (0, fetch_js_1.gatherIncomingCfAttributes)(request));
    const options = {
        attributes,
        kind: api_1.SpanKind.SERVER,
    };
    const name = id.name || '';
    const promise = tracer.startActiveSpan(`Durable Object Fetch ${name}`, options, spanContext, (span) => __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetchFn(request);
            if (response.ok) {
                span.setStatus({ code: api_1.SpanStatusCode.OK });
            }
            span.setAttributes((0, fetch_js_1.gatherResponseAttributes)(response));
            span.end();
            return response;
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: api_1.SpanStatusCode.ERROR });
            span.end();
            throw error;
        }
    }));
    return promise;
}
function executeDOAlarm(alarmFn, id) {
    const tracer = api_1.trace.getTracer('DO alarmHandler');
    const name = id.name || '';
    const promise = tracer.startActiveSpan(`Durable Object Alarm ${name}`, (span) => __awaiter(this, void 0, void 0, function* () {
        span.setAttribute(semantic_conventions_1.SemanticAttributes.FAAS_COLDSTART, cold_start);
        cold_start = false;
        span.setAttribute('do.id', id.toString());
        if (id.name)
            span.setAttribute('do.name', id.name);
        try {
            yield alarmFn();
            span.end();
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: api_1.SpanStatusCode.ERROR });
            span.end();
            throw error;
        }
    }));
    return promise;
}
function instrumentFetchFn(fetchFn, initialiser, env, id) {
    const fetchHandler = {
        apply(target, thisArg, argArray) {
            return __awaiter(this, void 0, void 0, function* () {
                const request = argArray[0];
                const config = initialiser(env, request);
                const context = (0, config_js_1.setConfig)(config);
                try {
                    const bound = target.bind((0, wrap_js_1.unwrap)(thisArg));
                    return yield api_1.context.with(context, executeDOFetch, undefined, bound, request, id);
                }
                catch (error) {
                    throw error;
                }
                finally {
                    (0, common_js_1.exportSpans)();
                }
            });
        },
    };
    return (0, wrap_js_1.wrap)(fetchFn, fetchHandler);
}
function instrumentAlarmFn(alarmFn, initialiser, env, id) {
    if (!alarmFn)
        return undefined;
    const alarmHandler = {
        apply(target, thisArg) {
            return __awaiter(this, void 0, void 0, function* () {
                const config = initialiser(env, 'do-alarm');
                const context = (0, config_js_1.setConfig)(config);
                try {
                    const bound = target.bind((0, wrap_js_1.unwrap)(thisArg));
                    return yield api_1.context.with(context, executeDOAlarm, undefined, bound, id);
                }
                catch (error) {
                    throw error;
                }
                finally {
                    (0, common_js_1.exportSpans)();
                }
            });
        },
    };
    return (0, wrap_js_1.wrap)(alarmFn, alarmHandler);
}
function instrumentDurableObject(doObj, initialiser, env, state) {
    const objHandler = {
        get(target, prop) {
            if (prop === 'fetch') {
                const fetchFn = Reflect.get(target, prop);
                return instrumentFetchFn(fetchFn, initialiser, env, state.id);
            }
            else if (prop === 'alarm') {
                const alarmFn = Reflect.get(target, prop);
                return instrumentAlarmFn(alarmFn, initialiser, env, state.id);
            }
            else {
                const result = Reflect.get(target, prop);
                if (typeof result === 'function') {
                    result.bind(doObj);
                }
                return result;
            }
        },
    };
    return (0, wrap_js_1.wrap)(doObj, objHandler);
}
function instrumentDOClass(doClass, initialiser) {
    const classHandler = {
        construct(target, [orig_state, orig_env]) {
            const trigger = {
                id: orig_state.id.toString(),
                name: orig_state.id.name,
            };
            const constructorConfig = initialiser(orig_env, trigger);
            const context = (0, config_js_1.setConfig)(constructorConfig);
            const state = instrumentState(orig_state);
            const env = (0, env_js_1.instrumentEnv)(orig_env);
            const createDO = () => {
                return new target(state, env);
            };
            const doObj = api_1.context.with(context, createDO);
            return instrumentDurableObject(doObj, initialiser, env, state);
        },
    };
    return (0, wrap_js_1.wrap)(doClass, classHandler);
}
//# sourceMappingURL=do.js.map