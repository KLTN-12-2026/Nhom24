/**
 * Chạy bộ phát thông báo một lần: node scripts/alerts.js  (npm run alerts:run)
 *  1. Quét tin published gần đây (ALERTS_LOOKBACK_HOURS) chưa được xử lý và báo cho người theo dõi công ty / tìm kiếm đã lưu khớp.
 *  2. Gửi thư tổng hợp cho các lượt báo "hằng ngày" đang chờ.
 * Dùng cho demo và test. Chạy lại an toàn: một tin không bao giờ được báo hai lần cho cùng một người.
 * Thư đi qua MAIL_PROVIDER (mặc định `log`: in ra màn hình).
 */
import { connectDB, describeConnection, disconnectDB, redactSecrets } from '../src/config/db.js';
import { runAlerts } from '../src/modules/alerts/dispatcher.js';

try {
  const { host, name } = describeConnection(await connectDB());
  console.log(`Đã kết nối MongoDB: host=${host}, database=${name}`);
  const { dispatch, digest } = await runAlerts();
  console.log(`Tin đã quét: ${dispatch.jobs}`);
  console.log(`Lượt báo tạo mới: ${dispatch.created} (ngay: ${dispatch.instant}, chờ tổng hợp: ${dispatch.queued})`);
  console.log(`Gửi: ${dispatch.notifications} thông báo, ${dispatch.emails} email`);
  console.log(`Thư tổng hợp: ${digest.users} người, ${digest.alerts} lượt báo, ${digest.notifications} thông báo, ${digest.emails} email`);
  await disconnectDB();
} catch (err) {
  console.error(`Chạy bộ phát thông báo thất bại: ${redactSecrets(err.message)}`);
  process.exitCode = 1;
  await disconnectDB().catch(() => {});
}
