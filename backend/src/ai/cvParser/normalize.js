import fs from 'node:fs';
import { EDUCATION, JOB_CATEGORY, LEVEL, SKILL_LEVEL, SKILL_TYPE } from '../../config/constants.js';

const readData = (name) => JSON.parse(fs.readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));

/* ---------- Chuẩn hóa skill (dùng skillAliases.json) ---------- */

// Chữ thường, gộp khoảng trắng; skill ngoài từ điển giữ nguyên dạng này
const clean = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');
// Khóa "ép sát": bỏ dấu tiếng Việt và mọi ký tự ngoài chữ/số/+/# ("React JS", "react-js" đều thành "reactjs")
const squash = (s) =>
  clean(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9+#]/g, '');

// Skill gộp trong từ điển được tách thành các skill đơn ("html/css" -> html + css)
const COMPOSITE_SKILLS = { 'html/css': ['html', 'css'] };
// Tên gộp không có trong từ điển, tra theo khóa ép sát ("Agile/Scrum", "agile & scrum"...) -> agile + scrum
const COMPOSITE_BY_SQUASH = {
  agilescrum: ['agile', 'scrum'],
  scrumagile: ['agile', 'scrum'],
  agileandscrum: ['agile', 'scrum'],
  scrumandagile: ['agile', 'scrum'],
};

let exactMap = null;
let squashMap = null;
let displayNames = null;
let categories = null;

function load() {
  if (exactMap) return;
  exactMap = new Map();
  squashMap = new Map();
  displayNames = new Map();
  for (const entry of readData('skillAliases.json')) {
    displayNames.set(entry.normalized, entry.name);
    for (const term of [entry.normalized, entry.name, ...(entry.aliases ?? [])]) {
      exactMap.set(clean(term), entry.normalized);
      const sq = squash(term);
      // khóa ép sát quá ngắn (vd "c", "r") dễ trùng nhầm nên chỉ dùng khớp chính xác
      if (sq.length >= 3 && !squashMap.has(sq)) squashMap.set(sq, entry.normalized);
    }
  }
  categories = readData('skillCategories.json');
}

/** Tên skill -> mã chuẩn. Không có trong từ điển thì trả về chính tên đã làm sạch (khớp hành vi của T2) */
export function normalizeSkillName(name) {
  load();
  const key = clean(name);
  return exactMap.get(key) ?? squashMap.get(squash(key)) ?? key;
}

/** Như normalizeSkillName nhưng tách skill gộp: "HTML/CSS" -> ['html', 'css'], "Agile/Scrum" -> ['agile', 'scrum'] */
export function expandSkillName(name) {
  const composite = COMPOSITE_BY_SQUASH[squash(name)];
  if (composite) return [...composite];
  const normalized = normalizeSkillName(name);
  return COMPOSITE_SKILLS[normalized] ?? [normalized];
}

/** Tên hiển thị của skill đã chuẩn hóa: lấy `name` trong từ điển, không có thì viết hoa chữ đầu của `normalized` */
export function getSkillDisplayName(normalized) {
  load();
  const key = String(normalized ?? '').trim();
  return displayNames.get(key) ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : key);
}

/** Thông tin type/category của skill đã chuẩn hóa, hoặc null nếu không có trong từ điển */
export function getSkillInfo(normalized) {
  load();
  return categories[normalized] ?? null;
}

/** Gắn `normalized` cho từng skill, tách skill gộp (html/css -> html, css; agile/scrum -> agile, scrum) và bỏ trùng (giữ bản đầu tiên). Cùng chữ ký với bản của T2 */
export function normalizeSkills(skills = []) {
  const seen = new Set();
  const out = [];
  for (const skill of skills) {
    if (!skill?.name || !String(skill.name).trim()) continue;
    const parts = expandSkillName(skill.name);
    for (const normalized of parts) {
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      // skill bị tách thì lấy tên hiển thị trong từ điển, nếu không thì giữ tên người dùng nhập
      const name = parts.length > 1 ? (displayNames.get(normalized) ?? normalized) : String(skill.name).trim();
      out.push({ ...skill, name, normalized });
    }
  }
  return out;
}

