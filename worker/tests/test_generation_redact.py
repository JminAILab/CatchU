"""생성 입력 가리기(#120 결정 7·16, 완료 기준 32의 단위 부분).

기대값은 #120 본문 「자료 보호와 coverageLimits」(보내기 전에 비밀값·제3자 개인정보를 가리고, 비밀
파일은 경로·상태를 보내지 않는다), 2026-10-12 결정 7·16, 착수 계획 「가리기」(값만 자리표시로 바꾸고 줄
구조는 유지, 대상 예: PEM 개인 키·AKIA…·ghp_/gho_/github_pat_·xox?-·AIza…·JWT·비밀 이름 대입의
값·이메일·주민번호·휴대전화 꼴, 비밀 파일 .env·*.pem·id_rsa·credentials.json 등)에서 정했다.
자리표시 글자(`[MASKED]`)와 예시 파일(.env.example 등)을 값만 가리는 선택은 구현에 맡긴 값이라 구현
요약을 따랐다. 가리기 코드를 읽어 기대값을 맞추지 않았다.

계획대로 정규식이 모든 비밀값을 잡는다고 주장하지 않는다. 알려진 잘못 잡음(가리지 않아도 될 것을
가림)과 놓침(가려야 할 것을 보냄)은 지금 동작을 「한계」 시험으로 고정해 둔다. 잘못 잡음은 고를 수 있는
줄이 줄어들 뿐 값이 새지 않는다. 놓침은 그 값이 그대로 제공자에게 간다.

가짜 비밀값·개인정보는 소스에 통째로 두지 않고 실행 중에 조각을 이어 붙여 만든다. 가린 줄이 응답에서
고를 수 없게 표시되는지와 거부되는지(기준 33)는 생성 흐름 시험이 끝까지 본다. 여기서는 PEM 개인 키가
바뀐 변경 하나만 생성 흐름으로 돌려 실제로 보낸 자료를 본다.
"""

import time

import pytest
from candidate_scenarios import ROOT, Scenario, change, commit, root_commit
from generation_scenarios import (
    ScriptedProvider,
    assert_nowhere,
    generation_case,
    naive,
    sent_lines,
)
from github_synthetic import MEMBER, sha

from app.generation.redact import (
    MASK,
    MAX_LINE_CHARS,
    MaskBook,
    PrivateKeyBlock,
    is_secret_path,
    mask_text,
)


def _join(*parts: str) -> str:
    """가짜 값을 실행 중에 이어 붙인다(소스 검사에 통째로 걸리지 않게)."""
    return "".join(parts)


# 가짜 값. 모두 실제 계정·사람과 무관하다.
AWS_KEY = _join("AKIA", "SYNTHETIC", "KEY0001")
AWS_TEMP_KEY = _join("ASIA", "SYNTHETIC", "TEMP002")
AWS_SECRET = _join("wJalr", "XUtnFEMI", "/K7MDENG", "+bPxRfiCY")
_GITHUB_TAIL = _join("Synthetic", "Token", "0123456789", "abcdefghijkl")
GITHUB_PAT = _join("github_pat_", "11SYNTHETIC0", "_", "abcdefghijklmnopqrstuvwxyz0123")
SLACK_BOT = _join("xoxb-", "1234567890", "-", "synthetic")
SLACK_USER = _join("xoxp-", "1234567890", "-", "synthetic")
GOOGLE_KEY = _join("AIza", "Sy", "Synthetic", "_", "Key-", "0123456789", "abcdefghi")
JWT = _join(
    "eyJ",
    "hbGciOiJIUzI1NiJ9",
    ".",
    "eyJ",
    "zdWIiOiJzeW50aGV0aWMifQ",
    ".",
    "c3ludGhldGljLXNpZ25hdHVyZQ",
)
QUOTED = _join("s3", "cr3t", "-Value")
ENV_VALUE = _join("plain", "Env", "Value9")
URL_PASSWORD = _join("pa", "ss", "w0rd")
EMAIL = _join("hong.gildong", "@", "example.com")
EMAIL_TAGGED = _join("dev+catchu", "@", "mail.example.co.kr")
RESIDENT = _join("900101", "-", "1234567")
PHONE = _join("010", "-", "1234", "-", "5678")
PHONE_PLAIN = _join("010", "1234", "5678")
PHONE_OLD = _join("011", "-", "123", "-", "4567")


def github_token(prefix: str) -> str:
    return _join(prefix, _GITHUB_TAIL)


def _filled(template: str, value: str) -> str:
    return template.replace("{v}", value)


