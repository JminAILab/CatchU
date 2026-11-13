"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { api } from "../../lib/api";
import { authSessionIntegrationEnabled } from "../../lib/auth-integration";
import { authRuntime } from "../../lib/auth-runtime";
import { createMemberJdApi } from "./jd-api";
import { createJdRecipientCallbacks } from "./jd-recipient-binding";
import { JdSummaryPanel } from "./jd-summary-panel";
import type { JdRecipientContext, SourceLocation } from "./jd-types";

const client = createMemberJdApi(api.member);
type Props = JdRecipientContext & { showEvidence: (location: SourceLocation) => void };

/** U4의 4번 자리만 소비한다. 링크를 바꾸면 콜백 묶음과 이전 패널도 함께 해제한다. */
export function JdRecipientPanel(props: Props) {
  return <LinkedJdPanel key={props.token} {...props} />;
}

function LinkedJdPanel({ token, isLoggedIn, getGrant, onAccessLost, showEvidence }: Props) {
  const [callbacks] = useState(() => createJdRecipientCallbacks({ getGrant, onAccessLost }));
  // U4의 강조·다시 그리기는 새 함수를 전달한다. 그것만으로 JD 선택·결과를 초기화하지 않는다.
  useLayoutEffect(() => callbacks.update({ getGrant, onAccessLost }), [callbacks, getGrant, onAccessLost]);
  useEffect(() => {
    // 공유 페이지에는 회원 Guard가 없다. 기존 공용 복원을 한 번 요청하며 별도 인증 흐름은 만들지 않는다.
    if (authSessionIntegrationEnabled) authRuntime().ensureRestored();
  }, []);
  return <JdSummaryPanel client={client} token={token} isLoggedIn={isLoggedIn}
    getGrant={callbacks.getGrant} onAccessLost={callbacks.onAccessLost} showEvidence={showEvidence} />;
}
