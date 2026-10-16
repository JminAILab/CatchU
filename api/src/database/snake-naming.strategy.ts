import { createHash } from 'node:crypto';
import { DefaultNamingStrategy, NamingStrategyInterface, Table, View } from 'typeorm';

// PostgreSQL 식별자 최대 길이. 넘으면 DB가 조용히 잘라 이름이 겹칠 수 있다.
const MAX_IDENTIFIER_LENGTH = 63;

export function snakeCase(name: string): string {
  return name
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z\d]+)/g, '$1_$2')
    .toLowerCase();
}

// 스키마 접두사를 뺀 테이블 이름.
function tableOf(tableOrName: Table | View | string): string {
  return (typeof tableOrName === 'string' ? tableOrName : tableOrName.name).split('.').pop() as string;
}

function shortHash(input: string): string {
  return createHash('sha1').update(input).digest('hex').slice(0, 8);
}

/** `pk_<테이블>_<칼럼>` 형태. 63자를 넘으면 앞부분에 전체 이름의 해시를 붙여 결정적으로 줄인다. */
function constraintName(prefix: string, parts: string[]): string {
  const name = [prefix, ...parts].join('_');
  if (name.length <= MAX_IDENTIFIER_LENGTH) return name;
  return `${name.slice(0, MAX_IDENTIFIER_LENGTH - 9)}_${shortHash(name)}`;
}

/**
 * 테이블·칼럼은 snake_case, 제약·인덱스는 접두사가 붙은 결정적 이름으로 만든다.
 * 이름은 규칙이 만들므로 엔티티에서 제약·인덱스 이름을 직접 쓰지 않는다(api/CONVENTIONS.md 「DB 물리 규약」).
 */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  override tableName(targetName: string, userSpecifiedName: string | undefined): string {
    return userSpecifiedName ?? snakeCase(targetName);
  }

  override columnName(propertyName: string, customName: string | undefined, embeddedPrefixes: string[]): string {
    return customName ?? snakeCase([...embeddedPrefixes, propertyName].join('_'));
  }

  override joinColumnName(relationName: string, referencedColumnName: string): string {
    return snakeCase(`${relationName}_${referencedColumnName}`);
  }

  override joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return snakeCase(`${tableName}_${columnName ?? propertyName}`);
  }

  override primaryKeyName(tableOrName: Table | string): string {
    return constraintName('pk', [tableOf(tableOrName)]);
  }

  override uniqueConstraintName(tableOrName: Table | string, columnNames: string[]): string {
    return constraintName('uq', [tableOf(tableOrName), ...columnNames]);
  }

  override relationConstraintName(tableOrName: Table | string, columnNames: string[], where?: string): string {
    return constraintName('uq', [tableOf(tableOrName), ...columnNames, ...(where ? [shortHash(where)] : [])]);
  }

  override foreignKeyName(tableOrName: Table | string, columnNames: string[]): string {
    return constraintName('fk', [tableOf(tableOrName), ...columnNames]);
  }

  // 부분 인덱스는 조건식의 해시를 붙여, 조건이 바뀌면 이름도 바뀌어 마이그레이션 생성이 변경을 알아채게 한다.
  override indexName(tableOrName: Table | View | string, columnNames: string[], where?: string): string {
    return constraintName('ix', [tableOf(tableOrName), ...columnNames, ...(where ? [shortHash(where)] : [])]);
  }

  // CHECK는 식에 처음 나오는 칼럼 이름과 식의 해시로 만든다. 허용 값이 바뀌면 이름이 바뀌어 교체 마이그레이션이 생성된다.
  override checkConstraintName(tableOrName: Table | string, expression: string): string {
    const column = /"([^"]+)"/.exec(expression)?.[1];
    return constraintName('ck', [tableOf(tableOrName), ...(column ? [column] : []), shortHash(expression)]);
  }

  override exclusionConstraintName(tableOrName: Table | string, expression: string): string {
    return constraintName('ex', [tableOf(tableOrName), shortHash(expression)]);
  }

  override defaultConstraintName(tableOrName: Table | string, columnName: string): string {
    return constraintName('df', [tableOf(tableOrName), columnName]);
  }
}