# (줄 틀, 가릴 값). 줄 틀의 {v} 자리에 값을 넣고, 가린 뒤에는 그 자리만 자리표시여야 한다.
VALUE_SHAPES = [
    pytest.param("aws configure set aws_access_key_id {v}", AWS_KEY, id="aws-akia"),
    pytest.param("임시 키 {v} 사용", AWS_TEMP_KEY, id="aws-asia"),
    *(
        pytest.param(
            "gh auth login --with-token <<< {v}", github_token(prefix), id=prefix
        )
        for prefix in ("ghp_", "gho_", "ghu_", "ghs_", "ghr_")
    ),
    pytest.param("gh auth login --with-token <<< {v}", GITHUB_PAT, id="github_pat"),
    pytest.param("client = WebClient({v})", SLACK_BOT, id="xoxb"),
    pytest.param("client = WebClient({v})", SLACK_USER, id="xoxp"),
    pytest.param(
        '<script src="https://maps.googleapis.com/maps/api/js?key={v}"></script>',
        GOOGLE_KEY,
        id="aiza",
    ),
    pytest.param("Authorization: Bearer {v}", JWT, id="jwt"),
    pytest.param("const apiKey = '{v}';", QUOTED, id="camel-apiKey"),
    pytest.param('  clientSecret: "{v}",', QUOTED, id="camel-clientSecret"),
    pytest.param('  "password": "{v}",', QUOTED, id="json-password"),
    pytest.param('password := "{v}"', QUOTED, id="go-password"),
    pytest.param('client = connect(api_key="{v}")', QUOTED, id="kwarg-api_key"),
    pytest.param("const accessToken = `{v}`;", QUOTED, id="backtick-token"),
    pytest.param(
        'private static final String DB_PASSWORD = "{v}";',
        QUOTED,
        id="java-constant",
    ),
    pytest.param("GITHUB_TOKEN={v}", ENV_VALUE, id="env-github-token"),
    pytest.param("export API_KEY={v}", ENV_VALUE, id="env-export"),
    pytest.param("DB_PASSWORD={v} # 로컬용", ENV_VALUE, id="env-comment"),
    pytest.param("  export AWS_SECRET_ACCESS_KEY={v}", AWS_SECRET, id="env-aws-secret"),
    pytest.param(
        "git clone https://octo:{v}@github.com/octo/repo.git",
        URL_PASSWORD,
        id="url-userinfo",
    ),
    pytest.param(
        "DATABASE_URL=postgres://admin:{v}@db:5432/app",
        URL_PASSWORD,
        id="url-database",
    ),
    pytest.param("작성자: {v}", EMAIL, id="email"),
    pytest.param("연락처 <{v}>", EMAIL, id="email-angle"),
    pytest.param("문의: {v}.", EMAIL_TAGGED, id="email-tagged-period"),
    pytest.param("주민번호 {v}", RESIDENT, id="resident"),
    pytest.param("번호는 {v}입니다", RESIDENT, id="resident-particle"),
    pytest.param("연락처 {v}", PHONE, id="phone"),
    pytest.param("연락처 {v}", PHONE_PLAIN, id="phone-plain"),
    pytest.param("연락처 {v}", PHONE_OLD, id="phone-011"),
    pytest.param("{v}로 연락", PHONE, id="phone-particle"),
    # 줄 앞에 다른 글자가 붙거나 ':'로 대입한 대문자 환경 변수 꼴(compose·Dockerfile).
    pytest.param("POSTGRES_PASSWORD: {v}", ENV_VALUE, id="compose-map"),
    pytest.param("      - POSTGRES_PASSWORD={v}", ENV_VALUE, id="compose-list"),
    pytest.param("ENV API_KEY={v}", ENV_VALUE, id="dockerfile-env"),
    # 인증 머리글 값과 이름에 붙임표가 든 비밀 이름.
    pytest.param(
        'headers = {"Authorization": "Bearer {v}"}', ENV_VALUE, id="authorization"
    ),
    pytest.param('  "x-api-key": "{v}",', ENV_VALUE, id="x-api-key"),
    # 값 뒤에 다른 명령·대입이 이어지는 환경 변수 꼴.
    pytest.param("ENV API_KEY={v} NODE_ENV=production", ENV_VALUE, id="env-then-env"),
    pytest.param("RUN NPM_TOKEN={v} npm ci", ENV_VALUE, id="env-before-command"),
    pytest.param("export API_KEY={v}; ./run.sh", ENV_VALUE, id="env-semicolon"),
    pytest.param("API_KEY={v} && make deploy", ENV_VALUE, id="env-and"),
    pytest.param("docker run -e DB_PASSWORD={v} postgres", ENV_VALUE, id="docker-e"),
    # 다른 따옴표가 든 따옴표 값.
    pytest.param('password = "{v}"', _join("it'", "s", ENV_VALUE), id="mixed-quotes"),
]


def test_mask_placeholder_is_fixed_text() -> None:
    """자리표시는 구현이 고른 고정 글자 `[MASKED]`다(구현 요약 「입력」)."""
    assert MASK == "[MASKED]"


