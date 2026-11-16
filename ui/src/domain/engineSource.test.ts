import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Named .test.ts so the app's build (tsconfig.app.json) leaves it out: it reads
// the file system, which only a test may.

/**
 * Where the tests that check the UI against the engine's own source find it.
 *
 * Some rules are written down on both sides (the password length, the node
 * types the designer must offer, the routes the SDK screen prints), and these
 * tests read the engine's Go source rather than keep a second copy that could
 * drift. The engine lives in gsoultan/metis, so they need a checkout of it:
 * METIS_ENGINE_DIR, or ../metis next to this repository.
 *
 * A missing checkout fails the test with this message rather than skipping it:
 * a check that quietly stops running is how the two sides drifted before.
 */
export function engineRoot(): string {
  const configured = process.env.METIS_ENGINE_DIR;
  const root = configured ? resolve(configured) : join(import.meta.dir, '..', '..', '..', '..', 'metis');
  if (!existsSync(join(root, 'server'))) {
    throw new Error(
      `No metis engine checkout at ${root}. Clone gsoultan/metis there, or set METIS_ENGINE_DIR to one.`,
    );
  }
  return root;
}

/**
 * Where the tests that check the SDK screen's Go snippets against metis-sdk
 * find its source: METIS_SDK_DIR, or ../metis-sdk next to this repository.
 * Missing, the test fails with this message rather than skipping, for the
 * same reason as engineRoot.
 */
export function sdkRoot(): string {
  const configured = process.env.METIS_SDK_DIR;
  const root = configured ? resolve(configured) : join(import.meta.dir, '..', '..', '..', '..', 'metis-sdk');
  if (!existsSync(join(root, 'worker.go'))) {
    throw new Error(
      `No metis-sdk checkout at ${root}. Clone gsoultan/metis-sdk there, or set METIS_SDK_DIR to one.`,
    );
  }
  return root;
}
