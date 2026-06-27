import { Knex } from "knex";

/**
 * 라이브러리 재스캔 시 변경되지 않은 ZIP/CBZ 파일을 건너뛰기 위한
 * 파일 캐시 키 컬럼 추가. 파일의 수정 시간(mtime)과 크기(size)를 저장하여
 * 다음 스캔에서 이 값이 같으면 ZIP을 다시 열지 않고 DB 갱신도 생략한다.
 * (폴더 형태 자료는 ZIP과 달리 파일 IO가 가벼워 캐시 대상에서 제외한다)
 *
 * 기존 책은 값이 null이며, 다음 스캔 시 채워진다.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("Book", (table) => {
    // 파일 수정 시간 (ms epoch). ZIP/CBZ 파일의 stat.mtimeMs
    table.bigInteger("file_mtime").nullable();
    // 파일 크기 (byte). ZIP/CBZ 파일의 stat.size
    table.integer("file_size").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("Book", (table) => {
    table.dropColumn("file_size");
    table.dropColumn("file_mtime");
  });
}