@pytest.mark.parametrize(("template", "value"), VALUE_SHAPES)
def test_value_shape_is_masked_in_place(template: str, value: str) -> None:
    """값 모양별 비밀값·개인정보는 그 값만 자리표시로 바뀌고 줄의 나머지는 그대로다(기준 32, 결정 7)."""
    masked = mask_text(_filled(template, value))

    assert masked.text == _filled(template, MASK)
    assert masked.count == 1
    assert value not in masked.text


def test_every_value_in_one_line_is_masked_and_counted() -> None:
    """한 줄에 든 값마다 따로 가리고 센다. 사이 글자와 줄 구조는 남는다(기준 32, 로그 건수)."""
    line = f"keys: {AWS_KEY}, {github_token('ghp_')} / owner {EMAIL}"

    masked = mask_text(line)

    assert masked.text == f"keys: {MASK}, {MASK} / owner {MASK}"
    assert masked.count == 3
    for value in (AWS_KEY, github_token("ghp_"), EMAIL):
        assert value not in masked.text


@pytest.mark.parametrize(
    ("line", "expected"),
    [
        pytest.param(
            f"GITHUB_TOKEN={github_token('ghp_')}",
            f"GITHUB_TOKEN={MASK}",
            id="env-and-token-shape",
        ),
        pytest.param(
            f'  "apiKey": "{GOOGLE_KEY}",',
            f'  "apiKey": "{MASK}",',
            id="quoted-and-aiza-shape",
        ),
    ],
)
def test_value_caught_by_two_rules_is_one_masked_value(
    line: str, expected: str
) -> None:
    """값 하나가 두 규칙에 걸려도 한 번만 가리고 한 건으로 센다(운영 로그 건수, 결정 7)."""
    masked = mask_text(line)

    assert masked.text == expected
    assert masked.count == 1


def test_carriage_return_at_line_end_is_kept() -> None:
    """CRLF patch의 줄 끝 \\r은 줄 내용이라 가린 뒤에도 남는다(줄 구조 유지, 계획 「가리기」)."""
    for template, value in (
        ("GITHUB_TOKEN={v}\r", ENV_VALUE),
        ('password = "{v}"\r', QUOTED),
        ("작성자: {v}\r", EMAIL),
    ):
        masked = mask_text(_filled(template, value))

        assert masked.text == _filled(template, MASK)
        assert masked.count == 1


@pytest.mark.parametrize(
    "line",
    [
        "const loginRateLimit = 5;",
        'import { useState } from "react";',
        '    "@babel/core": "^7.24.0",',
        "def get_token(self) -> str:",
        "if token is None:",
        "password_hash = hash_password(password)",
        'version = "1.2.3"',
    ],
)
def test_ordinary_code_line_is_left_alone(line: str) -> None:
    """비밀값·개인정보가 없는 보통 코드 줄은 그대로 두어 근거로 고를 수 있다(결정 7: 가림이 든 줄만 뺀다)."""
    masked = mask_text(line)

    assert masked.text == line
    assert masked.count == 0


@pytest.mark.parametrize(
    "line",
    [
        "API_KEY=${API_KEY}",
        "TOKEN=$(cat token.txt)",
        "TOKEN = getToken()",
        'SECRET_KEY = os.environ["SECRET_KEY"]',
        'password = ""',
    ],
)
def test_reference_or_empty_value_is_not_a_value_to_mask(line: str) -> None:
    """비밀 이름 대입이라도 값이 참조·호출·빈 글자면 가릴 값이 없어 그대로 둔다(계획 「가리기」: 대입의 값)."""
    masked = mask_text(line)

    assert masked.text == line
    assert masked.count == 0


def test_env_example_file_is_not_secret_but_its_values_are_masked() -> None:
    """.env.example 같은 예시 파일은 비밀 파일이 아니고, 그 안의 값만 가린다(구현 요약 「입력」)."""
    assert not is_secret_path(".env.example")

    masked = mask_text(f"API_KEY={ENV_VALUE}")

    assert masked.text == f"API_KEY={MASK}"
    assert ENV_VALUE not in masked.text


# 알려진 한계: 계획 「가리기」의 합성 실행 기록과 구현 요약이 적은 잘못 잡음·놓침


@pytest.mark.parametrize(
    "line",
    [
        "This guide assumes basic understanding of the API.",
        "Send the Bearer token in the header.",
        "PASSWORD_HINT_TEXT = getHint()",
        "sha = 3f786850e387550fdab836ed7e6dc881de23001b",
    ],
)
def test_prose_and_hashes_are_not_masked(line: str) -> None:
    """설명 글의 Bearer·basic 낱말, 호출 대입, 소문자 16진수 해시 줄은 가리지 않는다(잘못 잡음 줄이기)."""
    masked = mask_text(line)

    assert masked.text == line
    assert masked.count == 0


