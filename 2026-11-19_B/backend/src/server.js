import mongoose from 'mongoose';
import app from './app.js';
import { TransactionsUnsupportedError, connectDB, describeConnection, redactSecrets } from './config/db.js';
import { env } from './config/env.js';
import { startScheduler } from './modules/alerts/scheduler.js';

const RETRY_MS = 5000;

// Server vẫn lắng nghe khi DB chưa sẵn sàng để /health báo db: "down" thay vì sập
async function connectWithRetry() {
  try {
    const { host, name } = describeConnection(await connectDB());
    console.log(`MongoDB đã kết nối: host=${host}, database=${name}`);
  } catch (err) {
    if (err instanceof TransactionsUnsupportedError) {
      console.error(err.message); // thử lại cũng vô ích: phải đổi cấu hình MongoDB
      process.exit(1);
    }
    console.error(`Không kết nối được MongoDB (${redactSecrets(err.message)}), thử lại sau ${RETRY_MS / 1000}s`);
    setTimeout(connectWithRetry, RETRY_MS);
  }
}

const server = app.listen(env.PORT, () => {
  console.log(`Server chạy tại http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
connectWithRetry();
const stopScheduler = startScheduler();

async function shutdown(signal) {
  console.log(`Nhận ${signal}, đang tắt server...`);
  stopScheduler?.();
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
