import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { beforeEach, describe, expect, test, vitest } from 'vitest'
import { AsyncLocalStorageContextManager } from '../../src/context'
import { instrumentStorage } from '../../src/instrumentation/do-storage'
import { context, trace } from '@opentelemetry/api'

const exporter = new InMemorySpanExporter()

const provider = new BasicTracerProvider({
	spanProcessors: [new SimpleSpanProcessor(exporter)],
})

trace.setGlobalTracerProvider(provider)
context.setGlobalContextManager(new AsyncLocalStorageContextManager())

// not entirely accurate, but enough to satisfy types
const sqlMock = {
	exec: vitest.fn().mockReturnValue(undefined),
	prepare: vitest.fn().mockReturnValue(undefined),
	ingest: vitest.fn().mockReturnValue(undefined),
	databaseSize: 0,
	Cursor: null as unknown as SqlStorageCursor<any>,
	Statement: null as unknown as SqlStorageStatement,
} as unknown as SqlStorage

const storage = {
	get: vitest.fn().mockResolvedValue(null),
	list: vitest.fn().mockResolvedValue(new Map()),
	put: vitest.fn().mockResolvedValue(undefined),
	delete: vitest.fn().mockResolvedValue(true),
	deleteAll: vitest.fn().mockResolvedValue(undefined),
	transaction: vitest.fn().mockResolvedValue(undefined),
	getAlarm: vitest.fn().mockResolvedValue(null),
	setAlarm: vitest.fn().mockResolvedValue(undefined),
	deleteAlarm: vitest.fn().mockResolvedValue(undefined),
	sync: vitest.fn().mockResolvedValue(undefined),
	transactionSync: vitest.fn().mockResolvedValue(undefined),
	getCurrentBookmark: vitest.fn().mockResolvedValue(''),
	getBookmarkForTime: vitest.fn().mockResolvedValue(''),
	onNextSessionRestoreBookmark: vitest.fn().mockResolvedValue(''),
	sql: sqlMock,
	waitForBookmark: vitest.fn().mockResolvedValue(null),
	ensureReplicas: vitest.fn().mockResolvedValue(null),
	disableReplicas: vitest.fn().mockResolvedValue(null),
} satisfies DurableObjectStorage

beforeEach(() => {
	exporter.reset()
	vitest.resetAllMocks()
})

describe('delete', () => {
	test('single key', async () => {
		const result = {}
		storage.delete.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.delete('key')).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage delete"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "db.cf.do.has_result": true,
			  "db.cf.do.key": "key",
			  "db.operation": "delete",
			  "db.statement": "delete key",
			  "db.system": "Cloudflare DO",
			  "operation": "delete",
			}
		`)
	})

	test('multiple keys', async () => {
		const result = {}
		storage.delete.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.delete(['key1', 'key2'])).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage delete"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "db.cf.do.has_result": true,
			  "db.cf.do.key": "key1",
			  "db.cf.do.number_of_keys": 2,
			  "db.operation": "delete",
			  "db.statement": "delete key1,key2",
			  "db.system": "Cloudflare DO",
			  "operation": "delete",
			}
		`)
	})

	test('with options', async () => {
		const result = {}
		storage.delete.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.delete('key', { allowConcurrency: true, noCache: true })).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage delete"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "db.cf.do.allow_concurrency": true,
			  "db.cf.do.has_result": true,
			  "db.cf.do.key": "key",
			  "db.cf.do.no_cache": true,
			  "db.operation": "delete",
			  "db.statement": "delete key",
			  "db.system": "Cloudflare DO",
			  "operation": "delete",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})

	test.skip('rejects with spans', async () => {
		const error = new Error()
		storage.delete.mockRejectedValue(error)

		const instrument = instrumentStorage(storage)
		await expect(instrument.delete('key')).rejects.toBe(error)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot()
		expect(spans[0]?.attributes).toMatchInlineSnapshot()
		expect(spans[0]?.events).toEqual([])
	})
})

describe('deleteAll', () => {
	test('without options', async () => {
		const instrument = instrumentStorage(storage)
		await expect(instrument.deleteAll()).resolves.toBe(undefined)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage deleteAll"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "db.cf.do.has_result": false,
			  "db.operation": "deleteAll",
			  "db.statement": "deleteAll undefined",
			  "db.system": "Cloudflare DO",
			  "operation": "deleteAll",
			}
		`)
	})

	test.skip('with options', async () => {
		const instrument = instrumentStorage(storage)
		await expect(
			instrument.deleteAll({
				allowConcurrency: true,
				allowUnconfirmed: true,
				noCache: true,
			}),
		).resolves.toBe(undefined)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot('"do:storage:deleteAll"')
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "allowConcurrency": true,
			  "hasResult": false,
			  "noCache": true,
			  "operation": "deleteAll",
			}
		`)
	})
})