def test_long_base64_line_is_masked_even_outside_a_key_block() -> None:
    """키 블록의 BEGIN·END가 보이지 않아도, 대소문자·숫자가 섞인 긴 base64 덩어리 줄은 가린다(기준 32)."""
    body = _join("MIIEvQIBADANBgkqhkiG9w0BAQEFAASC", "BKcwggSjAgEAAoIBAQC7syn")
    for line in (body, "    " + body, f'  "{body}",'):
        masked = mask_text(line)

        assert body not in masked.text
        assert masked.count == 1


def test_known_false_positive_certificate_body_is_masked() -> None:
    """인증서·공개 키 내용 줄도 긴 base64 덩어리라 가린다. 비밀이 아니지만 그 줄을 고를 수 없을 뿐이다(한계)."""
    body = _join(
        "MIIDdzCCAl+gAwIBAgIEAgAAuTANBgkqhkiG9w0B", "AQUFADBaMQswCQYDVQQGEwJJRTES"
    )

    masked = mask_text(body)

    assert masked.text == MASK
    assert masked.count == 1


def test_known_non_secret_lines_from_plan_are_not_masked() -> None:
    """계획이 잘못 잡음으로 적었던 함수 호출 대입과 패키지 버전 표기는 지금 가리지 않는다(한계 고정)."""
    for line in (
        "token = createSessionToken(user)",
        "pnpm add @babel/core@7.24.0",
        "core@7.24.0",
    ):
        masked = mask_text(line)

        assert masked.text == line
        assert masked.count == 0


@pytest.mark.parametrize(
    ("line", "expected"),
    [
        # 문서화된 잘못 잡음: ssh 주소가 이메일 꼴이다.
        pytest.param(
            "git@github.com:octo/repo.git",
            f"{MASK}:octo/repo.git",
            id="ssh-remote",
        ),
        # 문서화된 잘못 잡음: 이름에 token이 들어 있다.
        pytest.param('tokenizer = "bert"', f'tokenizer = "{MASK}"', id="tokenizer"),
        # 이번에 확인한 잘못 잡음: 대문자 상수 이름에 TOKEN·PASSWORD가 든 설정 숫자.
        pytest.param("MAX_TOKENS = 4096", f"MAX_TOKENS = {MASK}", id="max-tokens"),
        pytest.param(
            "ACCESS_TOKEN_EXPIRE_MINUTES = 30",
            f"ACCESS_TOKEN_EXPIRE_MINUTES = {MASK}",
            id="token-expire",
        ),
        pytest.param(
            "PASSWORD_MIN_LENGTH = 8",
            f"PASSWORD_MIN_LENGTH = {MASK}",
            id="password-min-length",
        ),
        # 이번에 확인한 잘못 잡음: 고해상도 그림 파일 이름이 이메일 꼴이다.
        pytest.param(
            "background: url(logo@2x.png);",
            f"background: url({MASK});",
            id="retina-image",
        ),
    ],
)
def test_known_false_positive_is_masked(line: str, expected: str) -> None:
    """비밀이 아닌데 가리는 줄을 지금 동작으로 고정한다. 값은 새지 않고 그 줄을 고를 수 없을 뿐이다(한계 고정)."""
    masked = mask_text(line)

    assert masked.text == expected
    assert masked.count == 1


@pytest.mark.parametrize(
    "template",
    [
        # 구현 요약·계획이 적은 놓침: 따옴표 없는 소문자 비밀 이름 대입.
        pytest.param("password = {v}", id="lower-unquoted"),
        pytest.param("password: {v}", id="yaml-unquoted"),
        pytest.param("aws_secret_access_key = {v}", id="aws-credentials-style"),
        # 같은 갈래로 확인한 놓침: 점 이름으로 따옴표 없이 대입한 설정.
        pytest.param("spring.datasource.password={v}", id="properties"),
        pytest.param("secret_key_base: {v}", id="yaml-lower-unquoted"),
        pytest.param("curl -u admin:{v} https://example.invalid", id="curl-user"),
    ],
)
def test_known_miss_unquoted_or_unnamed_secret_is_sent(template: str) -> None:
    """비밀 이름·따옴표·줄 모양이 정한 꼴과 다르면 값을 놓친다. 지금 동작을 한계로 고정하고 따로 보고한다."""
    line = _filled(template, ENV_VALUE)

    masked = mask_text(line)

    assert masked.text == line
    assert masked.count == 0


@pytest.mark.parametrize(
    "value",
    [
        pytest.param(_join("010", " ", "1234", " ", "5678"), id="phone-spaces"),
        pytest.param(_join("+82", "-10-", "1234", "-", "5678"), id="phone-intl"),
        pytest.param(_join("900101", "1234567"), id="resident-no-hyphen"),
    ],
)
def test_known_miss_other_personal_number_layouts(value: str) -> None:
    """정한 꼴(하이픈 주민번호, 01X 휴대전화)과 다른 번호 표기는 놓친다. 지금 동작을 한계로 고정한다."""
    line = f"연락처 {value}"

    masked = mask_text(line)

    assert masked.text == line
    assert masked.count == 0


