import { buildJobText, buildProfileText, embedTexts } from '../../ai/index.js';
import { env } from '../../config/env.js';
import { CandidateProfile, Job } from '../../models/index.js';
import { sha256 } from '../../utils/hash.js';

// Lớp này chỉ dùng models và src/ai (không import module nghiệp vụ khác) để jobs/candidates/applications
// dùng chung mà không tạo vòng phụ thuộc.

export const hashOf = (text) => sha256(`${env.EMBEDDING_MODEL}:${env.EMBEDDING_DIM}:${text}`);
export const hasVector = (v) => Array.isArray(v) && v.length > 0;

function logAiError(what, err) {
  if (!env.isTest) console.error(`Không tính được embedding cho ${what}: ${err.message}`);
}

/**
 * Embedding cho một tin. Trả { embedding, embeddingHash } để ghi vào DB, hoặc null khi không cần
 * (tin không có nội dung, hoặc embeddingHash đã khớp nội dung hiện tại). Lỗi AI được ném ra cho nơi gọi xử lý.
 */
export async function embedJob(job) {
  const text = buildJobText(job);
  if (!text) return null;
  const embeddingHash = hashOf(text);
  if (job.embeddingHash === embeddingHash) return null;
  const [embedding] = await embedTexts([text]);
  return { embedding, embeddingHash };
}

/** Như embedJob nhưng cho hồ sơ: trả { profileEmbedding, embeddingHash } hoặc null */
export async function embedProfile(profile) {
  const text = buildProfileText(profile);
  if (!text) return null;
  const embeddingHash = hashOf(text);
  if (profile.embeddingHash === embeddingHash) return null;
  const [profileEmbedding] = await embedTexts([text]);
  return { profileEmbedding, embeddingHash };
}

/**
 * Bảo đảm hồ sơ (object lean đã `select('+profileEmbedding')`) có embedding khớp nội dung, tính bù nếu thiếu/lỗi thời.
 * Không bao giờ ném lỗi: AI hỏng thì giữ embedding cũ (nếu có). Cập nhật trực tiếp object truyền vào.
 * @returns {Promise<number[]|null>}
 */
export async function ensureProfileEmbedding(profile) {
  const text = buildProfileText(profile);
  if (text && (!hasVector(profile.profileEmbedding) || profile.embeddingHash !== hashOf(text))) {
    try {
      const [profileEmbedding] = await embedTexts([text]);
      const embeddingHash = hashOf(text);
      await CandidateProfile.updateOne({ _id: profile._id }, { $set: { profileEmbedding, embeddingHash } });
      profile.profileEmbedding = profileEmbedding;
      profile.embeddingHash = embeddingHash;
    } catch (err) {
      logAiError(`hồ sơ ${profile._id}`, err);
    }
  }
  return hasVector(profile.profileEmbedding) ? profile.profileEmbedding : null;
}

/**
 * Như ensureProfileEmbedding nhưng cho nhiều tin (object lean đã `select('+embedding')`), gọi embedding theo lô.
 * Không ném lỗi; tin nào không tính được thì giữ nguyên.
 */
export async function ensureJobEmbeddings(jobs) {
  const todo = jobs
    .map((job) => ({ job, text: buildJobText(job) }))
    .filter(({ job, text }) => text && (!hasVector(job.embedding) || job.embeddingHash !== hashOf(text)));
  if (!todo.length) return;

  try {
    const vectors = await embedTexts(todo.map((t) => t.text));
    const updates = todo.map(({ job, text }, i) => ({
      job,
      embedding: vectors[i],
      embeddingHash: hashOf(text),
    }));
    await Job.bulkWrite(
      updates.map(({ job, embedding, embeddingHash }) => ({
        updateOne: { filter: { _id: job._id }, update: { $set: { embedding, embeddingHash } } },
      })),
    );
    for (const { job, embedding, embeddingHash } of updates) {
      job.embedding = embedding;
      job.embeddingHash = embeddingHash;
    }
  } catch (err) {
    logAiError(`${todo.length} tin tuyển dụng`, err);
  }
}
