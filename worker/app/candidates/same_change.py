"""같은 변경을 확인하는 재료: 공백을 무시한 diff 값과 관계 근거(cherry-pick 표시·번호 참조).

SHA가 다른 두 커밋은 관계 근거와 공백을 무시한 diff 같음이 함께 있을 때만 같은 변경이다.
이 모듈은 그 재료만 계산하고, 합칠지는 후보 묶음이 정한다. 모두 순수 함수다.

- 공백을 무시한 diff 값(stable_patch_id)은 GitHub 커밋 상세의 파일별 `patch`와, 수집이 diff
  형식으로 따로 받은 파일 모드 줄로 `git patch-id --stable`(SHA-1 저장소 기준)을 다시 계산한
  값이다. 모드를 관측하지 못했거나 비교할 수 없는 변경은 값을 만들지 않는다(None).
- 모드 없이 `patch`만으로 만든 값(content_patch_id)은 모드를 확인할 커밋 쌍을 고르는 데만 쓴다.
  모드만 다른 두 변경도 같은 값이 되므로 같은 변경 판정에는 쓰지 않는다.
- 커밋 메시지와 PR 제목·본문은 자료로만 읽는다. 글자 속 주소를 부르거나 지시로 해석하지 않고,
  찾은 번호는 부르는 쪽이 이미 수집한 PR·이슈 번호와 맞춰 본다.
"""

import hashlib
import re
from bisect import bisect_left
from collections.abc import Iterator
from dataclasses import dataclass

from app.collection.identifiers import RepositoryCoordinates, normalize_sha
from app.collection.records import ChangedFile, CommitChanges

