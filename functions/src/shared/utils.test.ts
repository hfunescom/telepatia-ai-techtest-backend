// src/shared/utils.test.ts
import { err } from "./utils";

test("fail helper sets message and code", () => {
  const out = err("error", "500");
  expect(out).toEqual(
    expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: "error",
        message: "500",
      }),
    })
  );
});
