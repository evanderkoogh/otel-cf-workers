import { isVersionMetadata } from './env.js'

export function versionAttributes(env: unknown): Record<string, string | undefined> {
	const attributes = {} as Record<string, string | undefined>

	if (typeof env === 'object' && env !== null) {
		for (const [binding, data] of Object.entries(env)) {
			if (isVersionMetadata(data)) {
				attributes['cf.script_version.binding'] = binding
				attributes['cf.script_version.id'] = data.id
				attributes['cf.script_version.tag'] = data.tag
				// Version metadata bindings are identical, so we can stop after the first one found
				break
			}
		}
	}

	return attributes
}