@pytest.mark.parametrize(
    ("template", "value"),
    [
        pytest.param("문의는 {v}으로 보내 주세요", EMAIL, id="email-euro"),
        pytest.param("# 토큰 {v}를 넣는다", github_token("ghp_"), id="ghp-reul"),
        pytest.param("키 {v}는 쓰지 않는다", AWS_KEY, id="akia-neun"),
        pytest.param("# {v}을 환경 변수로 둔다", GITHUB_PAT, id="github-pat-eul"),
        pytest.param("키는{v}", AWS_KEY, id="akia-korean-before"),
        pytest.param("슬랙 토큰 {v}을 썼다", SLACK_BOT, id="xoxb-eul"),
        pytest.param("지도 키 {v}로 부른다", GOOGLE_KEY, id="aiza-ro"),
    ],
)
def test_value_followed_by_korean_particle_is_still_masked(
    template: str, value: str
) -> None:
    """한글 조사가 바로 붙어도 값 모양이 온전하면 그 값만 가린다(기준 32, 계획 「가리기」의 대상 꼴)."""
    masked = mask_text(_filled(template, value))

    assert masked.text == _filled(template, MASK)
    assert masked.count == 1
    assert value not in masked.text


# PEM 개인 키 블록


def _key_lines(label: str, indent: str = "") -> list[str]:
    body = [
        _join(indent, "MIIEvQIBADANBgkq", "hkiG9w0BAQEFAASC"),
        _join(indent, "BKcwggSjAgEAAoIB", "AQC7synthetic+/="),
    ]
    return [
        f"{indent}-----BEGIN {label}-----",
        *body,
        f"{indent}-----END {label}-----",
    ]


@pytest.mark.parametrize(
    "label",
    [
        "PRIVATE KEY",
        "RSA PRIVATE KEY",
        "EC PRIVATE KEY",
        "DSA PRIVATE KEY",
        "OPENSSH PRIVATE KEY",
        "ENCRYPTED PRIVATE KEY",
        "PGP PRIVATE KEY BLOCK",
    ],
)
def test_private_key_block_is_masked_from_begin_to_end(label: str) -> None:
    """PEM 개인 키는 BEGIN부터 END까지 모든 줄을 가리고, 블록 앞뒤 줄은 보통 가리기만 받는다(계획 「가리기」)."""
    key = _key_lines(label)
    lines = ["signing_key = load(", *key, ")", f"owner = {EMAIL}"]
    block = PrivateKeyBlock()

    results = [block.mask(line) for line in lines]

    assert results[0].text == lines[0]
    assert results[0].count == 0
    for line, result in zip(key, results[1:-2], strict=True):
        assert result.text == MASK
        assert result.count > 0
        assert line not in result.text
    assert results[-2].text == ")"
    assert results[-2].count == 0
    # 블록이 끝나면 다음 줄은 다시 보통 가리기를 받는다.
    assert results[-1].text == f"owner = {MASK}"
    assert results[-1].count == 1


def test_indented_private_key_in_config_is_masked() -> None:
    """설정 파일 안에 들여 쓴 키 블록도 BEGIN~END 줄을 모두 가리고 바깥 키 이름 줄은 남긴다(계획 「가리기」)."""
    key = _key_lines("PRIVATE KEY", indent="    ")
    lines = ["  key: |", *key, "  algorithm: RS256"]
    block = PrivateKeyBlock()

    results = [block.mask(line) for line in lines]

    assert [result.text for result in results] == [
        "  key: |",
        *([MASK] * len(key)),
        "  algorithm: RS256",
    ]
    for line in key:
        assert all(line not in result.text for result in results)


def test_private_key_in_one_line_string_is_masked() -> None:
    """한 줄 문자열에 BEGIN·END가 함께 든 키는 그 줄을 가리고 다음 줄은 블록 밖이다(계획 「가리기」)."""
    body = _join("MIIEvQIBADANBgkq", "hkiG9w0BAQEFAASC")
    line = (
        'const key = "-----BEGIN PRIVATE KEY-----\\n'
        + body
        + '\\n-----END PRIVATE KEY-----";'
    )
    block = PrivateKeyBlock()

    first = block.mask(line)
    after = block.mask("const loginRateLimit = 5;")

    assert first.text == MASK
    assert body not in first.text
    assert after.text == "const loginRateLimit = 5;"
    assert after.count == 0


