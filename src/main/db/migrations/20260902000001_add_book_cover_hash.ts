import { Knex } from "knex";

/**
 * 표지 이미지의 dHash를 저장할 컬럼 추가. 제목이나 hitomi_id가 달라도
 * 표지가 같은 사본을 중복 후보로 잡는 데 쓴다. 16자리 16진수(64비트)다.
 *
 * 해밍 거리는 SQL로 계산할 수 없어 그룹핑을 메모리에서 하므로 인덱스는 두지 않는다.
 * 기존 책은 null이며 중복 정리 화면에 처음 들어갈 때 채워진다.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("Book", (table) => {
    table.string("cover_hash", 16).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("Book", (table) => {
    table.dropColumn("cover_hash");
  });
}
