import { Company, User } from '../../models/index.js';
import { loadAuthorized } from './access.js';

// Mẫu phản hồi dựng sẵn (mục 8.12). Chỉ là văn bản gợi ý: nhà tuyển dụng sửa trước khi gửi, server không lưu bản sửa.
// `reject` dùng được làm lý do từ chối (<= HIRING.REASON_MAX ký tự), `interview` dùng được làm lời nhắn trong lịch phỏng vấn.
const TEMPLATES = [
  {
    id: 'thanks',
    name: 'Cảm ơn đã ứng tuyển',
    purpose: 'thanks',
    body:
      'Chào {candidate},\n\nCảm ơn bạn đã quan tâm và ứng tuyển vị trí {job} tại {company}. Chúng tôi đã nhận được hồ sơ và sẽ xem xét trong thời gian sớm nhất. Nếu hồ sơ phù hợp, chúng tôi sẽ liên hệ để trao đổi thêm.\n\nTrân trọng,\n{company}',
  },
  {
    id: 'interview',
    name: 'Mời phỏng vấn',
    purpose: 'interview',
    body:
      'Chào {candidate}, cảm ơn bạn đã ứng tuyển vị trí {job} tại {company}. Chúng tôi muốn mời bạn tham gia buổi phỏng vấn theo lịch đã nêu. Bạn vui lòng xác nhận tham dự, hoặc đề nghị giờ khác nếu chưa sắp xếp được. Nếu cần chuẩn bị gì thêm, bạn cứ nhắn cho chúng tôi.',
  },
  {
    id: 'info',
    name: 'Xin bổ sung thông tin',
    purpose: 'info',
    body:
      'Chào {candidate},\n\nĐể đánh giá hồ sơ cho vị trí {job}, bạn vui lòng bổ sung giúp chúng tôi: [thông tin cần thêm].\n\nCảm ơn bạn,\n{company}',
  },
  {
    id: 'offer',
    name: 'Đề nghị làm việc',
    purpose: 'offer',
    body:
      'Chào {candidate},\n\nChúc mừng bạn! Sau các vòng trao đổi, {company} muốn gửi đến bạn đề nghị làm việc cho vị trí {job}. Mức lương, ngày bắt đầu và các quyền lợi chi tiết: [điền thông tin]. Bạn vui lòng phản hồi trước [ngày] để chúng tôi sắp xếp bước tiếp theo.\n\nTrân trọng,\n{company}',
  },
  {
    id: 'reject',
    name: 'Từ chối lịch sự',
    purpose: 'reject',
    body:
      'Cảm ơn bạn đã dành thời gian ứng tuyển vị trí {job} tại {company}. Sau khi cân nhắc kỹ, chúng tôi chưa thể tiếp tục với hồ sơ của bạn ở lần tuyển dụng này. Điều đó không phản ánh toàn bộ năng lực của bạn. Chúc bạn sớm tìm được công việc phù hợp.',
  },
];

export const fillTemplate = (body, values) =>
  body.replace(/\{(candidate|job|company)\}/g, (_, key) => values[key]);

/** GET /applications/:id/message-templates */
export async function listTemplates(user, id) {
  const { application, job } = await loadAuthorized(id, user);
  const [company, candidate] = await Promise.all([
    Company.findById(job.companyId).select('name'),
    User.findById(application.candidateId).select('fullName'),
  ]);
  const values = {
    candidate: candidate?.fullName ?? 'bạn',
    job: job.title,
    company: company?.name ?? 'chúng tôi',
  };
  return TEMPLATES.map(({ body, ...rest }) => ({ ...rest, body: fillTemplate(body, values) }));
}
