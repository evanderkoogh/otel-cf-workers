import { context as api_context, trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { passthroughGet, unwrap, wrap } from '../wrap.js';
import { getParentContextFromHeaders, gatherIncomingCfAttributes, gatherRequestAttributes, gatherResponseAttributes, instrumentClientFetch, } from './fetch.js';
import { instrumentEnv } from './env.js';
import { setConfig } from '../config.js';
import { exportSpans } from './common.js';
import { instrumentStorage } from './do-storage.js';
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
                return instrumentClientFetch(fetcher, () => ({ includeTraceContext: true }), attrs);
            }
            else {
                return passthroughGet(target, prop);
            }
        },
    };
    return wrap(stub, stubHandler);
}
function instrumentBindingGet(getFn, nsName) {
    const getHandler = {
        apply(target, thisArg, argArray) {
            const stub = Reflect.apply(target, thisArg, argArray);
            return instrumentBindingStub(stub, nsName);
        },
    };
    return wrap(getFn, getHandler);
}
export function instrumentDOBinding(ns, nsName) {
    const nsHandler = {
        get(target, prop) {
            if (prop === 'get') {
                const fn = Reflect.get(ns, prop);
                return instrumentBindingGet(fn, nsName);
            }
            else {
                return passthroughGet(target, prop);
            }
        },
    };
    return wrap(ns, nsHandler);
}
export function instrumentState(state) {
    const stateHandler = {
        get(target, prop, receiver) {
            const result = Reflect.get(target, prop, unwrap(receiver));
            if (prop === 'storage') {
                return instrumentStorage(result);
            }
            else if (typeof result === 'function') {
                return result.bind(target);
            }
            else {
                return result;
            }
        },
    };
    return wrap(state, stateHandler);
}
let cold_start = true;
export function executeDOFetch(fetchFn, request, id) {
    const spanContext = getParentContextFromHeaders(request.headers);
    const tracer = trace.getTracer('DO fetchHandler');
    const attributes = {
        [SemanticAttributes.FAAS_TRIGGER]: 'http',
        [SemanticAttributes.FAAS_COLDSTART]: cold_start,
    };
    cold_start = false;
    Object.assign(attributes, gatherRequestAttributes(request));
    Object.assign(attributes, gatherIncomingCfAttributes(request));
    const options = {
        attributes,
        kind: SpanKind.SERVER,
    };
    const name = id.name || '';
    const promise = tracer.startActiveSpan(`Durable Object Fetch ${name}`, options, spanContext, async (span) => {
        try {
            const response = await fetchFn(request);
            if (response.ok) {
                span.setStatus({ code: SpanStatusCode.OK });
            }
            span.setAttributes(gatherResponseAttributes(response));
            span.end();
            return response;
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR });
            span.end();
            throw error;
        }
    });
    return promise;
}
export function executeDOAlarm(alarmFn, id) {
    const tracer = trace.getTracer('DO alarmHandler');
    const name = id.name || '';
    const promise = tracer.startActiveSpan(`Durable Object Alarm ${name}`, async (span) => {
        span.setAttribute(SemanticAttributes.FAAS_COLDSTART, cold_start);
        cold_start = false;
        span.setAttribute('do.id', id.toString());
        if (id.name)
            span.setAttribute('do.name', id.name);
        try {
            await alarmFn();
            span.end();
        }
        catch (error) {
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR });
            span.end();
            throw error;
        }
    });
    return promise;
}
function instrumentFetchFn(fetchFn, initialiser, env, id) {
    const fetchHandler = {
        async apply(target, thisArg, argArray) {
            const request = argArray[0];
            const config = initialiser(env, request);
            const context = setConfig(config);
            try {
                const bound = target.bind(unwrap(thisArg));
                return await api_context.with(context, executeDOFetch, undefined, bound, request, id);
            }
            catch (error) {
                throw error;
            }
            finally {
                exportSpans();
            }
        },
    };
    return wrap(fetchFn, fetchHandler);
}
function instrumentAlarmFn(alarmFn, initialiser, env, id) {
    if (!alarmFn)
        return undefined;
    const alarmHandler = {
        async apply(target, thisArg) {
            const config = initialiser(env, 'do-alarm');
            const context = setConfig(config);
            try {
                const bound = target.bind(unwrap(thisArg));
                return await api_context.with(context, executeDOAlarm, undefined, bound, id);
            }
            catch (error) {
                throw error;
            }
            finally {
                exportSpans();
            }
        },
    };
    return wrap(alarmFn, alarmHandler);
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
    return wrap(doObj, objHandler);
}
export function instrumentDOClass(doClass, initialiser) {
    const classHandler = {
        construct(target, [orig_state, orig_env]) {
            const trigger = {
                id: orig_state.id.toString(),
                name: orig_state.id.name,
            };
            const constructorConfig = initialiser(orig_env, trigger);
            const context = setConfig(constructorConfig);
            const state = instrumentState(orig_state);
            const env = instrumentEnv(orig_env);
            const createDO = () => {
                return new target(state, env);
            };
            const doObj = api_context.with(context, createDO);
            return instrumentDurableObject(doObj, initialiser, env, state);
        },
    };
    return wrap(doClass, classHandler);
}
//# sourceMappingURL=do.js.map