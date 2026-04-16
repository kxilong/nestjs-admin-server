export interface JwtPayload {
  sub: number;
  username: string;
  type: 'access' | 'refresh';
}
