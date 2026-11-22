import fs from 'node:fs';

const readData = (name) => JSON.parse(fs.readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));

// Từ trùng với từ thông dụng của tiếng Anh/Việt: không dùng để nhận diện kỹ năng trong văn bản tự do
const AMBIGUOUS = new Set([
  'c', 'go', 'r', 'word', 'express', 'spring', 'swift', 'less', 'notion', 'slack', 'unity', 'sketch', 'testing',
  'monitoring', 'networking', 'training', 'planning', 'administration', 'sales', 'retail', 'tax', 'medical', 'clinical',
  'teaching', 'translation', 'architecture', 'welding', 'automotive', 'statistics', 'photography', 'typography',
  'recruitment', 'budgeting', 'logistics', 'nutrition', 'investment', 'banking', 'secretary', 'embedded', 'helm',
  'maya', 'gin', 'koa', 'babel', 'excel', 'canva', 'looker', 'soc', 'iam', 'sem', 'pr', 'rag', 'sre',
]);

let matcher = null;

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function build() {
  const categories = readData('skillCategories.json');
  const termToKey = new Map();
  for (const entry of readData('skillAliases.json')) {
    const type = categories[entry.normalized]?.type;
    if (type === 'soft' || type === 'language') continue;
    for (const term of [entry.name, entry.normalized, ...(entry.aliases ?? [])]) {
      const t = String(term).trim().toLowerCase();
      // Tên tiếng Việt có dấu ("tuyển dụng", "kế toán"...) là từ thường dùng trong văn xuôi: không nhận diện
      if (!t || AMBIGUOUS.has(t) || /\P{ASCII}/u.test(t)) continue;
      if (t.length < 3 && !/[#+]/.test(t)) continue;
      if (!termToKey.has(t)) termToKey.set(t, entry.normalized);
    }
  }
  const terms = [...termToKey.keys()].sort((a, b) => b.length - a.length);
  const source = terms.map((t) => escape(t).replace(/\s+/g, '\\s+')).join('|');
  matcher = {
    termToKey,
    re: new RegExp(`(?<![\\p{L}\\p{N}+#])(?:${source})(?![\\p{L}\\p{N}+#])`, 'giu'),
  };
}

/** Tập mã kỹ năng (normalized) thuộc từ điển xuất hiện trong văn bản; bỏ kỹ năng mềm, ngôn ngữ và từ quá chung */
export function findSkills(text) {
  if (!matcher) build();
  const out = new Set();
  const src = String(text ?? '');
  matcher.re.lastIndex = 0;
  for (const m of src.matchAll(matcher.re)) {
    const key = matcher.termToKey.get(m[0].toLowerCase().replace(/\s+/g, ' '));
    if (key) out.add(key);
  }
  return out;
}