# git이 지우는 공백(git ctype의 isspace). 수직 탭·폼 피드는 지우지 않는다.
_GIT_SPACE = b" \t\n\r"
# 줄 수는 10자리까지만 읽는다. 더 긴 값은 GitHub가 만든 머리글이 아니다.
_HUNK_HEADER = re.compile(
    r"@@ -[0-9]{1,10}(?:,([0-9]{1,10}))? \+[0-9]{1,10}(?:,([0-9]{1,10}))? @@"
)
# git은 `\ `로 시작하고 줄바꿈을 포함해 12바이트보다 긴 줄(`\ No newline at end of file`)을
# 해시에 넣지 않고 줄 수에도 세지 않는다. 줄바꿈을 뺀 바이트 수로 12 이상이다.
_NO_NEWLINE_MARKER_MIN = 12
# git diff 머리글의 파일 모드 줄. 모드는 6자리 8진수다(100644·100755·120000·160000 등).
_MODE_LINE = re.compile(r"(old mode|new mode|new file mode|deleted file mode) [0-7]{6}")
# 상태마다 git이 쓰는 모드 줄의 종류(순서대로). 수정한 파일은 모드가 그대로면 모드 줄이 없다.
_MODE_KINDS: dict[str, tuple[tuple[str, ...], ...]] = {
    "modified": ((), ("old mode", "new mode")),
    "added": (("new file mode",),),
    "removed": (("deleted file mode",),),
}
# 모드를 관측하지 않고 계산할 때(content_patch_id) 상태마다 두는 모드 줄.
_ASSUMED_MODES: dict[str, tuple[str, ...]] = {
    "modified": (),
    "added": ("new file mode 100644",),
    "removed": ("deleted file mode 100644",),
}
# git의 C 문자열 따옴표 규칙(core.quotePath=false). 0x80 이상은 그대로 둔다.
_PATH_ESCAPES = {
    0x07: b"a",
    0x08: b"b",
    0x09: b"t",
    0x0A: b"n",
    0x0B: b"v",
    0x0C: b"f",
    0x0D: b"r",
    0x22: b'"',
    0x5C: b"\\",
}
_CHERRY_PICK = re.compile(
    r"^[ \t]*\(cherry picked from commit ([0-9A-Fa-f]{64}|[0-9A-Fa-f]{40})\)[ \t]*\r?$",
    re.MULTILINE,
)
# 번호는 ASCII 숫자, 앞자리 0 없음, 10자리까지(GitHub 번호 범위). 앞은 Unicode 글자·숫자·`_`나
# `/`·`&`가 아니어야 하고, 뒤는 ASCII 영숫자·`_`가 아니어야 한다(`#11을`·`#11.`은 센다).
_NUMBER_REFERENCE = re.compile(r"(?<![\w/&])#([1-9][0-9]{0,9})(?![0-9A-Za-z_])")
# `owner/repo-#11`처럼 이름이 `.`·`-`로 끝나는 다른 저장소 참조.
_REPOSITORY_PREFIX = re.compile(
    r"(?<![\w.-])[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}\Z"
)
# 주소의 scheme·호스트만 대소문자를 가리지 않는다. 소유자·이름은 저장소 좌표와 따로 맞춘다.
_PULL_URL = re.compile(
    r"(?i:https://github\.com)/([A-Za-z0-9-]{1,39})/([A-Za-z0-9._-]{1,100})"
    r"/pull/([1-9][0-9]{0,9})(?![0-9A-Za-z_])"
)
# 주소 토큰: `http://`·`https://`·`www.`로 시작해 공백·`<`·`>`·따옴표 전까지. 그 안의 `#N`
# (`?ref=#11` 같은 조각)은 번호 참조가 아니다.
_ADDRESS = re.compile(r"(?i:https?://|www\.)[^\s<>\"']*")
# 인용 표시 `>`와 그 뒤 공백 하나. 인용 안의 코드 블록도 코드로 본다.
_QUOTE_MARKER = re.compile(r" {0,3}> ?")
# 목록 표시(`-`·`+`·`*`·`1.`·`1)`). 목록 안의 펜스를 찾을 때만 쓴다.
_LIST_MARKER = re.compile(r" {0,3}(?:[-+*]|[0-9]{1,9}[.)])[ \t]+")
_LIST_ITEM = re.compile(r" {0,3}(?:[-+*]|[0-9]{1,9}[.)])(?:[ \t]|$)")
_FENCE_OPEN = re.compile(r"([ \t]*)(`{3,}|~{3,})(.*)")
_FENCE_CLOSE = re.compile(r"([ \t]*)(`{3,}|~{3,})[ \t]*")
_ATX_HEADING = re.compile(r" {0,3}#{1,6}(?:[ \t]|$)")
# 주제 구분선과 Setext 제목 밑줄. 다음 줄은 문단 이어짐이 아니다.
_BLOCK_BREAK = re.compile(r" {0,3}(?:([-*_])(?:[ \t]*\1){2,}|=+|-+)[ \t]*")
# 줄 앞(3칸까지 들여 씀)에서 여는 HTML 주석. `-->`까지 펜스·들여쓰기 코드를 판단하지 않는다.
_COMMENT_BLOCK = re.compile(r" {0,3}<!--")
# 인라인 코드(백틱), HTML 주석, HTML `<pre>`·`<code>` 요소의 시작.
_INLINE_START = re.compile(r"`+|<!--|<(?i:(pre|code))(?=[\s/>])")
_HTML_CLOSE = {
    "pre": re.compile(r"</pre\s*>", re.IGNORECASE),
    "code": re.compile(r"</code\s*>", re.IGNORECASE),
}
_BACKTICKS = re.compile(r"`+")
_BLANK_LINE = re.compile(r"\n[ \t]*(?=\n|\Z)")


