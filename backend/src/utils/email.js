import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config');
const load = (name) => new Set(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')).map((d) => d.toLowerCase()));

const disposable = load('disposableEmailDomains.json');
const free = load('freeEmailDomains.json');

const domainOf = (email) => String(email).split('@').pop().toLowerCase();

// Khớp cả miền con: "a.mailinator.com" thuộc "mailinator.com"
const inList = (list, email) => {
  const parts = domainOf(email).split('.');
  return parts.some((_, i) => list.has(parts.slice(i).join('.')));
};

export const isDisposableEmail = (email) => inList(disposable, email);
export const isFreeEmail = (email) => inList(free, email);
