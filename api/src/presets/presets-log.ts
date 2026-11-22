// 프리셋 로그(발행 프리셋 U1 관측 설계 NFR4.5, 보안 설계 NFR4.1, 규칙 BR7.1). 지금 publications-log.ts와 같은 꼴이다.
// Nest Logger('Presets')로 사건마다 객체 한 줄을 남긴다. 함수는 회원 ID·프리셋 ID·오류 코드만 받는다. 이름·자료 ID·자료 내용은 받지 않는다.
// 목록·상세·세기의 실패는 따로 남기지 않는다(500은 공통 오류 필터의 서버 오류 로그, NFR4.7).
import { HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ApiError } from '../common/errors';

export type PresetLogEvent = 'PRESET_SAVED' | 'PRESET_SAVE_FAILED' | 'PRESET_DELETED' | 'PRESET_DELETE_FAILED';

/** 로그 한 줄의 칸. 해당 없는 칸은 null로 둬 줄마다 같은 모양을 유지한다. */
export interface PresetLogEntry {
  event: PresetLogEvent;
  memberId: string | null;
  presetId: string | null;
  errorCode: string | null;
}

@Injectable()
export class PresetsLog {
  private readonly logger = new Logger('Presets');

  presetSaved(memberId: string, presetId: string): void {
    this.logger.log(entry({ event: 'PRESET_SAVED', memberId, presetId }));
  }

  presetSaveFailed(memberId: string | null, errorCode: string): void {
    this.logger.warn(entry({ event: 'PRESET_SAVE_FAILED', memberId, errorCode }));
  }

  presetDeleted(memberId: string, presetId: string): void {
    this.logger.log(entry({ event: 'PRESET_DELETED', memberId, presetId }));
  }

  presetDeleteFailed(memberId: string | null, errorCode: string): void {
    this.logger.warn(entry({ event: 'PRESET_DELETE_FAILED', memberId, errorCode }));
  }
}

/** 로그에 남길 오류 코드: 업무 코드가 있으면 그 코드, 404 예외는 RESOURCE_UNAVAILABLE, 그 밖은 INTERNAL_ERROR(발행 로그와 같은 기준). */
export function presetErrorCode(error: unknown): string {
  if (error instanceof ApiError) return error.code;
  if (error instanceof NotFoundException) return 'RESOURCE_UNAVAILABLE';
  if (error instanceof HttpException && error.getStatus() === 400) return 'INVALID_REQUEST';
  return 'INTERNAL_ERROR';
}

function entry(values: Partial<PresetLogEntry> & { event: PresetLogEvent }): PresetLogEntry {
  return { memberId: null, presetId: null, errorCode: null, ...values };
}
