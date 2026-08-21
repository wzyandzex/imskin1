/**
 * Playwright globalTeardown —— 写 E2E 证据文件。
 */

import { writeEvidence } from "./evidence.ts";

export default function teardown(): void {
  writeEvidence();
}
