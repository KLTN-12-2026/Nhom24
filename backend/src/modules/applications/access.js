import { Application, Job } from '../../models/index.js';
import { ApiError } from '../../utils/ApiError.js';

export const isOwner = (id, userId) => String(id) === userId;

/**
 * Dữ liệu nội bộ của employer (ghi chú, sao) không được lộ cho ứng viên (mục 9, v1.20).
 * Mọi DTO đơn ứng tuyển trả cho ứng viên đều đi qua hàm này.
 */
export function forCandidate(dto) {
  delete dto.employerNote;
  delete dto.rating;
  delete dto.reviewedAt;
  return dto;
}

/** Tìm đơn và kiểm tra quyền: candidate chủ đơn hoặc employer chủ tin */
export async function loadAuthorized(id, user) {
  const application = await Application.findById(id);
  if (!application) throw new ApiError('NOT_FOUND', 'Không tìm thấy đơn ứng tuyển');
  const job = await Job.findById(application.jobId);
  if (!job) throw new ApiError('NOT_FOUND', 'Không tìm thấy tin tuyển dụng của đơn này');

  const allowed =
    user.role === 'candidate'
      ? isOwner(application.candidateId, user.id)
      : user.role === 'employer' && isOwner(job.employerId, user.id);
  if (!allowed) throw new ApiError('FORBIDDEN', 'Bạn không có quyền xem đơn ứng tuyển này');
  return { application, job };
}
