/**
 * Dọn dữ liệu hết hạn một lần: node scripts/cleanup.js  (npm run cleanup)
 * Xóa token hết hạn / đã thu hồi lâu, thông báo và lịch sử báo việc cũ, thống kê và hạn mức AI cũ.
 * Chỉ in số lượng bản ghi đã xóa, không in nội dung. Chạy lại an toàn.
 */
import { connectDB, describeConnection, disconnectDB, redactSecrets } from '../src/config/db.js';
import { runCleanup } from '../src/modules/privacy/cleanup.js';

try {
  const { host, name } = describeConnection(await connectDB());
  console.log(`Đã kết nối MongoDB: host=${host}, database=${name}`);
  const removed = await runCleanup();
  for (const [what, count] of Object.entries(removed)) console.log(`${what}: đã xóa ${count}`);
  await disconnectDB();
} catch (err) {
  console.error(`Dọn dữ liệu thất bại: ${redactSecrets(err.message)}`);
  process.exitCode = 1;
  await disconnectDB().catch(() => {});
}