/* ---------- Chuẩn hóa kết quả LLM thành CVParsed ---------- */

const oneOf = (value, allowed) => (allowed.includes(value) ? value : null);
const str = (v, max = 500) => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim().slice(0, max);
  return s === '' || s.toLowerCase() === 'null' ? null : s;
};
const arr = (v) => (Array.isArray(v) ? v : []);
const year = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n >= 1950 && n <= 2100 ? n : null;
};

const DEGREE_SYNONYMS = [
  [/ti[eế]n s[iĩ]|ph\.?d|doctor/i, 'phd'],
  [/th[aạ]c s[iĩ]|master|m\.?sc|mba/i, 'master'],
  [/c[aả]o [dđ][aẳ]ng|college|associate/i, 'college'],
  [/[dđ][aạ]i h[oọ]c|c[uử] nh[aâ]n|k[iỹ] s[uư]|bachelor|b\.?sc|engineer/i, 'bachelor'],
  [/trung c[aấ]p|high school|thpt|t[oố]t nghi[eệ]p c[aấ]p 3/i, 'high_school'],
];
function toDegree(v) {
  const direct = oneOf(v, EDUCATION);
  if (direct) return direct;
  const s = str(v, 100);
  if (!s) return null;
  return DEGREE_SYNONYMS.find(([re]) => re.test(s))?.[1] ?? null;
}

/** "2022-3", "03/2022", "2022" -> "YYYY-MM" hoặc null */
function toYearMonth(v) {
  const s = str(v, 30);
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  let y;
  let mo;
  if (m) [y, mo] = [m[1], m[2]];
  else if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) [y, mo] = [m[2], m[1]];
  else if ((m = s.match(/^(\d{4})$/))) [y, mo] = [m[1], '1'];
  else return null;
  const month = Number(mo);
  const yr = Number(y);
  if (month < 1 || month > 12 || yr < 1950 || yr > 2100) return null;
  return `${yr}-${String(month).padStart(2, '0')}`;
}
const monthIndex = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
};

const toBool = (v) => v === true || (typeof v === 'string' && v.toLowerCase() === 'true');

/** Cộng các khoảng làm việc (tháng), không cộng phần chồng lấn; làm tròn 0.5 năm. null nếu không tính được */
function yearsFromExperiences(experiences, now) {
  const nowIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const intervals = [];
  for (const e of experiences) {
    if (!e.startDate) continue;
    const start = monthIndex(e.startDate);
    const end = e.isCurrent || !e.endDate ? (e.isCurrent ? nowIdx : null) : monthIndex(e.endDate);
    if (end === null || end < start) continue;
    intervals.push([start, Math.max(end, start + 1)]);
  }
  if (intervals.length === 0) return null;
  intervals.sort((a, b) => a[0] - b[0]);
  let months = 0;
  let [curStart, curEnd] = intervals[0];
  for (const [s, e] of intervals.slice(1)) {
    if (s <= curEnd) curEnd = Math.max(curEnd, e);
    else {
      months += curEnd - curStart;
      [curStart, curEnd] = [s, e];
    }
  }
  months += curEnd - curStart;
  return Math.round((months / 12) * 2) / 2;
}

