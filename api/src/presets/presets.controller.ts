import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentMemberId } from '../auth/auth.decorators';
import { emptyPresetQuery, isUuid } from './preset-input';
import { ItemMeasure, PresetDetail, PresetStore, PresetSummary } from './preset-store';
import { PresetsLog, presetErrorCode } from './presets-log';

/**
 * 프리셋 경로(발행 프리셋 U1 계약 P-1, 기능 명세 「경로 요약」). 인증은 지금 발행 경로와 같은 전역 Bearer Guard이고
 * `@CurrentMemberId()`만 쓴다. Bearer 회원 경로라 CSRF·Origin 검사는 더하지 않는다(NFR 요구 검토 R-01, security-design NFR2.1).
 * 클래스·메서드에 `@Public()`을 붙이지 않는다. /v1·오류 형식·no-store는 공통 bootstrap을 쓴다.
 * `measure`는 `:presetId`보다 먼저 선언해 경로가 겹치지 않게 한다(메서드가 달라 겹치지 않지만 읽는 순서를 맞춘다).
 */
@Controller('presets')
export class PresetsController {
  constructor(private readonly store: PresetStore, private readonly log: PresetsLog) {}

  @Get()
  list(@CurrentMemberId() memberId: string, @Query() query: unknown): Promise<{ presets: PresetSummary[] }> {
    emptyPresetQuery(query);
    return this.store.list(memberId);
  }

  @Post()
  async create(@CurrentMemberId() memberId: string, @Body() body: unknown, @Query() query: unknown): Promise<{ presetId: string }> {
    return this.saved(memberId, () => {
      emptyPresetQuery(query);
      return this.store.create(memberId, body);
    });
  }

  /** 세기(BR2.4). 값을 만들지 않으므로 200이다. */
  @Post('measure')
  @HttpCode(200)
  measure(@CurrentMemberId() memberId: string, @Body() body: unknown, @Query() query: unknown): Promise<{ items: ItemMeasure[] }> {
    emptyPresetQuery(query);
    return this.store.measure(memberId, body);
  }

  @Get(':presetId')
  get(@CurrentMemberId() memberId: string, @Param('presetId') id: string, @Query() query: unknown): Promise<PresetDetail> {
    emptyPresetQuery(query);
    return this.store.get(memberId, id);
  }

  @Put(':presetId')
  update(
    @CurrentMemberId() memberId: string, @Param('presetId') id: string, @Body() body: unknown, @Query() query: unknown,
  ): Promise<{ presetId: string }> {
    return this.saved(memberId, () => {
      emptyPresetQuery(query);
      return this.store.update(memberId, id, body);
    });
  }

  @Delete(':presetId')
  @HttpCode(204)
  async remove(@CurrentMemberId() memberId: string, @Param('presetId') id: string, @Query() query: unknown): Promise<void> {
    const member = memberOf(memberId);
    try {
      emptyPresetQuery(query);
      const presetId = await this.store.remove(memberId, id);
      this.log.presetDeleted(memberId.toLowerCase(), presetId);
    } catch (error) {
      this.log.presetDeleteFailed(member, presetErrorCode(error));
      throw error;
    }
  }

  /** 저장(만들기·고치기)의 성공·실패 로그 한 줄(NFR4.5). 실패는 원래 오류를 그대로 던진다. */
  private async saved(memberId: string, run: () => Promise<{ presetId: string }>): Promise<{ presetId: string }> {
    try {
      const result = await run();
      this.log.presetSaved(memberId.toLowerCase(), result.presetId);
      return result;
    } catch (error) {
      this.log.presetSaveFailed(memberOf(memberId), presetErrorCode(error));
      throw error;
    }
  }
}

/** 로그에 남길 회원 ID. UUID가 아니면 남기지 않는다. */
function memberOf(memberId: string): string | null {
  return isUuid(memberId) ? memberId.toLowerCase() : null;
}
