/**
 * Giao diện module AI (CONTRACT mục 7.4). Module này chỉ nhận/trả JSON thuần,
 * không import Express hay Mongoose.
 *
 * Phần của T5: parseCv, embedTexts (+ normalize skill để T6/T7 dùng chung).
 * Phần của T6: buildProfileText, buildJobText, scoreMatch, rankJobsForProfile, rankProfilesForJob.
 * Phần của T7: buildAdvice (advisor/).
 * v1.21: buildCvReview, buildCoverLetter, buildInterviewSet, buildAnswerFeedback (tools/, CONTRACT 7.8).
 */
export { buildProfileText, buildJobText } from './matcher/text.js';
export { scoreMatch } from './matcher/scoreMatch.js';
export { rankJobsForProfile, rankProfilesForJob } from './matcher/rank.js';
export { parseCv } from './cvParser/parseCv.js';
export { getSkillDisplayName, normalizeSkillName, normalizeSkills } from './cvParser/normalize.js';
export { embed as embedTexts } from './providers/llmProvider.js';
export { buildAdvice } from './advisor/buildAdvice.js';
export { selectMarketJobs } from './advisor/skillGap.js';
export { buildCvReview } from './tools/cvReview.js';
export { buildCoverLetter } from './tools/coverLetter.js';
export { buildInterviewSet, buildAnswerFeedback } from './tools/interview.js';