def stable_patch_id(changes: CommitChanges) -> str | None:
    """커밋 변경의 공백을 무시한 diff 값(40자 16진수). 비교할 수 없으면 None.

    파일마다 git이 해시할 머리글(관측한 모드 줄 포함)과 `patch` 줄에서 공백을 지우고 SHA-1을
    구해, git `flush_one_hunk`처럼 20바이트 자리올림 합으로 더한다. 그래서 파일 순서는 값에 영향이
    없다. 모든 파일의 모드 줄을 관측했으면 git 값과 같다.

    다음이면 None이다: 파일 목록이 잘렸거나 비었다, `patch`가 없는 파일(이진·큰 변경)이 있다,
    추가·삭제·수정 밖의 상태다(이름 바꿈·복사·모드만 바꿈 등. 이름 바꿈의 유사도 줄처럼 git이
    해시하는 줄을 커밋 상세가 주지 않는다), 모드 줄을 관측하지 못한 파일이 있다(수정한 파일도
    같다), 모드 줄이 상태와 맞지 않는다, hunk 머리글의 줄 수와 내용이 맞지 않는다, 파일의 추가·삭제
    줄 수가 `patch`의 줄 수와 다르다(잘린 `patch`).
    """
    return _patch_id(changes, observed=True)


def content_patch_id(changes: CommitChanges) -> str | None:
    """모드 줄을 관측하지 않고 `patch`만으로 만든 값. 모드 말고는 stable_patch_id와 같다.

    새 파일·지운 파일은 모드 100644로, 수정한 파일은 모드 바꿈이 없는 것으로 본다. 그래서 실행
    파일을 더하거나 내용과 함께 모드를 바꾼 커밋은 git 값과 다르고, 모드만 다른 두 변경은 같은 값이
    된다. 같은 변경 판정에는 쓰지 않고, 모드를 확인할 커밋 쌍을 고르는 데만 쓴다. 두 커밋의
    stable_patch_id가 같으면 이 값도 같다.
    """
    return _patch_id(changes, observed=False)


def _patch_id(changes: CommitChanges, *, observed: bool) -> str | None:
    if changes.files_truncated or not changes.files:
        return None
    total = bytearray(20)
    for entry in changes.files:
        modes = entry.mode_lines if observed else _ASSUMED_MODES.get(entry.status)
        digest = _file_digest(entry, modes)
        if digest is None:
            return None
        carry = 0
        for index in range(20):
            carry += total[index] + digest[index]
            total[index] = carry & 0xFF
            carry >>= 8
    return total.hex()


def _file_digest(entry: ChangedFile, modes: tuple[str, ...] | None) -> bytes | None:
    try:
        header = _file_header(entry, modes)
        if header is None or not entry.patch:
            return None
        digest = hashlib.sha1(usedforsecurity=False)
        for header_line in header:
            digest.update(header_line.translate(None, _GIT_SPACE))
        lines = entry.patch.split("\n")
        if lines[-1] == "":
            lines.pop()
        before = after = hunks = added = removed = 0
        for line in lines:
            encoded = line.encode("utf-8")
            if encoded.startswith(b"\\ ") and len(encoded) >= _NO_NEWLINE_MARKER_MIN:
                continue
            if before == 0 and after == 0:
                header_match = _HUNK_HEADER.match(line)
                if header_match is None:
                    return None
                before = int(header_match.group(1) or "1")
                after = int(header_match.group(2) or "1")
                hunks += 1
                continue
            marker = line[:1]
            if marker not in (" ", "-", "+"):
                return None
            if marker != "+":
                before -= 1
            if marker != "-":
                after -= 1
            if before < 0 or after < 0:
                return None
            added += marker == "+"
            removed += marker == "-"
            digest.update(encoded.translate(None, _GIT_SPACE))
        if hunks == 0 or before or after:
            return None
        # 온전한 hunk 뒤에서 잘린 patch는 hunk 머리글과는 맞는다. 파일의 추가·삭제 줄 수와 대조해
        # 일부만 받은 변경을 전체로 비교하지 않는다.
        if (added, removed) != (entry.additions, entry.deletions):
            return None
        return digest.digest()
    except UnicodeEncodeError:
        return None