def test_private_key_without_end_masks_the_rest_of_the_file() -> None:
    """END가 변경 줄에 없으면 BEGIN 뒤 줄을 끝까지 가린다. 키 내용을 보내는 쪽으로 기울지 않는다(기준 32)."""
    body = _join("MIIEvQIBADANBgkq", "hkiG9w0BAQEFAASC")
    block = PrivateKeyBlock()

    results = [
        block.mask(line)
        for line in ("-----BEGIN RSA PRIVATE KEY-----", body, "const after = 1;")
    ]

    assert [result.text for result in results] == [MASK, MASK, MASK]
    assert all(result.count > 0 for result in results)


def test_each_file_starts_outside_a_key_block() -> None:
    """키 블록 상태는 파일마다 새로 시작한다. 앞 파일의 열린 블록이 다음 파일 줄을 가리지 않는다."""
    first_file = PrivateKeyBlock()
    first_file.mask("-----BEGIN PRIVATE KEY-----")

    next_file = PrivateKeyBlock()
    result = next_file.mask("const loginRateLimit = 5;")

    assert result.text == "const loginRateLimit = 5;"
    assert result.count == 0


@pytest.mark.parametrize("label", ["PUBLIC KEY", "CERTIFICATE", "RSA PUBLIC KEY"])
def test_public_key_or_certificate_block_is_not_a_private_key(label: str) -> None:
    """공개 키·인증서 블록은 개인 키가 아니어서 블록째 가리지 않는다(계획 「가리기」의 대상은 PEM 개인 키)."""
    lines = [
        f"-----BEGIN {label}-----",
        "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE",
        f"-----END {label}-----",
        "const loginRateLimit = 5;",
    ]
    block = PrivateKeyBlock()

    results = [block.mask(line) for line in lines]

    assert [result.text for result in results] == lines
    assert all(result.count == 0 for result in results)


KEY_PATH = "config/signing.yaml"


def test_rotated_private_key_body_is_not_sent_to_the_provider() -> None:
    """키 내용만 바꾼 변경(BEGIN·END는 문맥 줄)도 키 줄을 제공자 입력·결과에 남기지 않는다(기준 32).

    PEM 키를 새 키로 바꾸면 BEGIN·END 줄은 같아서 git diff에서 문맥 줄이 되고, 바뀐 줄은 키 내용뿐이다.
    가리기 대상이 PEM 개인 키이므로 이 줄들도 보내면 안 된다. 다른 파일에 고를 수 있는 줄을 두어 생성
    호출이 일어나게 한다.
    """
    old_body = _join("MIIEvQIBADANBgkq", "hkiG9w0BAQEFAASC", "oldSynthetic")
    new_body = _join("MIIEvgIBADANBgkq", "hkiG9w0BAQEFAASC", "newSynthetic")
    patch = "\n".join(
        [
            "@@ -1,5 +1,5 @@",
            " signing:",
            "   key: |",
            "     -----BEGIN PRIVATE KEY-----",
            "-    " + old_body,
            "+    " + new_body,
            "     -----END PRIVATE KEY-----",
        ]
    )
    work = commit(
        sha(9201),
        MEMBER,
        parents=(ROOT,),
        minute=5,
        files=[
            change(KEY_PATH, patch=patch),
            change("src/limit.py", patch="@@ -1 +1 @@\n-x = 1\n+loginRateLimit = 5"),
        ],
    )
    scenario = Scenario(default_branch=(work, root_commit()), lookups={work.sha: ()})
    provider = ScriptedProvider(naive)

    case = generation_case(scenario, provider)

    assert provider.generate_requests()
    for body in (old_body, new_body):
        assert_nowhere(body, provider=provider, result=case.result)
    for request in provider.requests:
        for line in sent_lines(request):
            if line.path == KEY_PATH:
                assert not line.selectable


# 비밀 파일 판정


@pytest.mark.parametrize(
    "path",
    [
        ".env",
        ".env.local",
        ".env.production",
        ".env.development",
        "id_rsa",
        "id_ed25519",
        "server.pem",
        "tls.key",
        "credentials.json",
        ".npmrc",
        "config/.env",
        "apps/web/.env.local",
        "deploy/.env.production",
        "home/dev/.ssh/id_rsa",
        "deploy/certs/server.pem",
        "infra/tls/tls.key",
        "secrets/credentials.json",
        "packages/ui/.npmrc",
    ],
)
def test_secret_file_by_name_is_secret_in_any_directory(path: str) -> None:
    """이름만으로 비밀인 파일은 어느 디렉터리에 있어도 비밀 파일이다(결정 7, 계획 「가리기」)."""
    assert is_secret_path(path)


@pytest.mark.parametrize(
    "path",
    [
        ".env.example",
        ".env.sample",
        "config/.env.example",
        "apps/web/.env.sample",
        ".env.template",
        ".env.dist",
        "src/auth.ts",
        "src/env.ts",
        "README.md",
        "package.json",
        "docs/environment.md",
        "node_modules/.pnpm/@babel+core@7.24.0/index.js",
    ],
)
def test_example_or_ordinary_file_is_not_secret(path: str) -> None:
    """예시 환경 파일과 보통 파일은 비밀 파일이 아니다. 예시 파일은 값만 가린다(구현 요약 「입력」)."""
    assert not is_secret_path(path)


