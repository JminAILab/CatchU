"""기계 대조(CR3 기능 설계 BR3.3, 시나리오 S4) 시험.

기대값은 rules.md BR3.3과 12월 기계 대조(`api/src/ai-generation/fact-check.ts`)의 낱말 나누기에서 정했다.
"""

import pytest

from app.judgement.factcheck import EXCEPTIONS, CitedLine, extract, passes

LINE = CitedLine("src/auth/rate_limit.ts", "+const loginRateLimit = 5;")


def test_s4_english_name_only_on_another_line_of_the_material_is_rejected() -> None:
    """S4: 가리킨 줄에 없는 영어 이름은 재료의 다른 줄에 있어도 통과하지 못한다."""
    other = CitedLine("src/auth/session.ts", "+const sessionStore = {};")
    assert passes("sessionStore 값을 바꿨습니다", [LINE]) is False
    assert passes("sessionStore 값을 바꿨습니다", [other]) is True


def test_names_and_numbers_on_the_cited_line_pass() -> None:
    assert passes("loginRateLimit을 5로 정했습니다", [LINE]) is True


def test_case_is_ignored_for_english_names() -> None:
    assert passes("LOGINRATELIMIT 상수", [LINE]) is True


def test_hangul_is_not_checked() -> None:
    """한글은 보지 않는다. 한글만 있는 글은 낱말이 없어 통과한다."""
    assert passes("로그인 시도 상한을 정했습니다", [LINE]) is True


@pytest.mark.parametrize("text", ["PR #12에서 바꿨다", "#7 작업", "PR 3 정리", "pr#40"])
def test_a_pull_request_number_always_fails(text: str) -> None:
    assert passes(text, [CitedLine("a.py", "+x = 12 # 7 3 40")]) is False


def test_word_inside_apr_is_not_a_pull_request_number() -> None:
    assert extract("APR 3").pr_numbers == frozenset()


def test_leading_zeros_of_numbers_are_ignored() -> None:
    line = CitedLine("config.yml", "+retries: 007")
    assert passes("다시 시도 7번", [line]) is True
    assert passes("다시 시도 8번", [line]) is False


def test_exception_words_are_not_checked() -> None:
    assert {"api", "pr", "json"} <= EXCEPTIONS
    assert passes("API 응답 JSON 모양", [LINE]) is True


def test_file_names_must_be_in_the_cited_path() -> None:
    """파일 이름은 가리킨 줄의 경로에 낱말 단위로 있어야 한다(줄 글에만 있으면 버린다)."""
    assert passes("rate_limit.ts에 상수를 더했다", [LINE]) is True
    assert passes("auth/rate_limit.ts", [LINE]) is True
    assert passes("limit.ts에 상수", [LINE]) is False
    in_text = CitedLine("src/app.ts", "+import x from './helper.ts';")
    assert passes("helper.ts를 불러온다", [in_text]) is False


def test_dotted_member_on_the_line_counts_as_a_word() -> None:
    """줄의 `this.loginRateLimit`에서 `loginRateLimit`을 낱말로 찾는다."""
    line = CitedLine("a.ts", "+this.loginRateLimit = 5")
    assert passes("loginRateLimit 값", [line]) is True


def test_no_cited_lines_fails() -> None:
    assert passes("아무 글", []) is False


def test_extract_splits_kinds() -> None:
    tokens = extract("PR #4 main.ts의 retryCount를 03으로, src/a 경로")
    assert tokens.pr_numbers == frozenset({"4"})
    assert tokens.file_names == frozenset({"main.ts", "src/a"})
    assert tokens.english == frozenset({"retrycount"})
    assert tokens.numbers == frozenset({"3"})


def test_several_cited_lines_are_joined() -> None:
    first = CitedLine("a.py", "+alpha = 1")
    second = CitedLine("b.py", "+beta = 2")
    assert passes("alpha와 beta", [first, second]) is True
