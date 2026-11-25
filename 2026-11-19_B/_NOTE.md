# 19/11/2026 / B → C

Hỏi nhanh, đáp nhanh:

- *Đăng gì?* Lắp ráp backend (app, server), dữ liệu seed và script phụ trợ. Ngày 8/15 (Thứ Năm), 19 file.
- *Cần gì trước?* 2026-10-27_E (Nền độc lập: cấu hình, tài sản tĩnh, tiện ích thuần); 2026-10-29_A (Cấu hình còn lại, tiện ích và toàn bộ model dữ liệu); 2026-11-03_B (Hạ tầng backend: middleware, provider (mail, SMS, thanh toán, LLM)); 2026-11-05_C (Lõi AI: đọc CV, chấm điểm phù hợp, công cụ AI, advisor); 2026-11-10_D (API tin tuyển dụng, công ty, thông báo/cảnh báo và lõi ví điểm); 2026-11-12_E (API ví điểm, API AI, hồ sơ ứng viên, meta/SEO); 2026-11-17_A (API ứng tuyển, quyền riêng tư, quản trị, đăng nhập/đăng ký). Nhớ `git pull` để có phần của 2026-11-17_A.
- *Ai xem?* C.
- *Nhánh gợi ý:* `feature/lap-rap-seed-20261119`
- *Kiểm tra sao?*

```powershell
cd backend
@('scripts/alerts.js','scripts/cleanup.js','scripts/seed.js','scripts/seedImages.js','scripts/try-match.js','scripts/try-parse-cv.js','scripts/walletVerify.js','src/app.js','src/server.js') | ForEach-Object { node --check $_ }   # không in gì là đạt
cd ..
node -e "for (const f of ['data/demo/companies.json','data/demo/jobs/01_phan_mem_ha_tang.json','data/demo/jobs/02_du_lieu_thiet_ke.json','data/demo/jobs/03_marketing_kinh_doanh.json','data/demo/jobs/04_tai_chinh_nhan_su_logistics.json','data/demo/jobs/05_giao_duc_y_te_san_xuat_fnb.json','data/eval/jobs_extra.json','data/jobs/seed_jobs.json','data/seed_users.json']) { JSON.parse(require('fs').readFileSync(f,'utf8')); } console.log('JSON hợp lệ')"
```

- *Commit thế nào?* `feat: lắp ráp backend (app, server), dữ liệu seed và script phụ trợ`

Toàn bộ file:

- `backend/scripts/alerts.js`
- `backend/scripts/cleanup.js`
- `backend/scripts/seed.js`
- `backend/scripts/seedImages.js`
- `backend/scripts/try-match.js`
- `backend/scripts/try-parse-cv.js`
- `backend/scripts/walletVerify.js`
- `backend/src/app.js`
- `backend/src/server.js`
- `data/cvs/cv_test.pdf`
- `data/demo/companies.json`
- `data/demo/jobs/01_phan_mem_ha_tang.json`
- `data/demo/jobs/02_du_lieu_thiet_ke.json`
- `data/demo/jobs/03_marketing_kinh_doanh.json`
- `data/demo/jobs/04_tai_chinh_nhan_su_logistics.json`
- `data/demo/jobs/05_giao_duc_y_te_san_xuat_fnb.json`
- `data/eval/jobs_extra.json`
- `data/jobs/seed_jobs.json`
- `data/seed_users.json`
