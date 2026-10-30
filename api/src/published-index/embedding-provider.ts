// 임베딩 제공자 만들기(비기능 설계 security-design 「키와 합성 제공자」 판정표, BR6.1, NFR1.3).
// U3 코드 PR에서는 앱 기동 경로에 넣지 않는다. 통합 PR에서 api 기동 때 이 판정이 돈다(logical-components 「통합 때 할 일」).
import { isDevelopmentOrTest } from '../common/node-env';
import type { EmbeddingConfig } from './embedding-config';
import type { EmbeddingProvider } from './embedding-types';
import { createIndexLogger, type IndexLogger, writeIndexLog } from './published-index-log';
import { createSyntheticEmbeddingProvider } from './synthetic-embedding-provider';
import { createVoyageEmbeddingProvider, type VoyageProviderOptions } from './voyage-embedding-provider';

export {
  type DocumentEmbeddings, type EmbeddingInputType, type EmbeddingProvider, EmbeddingProviderError,
  type EmbeddingProviderFailure, type QueryEmbedding,
} from './embedding-types';

export interface EmbeddingProviderOptions extends VoyageProviderOptions {
  logger?: IndexLogger;
}

/**
 * | 키 | NODE_ENV | 결과 |
 * | 있음 | 무엇이든 | Voyage 제공자 |
 * | 없음 | 정확히 development·test | 합성 제공자 + EMBEDDING_PROVIDER_SYNTHETIC 경고 한 줄 |
 * | 없음 | 그 밖(미지정 포함) | 오류(키 값은 넣지 않는다) |
 */
export function createEmbeddingProvider(
  config: EmbeddingConfig,
  env: NodeJS.ProcessEnv = process.env,
  options: EmbeddingProviderOptions = {},
): EmbeddingProvider {
  if (config.apiKey !== null) return createVoyageEmbeddingProvider(config.apiKey, options);
  if (isDevelopmentOrTest(env)) {
    writeIndexLog(options.logger ?? createIndexLogger(), { event: 'EMBEDDING_PROVIDER_SYNTHETIC' });
    return createSyntheticEmbeddingProvider();
  }
  throw new Error('CATCHU_EMBEDDING_API_KEY가 비어 있어 임베딩 제공자를 만들 수 없습니다.');
}
