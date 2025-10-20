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
  series_name?: string; // Series name can be directly on Book for display
  artists?: Artist[];
  tags?: Tag[];
  groups?: Group[];
  characters?: Character[];
  type?: string | null;
  language_name_english?: string | null;
  language_name_local?: string | null;
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
