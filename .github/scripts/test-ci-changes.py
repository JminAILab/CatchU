"""실제 CI의 detect 셸을 합성 Git 이력으로 검사한다. 실행: python3 이_파일."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


WORKFLOW = Path(__file__).resolve().parents[1] / "workflows/ci.yml"


def detector():
    lines = WORKFLOW.read_text().splitlines()
    start = lines.index("      - id: detect")
    start = lines.index("        run: |", start) + 1
    end = start
    while end < len(lines) and (not lines[end] or lines[end].startswith("          ")):
        end += 1
    return "\n".join(line[10:] for line in lines[start:end]) + "\n"


class ChangesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="catchu-ci-changes-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env = {**os.environ, "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}
        for key in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"):
            self.env.pop(key, None)
        self.git("init", "-q", "--initial-branch=base")
        self.git("config", "user.name", "CI regression")
        self.git("config", "user.email", "ci@catchu.invalid")
        self.git("config", "core.hooksPath", os.devnull)
        self.git("config", "commit.gpgsign", "false")
        self.git("commit", "-qm", "base", "--allow-empty")
        self.base = self.git("rev-parse", "HEAD").strip()

    def git(self, *args):
        return subprocess.run(
            ["git", *args], cwd=self.root, env=self.env, check=True,
            capture_output=True, text=True,
        ).stdout

    def commit(self, path):
        file = self.root / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text("synthetic\n")
        self.git("add", "--", path)
        self.git("commit", "-qm", "change")

    def detect(self, event="pull_request", before=""):
        output = self.root / "output"
        output.write_text("")
        subprocess.run(
            ["bash", "-e", "-o", "pipefail", "-c", detector()],
            cwd=self.root, check=True, capture_output=True, text=True,
            env={**self.env, "EVENT": event, "BEFORE": before,
                 "GITHUB_OUTPUT": str(output), "GITHUB_STEP_SUMMARY": str(self.root / "summary")},
        )
        return dict(line.split("=", 1) for line in output.read_text().splitlines())

    def expect(self, services=(), deps="", **event):
        expected = {service: str(service in services).lower() for service in ("web", "api", "worker")}
        self.assertEqual(self.detect(**event), {**expected, "deps": deps})

    def test_changed_paths(self):
        cases = [
            ("worker/app/processing/live.py", ("api", "worker"), ""),
            ("worker/tests/u7_chain_output.py", ("api", "worker"), ""),
            ("worker/tests/candidate_scenarios.py", ("api", "worker"), ""),
            ("worker/fixtures/m1-synthetic/results/failed.json", ("api", "worker"), ""),
            ("worker/.python-version", ("api", "worker"), ""),
            ("worker/pyproject.toml", ("api", "worker"), "worker"),
            ("worker/uv.lock", ("api", "worker"), "worker"),
            ("worker/docs/generation.md", ("worker",), ""),
            ("api/test/published-index/chunker.test.cjs", ("api",), ""),
            ("api/src/rag-answer/question-counter.ts", ("api",), ""),
            ("api/package-lock.json", ("api",), "api"),
            ("web/src/features/repository-management/repository-api.ts", ("web", "api"), ""),
            ("web/src/features/publications/snapshot-view.tsx", ("web", "api"), ""),
            ("web/src/features/publications/publish-view.tsx", ("web",), ""),
            ("web/src/app/page.tsx", ("web",), ""),
            ("web/package-lock.json", ("web",), "web"),
            ("docs/README.md", (), ""),
            (".github/workflows/ci.yml", ("web", "api", "worker"), "web api worker"),
        ]
        for path, services, deps in cases:
            with self.subTest(path=path):
                self.git("reset", "--hard", self.base)
                self.commit(path)
                self.expect(services, deps)

    def test_push_includes_all_commits_since_before(self):
        self.commit("worker/app/processing/live.py")
        self.commit("docs/README.md")
        self.expect(("api", "worker"), event="push", before=self.base)

    def test_pull_request_compares_merge_with_target_parent(self):
        self.git("switch", "-qc", "feature")
        self.commit("worker/app/processing/live.py")
        self.commit("docs/README.md")
        self.git("switch", "-q", "base")
        self.git("merge", "--no-ff", "-qm", "merge", "feature")
        self.expect(("api", "worker"))

    def test_deleted_worker_code_still_runs_api(self):
        self.commit("worker/app/processing/live.py")
        self.git("rm", "worker/app/processing/live.py")
        self.git("commit", "-qm", "delete")
        self.expect(("api", "worker"))

    def test_manual_run_checks_every_service(self):
        self.expect(("web", "api", "worker"), "web api worker", event="workflow_dispatch")

    def test_initial_or_unknown_push_base_checks_every_service(self):
        for before in ("0" * 40, "unknown-commit"):
            with self.subTest(before=before):
                self.expect(("web", "api", "worker"), "web api worker", event="push", before=before)


if __name__ == "__main__":
    unittest.main()