def _file_header(
    entry: ChangedFile, modes: tuple[str, ...] | None
) -> tuple[bytes, ...] | None:
    """git diff가 이 파일 앞에 쓰고 patch-id가 해시하는 머리글 줄(`index` 줄은 해시하지 않음).

    모드 줄은 `diff --git` 줄 다음, `---`·`+++` 줄 앞에 둔다. 모드를 모르거나(None) 상태와 맞지
    않으면 None이다: 새 파일은 `new file mode` 하나, 지운 파일은 `deleted file mode` 하나, 수정한
    파일은 없거나 `old mode`·`new mode`(서로 다른 모드) 둘이어야 한다.
    """
    if not entry.path or modes is None:
        return None
    if not all(_MODE_LINE.fullmatch(line) for line in modes):
        return None
    kinds = tuple(line.rsplit(" ", 1)[0] for line in modes)
    if kinds not in _MODE_KINDS.get(entry.status, ()):
        return None
    if kinds == ("old mode", "new mode") and modes[0][-6:] == modes[1][-6:]:
        return None
    path = entry.path.encode("utf-8")
    old = _quoted_path(b"a/", path)
    new = _quoted_path(b"b/", path)
    diff = b"diff --git " + old + b" " + new
    mode_lines = tuple(line.encode("ascii") for line in modes)
    if entry.status == "added":
        return (diff, *mode_lines, b"--- /dev/null", b"+++ " + new)
    if entry.status == "removed":
        return (diff, *mode_lines, b"--- " + old, b"+++ /dev/null")
    return (diff, *mode_lines, b"--- " + old, b"+++ " + new)


def _quoted_path(prefix: bytes, path: bytes) -> bytes:
    raw = prefix + path
    if not any(byte < 0x20 or byte in (0x22, 0x5C, 0x7F) for byte in raw):
        return raw
    quoted = bytearray(b'"')
    for byte in raw:
        if byte in _PATH_ESCAPES:
            quoted += b"\\" + _PATH_ESCAPES[byte]
        elif byte < 0x20 or byte == 0x7F:
            quoted += b"\\%03o" % byte
        else:
            quoted.append(byte)
    quoted += b'"'
    return bytes(quoted)


def cherry_pick_sources(message: str) -> frozenset[str]:
    """`git cherry-pick -x`가 남긴 `(cherry picked from commit <SHA>)` 줄이 가리키는 커밋.

    그 줄 하나로 된 표시만 읽고 전체 길이 SHA만 소문자로 돌려준다. 짧은 SHA는 버린다.
    """
    return frozenset(
        normalize_sha(match.group(1)) for match in _CHERRY_PICK.finditer(message)
    )


def pull_request_references(
    text: str, repository: RepositoryCoordinates
) -> frozenset[int]:
    """PR 제목·본문이 `#N`이나 이 저장소의 PR 주소로 가리킨 번호.

    주소는 `https://github.com/{owner}/{name}/pull/N`(뒤 경로 허용)만 세고, 소유자·이름은
    대소문자를 가리지 않고 이 저장소와 같아야 한다. 그다음 모든 주소 토큰을 지우고 `#N`을 센다.
    그래서 다른 주소 안의 `#N`(`?ref=#11`)은 세지 않는다. 코드 블록·인라인 코드·HTML 주석·
    HTML `<pre>`·`<code>` 안도 세지 않는다. 주소를 부르지 않으며, 번호가 이 저장소의 PR인지는
    부르는 쪽이 맞춰 본다.
    """
    visible = _visible_text(text)
    numbers = set(_number_references(visible))
    for match in _PULL_URL.finditer(visible):
        if repository.same_as(f"{match.group(1)}/{match.group(2)}"):
            numbers.add(int(match.group(3)))
    return frozenset(numbers)


def issue_references(text: str) -> frozenset[int]:
    """글이 `#N`으로 가리킨 번호. 규칙과 지우는 범위는 PR 참조와 같고 주소는 세지 않는다."""
    return frozenset(_number_references(_visible_text(text)))


