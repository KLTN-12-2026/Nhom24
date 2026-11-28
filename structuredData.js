// Dữ liệu có cấu trúc (JSON-LD) cho công cụ tìm kiếm. Hàm thuần: không import React hay axios nên backend/tests
// kiểm thử trực tiếp (v1.24). Địa chỉ gốc `origin` và hạn `now` luôn do nơi gọi truyền vào.

const REMOTE_CITY = 'Làm việc từ xa / Toàn quốc';
const EMPLOYMENT = {
  'full-time': 'FULL_TIME',
  'part-time': 'PART_TIME',
  internship: 'INTERN',
  contract: 'CONTRACTOR',
  freelance: 'CONTRACTOR',
};

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const paragraphs = (text) =>
  String(text ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');

/** Tin còn nhận hồ sơ: đã đăng (published) và hạn nộp chưa qua. Chỉ tin như vậy mới được đưa vào JSON-LD */
export function isJobOpen(job, now = Date.now()) {
  if (!job || job.status !== 'published' || !job.deadline) return false;
  const deadline = new Date(job.deadline).getTime();
  return Number.isFinite(deadline) && deadline >= now;
}

/**
 * JobPosting (schema.org) cho trang chi tiết tin. Trả null nếu tin hết hạn, đã đóng hoặc chưa được duyệt:
 * công cụ tìm kiếm không được thấy dữ liệu tuyển dụng của tin không còn nhận hồ sơ.
 */
export function buildJobPosting(job, { origin = '', logoUrl, now = Date.now() } = {}) {
  if (!isJobOpen(job, now)) return null;

  const description = [
    paragraphs(job.description),
    job.requirements ? `<h3>Yêu cầu ứng viên</h3>${paragraphs(job.requirements)}` : '',
    job.benefitList?.length ? `<h3>Quyền lợi</h3><ul>${job.benefitList.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : '',
  ].join('');

  const data = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description,
    identifier: { '@type': 'PropertyValue', name: job.company?.name ?? 'Tuyển dụng AI', value: job.id },
    datePosted: new Date(job.postedAt ?? job.publishedAt ?? job.createdAt ?? now).toISOString(),
    validThrough: new Date(job.deadline).toISOString(),
    employmentType: EMPLOYMENT[job.employmentType] ?? 'OTHER',
    directApply: true,
    url: `${origin}/jobs/${job.id}`,
  };

  if (job.company?.name) {
    data.hiringOrganization = {
      '@type': 'Organization',
      name: job.company.name,
      sameAs: job.company.id ? `${origin}/companies/${job.company.id}` : undefined,
      logo: logoUrl,
    };
  }

  const isRemoteCity = job.city === REMOTE_CITY;
  if (job.workMode === 'remote') {
    data.jobLocationType = 'TELECOMMUTE';
    data.applicantLocationRequirements = { '@type': 'Country', name: 'VN' };
  }
  if (!isRemoteCity && job.city) {
    data.jobLocation = {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        ...(job.address ? { streetAddress: job.address } : {}),
        addressLocality: job.city,
        addressCountry: 'VN',
      },
    };
  }

  const { min, max, currency = 'VND', negotiable } = job.salary ?? {};
  if (!negotiable && (min != null || max != null)) {
    data.baseSalary = {
      '@type': 'MonetaryAmount',
      currency,
      value: {
        '@type': 'QuantitativeValue',
        ...(min != null ? { minValue: min } : {}),
        ...(max != null ? { maxValue: max } : {}),
        unitText: 'MONTH', // lương trên tin tuyển dụng của hệ thống luôn là lương tháng
      },
    };
  }

  if (job.minYearsExperience > 0) {
    data.experienceRequirements = { '@type': 'OccupationalExperienceRequirements', monthsOfExperience: Math.round(job.minYearsExperience * 12) };
  }
  const skills = (job.requiredSkills ?? []).map((s) => s.name).filter(Boolean);
  if (skills.length) data.skills = skills.join(', ');
  if (job.vacancies > 0) data.totalJobOpenings = job.vacancies;

  return JSON.parse(JSON.stringify(data)); // bỏ trường undefined
}

/**
 * BreadcrumbList. `items` = [{ label, to? }]; mục không có `to` là trang hiện tại và dùng `currentUrl`.
 * Cần ít nhất 2 mục mới có ích; ít hơn thì trả null.
 */
export function buildBreadcrumbList(items, { origin = '', currentUrl = '' } = {}) {
  if (!Array.isArray(items) || items.length < 2) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      item: item.to ? origin + item.to : currentUrl || undefined,
    })),
  };
}

/** Organization cho trang công ty */
export function buildOrganization(company, { origin = '', logoUrl } = {}) {
  if (!company?.name) return null;
  return JSON.parse(
    JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: company.name,
      url: `${origin}/companies/${company.id}`,
      logo: logoUrl,
      description: company.description ? String(company.description).slice(0, 300) : undefined,
      sameAs: company.website || undefined,
      foundingDate: company.foundedYear ? String(company.foundedYear) : undefined,
      address: company.city ? { '@type': 'PostalAddress', addressLocality: company.city, addressCountry: 'VN' } : undefined,
    }),
  );
}

/** WebSite kèm ô tìm kiếm, cho trang chủ */
export function buildWebSite({ origin = '', name = 'Tuyển dụng AI' } = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url: `${origin}/`,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${origin}/jobs?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}
