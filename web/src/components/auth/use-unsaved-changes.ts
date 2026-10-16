"use client";
import { useEffect, useRef } from "react";
import { unsavedChanges } from "@/lib/unsaved-changes";

/**
 * 작성 중인 입력이 있음을 로그아웃·재인증 [다시 로그인]의 미저장 확인에 알린다(#287). 어떤 입력을 미저장으로 볼지는 각 화면이 정한다.
 * 화면이 사라지면 등록을 푼다.
 */
export function useUnsavedChanges(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => unsavedChanges.register(() => dirtyRef.current), []);
}