def _number_references(visible: str) -> Iterator[int]:
    """주소 토큰을 공백으로 지운 뒤의 `#N` 번호."""
    text = _ADDRESS.sub(" ", visible)
    for match in _NUMBER_REFERENCE.finditer(text):
        start = match.start()
        if text[start - 1 : start] in (".", "-") and _REPOSITORY_PREFIX.search(
            text, max(0, start - 141), start
        ):
            continue
        yield int(match.group(1))


@dataclass(frozen=True)
class _Fence:
    char: str
    length: int
    # 펜스를 연 줄의 인용 깊이. 깊이가 다른 줄은 닫는 펜스가 아니다.
    depth: int
    # 닫는 펜스가 들여 쓸 수 있는 최대 칸 수.
    limit: int


def _visible_text(text: str) -> str:
    """펜스·들여쓰기 코드 블록, 인라인 코드, HTML 주석, HTML `<pre>`·`<code>`를 지운 글.

    CommonMark를 줄여 따른다. 줄 앞의 인용 표시(`>`)를 떼고 블록을 본다. 펜스는 ``` 또는
    ~~~ 3개 이상으로 열고(목록 항목 안 포함) 같은 인용 깊이에서 같은 문자를 같은 수 이상 쓴
    줄로 닫으며, 닫지 않으면 끝까지 코드다. 들여쓰기 코드는 문단 밖(글 처음·빈 줄·블록·구분선
    뒤)에서 4칸(탭은 4칸 단위) 이상 들여 쓴 줄이다. 펜스 밖에서 줄 앞(3칸까지)에 연 HTML 주석이
    그 줄에서 닫히지 않으면 `-->`가 있는 줄까지 펜스·들여쓰기를 보지 않고 남기며, 주석은 뒤에서
    지운다. 문단 가운데(`글 <!--`)에서 연 주석 뒤의 펜스는 코드로 본다.

    줄여 따르므로 CommonMark와 다르게 읽는 글이 있다. 목록 항목을 잇는 줄의 펜스처럼 모르는
    경우는 코드로 보고 지운다. 지운 곳의 번호는 세지 않으므로, 그런 글에서는 재제출 관계나
    서로 다른 번호를 놓칠 수 있다.
    """
    kept: list[str] = []
    fence: _Fence | None = None
    in_paragraph = in_list = in_comment = False
    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        depth, content = _unquoted(line)
        if fence is not None:
            if depth == fence.depth and _closes(fence, content):
                fence = None
            kept.append("")
            continue
        if in_comment:
            if "-->" in content:
                in_comment = False
            kept.append(line)
            continue
        comment = _COMMENT_BLOCK.match(content)
        if comment is not None and "-->" not in content[comment.end() :]:
            in_comment = True
            in_paragraph = False
            kept.append(line)
            continue
        indent = _width(_leading_space(content))
        listed = _LIST_ITEM.match(content) is not None
        fence = _fence_opening(content, depth, in_list=in_list)
        if fence is not None:
            in_paragraph = False
            in_list = listed or (in_list and indent > 0)
            kept.append("")
            continue
        if not content.strip(" \t"):
            in_paragraph = False
            kept.append(line)
            continue
        if not in_paragraph and indent >= 4:
            kept.append("")
            continue
        block_start = bool(
            _ATX_HEADING.match(content) or _BLOCK_BREAK.fullmatch(content)
        )
        if listed:
            in_list = True
        elif indent == 0 and (block_start or not in_paragraph):
            # 들여 쓰지 않은 새 블록이 목록을 끝낸다. 문단을 잇는 줄은 목록 안에 둔다.
            in_list = False
        in_paragraph = not block_start
        kept.append(line)
    return _without_inline_code("\n".join(kept))


def _unquoted(line: str) -> tuple[int, str]:
    """(인용 깊이, 인용 표시를 뗀 줄)."""
    depth = position = 0
    while (marker := _QUOTE_MARKER.match(line, position)) is not None:
        depth += 1
        position = marker.end()
    return depth, line[position:]


