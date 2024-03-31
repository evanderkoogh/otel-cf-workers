import { isVersionMetadata } from './env'

export function versionAttributes(env: unknown): Record<string, string | undefined> {
	const attributes = {} as Record<string, string | undefined>

	if (typeof env === 'object' && env !== null) {
		for (const [binding, data] of Object.entries(env)) {
			if (isVersionMetadata(data)) {
				attributes['cf.gradual_rollouts.binding'] = binding
				attributes['cf.gradual_rollouts.id'] = data.id
				attributes['cf.gradual_rollouts.tag'] = data.tag
				// Version metadata bindings are identical, so we can stop after the first one found
				break
			}
		}
	}

	return attributes
}
