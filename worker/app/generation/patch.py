"""GitHub 파일 patch 해석과 온전성 검사(#120).

GitHub 커밋 상세의 `files[].patch`는 첫 `@@` 머리글부터 그 파일 끝까지다. 줄은 `split("\\n")`로만
나눈다(`splitlines()`는 \\x0c·\\x85·\\u2028 같은 글자가 든 정상 줄을 둘로 깬다). 끝이 줄바꿈이면 마지막
빈 요소 하나만 버리고, 줄 끝의 \\r은 줄 내용으로 남긴다.

온전한 patch는 다음을 모두 지킨다. 하나라도 어기면 그 파일은 생성에 쓰지 않는다(받은 변경 내용이
잘렸거나 온전하지 않음).
- 모든 줄이 hunk 머리글 `@@ -a[,b] +c[,d] @@` 다음에 온다. hunk마다 ' '·'-' 줄 수가 b, ' '·'+' 줄 수가
  d와 같고(`\\ `로 시작하는 표시 줄은 세지 않는다. `\\`로 시작하지만 `\\ `가 아닌 줄은 온전하지 않다),
  빈 hunk가 없고, hunk가 앞뒤로 겹치지 않고, 각 머리글의 이후 위치가 앞 hunk들의 줄 수 차이와 맞는다.
- '+' 줄 수와 '-' 줄 수가 GitHub가 준 additions·deletions와 같다.
- UTF-8로 인코딩할 수 있다(짝 없는 대리 문자가 없다).

줄 식별에는 두 값을 따로 둔다. 모델이 지목하는 줄 번호는 patch 안 줄 순서(index)이고, 제목의 후보 전후
비교는 hunk의 이전·이후 줄 위치(old_no·new_no)를 쓴다. 삭제 줄과 추가 줄의 index나 위치 번호가 같다고
같은 위치의 변경으로 보지 않는다.
"""

import re
from dataclasses import dataclass, replace
from typing import Literal

LineKind = Literal["+", "-", " "]

# "\ No newline at end of file" 같은 표시 줄. 앞 두 글자만 본다(문구는 git 언어 설정에 따라 다르다).
_MARKER = "\\ "
# 위치·줄 수는 9자리까지만 받는다(그보다 긴 숫자는 온전하지 않은 머리글로 본다).
_HEADER = re.compile(r"@@ -(\d{1,9})(?:,(\d{1,9}))? \+(\d{1,9})(?:,(\d{1,9}))? @@")


@dataclass(frozen=True)
class PatchLine:
    # patch 안 줄 순서(1부터, 머리글·표시 줄 포함).
    index: int
    kind: LineKind
    # 앞의 '+'·'-'·' ' 한 글자를 뺀 내용.
    text: str
    # 이 커밋 전 파일의 줄 위치(삭제·문맥 줄), 이 커밋 뒤 파일의 줄 위치(추가·문맥 줄).
    old_no: int | None
    new_no: int | None
    # 삭제 줄만: 이 줄이 있던 자리(이 커밋 뒤 파일에서 그 자리 바로 다음 줄의 위치)와, 같은 변경 덩어리가
    # 끝난 뒤 처음 남은 줄의 위치(그사이 줄은 이 덩어리에서 더한 줄이다).
    gap: int | None = None
    gap_end: int | None = None
    # 추가 줄만: 이 줄을 넣은 자리(이 커밋 전 파일에서 바로 뒤에 오는 줄의 위치).
    anchor: int | None = None


@dataclass(frozen=True)
class Hunk:
    old_start: int
    old_count: int
    new_start: int
    new_count: int
    lines: tuple[PatchLine, ...]

    @property
    def old_end(self) -> int:
        """이 hunk가 차지하는 마지막 이전 줄 위치. 넣기만 한 hunk는 넣은 자리 앞 줄(old_start)이다."""
        return self.old_start + max(self.old_count, 1) - 1

    @property
    def new_end(self) -> int:
        """이 hunk가 차지하는 마지막 이후 줄 위치. 지우기만 한 hunk는 지운 자리 앞 줄(new_start)이다."""
        return self.new_start + max(self.new_count, 1) - 1


@dataclass(frozen=True)
class ParsedPatch:
    hunks: tuple[Hunk, ...]

    @property
    def changed(self) -> tuple[PatchLine, ...]:
        """'+'·'-' 줄(patch 순서)."""
        return tuple(
            line for hunk in self.hunks for line in hunk.lines if line.kind != " "
        )

    def new_position(self, old_no: int) -> int | None:
        """이 커밋 전 파일의 줄 위치가 이 커밋 뒤에 놓이는 위치. 그 줄을 지웠으면 None."""
        offset = 0
        for hunk in self.hunks:
            if hunk.old_count and hunk.old_start <= old_no <= hunk.old_end:
                for line in hunk.lines:
                    if line.old_no == old_no:
                        return line.new_no if line.kind == " " else None
                raise ValueError("hunk 범위 안의 위치를 찾지 못했다")
            if hunk.old_end < old_no:
                offset += hunk.new_count - hunk.old_count
        return old_no + offset

    def gap_start(self, old_no: int) -> int:
        """이 커밋 전 파일의 줄 old_no 바로 앞 자리가 이 커밋 뒤 파일에서 시작하는 위치. 그 자리에 이 커밋이
        더한 줄이 있으면 그 첫 줄, 그 줄을 지웠으면 지운 자리다."""
        line = self.line_at_old(old_no)
        if line is not None and line.kind == "-":
            assert line.gap is not None
            return line.gap
        inserted = [
            each.new_no
            for each in self.changed
            if each.kind == "+" and each.anchor == old_no and each.new_no is not None
        ]
        moved = self.new_position(old_no)
        assert moved is not None
        return min((*inserted, moved))

    def gap_end(self, old_no: int) -> int:
        """이 커밋 전 파일의 줄 old_no가 이 커밋 뒤 파일에서 놓이는 위치. 그 줄을 지웠으면 그 변경 덩어리
        다음에 처음 남은 줄의 위치다."""
        line = self.line_at_old(old_no)
        if line is not None and line.kind == "-":
            assert line.gap_end is not None
            return line.gap_end
        moved = self.new_position(old_no)
        assert moved is not None
        return moved

    def line_at_old(self, old_no: int) -> PatchLine | None:
        for hunk in self.hunks:
            for line in hunk.lines:
                if line.old_no == old_no:
                    return line
        return None


