"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.versionAttributes = versionAttributes;
const env_js_1 = require("./env.js");
function versionAttributes(env) {
    const attributes = {};
    if (typeof env === 'object' && env !== null) {
        for (const [binding, data] of Object.entries(env)) {
            if ((0, env_js_1.isVersionMetadata)(data)) {
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