describe('get', () => {
	test('single key', async () => {
		const result = {}
		storage.get.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.get('key')).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage get"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "db.cf.do.has_result": true,
			  "db.cf.do.key": "key",
			  "db.operation": "get",
			  "db.statement": "get key",
			  "db.system": "Cloudflare DO",
			  "operation": "get",
			}
		`)
	})

	test('multiple keys', async () => {
		const result = {}
		storage.get.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.get(['key1', 'key2'])).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage get"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "db.cf.do.has_result": true,
			  "db.cf.do.key": "key1",
			  "db.cf.do.number_of_keys": 2,
			  "db.operation": "get",
			  "db.statement": "get key1,key2",
			  "db.system": "Cloudflare DO",
			  "operation": "get",
			}
		`)
	})

	test('with options', async () => {
		const result = {}
		storage.get.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.get('key', { allowConcurrency: true, noCache: true })).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage get"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "db.cf.do.allow_concurrency": true,
			  "db.cf.do.has_result": true,
			  "db.cf.do.key": "key",
			  "db.cf.do.no_cache": true,
			  "db.operation": "get",
			  "db.statement": "get key",
			  "db.system": "Cloudflare DO",
			  "operation": "get",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})

	test.skip('rejects with spans', async () => {
		const error = new Error()
		storage.get.mockRejectedValue(error)

		const instrument = instrumentStorage(storage)
		await expect(instrument.list()).rejects.toBe(error)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot('"do:storage:get"')
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "operation": "get",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})
})

describe('list', () => {
	test('no args', async () => {
		const result = new Map()
		storage.list.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.list()).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage list"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "db.cf.do.has_result": true,
			  "db.cf.do.number_of_results": 0,
			  "db.operation": "list",
			  "db.statement": "list undefined",
			  "db.system": "Cloudflare DO",
			  "operation": "list",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})

	test('empty object arg', async () => {
		const result = new Map()
		storage.list.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.list({})).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage list"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "db.cf.do.has_result": true,
			  "db.cf.do.number_of_results": 0,
			  "db.operation": "list",
			  "db.statement": "list [object Object]",
			  "db.system": "Cloudflare DO",
			  "operation": "list",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})

	test.skip('rejects with spans', async () => {
		const error = new Error()
		storage.list.mockRejectedValue(error)

		const instrument = instrumentStorage(storage)
		await expect(instrument.list()).rejects.toBe(error)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot('"do:storage:list"')
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "operation": "list",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})
})

describe('put', () => {
	test('single entry', async () => {
		const instrument = instrumentStorage(storage)
		await expect(instrument.put('key', 'value')).resolves.toBeUndefined()

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage put"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "db.cf.do.has_result": false,
			  "db.cf.do.key": "key",
			  "db.operation": "put",
			  "db.statement": "put key",
			  "db.system": "Cloudflare DO",
			  "operation": "put",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})

	test('single entry with options', async () => {
		const instrument = instrumentStorage(storage)
		await expect(
			instrument.put('key', 'value', {
				allowConcurrency: true,
				noCache: true,
				allowUnconfirmed: true,
			}),
		).resolves.toBeUndefined()

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage put"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "db.cf.do.allow_concurrency": true,
			  "db.cf.do.allow_unconfirmed": true,
			  "db.cf.do.has_result": false,
			  "db.cf.do.key": "key",
			  "db.cf.do.no_cache": true,
			  "db.operation": "put",
			  "db.statement": "put key",
			  "db.system": "Cloudflare DO",
			  "operation": "put",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})

	test('multiple entries', async () => {
		const instrument = instrumentStorage(storage)
		await expect(
			instrument.put({
				key1: 'value1',
				key2: 'value2',
			}),
		).resolves.toBeUndefined()

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage put"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "db.cf.do.has_result": false,
			  "db.cf.do.key": "key1",
			  "db.cf.do.number_of_keys": 2,
			  "db.operation": "put",
			  "db.statement": "put [object Object]",
			  "db.system": "Cloudflare DO",
			  "operation": "put",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})

	test('multiple entries with options', async () => {
		const instrument = instrumentStorage(storage)
		await expect(
			instrument.put(
				{
					key1: 'value1',
					key2: 'value2',
				},
				{
					allowConcurrency: true,
					noCache: true,
					allowUnconfirmed: true,
				},
			),
		).resolves.toBeUndefined()

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage put"`)
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "db.cf.do.allow_concurrency": true,
			  "db.cf.do.allow_unconfirmed": true,
			  "db.cf.do.has_result": false,
			  "db.cf.do.key": "key1",
			  "db.cf.do.no_cache": true,
			  "db.cf.do.number_of_keys": 2,
			  "db.operation": "put",
			  "db.statement": "put [object Object]",
			  "db.system": "Cloudflare DO",
			  "operation": "put",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})

	test.skip('rejects with spans', async () => {
		const error = new Error()
		storage.put.mockRejectedValue(error)

		const instrument = instrumentStorage(storage)
		await expect(instrument.put('key', 'value')).rejects.toBe(error)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0]?.name).toMatchInlineSnapshot('"do:storage:put"')
		expect(spans[0]?.attributes).toMatchInlineSnapshot(`
			{
			  "operation": "put",
			}
		`)
		expect(spans[0]?.events).toEqual([])
	})
})

test('sync', async () => {
	const instrument = instrumentStorage(storage)
	await expect(instrument.sync()).resolves.toBe(undefined)

	const spans = exporter.getFinishedSpans()
	expect(spans).toHaveLength(1)
	expect(spans[0]?.name).toMatchInlineSnapshot(`"Durable Object Storage sync"`)
	expect(spans[0]?.attributes).toMatchInlineSnapshot(`
		{
		  "db.cf.do.has_result": false,
		  "db.operation": "sync",
		  "db.statement": "sync undefined",
		  "db.system": "Cloudflare DO",
		  "operation": "sync",
		}
	`)
})
