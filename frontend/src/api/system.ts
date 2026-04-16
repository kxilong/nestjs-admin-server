import { apiGet } from './client';

/** 根路径健康检查，对应后端 AppController GET / */
export function fetchHello() {
  return apiGet<string>('/');
}
