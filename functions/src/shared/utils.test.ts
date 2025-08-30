import { ok, fail } from "./utils";

test("ok helper wraps data correctly", () => {
  expect(ok({ foo: "bar" })).toEqual({ ok: true, data: { foo: "bar" } });
});

test("fail helper sets message and code", () => {
  expect(fail("error", 500)).toEqual({ ok: false, code: 500, message: "error" });
});
