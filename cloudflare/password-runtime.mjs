import * as opaque from '@serenity-kit/opaque';

// Node uses the pinned package; Wrangler aliases it to the reviewed static-WASM build.
const runtime = Object.freeze({ server: opaque.server });
export async function getPasswordRuntime() {
  await opaque.ready;
  return runtime;
}
