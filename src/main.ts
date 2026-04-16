import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  if (process.env.NODE_ENV !== 'production') {
    const a = process.env.JWT_ACCESS_EXPIRES_IN?.trim() ?? '(未设置，access 默认 15m)';
    const r = process.env.JWT_REFRESH_EXPIRES_IN?.trim() ?? '(未设置，refresh 默认 7d)';
    console.log(`[JWT] JWT_ACCESS_EXPIRES_IN=${a} | JWT_REFRESH_EXPIRES_IN=${r}`);
    console.log(
      '[JWT] 修改 .env 后需重启进程；仅改代码不会重载环境变量。登录后才会签发新 access token。',
    );
  }

  const app = await NestFactory.create(AppModule);
  app.enableCors();

  // 全局拦截器
  app.useGlobalInterceptors(new ResponseInterceptor());

  // 全局异常过滤器
  app.useGlobalFilters(new GlobalExceptionFilter());

  // 全局管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger 配置
  const config = new DocumentBuilder()
    .setTitle('Admin API')
    .setDescription('Admin API 文档')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
  console.log(`swagger is running on: ${await app.getUrl()}/api`);
}
bootstrap();
