import { Attributes, SpanKind, SpanOptions, SpanStatusCode, Exception, trace } from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { wrap } from '../wrap.js'

const dbSystem = 'Cloudflare D1'

// We need to peak into D1 "internals" to instrument batch queries
// See: https://github.com/cloudflare/workerd/blob/5d27f8f7f1f9b584f673d2f11c9032f5a776ec55/src/cloudflare/internal/d1-api.ts#L173
interface D1StatementInternals {
	statement: string
	params: unknown[]
}

function metaAttributes(meta: D1Meta): Attributes {
	return {
		'db.cf.d1.rows_read': meta.rows_read,
		'db.cf.d1.rows_written': meta.rows_written,
		'db.cf.d1.duration': meta.duration,
		'db.cf.d1.size_after': meta.size_after,
		'db.cf.d1.last_row_id': meta.last_row_id,
		'db.cf.d1.changed_db': meta.changed_db,
		'db.cf.d1.changes': meta.changes,
	}
}
function spanOptions(dbName: string, operation: string, sql?: string): SpanOptions {
	const attributes: Attributes = {
		binding_type: 'D1',
		[SemanticAttributes.DB_NAME]: dbName,
		[SemanticAttributes.DB_SYSTEM]: dbSystem,
		[SemanticAttributes.DB_OPERATION]: operation,
	}
	if (sql) {
		attributes[SemanticAttributes.DB_STATEMENT] = sql
	}
	return {
		kind: SpanKind.CLIENT,
		attributes,
	}
}

function instrumentD1StatementFn(fn: Function, dbName: string, operation: string, sql: string) {
	const tracer = trace.getTracer('D1')
	const fnHandler: ProxyHandler<any> = {
		apply: (target, thisArg, argArray) => {
			if (operation === 'bind') {
				const newStmt = Reflect.apply(target, thisArg, argArray) as D1PreparedStatement
				return instrumentD1PreparedStatement(newStmt, dbName, sql)
			}

			const options = spanOptions(dbName, operation, sql)
			return tracer.startActiveSpan(`${dbName} ${operation}`, options, async (span) => {
				try {
					const result = await Reflect.apply(target, thisArg, argArray)
					if (operation === 'all' || operation === 'run') {
						span.setAttributes(metaAttributes((result as D1Result).meta))
					}
					span.setStatus({ code: SpanStatusCode.OK })
					return result
				} catch (error) {
					span.recordException(error as Exception)
					span.setStatus({ code: SpanStatusCode.ERROR })
					throw error
				} finally {
					span.end()
				}
			})
		},
	}
	return wrap(fn, fnHandler)
}

function instrumentD1PreparedStatement(
	stmt: D1PreparedStatement,
	dbName: string,
	statement: string,
): D1PreparedStatement {
	const statementHandler: ProxyHandler<D1PreparedStatement> = {
		get: (target, prop, receiver) => {
			const operation = String(prop)
			const fn = Reflect.get(target, prop, receiver)
			if (typeof fn === 'function') {
				return instrumentD1StatementFn(fn, dbName, operation, statement)
			}
			return fn
		},
	}
	return wrap(stmt, statementHandler)
}

export function instrumentD1Fn(fn: Function, dbName: string, operation: string) {
	const tracer = trace.getTracer('D1')
	const fnHandler: ProxyHandler<any> = {
		apply: (target, thisArg, argArray) => {
			if (operation === 'prepare') {
				const sql = argArray[0] as string
				const stmt = Reflect.apply(target, thisArg, argArray) as D1PreparedStatement
				return instrumentD1PreparedStatement(stmt, dbName, sql)
			} else if (operation === 'exec') {
				const sql = argArray[0] as string
				const options = spanOptions(dbName, operation, sql)
				return tracer.startActiveSpan(`${dbName} ${operation}`, options, async (span) => {
					try {
						const result = await Reflect.apply(target, thisArg, argArray)
						span.setStatus({ code: SpanStatusCode.OK })
						return result
					} catch (error) {
						span.recordException(error as Exception)
						span.setStatus({ code: SpanStatusCode.ERROR })
						throw error
					} finally {
						span.end()
					}
				})
			} else if (operation === 'batch') {
				// Create span for each statement, requires peeaking into D1 internals ...
				const statements = argArray[0] as D1StatementInternals[]
				return tracer.startActiveSpan(`${dbName} ${operation}`, async (span) => {
					// Create a span per query in the batch
					const subSpans = statements.map((s) =>
						tracer.startSpan(`${dbName} ${operation} > query`, spanOptions(dbName, operation, s.statement)),
					)

					try {
						const result = (await Reflect.apply(target, thisArg, argArray)) as D1Result[]
						result.forEach((r, i) => subSpans[i]?.setAttributes(metaAttributes(r.meta)))
						span.setStatus({ code: SpanStatusCode.OK })
						return result
					} catch (error) {
						span.recordException(error as Exception)
						span.setStatus({ code: SpanStatusCode.ERROR })
						throw error
					} finally {
						subSpans.forEach((s) => s.end())
						span.end()
					}
				})
			} else {
				return Reflect.apply(target, thisArg, argArray)
			}
		},
	}
	return wrap(fn, fnHandler)
}

export function instrumentD1(database: D1Database, dbName: string): D1Database {
	const dbHandler: ProxyHandler<D1Database> = {
		get: (target, prop, receiver) => {
			const operation = String(prop)
			const fn = Reflect.get(target, prop, receiver)
			if (typeof fn === 'function') {
				return instrumentD1Fn(fn, dbName, operation)
			}
			return fn
		},
	}
	return wrap(database, dbHandler)
}
