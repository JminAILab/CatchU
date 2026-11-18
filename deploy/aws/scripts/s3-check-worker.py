"""EKS worker Pod 안에서 회원 파일 버킷 권한을 확인한다(#276 2단계). 쓰는 법과 순서는 deploy/aws/s3.md 「확인(2단계)」.

worker 이미지에 든 boto3와 Pod가 받은 역할을 그대로 쓴다. 접근 키는 넘기지 않는다. 버킷은 Pod의 FILE_STORAGE_S3_BUCKET이다.
    python - <키>    api 확인(s3-check-api.js keep)이 남긴 파일을 읽을 수 있고, 올리기·삭제·목록은 거부되는지 본다.
화면에는 단계 이름과 결과만 찍는다. 하나라도 기대와 다르면 종료 코드 1이다. #276 완료 기준 「worker 역할의 S3 쓰기·삭제가 거부된다」의 증거다.
"""

import os
import re
import sys
from collections.abc import Callable

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

KEY_SHAPE = re.compile(r"members/[0-9a-f-]{36}/s3-check")


def outcome(call: Callable[[], object]) -> str:
    """호출 결과를 '허용' 또는 오류 코드·종류 이름으로 바꾼다."""
    try:
        call()
    except ClientError as error:
        return str(error.response.get("Error", {}).get("Code", "ClientError"))
    except BotoCoreError as error:
        return type(error).__name__
    return "허용"


def main() -> int:
    bucket = os.environ.get("FILE_STORAGE_S3_BUCKET", "")
    key = sys.argv[1] if len(sys.argv) > 1 else ""
    if not bucket:
        print("FILE_STORAGE_S3_BUCKET이 없다. worker Pod 안에서 실행한다.")
        return 1
    if not KEY_SHAPE.fullmatch(key):
        print("사용법: python - members/<UUID>/s3-check")
        return 1

    # 연결이 막혔을 때 오래 붙들지 않게 시간 제한과 시도 횟수를 줄인다.
    s3 = boto3.client("s3", config=Config(connect_timeout=5, read_timeout=15, retries={"mode": "standard", "total_max_attempts": 2}))
    extra = f"{key}-worker"
    steps = [
        ("읽기", lambda: s3.get_object(Bucket=bucket, Key=key)["Body"].read(), "허용"),
        ("올리기", lambda: s3.put_object(Bucket=bucket, Key=extra, Body=b"x"), "AccessDenied"),
        ("삭제", lambda: s3.delete_object(Bucket=bucket, Key=key), "AccessDenied"),
        ("목록", lambda: s3.list_objects_v2(Bucket=bucket, Prefix="members/", MaxKeys=1), "AccessDenied"),
    ]
    failed = False
    for step, call, want in steps:
        got = outcome(call)
        ok = got == want
        failed = failed or not ok
        print(f"{'통과' if ok else '실패'}: {step} — {got}" + ("" if ok else f"(기대: {want})"))
        if step == "올리기" and got == "허용":
            print(f"주의: 버킷에 {extra} 파일이 남았다. api 확인의 clean 뒤 관리자 권한으로 지운다.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
