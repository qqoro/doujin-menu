export interface Book {
  id: number;
  title: string;
  volume: number | null;
  path: string;
  cover_path: string | null;
  page_count: number;
  added_at: string;
  last_read_at: string | null;
  current_page: number | null;
  is_favorite: boolean;
  hitomi_id?: string | null;
  series_name?: string; // Series name can be directly on Book for display (패러디 원본용)
  artists?: Artist[];
  tags?: Tag[];
  groups?: Group[];
  characters?: Character[];
  type?: string | null;
  language_name_english?: string | null;
  language_name_local?: string | null;
  // 시리즈 그룹 관련 필드 (자동 시리즈 감지 기능)
  series_collection_id?: number | null;
  series_order_index?: number | null;
  series_collection?: SeriesCollection; // 조인 시 포함될 수 있음
}

export interface Series {
  id: number;
  name: string;
}

export interface Artist {
  id: number;
  name: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string | null;
}

export interface Group {
  id: number;
  name: string;
}

export interface Character {
  id: number;
  name: string;
}

export interface BookArtist {
  book_id: number;
  artist_id: number;
  role: string | null;
}

export interface BookTag {
  book_id: number;
  tag_id: number;
}

export interface BookSeries {
  book_id: number;
  series_id: number;
}

export interface SeriesCollection {
  id: number;
  name: string;
  description: string | null;
  cover_image: string | null;
  is_auto_generated: boolean;
  is_manually_edited: boolean;
  confidence_score: number;
  created_at: string;
  updated_at: string;
}

export interface SeriesCollectionWithBooks extends SeriesCollection {
  books: Book[];
  book_count: number;
}
