import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChatStreamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  prompt: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  systemPrompt?: string;
}
