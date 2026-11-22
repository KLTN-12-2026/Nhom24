import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { embedTexts, parseCv } from '../src/ai/index.js';
import { env } from '../src/config/env.js';
import { buildPdf } from './aiFixtures.js';

// Gọi Gemini thật (tốn quota): chỉ chạy khi có LLM_API_KEY và RUN_LIVE_AI=1
//   RUN_LIVE_AI=1 npx vitest run tests/aiLive.test.js
const live = Boolean(env.LLM_API_KEY) && process.env.RUN_LIVE_AI === '1';

const CV_TEXT =
  'NGUYEN VAN AN - Backend Developer. Email: an.nguyen@example.com. Phone: 0901234567. Location: Ho Chi Minh City. ' +
  'EXPERIENCE: Backend Developer at ABC Software, 03/2022 - 06/2024. Built REST APIs with Node.js, Express and MongoDB, deployed with Docker. ' +
  'EDUCATION: Bachelor of Computer Science, HCMUT, 2018 - 2022. SKILLS: JavaScript, Node.js, MongoDB, Docker, Git, teamwork. ' +
  'LANGUAGES: English (IELTS 6.5).';

describe.skipIf(!live)('Gemini thật (RUN_LIVE_AI=1)', () => {
  it('parseCv trả CVParsed hợp lệ', async () => {
    env.LLM_PROVIDER = 'gemini';
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cv-live-'));
    try {
      const filePath = path.join(dir, 'cv.pdf');
      await fs.writeFile(filePath, buildPdf(CV_TEXT));
      const { parsed } = await parseCv({ filePath, mimeType: 'application/pdf' });
      expect(parsed.skills.map((s) => s.normalized)).toEqual(expect.arrayContaining(['nodejs', 'mongodb', 'docker']));
      expect(parsed.highestEducation).toBe('bachelor');
      expect(parsed.primaryField).toBe('it-software');
      expect(parsed.confidence).toBeGreaterThan(0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 90_000);

  it('embedTexts trả vector đúng EMBEDDING_DIM, chuẩn hóa L2', async () => {
    env.LLM_PROVIDER = 'gemini';
    const [vec] = await embedTexts(['Backend developer Node.js MongoDB']);
    expect(vec).toHaveLength(env.EMBEDDING_DIM);
    expect(Math.hypot(...vec)).toBeCloseTo(1, 3);
  }, 60_000);
});
