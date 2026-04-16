export interface ApiResponse<T> {
  code: number;
  msg: string | string[];
  data: T;
}
