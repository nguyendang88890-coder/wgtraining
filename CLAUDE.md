@AGENTS.md

# WG Training Portal

Training portal cho nhân viên WeGolden. Next.js App Router + TypeScript + Tailwind + Prisma (SQLite dev, Postgres dự kiến cho production).

- Prisma client dùng driver adapter (`@prisma/adapter-better-sqlite3`) theo kiến trúc Prisma 7 — schema.prisma không khai báo `url`, kết nối được truyền qua adapter trong `src/lib/db.ts` và qua `prisma.config.ts` cho CLI.
- Import Prisma client qua `@/lib/db`, không import trực tiếp từ `@/generated/prisma`.
- Đây là project độc lập, không dùng chung `.env`/database với bất kỳ project nào khác trên máy.