def parse_patch(patch: str, additions: int, deletions: int) -> ParsedPatch | None:
    """온전하면 해석 결과, 아니면 None. 빈 patch는 줄 수가 0일 때만 온전하다(hunk 없음)."""
    try:
        patch.encode("utf-8")
    except UnicodeEncodeError:
        return None
    if patch == "":
        return ParsedPatch(()) if additions == 0 and deletions == 0 else None
    raw = patch.split("\n")
    if raw[-1] == "":
        raw.pop()
    hunks: list[Hunk] = []
    position = 0
    # 앞 hunk들이 만든 이전·이후 줄 위치 차이. hunk 밖 줄은 이 차이만큼 밀린다.
    offset = 0
    while position < len(raw):
        hunk, position = _hunk(raw, position)
        if hunk is None:
            return None
        if hunks and (
            hunk.old_start <= hunks[-1].old_end or hunk.new_start <= hunks[-1].new_end
        ):
            # 앞 hunk와 겹치거나 순서가 뒤집혔다. 위치를 이어 셀 수 없다.
            return None
        first_old = hunk.old_start if hunk.old_count else hunk.old_start + 1
        first_new = hunk.new_start if hunk.new_count else hunk.new_start + 1
        if first_new - first_old != offset:
            # 머리글의 이후 위치가 앞 hunk들의 줄 수 차이와 맞지 않는다(사이 hunk가 빠짐 등).
            return None
        offset += hunk.new_count - hunk.old_count
        hunks.append(hunk)
    parsed = ParsedPatch(tuple(hunks))
    added = sum(1 for line in parsed.changed if line.kind == "+")
    removed = sum(1 for line in parsed.changed if line.kind == "-")
    if (added, removed) != (additions, deletions):
        return None
    return parsed


def _hunk(raw: list[str], start: int) -> tuple[Hunk | None, int]:
    match = _HEADER.match(raw[start])
    if match is None:
        return None, start
    old_start, new_start = int(match[1]), int(match[3])
    old_count = 1 if match[2] is None else int(match[2])
    new_count = 1 if match[4] is None else int(match[4])
    if old_count == 0 and new_count == 0:
        return None, start
    if (old_count and old_start < 1) or (new_count and new_start < 1):
        # 줄이 있는 쪽의 시작 위치는 1 이상이다. 0은 빈 쪽(새 파일·지운 파일)에서만 쓴다.
        return None, start
    lines: list[PatchLine] = []
    # 빈 쪽의 시작 위치는 그 자리 앞 줄이다. 그 자리 다음 줄부터 센다.
    old_no = old_start if old_count else old_start + 1
    new_no = new_start if new_count else new_start + 1
    old_seen = new_seen = 0
    position = start + 1
    while position < len(raw) and (old_seen < old_count or new_seen < new_count):
        text = raw[position]
        prefix, body = text[:1], text[1:]
        index = position + 1
        if prefix == "\\":
            if not text.startswith(_MARKER):
                return None, position
            position += 1
            continue
        if prefix == " ":
            lines.append(PatchLine(index, " ", body, old_no, new_no))
            old_no, new_no = old_no + 1, new_no + 1
            old_seen, new_seen = old_seen + 1, new_seen + 1
        elif prefix == "-":
            lines.append(PatchLine(index, "-", body, old_no, None, gap=new_no))
            old_no, old_seen = old_no + 1, old_seen + 1
        elif prefix == "+":
            lines.append(PatchLine(index, "+", body, None, new_no, anchor=old_no))
            new_no, new_seen = new_no + 1, new_seen + 1
        else:
            return None, position
        position += 1
    if old_seen != old_count or new_seen != new_count:
        return None, position
    # 끝의 "\ No newline at end of file" 표시 줄은 hunk에 속한다.
    while position < len(raw) and raw[position].startswith("\\"):
        if not raw[position].startswith(_MARKER):
            return None, position
        position += 1
    if position < len(raw) and not raw[position].startswith("@@"):
        return None, position
    return Hunk(
        old_start, old_count, new_start, new_count, _block_ends(lines, new_no)
    ), position


def _block_ends(lines: list[PatchLine], end: int) -> tuple[PatchLine, ...]:
    """삭제 줄마다 그 변경 덩어리(문맥 줄 사이의 '+'·'-' 줄) 다음에 처음 남은 줄의 위치를 채운다."""
    result = list(lines)
    following = end
    for number in range(len(result) - 1, -1, -1):
        line = result[number]
        if line.kind == " ":
            assert line.new_no is not None
            following = line.new_no
        elif line.kind == "-":
            result[number] = replace(line, gap_end=following)
    return tuple(result)
