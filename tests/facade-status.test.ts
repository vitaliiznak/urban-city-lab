import test from "node:test";
import assert from "node:assert/strict";
import { HOSTED_PAYWALL, PHOTO_SALES_EMAIL, PHOTO_SALES_MAILTO, facadePaintLocked, readFacadeStatus } from "../src/facade-tool/status";

function response(ok: boolean, status = ok ? 200 : 404) {
  return { ok, status } as Response;
}

test("missing or HTML facade status is a hosted paywall", () => {
  assert.deepEqual(readFacadeStatus(response(false), null), HOSTED_PAYWALL);
  assert.deepEqual(readFacadeStatus(response(true), "<!doctype html>"), HOSTED_PAYWALL);
  assert.deepEqual(readFacadeStatus(response(true), { error: "not found" }), HOSTED_PAYWALL);
});

test("local vision status is not hosted", () => {
  const status = readFacadeStatus(response(true), {
    llm: "none",
    codex: false,
    api: false,
    paywalled: true,
  });
  assert.equal(status.hosted, false);
  assert.equal(facadePaintLocked(status, false), true);
  assert.equal(facadePaintLocked(status, true), false);
});

test("hosted production stays locked even after a local unlock flag", () => {
  assert.equal(facadePaintLocked(HOSTED_PAYWALL, true), true);
  assert.equal(facadePaintLocked({ llm: "codex-cli", codex: true, api: false, paywalled: false }, false), false);
});

test("sales mail asks to buy City Lab Photo", () => {
  assert.equal(PHOTO_SALES_EMAIL, "signumcode@gmail.com");
  assert.match(PHOTO_SALES_MAILTO, /^mailto:signumcode@gmail.com\?/);
  assert.match(PHOTO_SALES_MAILTO, /City%20Lab%20Photo/);
  assert.match(PHOTO_SALES_MAILTO, /buy%20City%20Lab%20Photo/);
});
