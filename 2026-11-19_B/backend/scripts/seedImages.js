import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { v5 as uuidv5 } from 'uuid';
import { env } from '../src/config/env.js';
import { Company } from '../src/models/index.js';
import { IMAGE_QUALITY } from '../src/utils/images.js';

/**
 * Ảnh mẫu cho công ty demo (v1.22): tự vẽ hình khối trừu tượng bằng SVG của chính script này rồi sharp đổi sang WEBP.
 * Không dùng chữ (tránh phụ thuộc phông của máy), không logo hay thương hiệu thật, và không có file ảnh nào trong Git.
 * Tên file cố định theo uuid v5 của tên công ty nên chạy lại chỉ ghi đè đúng file cũ.
 */
const NAMESPACE = '7a1d2f10-5c3e-4d6a-9b1e-2f4c8a6d0e11';
const PALETTE = [
  ['#E5F1EF', '#0F766E', '#B7D8D3'],
  ['#F3EBDD', '#92580A', '#EBD3A8'],
  ['#F1E6E0', '#8A4B35', '#E3C9BC'],
  ['#E8ECE0', '#46583A', '#C5CFB4'],
  ['#E6EAEF', '#3D4F63', '#BFC9D6'],
  ['#EEE9E2', '#5A4F44', '#D3CCC0'],
];

const hash = (s) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

function shapes(h, [, strong, soft], size) {
  const u = size / 8;
  const variants = [
    `<circle cx="${4 * u}" cy="${4 * u}" r="${2.6 * u}" fill="${strong}"/><circle cx="${5.2 * u}" cy="${2.8 * u}" r="${1.2 * u}" fill="${soft}"/>`,
    `<rect x="${1.8 * u}" y="${1.8 * u}" width="${4.4 * u}" height="${4.4 * u}" fill="${strong}"/><rect x="${3.6 * u}" y="${3.6 * u}" width="${3 * u}" height="${3 * u}" fill="${soft}"/>`,
    `<polygon points="${4 * u},${1.4 * u} ${6.8 * u},${6.4 * u} ${1.2 * u},${6.4 * u}" fill="${strong}"/><circle cx="${4 * u}" cy="${5 * u}" r="${1 * u}" fill="${soft}"/>`,
    `<rect x="${1.6 * u}" y="${4.4 * u}" width="${1.4 * u}" height="${2.2 * u}" fill="${strong}"/><rect x="${3.3 * u}" y="${3 * u}" width="${1.4 * u}" height="${3.6 * u}" fill="${strong}"/><rect x="${5 * u}" y="${1.6 * u}" width="${1.4 * u}" height="${5 * u}" fill="${soft}"/>`,
  ];
  return variants[h % variants.length];
}

const svgLogo = (name) => {
  const h = hash(name);
  const tone = PALETTE[h % PALETTE.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="${tone[0]}"/>${shapes(h >>> 3, tone, 512)}</svg>`;
};

const svgCover = (name) => {
  const h = hash(name);
  const tone = PALETTE[h % PALETTE.length];
  const bands = Array.from({ length: 6 }, (_, i) => {
    const x = i * 250;
    const height = 120 + ((h >>> i) % 5) * 60;
    return `<rect x="${x}" y="${500 - height}" width="190" height="${height}" fill="${i % 2 ? tone[2] : tone[1]}" opacity="${i % 2 ? 1 : 0.85}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="500" viewBox="0 0 1500 500"><rect width="1500" height="500" fill="${tone[0]}"/>${bands}</svg>`;
};

async function writeImage(kind, name, svg) {
  const dir = path.join(env.UPLOAD_DIR, kind);
  await fs.mkdir(dir, { recursive: true });
  const file = `${uuidv5(`${kind}:${name}`, NAMESPACE)}.webp`;
  const image = await sharp(Buffer.from(svg)).webp({ quality: IMAGE_QUALITY }).toBuffer();
  await fs.writeFile(path.join(dir, file), image); // ghi đè trọn file cũ (kể cả khi server đang mở file)
  return `${kind}/${file}`;
}

/**
 * Gán logo cho khoảng 2/3 số công ty và ảnh bìa cho khoảng 1/4 (theo băm tên, ổn định giữa các lần chạy); các công ty còn lại
 * giữ chữ cái đầu. Không đụng công ty đã có ảnh (kể cả ảnh chủ công ty tự tải).
 */
export async function seedCompanyImages() {
  const companies = await Company.find({}).select('name logoPath coverPath');
  const created = { logos: 0, covers: 0 };
  for (const company of companies) {
    const h = hash(company.name);
    const set = {};
    if (!company.logoPath && h % 3 !== 0) {
      set.logoPath = await writeImage('logos', company.name, svgLogo(company.name));
      created.logos += 1;
    }
    if (!company.coverPath && h % 4 === 1) {
      set.coverPath = await writeImage('covers', company.name, svgCover(company.name));
      created.covers += 1;
    }
    if (Object.keys(set).length) await Company.updateOne({ _id: company._id }, { $set: set });
  }
  return created;
}
