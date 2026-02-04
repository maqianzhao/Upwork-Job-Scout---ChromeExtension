import { describe, it, expect } from "vitest";
import { transition } from "../extension/src/core/state.js";

describe("state transition", () => {
  it("starts run from idle", () => {
    const state = { status: "IDLE" };
    const next = transition(state, "UI_START_CLICK", { run_id: "r1" });
    expect(next.status).toBe("RUNNING_LIST");
    expect(next.run_id).toBe("r1");
  });

  it("moves to exporting on stop drained", () => {
    const state = { status: "STOPPING" };
    const next = transition(state, "STOPPING_DRAINED", {});
    expect(next.status).toBe("EXPORTING");
    expect(next.post_export_status).toBe("STOPPED");
  });

  it("finalizes export to done", () => {
    const state = { status: "EXPORTING", post_export_status: "DONE" };
    const next = transition(state, "EXPORT_ALL_DONE", {});
    expect(next.status).toBe("DONE");
  });
});
