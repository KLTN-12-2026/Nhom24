import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test không bao giờ gọi LLM thật (kể cả khi máy dev có khóa trong .env) và ghi upload ra thư mục tạm.
    // dotenv không ghi đè biến đã có nên các giá trị này thắng .env.
    env: {
      LLM_PROVIDER: 'mock',
      LLM_API_KEY: '',
      EMBEDDING_API_KEY: '',
      AI_RATE_LIMIT_PER_HOUR: '30',
      MAIL_PROVIDER: 'memory', // thư xác minh vào hộp thư trong bộ nhớ (mailOutbox), không gửi ra ngoài
      SMS_PROVIDER: 'mock',
      REQUIRE_PHONE_OTP: 'false',
      UPLOAD_DIR: path.join(os.tmpdir(), 'recruitment-ai-test-uploads'),
    },
    // Pool mặc định 'forks' làm tiến trình con của Vitest tự thoát ngẫu nhiên ("Worker exited unexpectedly",
    // khoảng 2/10 lần chạy, trên Windows + Node 24); đổi sang 'threads' thì không còn gặp.
    pool: 'threads',
    // Mỗi file test tự khởi động một MongoDB tạm (mongodb-memory-server) và dùng chung UPLOAD_DIR,
    // nên chạy tuần tự từng file để tránh nhiều mongod chạy cùng lúc và tranh chấp thư mục upload.
    fileParallelism: false,
    // Nhật ký đăng nhập admin không cần in ra khi chạy test (test vẫn bắt được bằng spy trên console.info)
    onConsoleLog: (log) => (log.startsWith('[admin-login]') ? false : undefined),
    testTimeout: 30_000,
    hookTimeout: 60_000, // lần đầu tải binary MongoDB có thể lâu
  },
});
