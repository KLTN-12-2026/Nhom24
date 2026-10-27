import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.set('strictQuery', true);

export class TransactionsUnsupportedError extends Error {
  constructor() {
    super(
      'MongoDB đang chạy ở chế độ đơn lẻ nên không hỗ trợ transaction, mà ví điểm cần transaction để đổi số dư và ghi sổ cái cùng lúc. ' +
        'Hãy dùng MongoDB Atlas hoặc một replica set (local: chạy mongod với --replSet rs0 rồi rs.initiate(), và thêm ?replicaSet=rs0 vào MONGODB_URI).',
    );
    this.name = 'TransactionsUnsupportedError';
  }
}

/** Transaction chỉ có trên replica set (`setName`) hoặc cụm shard qua mongos (`msg = isdbgrid`) */
export async function assertTransactionSupport(connection = mongoose.connection) {
  const hello = await connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw new TransactionsUnsupportedError();
}

export async function connectDB(uri = env.MONGODB_URI) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await assertTransactionSupport();
  } catch (err) {
    await mongoose.disconnect().catch(() => {});
    throw err;
  }
  return mongoose.connection;
}

/**
 * Chạy `fn(session)` trong một transaction (tự thử lại khi xung đột ghi tạm thời). Lỗi ném ra từ `fn` thì mọi thay đổi
 * trong giao dịch bị hủy. `fn` có thể chạy nhiều lần nên không được có tác dụng phụ ngoài DB.
 */
export async function runInTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// Chỉ lộ host và tên database; chuỗi kết nối có thể chứa user:password nên không bao giờ được log
export function describeConnection(connection = mongoose.connection) {
  return { host: connection.host, name: connection.name };
}

/** Che mọi chuỗi kết nối MongoDB còn sót trong thông báo lỗi trước khi ghi log */
export const redactSecrets = (text) =>
  String(text).replace(/mongodb(?:\+srv)?:\/\/[^\s'"]+/gi, 'mongodb://***');

export async function disconnectDB() {
  await mongoose.disconnect();
}

// readyState 1 = connected
export const isDbUp = () => mongoose.connection.readyState === 1;
