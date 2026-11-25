/**
 * Đối chiếu số dư ví với tổng sổ cái: node scripts/walletVerify.js  (npm run wallet:verify)
 * Thoát mã 1 nếu có lệch. Chỉ đọc, không sửa dữ liệu, không in thông tin cá nhân (chỉ mã người dùng).
 */
import { connectDB, describeConnection, disconnectDB, redactSecrets } from '../src/config/db.js';
import { verifyWallets } from '../src/modules/wallet/ledger.js';

try {
  const { host, name } = describeConnection(await connectDB());
  console.log(`Đã kết nối MongoDB: host=${host}, database=${name}`);
  const result = await verifyWallets();
  console.log(`Ví: ${result.wallets}, dòng sổ cái: ${result.ledgerRows}`);
  if (result.ok) {
    console.log('OK: số dư mọi ví khớp tổng sổ cái.');
  } else {
    console.error(`LỆCH: ${result.problems.length} vấn đề`);
    for (const p of result.problems) console.error(JSON.stringify(p));
    process.exitCode = 1;
  }
  await disconnectDB();
} catch (err) {
  console.error(`Kiểm tra ví thất bại: ${redactSecrets(err.message)}`);
  process.exitCode = 1;
  await disconnectDB().catch(() => {});
}
