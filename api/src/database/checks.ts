// @Check()에 넘기는 CHECK 식. 칼럼은 DB 이름(snake_case)으로 쓴다. 이름은 SnakeNamingStrategy가 만든다.

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** varchar로 저장하는 enum 칼럼의 허용 값. 예: @Check(inValues('account_state', ['ACTIVE', 'DISABLED'])) */
export function inValues(column: string, values: readonly string[]): string {
  return `"${column}" IN (${values.map(quote).join(', ')})`;
}

/** 문자열 길이 범위. 예: @Check(lengthBetween('key', 1, 128)) */
export function lengthBetween(column: string, min: number, max?: number): string {
  return max === undefined
    ? `char_length("${column}") >= ${min}`
    : `char_length("${column}") BETWEEN ${min} AND ${max}`;
}