def _fence_opening(content: str, depth: int, *, in_list: bool) -> _Fence | None:
    rest = content
    listed = False
    while (marker := _LIST_MARKER.match(rest)) is not None:
        rest = rest[marker.end() :]
        listed = True
    opening = _FENCE_OPEN.fullmatch(rest)
    if opening is None:
        return None
    run, info = opening.group(2), opening.group(3)
    if run[0] == "`" and "`" in info:
        return None
    column = _width(content[: len(content) - len(rest) + opening.start(2)])
    if listed:
        # 목록 항목 첫 줄의 펜스는 항목 내용 칸에서 3칸까지 들여 쓴 줄로 닫힌다.
        limit = column + 3
    elif in_list:
        # 목록 항목을 잇는 줄의 펜스. 항목 내용 칸을 모르므로 여는 줄보다 깊은 닫는 줄은
        # 받지 않는다(코드로 보고 지운다).
        limit = max(3, column)
    elif column <= 3:
        limit = 3
    else:
        # 목록 밖에서 4칸 이상 들여 쓴 줄은 들여쓰기 코드이거나 문단을 잇는 글이다.
        return None
    return _Fence(run[0], len(run), depth, limit)


def _closes(fence: _Fence, content: str) -> bool:
    closing = _FENCE_CLOSE.fullmatch(content)
    return (
        closing is not None
        and _width(closing.group(1)) <= fence.limit
        and closing.group(2)[0] == fence.char
        and len(closing.group(2)) >= fence.length
    )


def _leading_space(line: str) -> str:
    return line[: len(line) - len(line.lstrip(" \t"))]


def _width(prefix: str) -> int:
    """앞부분의 칸 수. 탭은 다음 4칸 단위까지 채운다."""
    width = 0
    for char in prefix:
        width += 4 - width % 4 if char == "\t" else 1
    return width


def _without_inline_code(text: str) -> str:
    """앞에서부터 먼저 나온 인라인 코드·HTML 주석·HTML `<pre>`·`<code>` 요소를 지운다.

    백틱 n개는 같은 문단(빈 줄 전) 안의 백틱 정확히 n개로 닫히고, 닫히지 않으면 글자다.
    HTML 주석은 `-->`까지, `<pre ...>`·`<code ...>`는 대소문자를 가리지 않고 같은 이름의 닫는
    태그까지 지운다. 둘 다 닫히지 않으면 끝까지다. 지운 자리는 공백 하나와 그 안의 줄바꿈으로 둔다.
    """
    # 문단 경계(빈 줄 시작 위치)를 한 번만 찾는다. 백틱마다 다시 찾으면 긴 글에서 제곱으로 느려진다.
    boundaries = [blank.start() for blank in _BLANK_LINE.finditer(text)]
    parts: list[str] = []
    position = search_from = 0
    while (match := _INLINE_START.search(text, search_from)) is not None:
        element = match.group(1)
        if match.group() == "<!--":
            close = text.find("-->", match.end())
            end = len(text) if close < 0 else close + 3
        elif element is not None:
            # 여는 태그의 `>` 뒤에서 닫는 태그를 찾는다. 어느 쪽이든 없으면 끝까지 지운다.
            opened = text.find(">", match.end())
            found = (
                None
                if opened < 0
                else _HTML_CLOSE[element.lower()].search(text, opened + 1)
            )
            end = len(text) if found is None else found.end()
        else:
            index = bisect_left(boundaries, match.end())
            limit = boundaries[index] if index < len(boundaries) else len(text)
            run = len(match.group())
            closing = next(
                (
                    candidate
                    for candidate in _BACKTICKS.finditer(text, match.end(), limit)
                    if len(candidate.group()) == run
                ),
                None,
            )
            if closing is None:
                search_from = match.end()
                continue
            end = closing.end()
        parts.append(text[position : match.start()])
        parts.append(" " + "\n" * text.count("\n", match.start(), end))
        position = search_from = end
    parts.append(text[position:])
    return "".join(parts)