@pytest.mark.parametrize(
    "path",
    [
        _join("docs/people/", EMAIL, ".md"),
        _join("contacts/", EMAIL, "/notes.txt"),
        _join("data/", PHONE, ".csv"),
        _join("records/", RESIDENT, ".json"),
    ],
)
def test_path_with_value_to_mask_is_secret(path: str) -> None:
    """경로에 이메일·전화번호·주민번호 같은 가릴 값이 들면 그 파일은 경로·상태를 보내지 않는다(구현 요약 「입력」)."""
    assert is_secret_path(path)


def test_known_false_positive_retina_image_path_is_secret() -> None:
    """고해상도 그림 이름(`logo@2x.png`)은 이메일 꼴이라 비밀 파일로 본다. 값은 새지 않는 잘못 잡음이다(한계 고정)."""
    assert is_secret_path("assets/logo@2x.png")


def test_middle_of_long_private_key_is_not_sent_to_the_provider() -> None:
    """긴 키의 가운데 줄만 바뀌어 BEGIN·END가 hunk 밖에 있어도 키 내용 줄을 보내지 않는다(기준 32)."""
    context = _join("MIIEvQIBADANBgkqhkiG9w0BAQEFAASC", "BKcwggSjAgEAAoIBAQC7aaaa")
    old_body = _join("MIIEowIBAAKCAQEAsynthetic", "OldMiddleLine0123456789ab")
    new_body = _join("MIIEowIBAAKCAQEAsynthetic", "NewMiddleLine0123456789ab")
    patch = "\n".join(
        [
            "@@ -10,7 +10,7 @@",
            "     " + context,
            "     " + context,
            "     " + context,
            "-    " + old_body,
            "+    " + new_body,
            "     " + context,
            "     " + context,
            "     " + context,
        ]
    )
    work = commit(
        sha(9202),
        MEMBER,
        parents=(ROOT,),
        minute=5,
        files=[
            change(KEY_PATH, patch=patch),
            change("src/limit.py", patch="@@ -1 +1 @@\n-x = 1\n+loginRateLimit = 5"),
        ],
    )
    scenario = Scenario(default_branch=(work, root_commit()), lookups={work.sha: ()})
    provider = ScriptedProvider(naive)

    case = generation_case(scenario, provider)

    assert provider.generate_requests()
    for body in (old_body, new_body):
        assert_nowhere(body, provider=provider, result=case.result)


def test_renamed_from_secret_file_sends_neither_path() -> None:
    """이전 경로가 비밀 파일이면 새 경로·이전 경로·상태를 모두 보내지 않는다(기준 32, 결정 7)."""
    secret_previous = "deploy/.env.production"
    renamed_path = "deploy/settings.conf"
    renamed = {
        **change(renamed_path, status="renamed", patch="@@ -1 +1 @@\n-A=1\n+A=2"),
        "previous_filename": secret_previous,
    }
    work = commit(
        sha(9203),
        MEMBER,
        parents=(ROOT,),
        minute=5,
        files=[
            renamed,
            change("src/limit.py", patch="@@ -1 +1 @@\n-x = 1\n+loginRateLimit = 5"),
        ],
    )
    scenario = Scenario(default_branch=(work, root_commit()), lookups={work.sha: ()})
    provider = ScriptedProvider(naive)

    case = generation_case(scenario, provider)

    assert provider.generate_requests()
    for value in (secret_previous, renamed_path):
        assert_nowhere(value, provider=provider, result=case.result)
    assert case.run.report.secret_files == 1


def test_escaped_quote_inside_value_does_not_leave_the_rest() -> None:
    """따옴표 값 안의 이스케이프된 따옴표에서 끊지 않고 값 전체를 가린다(기준 32)."""
    line = _join('"password": "abc', "\\", '"', ENV_VALUE, '"')

    masked = mask_text(line)

    assert ENV_VALUE not in masked.text
    assert masked.text == f'"password": "{MASK}"'


def test_value_found_on_one_line_is_masked_on_other_lines() -> None:
    """한 줄에서 꼴로 알아본 값(6자 이상)은 같은 요청의 다른 줄에 그대로 나와도 가린다(기준 32·33)."""
    password = _join("S3cret", "Passw0rd")
    lines = [
        f'const adminPassword = "{password}";',
        f'await login(page, "admin", "{password}");',
        "const loginRateLimit = 5;",
    ]
    book = MaskBook(lines)

    results = [book.mask(line) for line in lines]

    assert all(password not in result.text for result in results)
    assert results[1].text == f'await login(page, "admin", "{MASK}");'
    assert results[1].count == 1
    assert results[2].text == lines[2]
    assert results[2].count == 0


