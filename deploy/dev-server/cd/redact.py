"""표준 입력을 그대로 내보내되, 환경 폴더(인자)의 비밀값과 같은 글자를 [가림]으로 바꾼다. 값 자체는 출력하지 않는다.

이름에 SECRET·PASSWORD·PASS·TOKEN·KEY·DATABASE가 들거나 _URL로 끝나는 값과, 주소 안 비밀번호를 가린다.
비밀번호가 없는 http(s) 주소와 8자 미만 값은 가리지 않는다. 자동 배포(#313)의 server-deploy.sh가 쓴다.
"""

import os
import re
import sys
import urllib.parse

base = sys.argv[1]
pattern = re.compile(r"(SECRET|PASSWORD|PASS|TOKEN|KEY|DATABASE|_URL$)", re.I)
values = set()
for name in os.listdir(base):
    path = os.path.join(base, name)
    if not (os.path.isfile(path) and name.endswith(".env")):
        continue
    with open(path, encoding="utf-8", errors="replace") as env_file:
        for line in env_file:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip().strip('"').strip("'")
            if len(value) < 8 or not pattern.search(key):
                continue
            try:
                parts = urllib.parse.urlsplit(value)
                if parts.password:
                    values.add(parts.password)
                    values.add(urllib.parse.unquote(parts.password))
                elif parts.scheme in ("http", "https"):
                    continue
            except ValueError:
                pass
            values.add(value)
ordered = sorted((v for v in values if len(v) >= 8), key=len, reverse=True)
for line in sys.stdin:
    for value in ordered:
        line = line.replace(value, "[가림]")
    sys.stdout.write(line)
    sys.stdout.flush()
