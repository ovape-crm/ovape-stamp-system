import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../src/app/_domains/_customer/_utils/followUpRemarkNote.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { formatFollowUpRemarkNote, getFollowUpRemarkContent } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`,
);

test("처리 필요 등록 표시는 저장과 수정 후에도 한 번만 남는다", () => {
  assert.equal(
    formatFollowUpRemarkNote("연락 필요"),
    "[처리 필요 등록]\n연락 필요",
  );
  assert.equal(
    formatFollowUpRemarkNote("[처리 필요 등록]\n연락 필요"),
    "[처리 필요 등록]\n연락 필요",
  );
  assert.equal(
    getFollowUpRemarkContent("[처리 필요 등록]\n[처리 필요 등록]\n연락 필요"),
    "연락 필요",
  );
});
