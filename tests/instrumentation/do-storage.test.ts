import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { beforeEach, describe, expect, test, vitest } from 'vitest'
import { AsyncLocalStorageContextManager } from '../../src/context'
import { instrumentStorage } from '../../src/instrumentation/do-storage'

const exporter = new InMemorySpanExporter()
const provider = new BasicTracerProvider()
provider.addSpanProcessor(new SimpleSpanProcessor(exporter))
provider.register({
	contextManager: new AsyncLocalStorageContextManager(),
})

const storage = {
	delete: vitest.fn().mockResolvedValue(true),
	deleteAlarm: vitest.fn().mockResolvedValue(undefined),
	deleteAll: vitest.fn().mockResolvedValue(undefined),
	get: vitest.fn().mockResolvedValue(null),
	getAlarm: vitest.fn().mockResolvedValue(null),
	list: vitest.fn().mockResolvedValue(new Map()),
	put: vitest.fn().mockResolvedValue(undefined),
	setAlarm: vitest.fn().mockResolvedValue(undefined),
	sync: vitest.fn().mockResolvedValue(undefined),
	transaction: vitest.fn().mockResolvedValue(undefined),
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
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:delete"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
			{
			  "do.storage.key": "key",
			  "hasResult": true,
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
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:delete"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
			{
			  "do.storage.key": "key1",
			  "do.storage.number_of_keys": 2,
			  "hasResult": true,
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
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:delete"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
			{
			  "allowConcurrency": true,
			  "do.storage.key": "key",
			  "hasResult": true,
			  "noCache": true,
			  "operation": "delete",
			}
		`)
		expect(spans[0].events).toEqual([])
	})

	test.skip('rejects with spans', async () => {
		const error = new Error()
		storage.delete.mockRejectedValue(error)

		const instrument = instrumentStorage(storage)
		await expect(instrument.delete('key')).rejects.toBe(error)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0].name).toMatchInlineSnapshot()
		expect(spans[0].attributes).toMatchInlineSnapshot()
		expect(spans[0].events).toEqual([])
	})
})

describe('deleteAll', () => {
	test('without options', async () => {
		const instrument = instrumentStorage(storage)
		await expect(instrument.deleteAll()).resolves.toBe(undefined)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:deleteAll"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
			{
			  "hasResult": false,
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
			})
		).resolves.toBe(undefined)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:deleteAll"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
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
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:get"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
			{
			  "do.storage.key": "key",
			  "hasResult": true,
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
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:get"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
			{
			  "do.storage.key": "key1",
			  "do.storage.number_of_keys": 2,
			  "hasResult": true,
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
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:get"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
			{
			  "allowConcurrency": true,
			  "do.storage.key": "key",
			  "hasResult": true,
			  "noCache": true,
			  "operation": "get",
			}
		`)
		expect(spans[0].events).toEqual([])
	})

	test.skip('rejects with spans', async () => {
		const error = new Error()
		storage.get.mockRejectedValue(error)

		const instrument = instrumentStorage(storage)
		await expect(instrument.list()).rejects.toBe(error)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:get"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
			{
			  "operation": "get",
			}
		`)
		expect(spans[0].events).toEqual([])
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
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:list"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
			{
			  "do.storage.number_of_results": 0,
			  "hasResult": true,
			  "operation": "list",
			}
		`)
		expect(spans[0].events).toEqual([])
	})

	test('empty object arg', async () => {
		const result = new Map()
		storage.list.mockResolvedValue(result)

		const instrument = instrumentStorage(storage)
		await expect(instrument.list({})).resolves.toBe(result)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:list"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
			{
			  "do.storage.number_of_results": 0,
			  "hasResult": true,
			  "operation": "list",
			}
		`)
		expect(spans[0].events).toEqual([])
	})

	test.skip('rejects with spans', async () => {
		const error = new Error()
		storage.list.mockRejectedValue(error)

		const instrument = instrumentStorage(storage)
		await expect(instrument.list()).rejects.toBe(error)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:list"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
			{
			  "operation": "list",
			}
		`)
		expect(spans[0].events).toEqual([])
	})
})

describe('put', () => {
	test('single entry', async () => {
		const instrument = instrumentStorage(storage)
		await expect(instrument.put('key', 'value')).resolves.toBeUndefined()

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:put"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
			{
			  "do.storage.key": "key",
			  "hasResult": false,
			  "operation": "put",
			}
		`)
		expect(spans[0].events).toEqual([])
	})

	test('single entry with options', async () => {
		const instrument = instrumentStorage(storage)
		await expect(
			instrument.put('key', 'value', {
				allowConcurrency: true,
				noCache: true,
				allowUnconfirmed: true,
			})
		).resolves.toBeUndefined()

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:put"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
			{
			  "allowConcurrency": true,
			  "allowUnconfirmed": true,
			  "do.storage.key": "key",
			  "hasResult": false,
			  "noCache": true,
			  "operation": "put",
			}
		`)
		expect(spans[0].events).toEqual([])
	})

	test('multiple entries', async () => {
		const instrument = instrumentStorage(storage)
		await expect(
			instrument.put({
				key1: 'value1',
				key2: 'value2',
			})
		).resolves.toBeUndefined()

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:put"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
			{
			  "hasResult": false,
			  "operation": "put",
			}
		`)
		expect(spans[0].events).toEqual([])
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
				}
			)
		).resolves.toBeUndefined()

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:put"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
			{
			  "hasResult": false,
			  "operation": "put",
			}
		`)
		expect(spans[0].events).toEqual([])
	})

	test.skip('rejects with spans', async () => {
		const error = new Error()
		storage.put.mockRejectedValue(error)

		const instrument = instrumentStorage(storage)
		await expect(instrument.put('key', 'value')).rejects.toBe(error)

		const spans = exporter.getFinishedSpans()
		expect(spans).toHaveLength(1)
		expect(spans[0].name).toMatchInlineSnapshot('"do:storage:put"')
		expect(spans[0].attributes).toMatchInlineSnapshot(`
			{
			  "operation": "put",
			}
		`)
		expect(spans[0].events).toEqual([])
	})
})

test('sync', async () => {
	const instrument = instrumentStorage(storage)
	await expect(instrument.sync()).resolves.toBe(undefined)

	const spans = exporter.getFinishedSpans()
	expect(spans).toHaveLength(1)
	expect(spans[0].name).toMatchInlineSnapshot('"do:storage:sync"')
	expect(spans[0].attributes).toMatchInlineSnapshot(`
		{
		  "hasResult": false,
		  "operation": "sync",
		}
	`)
})
