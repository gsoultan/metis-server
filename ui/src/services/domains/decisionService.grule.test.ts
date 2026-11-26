import { afterEach, describe, expect, test } from "bun:test";
import { decisionService } from "./decisionService";
import { stubFetch } from "../shared/stubbedFetch";

describe("decisionService.importGruleRules", () => {
  let restore = () => {};
  afterEach(() => restore());

  test("sends the files and what to do with them, as the engine reads them", async () => {
    let sent;
    ({ restore, sent } = stubFetch({ import: { rules: [] } }));
    await decisionService.importGruleRules({
      projectId: "p1",
      key: "loan",
      files: [{ name: "loan.grl", content: "rule A {}" }],
      preview: true,
    });
    expect(sent[0].url).toEndWith("/decisions/import/grule");
    expect(sent[0].body).toEqual({
      project_id: "p1",
      key: "loan",
      files: [{ name: "loan.grl", content: "rule A {}" }],
      preview: true,
    });
  });

  test("raises the refusal, which names the file and line", async () => {
    ({ restore } = stubFetch({ err: "broken.grl: rule A: line 3: expected a value, found `then`" }));
    await expect(
      decisionService.importGruleRules({ projectId: "p1", key: "loan", files: [] }),
    ).rejects.toThrow("broken.grl: rule A: line 3");
  });
});
