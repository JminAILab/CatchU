"""분석 소비자 실행: `python -m app.consumer [--host 주소] [--port 포트]`.

최상위에서는 아무것도 시작하지 않는다(spawn 자식이 이 모듈을 다시 읽어도 소비자가 뜨지 않게).
"""

import argparse
from collections.abc import Sequence


def main(argv: Sequence[str] | None = None) -> int:
    import asyncio
    import logging

    from app.consumer.service import ConsumerService
    from app.consumer.settings import (
        ConsumerSettings,
        SettingsError,
        drop_parent_only_env,
    )

    parser = argparse.ArgumentParser(
        prog="python -m app.consumer",
        description="분석 요청 큐 소비자와 상태 확인(/health)을 띄운다.",
    )
    parser.add_argument(
        "--host", default="0.0.0.0", help="상태 확인 주소(기본 0.0.0.0)"
    )
    parser.add_argument(
        "--port", type=int, default=8000, help="상태 확인 포트(기본 8000)"
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    try:
        settings = ConsumerSettings.from_environment()
    except SettingsError as error:
        logging.getLogger("app.consumer").error("기동 설정 오류: %s", error)
        return 2
    # 분석 자식(spawn)이 큐 비밀번호를 환경변수로 물려받지 않게 한다. 설정 객체에는 이미 담았다.
    drop_parent_only_env()
    return asyncio.run(ConsumerService(settings, host=args.host, port=args.port).run())


if __name__ == "__main__":
    raise SystemExit(main())
