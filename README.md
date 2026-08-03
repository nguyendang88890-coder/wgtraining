# WG Training Portal

Training portal cho nhân viên WeGolden — quản lý khóa học, thi cử, phỏng vấn, theo dõi tiến độ học viên.

## Stack

- HTML/CSS/JavaScript thuần (không build step, không framework)
- [Firebase Realtime Database](https://firebase.google.com/docs/database) — project `wmt-training-portal`
- Kiến trúc lưu trữ: đọc/ghi qua `localStorage` trước (nhanh, hoạt động offline), đồng bộ nền với Firebase qua `firebase-config.js`

## Chạy local

```bash
npx serve -p 3030 .
```

Mở [http://localhost:3030](http://localhost:3030).

## Cấu trúc

```
index.html          # Dashboard học viên
about.html           # Giới thiệu
admin.html           # Quản trị (admin)
leader.html          # Trang trưởng nhóm/leader
module1-7.html       # 7 module đào tạo
exam.html            # Bài thi
monthlytest.html     # Bài test hàng tháng
interview.html       # Quy trình phỏng vấn
tracker.html         # Theo dõi tiến độ
results.html         # Kết quả
taketest.html        # Làm bài thi
firebase-config.js   # Cấu hình Firebase + lớp đồng bộ localStorage <-> Firebase
module-common.js     # Logic dùng chung cho các trang module
style.css            # Style dùng chung
```

## Database

Firebase Realtime Database, project `wmt-training-portal`. Cấu trúc dữ liệu (xem `_fbPath` trong `firebase-config.js`):

- `users`, `exam_qbank`, `monthly_config`, `monthly_scores`, `proposals`, `interviews_list`, `qbank/*` — dữ liệu chung
- `progress/{user}`, `exam/{user}`, `quiz/{user}/m{n}`, `interview/{user}`, `submissions/{user}/{month}`, `reschedule/{user}` — dữ liệu theo từng học viên

## Deploy

Live tại **https://training.wegolden.com** — VPS Ubuntu 24.04 (Singapore), Nginx + Let's Encrypt SSL. Push lên `main` sẽ tự động deploy qua GitHub Actions (`.github/workflows/deploy.yml`, SSH vào VPS chạy `git pull`).
