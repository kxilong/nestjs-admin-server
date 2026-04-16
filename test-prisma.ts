import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

async function main() {
  try {
    console.log('🔗 正在连接数据库...');
    await prisma.$connect();
    console.log('✅ 数据库连接成功！');
    
    console.log('📊 检查 User 表...');
    const userCount = await prisma.user.count();
    console.log(`✅ User 表中有 ${userCount} 条记录`);
    
  } catch (error) {
    console.error('❌ 数据库连接失败:', error);
    if (error.message.includes('ECONNREFUSED')) {
      console.log('💡 提示：请确保 PostgreSQL 服务已启动');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
