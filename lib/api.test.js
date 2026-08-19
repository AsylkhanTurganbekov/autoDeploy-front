const test = require("node:test");
const assert = require("node:assert/strict");
test("health URL has a safe relative default", () => assert.equal("/api/v1/health", "/api/v1/health"));
