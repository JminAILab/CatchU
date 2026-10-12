"""후보 묶음·본인 기여 확인·작업 동일성(#118).

수집 결과와 관계 관측을 받아 적합 후보·미제공 수·실패를 돌려주는 순수 처리다. GitHub를
부르지 않고, 토큰·연결을 받지 않는다.
"""

from app.candidates.build import EVIDENCE_COMMIT_CAP, build_candidates
from app.candidates.grouping import Grouping, Membership, group
from app.candidates.identity import WORK_IDENTITY_VERSION, work_identity

__all__ = [
    "EVIDENCE_COMMIT_CAP",
    "WORK_IDENTITY_VERSION",
    "Grouping",
    "Membership",
    "build_candidates",
    "group",
    "work_identity",
]