// Khóa so khớp tên ngoại ngữ: "Tiếng Anh" và "English" cùng về "english"
const LANGUAGE_ALIASES = {
  tienganh: 'english', anh: 'english', tiengnhat: 'japanese', nhat: 'japanese', tienghan: 'korean', han: 'korean',
  tiengtrung: 'chinese', trung: 'chinese', tiengphap: 'french', phap: 'french', tiengduc: 'german', duc: 'german',
  tiengviet: 'vietnamese', viet: 'vietnamese',
};
const languageKey = (name) => {
  const key = squash(name);
  return LANGUAGE_ALIASES[key] ?? key;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Biến JSON thô của LLM thành CVParsed đúng mục 7.1: kiểm tra enum (sai thì về null/other),
 * chuẩn hóa skill và ngày, tính lại totalYearsExperience từ kinh nghiệm khi có đủ ngày.
 */
export function normalizeCvParsed(raw, { now = new Date() } = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const warnings = arr(src.warnings)
    .map((w) => str(w, 200))
    .filter(Boolean)
    .slice(0, 20);

  let email = str(src.email, 200);
  if (email && !EMAIL_RE.test(email)) {
    email = null;
    warnings.push('Email trích xuất không hợp lệ nên đã bỏ qua');
  }
  let phone = str(src.phone, 30);
  if (phone && phone.replace(/\D/g, '').length < 8) phone = null;

  const languages = arr(src.languages)
    .filter((l) => l && str(l.name))
    .slice(0, 10)
    .map((l) => ({ name: str(l.name, 50), level: str(l.level, 100) }));
  const languageKeys = new Set(languages.map((l) => languageKey(l.name)));
  const isSpokenLanguage = (name) => languageKeys.has(languageKey(name));

  const experiences = arr(src.experiences)
    .filter((e) => e && (str(e.company) || str(e.title)))
    .slice(0, 30)
    .map((e) => {
      const isCurrent = toBool(e.isCurrent);
      const technologies = [...new Set(arr(e.technologies).map((t) => str(t, 100)).filter(Boolean).flatMap(expandSkillName))];
      return {
        company: str(e.company, 200) ?? '',
        title: str(e.title, 200) ?? '',
        startDate: toYearMonth(e.startDate),
        endDate: isCurrent ? null : toYearMonth(e.endDate),
        isCurrent,
        description: str(e.description, 3000) ?? '',
        technologies,
      };
    });

  // Gộp technologies của các kinh nghiệm vào skills (level "unknown"), bỏ trùng theo normalized
  const techSkills = experiences.flatMap((e) => e.technologies.map((name) => ({ name })));
  const skills = normalizeSkills([
    ...arr(src.skills).map((s) => (typeof s === 'string' ? { name: s } : s)),
    ...techSkills,
  ])
    .filter((s) => !isSpokenLanguage(s.name) && !isSpokenLanguage(s.normalized))
    .slice(0, 80)
    .map((s) => {
      const info = getSkillInfo(s.normalized);
      return {
        name: s.name.slice(0, 100),
        normalized: s.normalized,
        type: oneOf(s.type, SKILL_TYPE) ?? info?.type ?? 'technical',
        level: oneOf(s.level, SKILL_LEVEL) ?? 'unknown',
      };
    });

  const educations = arr(src.educations)
    .filter((e) => e && str(e.school))
    .slice(0, 10)
    .map((e) => ({
      school: str(e.school, 200),
      degree: toDegree(e.degree),
      major: str(e.major, 200),
      startYear: year(e.startYear),
      endYear: year(e.endYear),
      gpa: str(e.gpa, 30),
    }));

  const certifications = arr(src.certifications)
    .filter((c) => c && str(c.name))
    .slice(0, 30)
    .map((c) => ({ name: str(c.name, 200), issuer: str(c.issuer, 200), year: year(c.year) }));

  const computedYears = yearsFromExperiences(experiences, now);
  const llmYears = Number(src.totalYearsExperience);
  const totalYearsExperience =
    computedYears ?? (Number.isFinite(llmYears) && llmYears >= 0 ? Math.round(Math.min(llmYears, 60) * 2) / 2 : 0);

  const eduRank = (d) => EDUCATION.indexOf(d);
  const bestDegree = educations.map((e) => e.degree).filter(Boolean).sort((a, b) => eduRank(b) - eduRank(a))[0] ?? null;
  const highestEducation = toDegree(src.highestEducation) ?? bestDegree;

  const confidence = Number(src.confidence);

  return {
    fullName: str(src.fullName, 120),
    email,
    phone,
    location: str(src.location, 120),
    summary: str(src.summary, 1500),
    skills,
    experiences,
    educations,
    certifications,
    languages,
    totalYearsExperience,
    highestEducation,
    primaryField: oneOf(src.primaryField, JOB_CATEGORY) ?? 'other',
    seniority: oneOf(src.seniority, LEVEL),
    confidence: Number.isFinite(confidence) ? Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100 : 0.5,
    warnings,
  };
}
