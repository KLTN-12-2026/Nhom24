import { AI_TOOLS } from '../../config/constants.js';
import { getSkillDisplayName } from '../cvParser/normalize.js';
import { computeSkillMatch } from '../matcher/skillMatch.js';
import { expandKeys, filterGroundedText, prepareUntrusted } from './guard.js';
import { clip, runLlm } from './llm.js';
import { COVER_LETTER_SCHEMA, COVER_LETTER_SYSTEM, buildCoverLetterPrompt } from './prompts.js';
import { profileFullText, profileSkillKeys, profileSkillNames, wordCount, yearsText } from './profileView.js';
import { findSkills } from './vocabulary.js';

const MAX_LETTER_CHARS = 5000; // khớp giới hạn coverLetter của đơn ứng tuyển

const firstSentence = (text) => clip(String(text ?? '').split(/(?<=[.!?])\s+/)[0], 220).replace(/[.…]+$/, '');
const joinNames = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} và ${list.at(-1)}` : (list[0] ?? ''));

/** Bỏ định dạng markdown mà LLM đôi khi thêm vào */
const plain = (text) =>
  String(text ?? '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/^\s*[*•-]\s+/gm, '- ')
    .replace(/\r/g, '')
    .trim();

/** Thư mẫu ghép từ hồ sơ thật: chỉ dùng họ tên, số năm, kỹ năng khớp, kinh nghiệm và học vấn có trong hồ sơ */
export function templateLetter({ fullName, profile, job, companyName, tone, length }) {
  const name = fullName || 'Ứng viên';
  const company = companyName || 'Quý công ty';
  const skills = computeSkillMatch({ profile, job });
  const matched = skills.matchedSkills.slice(0, 5).map(getSkillDisplayName);
  const own = profileSkillNames(profile).slice(0, 5);
  const years = yearsText(profile);
  const latest = (profile?.experiences ?? []).find((e) => e?.title || e?.company);
  const edu = (profile?.educations ?? []).find((e) => e?.school);

  const greeting = {
    formal: `Kính gửi Quý công ty ${company},`,
    friendly: `Chào anh/chị phụ trách tuyển dụng của ${company},`,
    concise: `Kính gửi ${company},`,
  }[tone];
  const intro = {
    formal: `Tôi là ${name}, xin gửi thư này để ứng tuyển vị trí ${job.title} tại ${company}.`,
    friendly: `Tôi là ${name} và rất quan tâm tới vị trí ${job.title} tại ${company}, nên xin gửi vài dòng giới thiệu.`,
    concise: `Tôi là ${name}, ứng tuyển vị trí ${job.title}.`,
  }[tone];

  const background = [];
  if (years) background.push(`Tôi có khoảng ${years} năm kinh nghiệm`);
  if (matched.length) {
    background.push(`${background.length ? 'và đã' : 'Tôi đã'} làm việc với ${joinNames(matched)}, khớp với yêu cầu của tin`);
  } else if (own.length) {
    background.push(`${background.length ? 'và có' : 'Hồ sơ của tôi có'} các kỹ năng ${joinNames(own)}`);
  }

  const paragraphs = [greeting, intro];
  if (background.length) paragraphs.push(`${background.join(' ')}.`);
  if (length !== 'short' && latest) {
    const where = [latest.title, latest.company && `tại ${latest.company}`].filter(Boolean).join(' ');
    const what = firstSentence(latest.description);
    paragraphs.push(`Gần đây, tôi đảm nhiệm vai trò ${where}${what ? `: ${what}` : ''}.`);
  }
  if (length === 'long') {
    if (edu) paragraphs.push(`Tôi học ${edu.major ? `${edu.major} ` : ''}tại ${edu.school}.`);
    paragraphs.push(
      'Tôi mong muốn được đóng góp vào công việc của đội ngũ và tiếp tục học hỏi trong một môi trường chuyên nghiệp.',
    );
  }
  paragraphs.push(
    {
      formal: 'Rất mong có cơ hội trao đổi thêm với Quý công ty. Xin chân thành cảm ơn Quý công ty đã xem xét hồ sơ.\n\nTrân trọng,',
      friendly: 'Cảm ơn anh/chị đã dành thời gian đọc thư, tôi rất mong có dịp trao đổi thêm.\n\nThân mến,',
      concise: 'Rất mong được trao đổi thêm.\n\nTrân trọng,',
    }[tone],
  );
  paragraphs[paragraphs.length - 1] += `\n${name}`;
  return paragraphs.join('\n\n');
}

/**
 * CoverLetter (CONTRACT 7.8). LLM chỉ viết văn bản từ dữ liệu hồ sơ và tin; câu có số liệu, kỹ năng hay công ty không có
 * trong hồ sơ bị loại. Không còn đủ nội dung hoặc LLM lỗi thì dùng thư mẫu (`aiGenerated=false`).
 */
export async function buildCoverLetter({ profile, job, fullName, companyName, tone, length, gate }) {
  const notes = [];
  const targetWords = AI_TOOLS.LETTER_WORDS[length];
  const keys = profileSkillKeys(profile);
  const matched = computeSkillMatch({ profile, job }).matchedSkills;
  const matchedFirst = [...matched, ...[...keys].filter((k) => !matched.includes(k))];

  let flagged = false;
  const prep = (text, max) => {
    const r = prepareUntrusted(text, max);
    flagged ||= r.flagged;
    return r.text;
  };
  const latest = (profile?.experiences ?? []).slice(0, 3).map((e) => ({
    title: prep(e.title, 120),
    company: prep(e.company, 120),
    description: prep(e.description, 400),
  }));
  const candidate = {
    fullName: prep(fullName, 120),
    headline: prep(profile?.headline, 200),
    about: prep(profile?.about || profile?.summary, 500),
    yearsExperience: yearsText(profile),
    skills: matchedFirst.slice(0, 12).map(getSkillDisplayName),
    experiences: latest,
    education: (profile?.educations ?? []).slice(0, 2).map((e) => ({ school: prep(e.school, 120), major: prep(e.major, 120) })),
  };
  const jobData = {
    title: prep(job.title, 150),
    company: prep(companyName, 150),
    level: job.level,
    requiredSkills: (job.requiredSkills ?? []).map((s) => s.name),
    requirements: prep(job.requirements, 800),
  };
  if (flagged) {
    notes.push('Hồ sơ hoặc tin có câu giống chỉ dẫn cho AI; hệ thống coi đó là dữ liệu, đã lược bỏ trước khi gửi cho AI và không làm theo.');
  }

  const { data, failure } = await runLlm(
    {
      tool: 'cover_letter',
      system: COVER_LETTER_SYSTEM,
      prompt: buildCoverLetterPrompt({ candidate, job: jobData, tone, targetWords }),
      jsonSchema: COVER_LETTER_SCHEMA,
      temperature: 0.5,
    },
    gate,
  );

  // Nguồn đối chiếu: chỉ hồ sơ và tên vị trí / công ty của tin, kỹ năng chỉ trong hồ sơ (hoặc nằm ngay trong tên vị trí)
  const years = Number(profile?.totalYearsExperience);
  const sourceText = [profileFullText(profile), job.title, companyName, Number.isFinite(years) ? String(years) : '', fullName]
    .filter(Boolean)
    .join('\n');
  const allowedSkills = expandKeys([...keys, ...findSkills(job.title)]);

  let text = '';
  if (typeof data?.text === 'string') {
    const filtered = filterGroundedText(plain(data.text).slice(0, MAX_LETTER_CHARS * 2), { sourceText, allowedSkills });
    text = filtered.text.slice(0, MAX_LETTER_CHARS).trim();
    if (filtered.dropped) {
      notes.push(`Đã loại ${filtered.dropped} câu của AI vì nhắc thông tin không có trong hồ sơ của bạn (số liệu, kỹ năng hoặc công ty).`);
    }
  }
  const aiGenerated = wordCount(text) >= Math.max(40, Math.round(targetWords * 0.35));
  if (!aiGenerated) {
    notes.push('Thư do AI chưa sẵn sàng nên đang hiển thị thư mẫu ghép từ hồ sơ của bạn. Hãy đọc và chỉnh sửa trước khi dùng.');
  }
  const finalText = aiGenerated ? text : templateLetter({ fullName, profile, job, companyName, tone, length });
  return {
    tone,
    length,
    text: finalText,
    wordCount: wordCount(finalText),
    aiGenerated,
    aiFailureReason: aiGenerated ? null : (failure ?? 'invalid_output'),
    notes,
    generatedAt: new Date().toISOString(),
  };
}
