"""여러 시험 파일이 함께 쓰는 고정값."""

from pathlib import Path

import pytest
from git_synthetic import GitRepo


@pytest.fixture
def repo(tmp_path: Path) -> GitRepo:
    """시험마다 새로 만든 합성 git 저장소. git이 없으면 그 시험을 건너뛴다."""
    return GitRepo(tmp_path)
