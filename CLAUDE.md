# WG Training Portal

Training portal cho nhân viên WeGolden. Static HTML/CSS/JS thuần, không build step — backend là Firebase Realtime Database (project `wmt-training-portal`).

- `firebase-config.js`: cấu hình Firebase + lớp đồng bộ `localStorage` ⇄ Firebase (`dbWrite`, `dbRemove`, `syncFromFirebase`). Đọc dữ liệu ở phía app luôn qua `localStorage` (nhanh, đồng bộ); ghi qua `window.dbWrite`/`window.dbRemove` để tự động đẩy lên Firebase.
- `module-common.js`: logic dùng chung giữa các trang module học (module1-7.html).
- Các trang chính: `index.html` (dashboard học viên), `admin.html`, `leader.html`, `exam.html`, `monthlytest.html`, `interview.html`, `tracker.html`, `results.html`, `taketest.html`.
- Chạy local: `npx serve -p 3030 .` (đã cấu hình sẵn trong `.claude/launch.json`).
- Đây là project độc lập, không dùng chung `.env`/database với bất kỳ project nào khác trên máy. Firebase API key trong `firebase-config.js` là client-side config (không phải secret), bảo mật thực sự nằm ở Firebase Security Rules trên console.