def test_short_value_is_not_spread_to_other_lines() -> None:
    """6자보다 짧은 값은 다른 줄로 넓혀 가리지 않는다(흔한 낱말이 든 줄을 모두 가리지 않게)."""
    lines = ['password = "test"', "def test_login(): pass"]
    book = MaskBook(lines)

    assert book.mask(lines[0]).text == f'password = "{MASK}"'
    assert book.mask(lines[1]).text == lines[1]


def test_line_longer_than_the_cap_is_masked_whole() -> None:
    """줄이 상한(2,000자)보다 길면 정규식을 돌리지 않고 통째로 가린다(빌드 산출물·압축 코드 줄)."""
    line = '  "bytecode": "0x' + "6080" * (MAX_LINE_CHARS // 4) + '",'

    masked = mask_text(line)

    assert masked.text == MASK
    assert masked.count == 1


@pytest.mark.parametrize(
    "line",
    [
        pytest.param("a" * MAX_LINE_CHARS, id="letters"),
        pytest.param(("token" * MAX_LINE_CHARS)[:MAX_LINE_CHARS], id="secret-word"),
        pytest.param(
            ("tokenStore.accessToken.refreshToken" * 100)[:MAX_LINE_CHARS],
            id="secret-path",
        ),
        pytest.param(("-TOKEN=a" * 300)[: MAX_LINE_CHARS - 2] + " x", id="env"),
        pytest.param(("xoxb-" * 400)[: MAX_LINE_CHARS - 1] + "_", id="slack"),
        pytest.param(("a" * (MAX_LINE_CHARS - 10)) + "://x:y@", id="url"),
        pytest.param(("a" * (MAX_LINE_CHARS - 30)) + "@b.c", id="email"),
        pytest.param(' secret: "a' * 180, id="quoted-many"),
        pytest.param(" -e TOKEN=a" * 180, id="env-many"),
    ],
)
def test_masking_a_long_line_stays_fast(line: str) -> None:
    """상한 길이의 병적인 줄도 가리기가 빨리 끝난다(줄 하나 0.5초 미만, 되돌아가기 폭증 없음)."""
    started = time.perf_counter()
    mask_text(line)

    assert time.perf_counter() - started < 0.5


def _two_files(first: dict[str, object], second: dict[str, object]) -> Scenario:
    work = commit(
        sha(9301),
        MEMBER,
        parents=(ROOT,),
        minute=5,
        files=[
            first,
            second,
            change("src/limit.py", patch="@@ -1 +1 @@\n-x = 1\n+loginRateLimit = 5"),
        ],
    )
    return Scenario(default_branch=(work, root_commit()), lookups={work.sha: ()})


def test_private_key_content_copied_elsewhere_is_masked_too() -> None:
    """PEM 블록 안에서 가린 내용이 다른 파일 줄에 그대로 있어도 보내지 않는다(32)."""
    body = _join("CopiedPem", "Tail2026", "abcdefXYZ")
    key = "\n".join(
        [
            "@@ -0,0 +1,3 @@",
            "+-----BEGIN PRIVATE KEY-----",
            "+" + body,
            "+-----END PRIVATE KEY-----",
        ]
    )
    provider = ScriptedProvider(naive)

    case = generation_case(
        _two_files(
            change("config/key.txt", patch=key, status="added"),
            change(
                "tests/check.py",
                patch=f'@@ -0,0 +1 @@\n+check("{body}")',
                status="added",
            ),
        ),
        provider,
    )

    assert provider.generate_requests()
    assert_nowhere(body, provider=provider, result=case.result)


def test_value_inside_a_line_over_the_cap_is_masked_elsewhere() -> None:
    """2,000자를 넘어 통째로 가린 줄 안의 비밀값도 다른 줄에서 가린다(32)."""
    password = _join("LongLine", "Password", "2026")
    long_line = f'+password = "{password}"  # ' + "x" * (MAX_LINE_CHARS + 100)
    provider = ScriptedProvider(naive)

    case = generation_case(
        _two_files(
            change(
                "src/config.py", patch=f"@@ -0,0 +1 @@\n{long_line}", status="added"
            ),
            change(
                "tests/check.py",
                patch=f'@@ -0,0 +1 @@\n+check("{password}")',
                status="added",
            ),
        ),
        provider,
    )

    assert provider.generate_requests()
    assert_nowhere(password, provider=provider, result=case.result)


def test_many_shared_values_keep_masking_time_linear() -> None:
    """가린 값이 아주 많아도 줄마다 모든 값을 다시 훑지 않는다(값 수 × 줄 수로 시간이 늘지 않음)."""
    lines = [f'password = "Secret{number:06d}xyz"' for number in range(8_000)]

    started = time.perf_counter()
    book = MaskBook(lines)
    results = [book.mask(line) for line in lines]

    assert time.perf_counter() - started < 2.0
    assert all("Secret" not in result.text for result in results)
