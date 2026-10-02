"""요청의 선택 범위 참조(`allowedScope.selectionReference`)를 해석하는 경계.

참조가 가리키는 범위는 제공자가 알려 준 것만 쓰고, 알려 주지 않은 것을 '저장소 전체'로
추정하지 않는다. 지금 F가 수집할 수 있는 범위는 저장소 단위 선택 하나뿐이며, 그보다 좁은
범위는 해석할 수 없으므로 넓혀 수집하지 않고 멈춘다. 실제 제공자는 아직 없다.
"""

from dataclasses import dataclass
from typing import Protocol

from app.collection.failures import CollectionFailure, FailureCode
from app.processing.request_check import CheckedRequest


@dataclass(frozen=True)
class SelectedRange:
    """선택 범위 참조가 가리키는 범위."""

    repository_id: str
    # 저장소 단위로 선택했다고 제공자가 명시했는가. False는 F가 모르는 더 좁은 범위다.
    whole_repository: bool


class SelectionLookupError(Exception):
    """선택 범위를 묻지 못했다. 다시 묻지 않는다."""


class SelectionResolver(Protocol):
    def resolve(self, reference: str) -> SelectedRange | None:
        """모르는 참조면 None, 조회 자체가 실패하면 SelectionLookupError."""
        ...


def check_selection(
    request: CheckedRequest, resolver: SelectionResolver
) -> SelectedRange | CollectionFailure:
    try:
        selected = resolver.resolve(request.selection_reference)
    except SelectionLookupError:
        return CollectionFailure(
            FailureCode.SELECTION_UNRESOLVED,
            "선택 범위를 조회하지 못해 수집하지 않았다",
        )
    if selected is None:
        return CollectionFailure(
            FailureCode.SELECTION_UNRESOLVED,
            "선택 범위 참조를 해석하지 못해 수집하지 않았다",
        )
    if selected.repository_id != request.repository_id:
        return CollectionFailure(
            FailureCode.SCOPE_INCONSISTENT,
            "선택 범위의 저장소가 요청과 달라 수집하지 않았다",
        )
    if not selected.whole_repository:
        return CollectionFailure(
            FailureCode.SELECTION_UNSUPPORTED,
            "해석할 수 없는 선택 범위라 넓혀 수집하지 않았다",
        )
    return selected
