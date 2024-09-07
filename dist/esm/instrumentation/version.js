import { isVersionMetadata } from './env.js';
export function versionAttributes(env) {
    const attributes = {};
    if (typeof env === 'object' && env !== null) {
        for (const [binding, data] of Object.entries(env)) {
            if (isVersionMetadata(data)) {
                attributes['cf.workers_version_metadata.binding'] = binding;
                attributes['cf.workers_version_metadata.id'] = data.id;
                attributes['cf.workers_version_metadata.tag'] = data.tag;
                // Version metadata bindings are identical, so we can stop after the first one found
                break;
            }
        }
    }
    return attributes;
}
//# sourceMappingURL=version.js.map