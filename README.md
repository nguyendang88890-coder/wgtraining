# WG Training Portal

Training portal cho nhân viên WeGolden — quản lý khóa học, tiến độ học viên, dashboard.

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS
- [Prisma](https://www.prisma.io) ORM — SQLite cho dev, có thể chuyển sang PostgreSQL cho production
- GitHub Actions cho CI

## Getting Started

```bash
npm install
npx prisma generate
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000) để xem kết quả.

## Cấu trúc thư mục

```
src/
  app/
    (auth)/login, (auth)/register   # trang đăng nhập / đăng ký
    courses/                        # danh sách khóa học
    dashboard/                      # dashboard học viên
  lib/db.ts                         # Prisma client singleton
  generated/prisma/                 # Prisma client generated (gitignored)
prisma/
  schema.prisma                     # data model
prisma.config.ts                    # cấu hình Prisma CLI (migrate, DATABASE_URL)
```

## Database

- Dev: SQLite (`file:./dev.db`), cấu hình qua biến `DATABASE_URL` trong `.env`
- Đổi schema: sửa `prisma/schema.prisma` rồi chạy `npx prisma migrate dev --name <mô_tả>`

## Deploy

Chưa cấu hình. Khi lên production cần đổi `datasource` sang PostgreSQL và cập nhật driver adapter trong `src/lib/db.ts`.
