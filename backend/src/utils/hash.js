import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 10;

export const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_COST);
export const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
