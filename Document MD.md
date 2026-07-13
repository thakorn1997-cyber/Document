# Project Document - Working Rules

> สถานะเอกสาร: Draft (Updated 2026-07-01)  
> แนวทางที่เลือก: Web App แบบแยก Frontend + Backend + PostgreSQL  
> Stack: Next.js (FE) + Go/Gin/pgx (BE) + PostgreSQL + JWT Auth  
> ขอบเขตสำคัญ: ระบบนี้เป็นระบบ Upload และ Download เอกสารระหว่างแผนก ไม่ใช่ระบบอนุมัติเอกสาร

## 1. เป้าหมายของ Project

Project Document เป็นระบบจัดเก็บและส่งต่อเอกสารระหว่างแผนก เพื่อให้แผนกต้นทาง Upload เอกสารเข้าระบบ และแผนกปลายทาง Download เอกสารไปใช้งานต่อได้

ตัวอย่าง Flow หลัก:

```text
แผนก ES Upload เอกสาร UAT
  -> ระบบบันทึกว่า ES ส่งเอกสาร UAT แล้ว
  -> แผนก Accounting เห็นรายการเอกสารที่ ES ส่งมา
  -> Accounting Download เอกสารไปดำเนินงานต่อ
  -> ระบบบันทึกว่า Accounting Download แล้ว
```

เป้าหมายหลักของระบบคือ

- ให้แผนกต้นทาง Upload เอกสารส่งให้แผนกปลายทางได้ โดยการ Upload เอกสารจะมีการเก็บข้อมูล 1.ชื่อบริษัท 2.เลข WorkOrder 3.ชื่อผู้รับผิดชอบ Project 4.วันทื่ติดตั้ง 5.สถานะ(Pending,Passed,Failed) UAT/UAI และวันที่ส่งของ UAT/UAI
- ให้แผนกปลายทางเห็นว่าเอกสารถูก Upload มาส่งแล้ว
- ให้แผนกปลายทาง Download เอกสารเพื่อนำไปทำงานต่อ
- ให้ระบบเก็บประวัติว่าใคร Upload, ใคร Download, เวลาใด และเป็นเอกสาร Version ใด
- ลดการส่งไฟล์ผ่านช่องทางกระจัดกระจาย เช่น Chat, Email หรือ Shared folder ที่ไม่มีประวัติชัดเจน

## 2. หลักการสำคัญ

- ระบบนี้ไม่มีขั้นตอนอนุมัติหรือปฏิเสธเอกสาร
- การ Download ไม่ได้หมายความว่าเอกสารถูกอนุมัติหรือรับรองความถูกต้อง
- การกดรับทราบ ถ้ามีใช้งาน หมายถึงรับทราบว่าได้รับเอกสารแล้วเท่านั้น
- เอกสารทุกไฟล์ต้องมีเจ้าของเอกสาร แผนกต้นทาง และแผนกปลายทาง
- ทุก action สำคัญต้องมี Audit Log
- ถ้าต้องส่งไฟล์ใหม่ ให้สร้าง Version ใหม่ ไม่เขียนทับไฟล์เดิม

## 3. ขอบเขตระบบ

### 3.1 In Scope

- Login และกำหนดสิทธิ์ผู้ใช้งานเบื้องต้น
- Upload เอกสารพร้อมข้อมูลประกอบ
- ระบุแผนกต้นทางและแผนกปลายทางของเอกสาร
- แสดงรายการเอกสารที่ส่งออกและเอกสารที่ได้รับ
- Download เอกสารตามสิทธิ์
- บันทึกประวัติการ Upload และ Download
- บันทึกการรับทราบการรับเอกสาร ถ้ากำหนดให้ใช้
- ค้นหาและกรองเอกสารจากชื่อเอกสาร, ประเภทเอกสาร, แผนก, สถานะ, วันที่ และผู้ส่ง
- จัดการ Version ของเอกสาร

### 3.2 Out of Scope สำหรับ Version แรก

- การอนุมัติเอกสาร
- การอนุมัติหรือปฏิเสธเอกสาร
- การรับรองความถูกต้องของเนื้อหาเอกสารภายในระบบ
- Digital signature หรือ e-signature ที่มีผลทางกฎหมาย
- OCR อ่านข้อมูลจากไฟล์อัตโนมัติ
- Workflow หลายลำดับขั้น
- การแก้ไขไฟล์เอกสารภายในระบบ
- การเชื่อมต่อกับระบบภายนอก เช่น ERP, DMS หรือ Email server แบบเต็มรูปแบบ

## 4. บทบาทผู้ใช้งาน

| Role | หน้าที่หลัก |
|---|---|
| Uploader | Upload เอกสาร, ระบุปลายทาง, ดูสถานะการ Download ของเอกสารที่ส่ง |
| Receiver | ดูเอกสารที่ส่งมาถึงแผนกตนเอง, Download เอกสาร, กดรับทราบการรับเอกสารถ้ามีขั้นตอนนี้ |
| Department Admin | ดูเอกสารของแผนก, จัดการผู้ใช้งานในแผนก, ตรวจสอบประวัติของแผนก |
| System Admin | จัดการผู้ใช้, แผนก, ประเภทเอกสาร, สิทธิ์ และ Audit Log ทั้งหมด |

> ผู้ใช้ 1 คนสามารถมีหลายบทบาทได้ เช่น เป็น Uploader ของแผนก ES และเป็น Receiver สำหรับเอกสารที่ส่งถึงแผนก ES

## 5. Flow การทำงานหลัก

```text
1. Uploader Login เข้าระบบ
2. Uploader เลือก Upload Document
3. Uploader กรอกข้อมูลเอกสาร
   - ชื่อเอกสาร
   - ประเภทเอกสาร
   - แผนกต้นทาง
   - แผนกปลายทาง
   - หมายเหตุ ถ้ามี
4. Uploader แนบไฟล์และบันทึก
5. ระบบสร้าง Document และ Document Version
6. ระบบแสดงเอกสารในรายการ Incoming Documents ของแผนกปลายทาง
7. Receiver ของแผนกปลายทางเปิดรายการเอกสาร
8. Receiver Download เอกสาร
9. ระบบบันทึก Download Log
10. ถ้าเปิดใช้การรับทราบ Receiver กดรับทราบว่าได้รับเอกสารแล้ว
```

## 6. สถานะเอกสาร

| Status | ความหมาย | ผู้ที่ทำให้เกิดสถานะ |
|---|---|---|
| Draft | เอกสารยังอยู่ระหว่างเตรียม ยังไม่ส่งให้แผนกปลายทาง | Uploader |
| Uploaded | Upload ไฟล์และข้อมูลเอกสารแล้ว | Uploader/System |
| Sent | เอกสารถูกส่งให้แผนกปลายทางเห็นในระบบแล้ว | Uploader/System |
| Downloaded | มีผู้ใช้จากแผนกปลายทาง Download เอกสารแล้วอย่างน้อย 1 ครั้ง | Receiver/System |
| Acknowledged | แผนกปลายทางกดรับทราบการรับเอกสารแล้ว ถ้าระบบเปิดใช้ขั้นตอนนี้ | Receiver/System |
| Replaced | เอกสารถูกแทนที่ด้วย Version ใหม่ | Uploader/System |
| Archived | เอกสารถูกปิดงานหรือเก็บถาวร | Admin/System |

> สถานะเหล่านี้ใช้ติดตามการส่งและการรับเอกสารเท่านั้น ไม่ใช่สถานะอนุมัติ

## 7. กฎการ Upload เอกสาร

- ผู้ใช้ต้อง Login ก่อน Upload เอกสาร
- ผู้ใช้ต้องมีสิทธิ์ Upload ในนามแผนกต้นทาง
- ผู้ใช้ต้องระบุข้อมูลขั้นต่ำก่อนส่งเอกสาร
  - ชื่อเอกสาร
  - ประเภทเอกสาร
  - แผนกต้นทาง
  - แผนกปลายทาง
  - ไฟล์แนบ
- ระบบต้องจำกัดประเภทไฟล์ที่อนุญาต เช่น PDF, DOCX, XLSX, PNG, JPG
- ระบบต้องจำกัดขนาดไฟล์ต่อไฟล์ เช่น 20 MB หรือค่าที่ Admin กำหนด
- ระบบต้องเก็บชื่อไฟล์จริงและชื่อไฟล์ในระบบแยกกัน เพื่อป้องกันชื่อซ้ำและลดความเสี่ยงจากชื่อไฟล์ไม่ปลอดภัย
- ถ้า Upload ไฟล์ใหม่แทนไฟล์เดิม ระบบต้องสร้าง Version ใหม่ ไม่เขียนทับไฟล์เดิม
- เมื่อ Upload สำเร็จ ระบบต้องบันทึก Audit Log
- เมื่อส่งเอกสารแล้ว แผนกปลายทางต้องเห็นเอกสารในรายการ Incoming Documents

## 8. กฎการ Download เอกสาร

- ผู้ใช้ Download ได้เฉพาะเอกสารที่ตนมีสิทธิ์เข้าถึง
- ผู้ใช้จากแผนกปลายทางสามารถ Download เอกสารที่ถูกส่งถึงแผนกของตนเอง
- Uploader สามารถ Download เอกสารที่ตนเองเคย Upload ได้
- Department Admin สามารถ Download เอกสารของแผนกตนเองได้
- System Admin สามารถ Download เอกสารทั้งหมดได้ตามสิทธิ์ดูแลระบบ
- ทุกครั้งที่ Download ระบบต้องบันทึก Download Log และ Audit Log
- Download Log ต้องผูกกับ Version ของเอกสาร
- การ Download ครั้งแรกของแผนกปลายทางสามารถเปลี่ยนสถานะเอกสารเป็น Downloaded ได้
- การ Download ไม่ถือเป็นการอนุมัติเอกสาร

## 9. กฎการรับทราบเอกสาร

การรับทราบเป็นขั้นตอนเสริม ใช้เมื่อองค์กรต้องการให้แผนกปลายทางยืนยันว่าได้รับเอกสารแล้ว

- การรับทราบไม่ใช่การอนุมัติ
- การรับทราบไม่ใช่การรับรองว่าเนื้อหาเอกสารถูกต้อง
- ผู้ที่มีสิทธิ์ Receiver หรือ Department Admin ของแผนกปลายทางสามารถกดรับทราบได้
- การรับทราบต้องผูกกับ Version ของเอกสาร
- ถ้ามีการ Upload Version ใหม่ ระบบต้องแยกประวัติการรับทราบของ Version ใหม่ออกจาก Version เดิม
- ระบบต้องบันทึกผู้รับทราบ วันเวลา และ Version ที่รับทราบ
- ถ้าไม่เปิดใช้ขั้นตอนรับทราบ ระบบสามารถใช้ Download Log เป็นหลักฐานว่าแผนกปลายทางรับไฟล์ไปแล้ว

## 10. Permission เบื้องต้น

| Action | Uploader | Receiver | Department Admin | System Admin |
|---|---:|---:|---:|---:|
| Upload เอกสาร | Yes | No | Yes | Yes |
| ดูเอกสารที่ตนเองส่ง | Yes | No | Yes | Yes |
| ดูเอกสารที่ส่งถึงแผนกตนเอง | No | Yes | Yes | Yes |
| Download เอกสารที่เกี่ยวข้อง | Yes | Yes | Yes | Yes |
| กดรับทราบการรับเอกสาร | No | Yes | Yes | Yes |
| Upload Version ใหม่ | Yes | No | Yes | Yes |
| Archive เอกสาร | No | No | Yes | Yes |
| แก้ไข Master Data | No | No | Limited | Yes |
| ดู Audit Log ทั้งหมด | No | No | Limited | Yes |

## 11. ข้อมูลที่ต้องจัดเก็บ

### 11.1 Document

| Field | Required | ตัวอย่าง |
|---|---:|---|
| document_id | Yes | DOC-2026-0001 |
| title | Yes | เอกสาร UAT ระบบขาย |
| document_type | Yes | UAT, Report, Invoice |
| source_department_id | Yes | ES |
| target_department_id | Yes | Accounting |
| status | Yes | Sent |
| owner_user_id | Yes | user_001 |
| current_version | Yes | 1 |
| note | Optional | ส่งเพื่อให้ Accounting นำไปดำเนินงานต่อ |
| created_at | Yes | 2026-06-29 10:00 |
| updated_at | Yes | 2026-06-29 10:30 |

### 11.2 Document Version

| Field | Required | ตัวอย่าง |
|---|---:|---|
| version_id | Yes | VER-0001 |
| document_id | Yes | DOC-2026-0001 |
| version_no | Yes | 1 |
| original_file_name | Yes | uat-document.pdf |
| stored_file_name | Yes | uuid-file-name.pdf |
| file_path | Yes | storage/documents/2026/06/uuid-file-name.pdf |
| file_size | Yes | 2.4 MB |
| mime_type | Yes | application/pdf |
| uploaded_by | Yes | user_001 |
| uploaded_at | Yes | 2026-06-29 10:00 |

### 11.3 Document Recipient

| Field | Required | ตัวอย่าง |
|---|---:|---|
| recipient_id | Yes | RCP-0001 |
| document_id | Yes | DOC-2026-0001 |
| target_department_id | Yes | Accounting |
| received_status | Yes | Pending Download |
| first_downloaded_at | Optional | 2026-06-29 11:00 |
| acknowledged_at | Optional | 2026-06-29 11:05 |
| acknowledged_by | Optional | user_020 |

### 11.4 Download Log

| Field | Required | ตัวอย่าง |
|---|---:|---|
| download_id | Yes | DNL-0001 |
| document_id | Yes | DOC-2026-0001 |
| version_id | Yes | VER-0001 |
| downloaded_by | Yes | user_020 |
| downloaded_department_id | Yes | Accounting |
| downloaded_at | Yes | 2026-06-29 11:00 |
| ip_address | Optional | 10.0.0.10 |

### 11.5 Acknowledgement

| Field | Required | ตัวอย่าง |
|---|---:|---|
| acknowledgement_id | Yes | ACK-0001 |
| document_id | Yes | DOC-2026-0001 |
| version_id | Yes | VER-0001 |
| department_id | Yes | Accounting |
| user_id | Yes | user_020 |
| acknowledged_at | Yes | 2026-06-29 11:05 |

### 11.6 Audit Log

| Field | Required | ตัวอย่าง |
|---|---:|---|
| audit_id | Yes | AUD-0001 |
| actor_user_id | Yes | user_001 |
| action | Yes | UPLOAD, SEND, DOWNLOAD, ACKNOWLEDGE, ARCHIVE |
| target_type | Yes | Document |
| target_id | Yes | DOC-2026-0001 |
| detail | Optional | Accounting downloaded version 1 |
| created_at | Yes | 2026-06-29 10:00 |

## 12. Tools และ Technology

### 12.1 Architecture Decision

โครงสร้างระบบเป็นแบบ **แยก Frontend และ Backend อย่างชัดเจน** ไม่ใช่ Monolith
สื่อสารระหว่างกันผ่าน REST API เท่านั้น

| ส่วนระบบ | Tool ที่ใช้ | เหตุผล |
|---|---|---|
| Frontend | Next.js 14+ (App Router) + TypeScript | React framework มาตรฐาน, SSR/SSG พร้อมใช้ |
| Frontend UI | Tailwind CSS + shadcn/ui | ทำหน้าจอเร็ว สวย มีมาตรฐาน |
| Frontend State | TanStack Query (React Query) + Zustand | Server state + Client state แยกกันชัดเจน |
| Frontend HTTP | Axios หรือ fetch wrapper | เรียก Backend API + แนบ JWT อัตโนมัติ |
| Backend | Go 1.22+ + Gin | Performance ดี, deploy binary ก้อนเดียว, เหมือน Project TimeSheet |
| Backend DB Driver | pgx (jackc/pgx) | Native PostgreSQL driver ที่เร็วและ feature ครบ |
| Backend Migration | golang-migrate หรือ goose | จัดการ schema versioning |
| Backend Validation | go-playground/validator | Validate request payload |
| Database | PostgreSQL 15+ (อย่างเดียว ไม่ใช้ SQLite) | ทั้ง dev และ prod ใช้ PostgreSQL เพื่อไม่ให้เกิด behavior ต่างระหว่าง environment |
| File Storage | Local Storage (`./storage/documents/YYYY/MM/`) ใน MVP; abstract เป็น interface เพื่อเปลี่ยนไป S3/MinIO ได้ | เริ่มง่าย, ย้ายภายหลังโดยไม่กระทบ business logic |
| Authentication | JWT (Access Token) + Refresh Token, custom implement บน Backend | ควบคุมทั้ง flow ได้, ไม่ผูกกับ 3rd party |
| Password Hash | bcrypt (cost 12) | มาตรฐาน, resistant to brute force |
| Deployment | Docker Compose (frontend + backend + postgres) | 3 container แยกกัน deploy/scale ได้อิสระ |
| Reverse Proxy | Nginx หรือ Traefik | route `/api/*` ไป Backend, ที่เหลือไป Frontend |

### 12.2 Project Structure

โครงสร้าง Repo แบบ Mono-repo แยก 2 folder ชัดเจน

```text
project-document/
├── backend/                          # Go + Gin API server
│   ├── cmd/server/main.go
│   ├── config/                       # env, config loader
│   ├── db/                           # pgx connection pool, migrations
│   ├── handlers/                     # HTTP handlers (auth, document, download, ack, audit)
│   ├── middleware/                   # jwt, rbac, logger, cors
│   ├── models/                       # struct ที่ map กับ DB
│   ├── repositories/                 # DB access layer
│   ├── services/                     # business logic
│   ├── storage/                      # file storage interface (local, s3-ready)
│   ├── utils/                        # jwt, hash, uuid, validators
│   ├── migrations/                   # SQL migration files
│   ├── go.mod
│   └── Dockerfile
├── frontend/                         # Next.js App Router
│   ├── src/app/
│   │   ├── (auth)/login/
│   │   ├── (main)/
│   │   │   ├── dashboard/
│   │   │   ├── documents/
│   │   │   │   ├── outgoing/
│   │   │   │   ├── incoming/
│   │   │   │   ├── upload/
│   │   │   │   └── [id]/            # detail
│   │   │   ├── audit-log/
│   │   │   └── settings/
│   │   └── layout.tsx
│   ├── src/components/               # shadcn/ui + custom
│   ├── src/lib/api/                  # axios client + endpoints
│   ├── src/lib/auth/                 # token storage, refresh logic
│   ├── src/hooks/
│   ├── src/store/
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

### 12.3 Stack Summary

```text
Frontend : Next.js 14 + TypeScript + Tailwind + shadcn/ui + TanStack Query
Backend  : Go 1.22 + Gin + pgx + JWT (custom) + golang-migrate
Database : PostgreSQL 15 (dev และ prod เหมือนกัน)
Storage  : Local filesystem (MVP) via interface abstraction
Deploy   : Docker Compose (3 services: frontend / backend / postgres)
```

## 13. หน้าจอหลักที่ควรมี

- Login
- Dashboard สรุปเอกสารที่ส่งออกและเอกสารที่รอดาวน์โหลด
- Outgoing Documents สำหรับเอกสารที่แผนกตนเองส่งออก
- Incoming Documents สำหรับเอกสารที่ส่งถึงแผนกตนเอง
- Upload Document
- Document Detail
- Download History
- Department Management
- User Management
- Master Data เช่น Document Type และ Department
- Audit Log สำหรับ Admin

## 14. Acceptance Criteria เบื้องต้น

- Given ผู้ใช้ Login สำเร็จ, when Upload ไฟล์พร้อมข้อมูลครบ, then ระบบต้องสร้าง Document และ Version แรกได้
- Given ES Upload เอกสารโดยเลือก Accounting เป็นแผนกปลายทาง, when Upload สำเร็จ, then Accounting ต้องเห็นเอกสารใน Incoming Documents
- Given Accounting เห็นเอกสารใน Incoming Documents, when ผู้ใช้ที่มีสิทธิ์กด Download, then ระบบต้องให้ Download ไฟล์ได้
- Given Accounting Download เอกสาร, when Download สำเร็จ, then ระบบต้องบันทึก Download Log พร้อมผู้ Download, แผนก, เวลา และ Version
- Given เอกสารถูก Download ครั้งแรกโดยแผนกปลายทาง, when ระบบบันทึกสำเร็จ, then สถานะเอกสารต้องเปลี่ยนเป็น Downloaded หรือแสดง first_downloaded_at ได้
- Given เปิดใช้การรับทราบ, when Receiver กดรับทราบ, then ระบบต้องบันทึกผู้รับทราบ วันเวลา และ Version
- Given ผู้ใช้ไม่มีสิทธิ์เข้าถึงเอกสาร, when เปิดหรือ Download เอกสาร, then ระบบต้องปฏิเสธการเข้าถึง
- Given Uploader Upload Version ใหม่, when ตรวจสอบประวัติ, then ระบบต้องแสดง Version และประวัติ Download แยกกันถูกต้อง
- Given ไม่มีขั้นตอนรับทราบ, when แผนกปลายทาง Download เอกสารแล้ว, then Download Log ต้องใช้เป็นหลักฐานการรับไฟล์ได้

## 15. ข้อควรระวัง

- ห้ามเก็บไฟล์โดยใช้ชื่อไฟล์เดิมเป็นชื่อหลักในระบบ เพราะอาจชนกันหรือมีอักขระไม่ปลอดภัย
- ต้องตรวจสิทธิ์ทุกครั้งก่อน Download ไฟล์
- ต้องป้องกันการเข้าถึงไฟล์โดยตรงผ่าน URL ที่เดาได้
- ต้องจำกัดชนิดไฟล์และขนาดไฟล์
- ต้องแยก Version ของเอกสารให้ชัดเจน
- ต้องมี Audit Log สำหรับ action สำคัญทั้งหมด
- ต้องสื่อสารในหน้าจอให้ชัดว่า Download หรือ Acknowledge ไม่ใช่การอนุมัติ
- ถ้าเอกสารมีข้อมูลสำคัญ ควรเข้ารหัส storage หรือใช้ cloud storage ที่มี access control

## 16. Future Enhancements

- Email หรือ notification แจ้งแผนกปลายทางเมื่อมีเอกสารใหม่
- Reminder เอกสารที่ยังไม่มีการ Download
- Preview PDF ในหน้าเว็บ
- Full-text search จากชื่อไฟล์และ metadata
- Export รายงานการ Upload และ Download เป็น Excel/PDF
- Retention policy สำหรับกำหนดอายุการเก็บเอกสาร
- Integration กับ Google Drive, SharePoint หรือ S3
- Dashboard แสดง SLA การ Download เอกสารระหว่างแผนก

## 17. Design Decisions (จาก Open Questions)

ข้อสรุปที่ตกลงไว้แล้ว ใช้เป็น default ของ MVP

| # | คำถามเดิม | ข้อสรุป | หมายเหตุ |
|---:|---|---|---|
| 1 | รับทราบหลัง Download หรือไม่ | **Optional per Document Type** — Admin กำหนดได้ว่า document_type ไหน `require_acknowledge = true`; default = ใช้ Download Log เป็นหลักฐาน | เพิ่ม field `require_acknowledge` ที่ตาราง `document_type` |
| 2 | เอกสาร 1 รายการส่งได้หลายแผนกหรือไม่ | **รองรับหลายแผนก** (multi-recipient) — 1 Document ↔ N Document Recipient | schema `document_recipient` รองรับอยู่แล้ว |
| 3 | Due date ให้แผนกปลายทาง Download | **มี field `due_date` ให้กรอกได้ (Optional)** ถ้าไม่กรอกจะไม่บังคับ SLA | ระบบจะ mark เอกสารเป็น `overdue` ถ้าเลย due_date และยังไม่มีการ Download |
| 4 | แจ้งเตือน Email / Line / Teams | **MVP ทำเฉพาะ In-app Notification** + วาง interface `notifier` ไว้ให้เพิ่ม Email/Teams ได้ภายหลัง | Email/Teams เป็น Future Enhancement |
| 5 | เก็บไฟล์ที่ Server เอง หรือ Cloud | **MVP: Local Filesystem** (`./storage/documents/YYYY/MM/`) ผ่าน `Storage` interface | เปลี่ยนเป็น S3/MinIO ได้โดยไม่แก้ business logic |
| 6 | Encryption ระดับใด | **MVP:** HTTPS (in-transit) + Filesystem-level encryption ของ OS (at-rest); **ไม่ทำ** application-level encryption | ถ้ามีเอกสารลับสูง ค่อยพิจารณา envelope encryption ใน Phase ถัดไป |

## 18. API Contract (Backend)

REST API ใช้ prefix `/api/v1` ทั้งหมด ตอบกลับเป็น JSON

### 18.1 Auth

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/auth/login` | รับ `{username, password}` คืน `access_token`, `refresh_token`, `user` |
| POST | `/api/v1/auth/refresh` | รับ `refresh_token` คืน `access_token` ใหม่ |
| POST | `/api/v1/auth/logout` | Revoke refresh token ปัจจุบัน |
| GET  | `/api/v1/auth/me` | คืนข้อมูล user + roles + departments ของ token ปัจจุบัน |

### 18.2 Documents

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/documents` | สร้าง Document + Upload Version แรก (multipart) |
| GET  | `/api/v1/documents` | ค้นหา/List (query: `direction=outgoing\|incoming`, `status`, `type`, `department`, `q`, `page`, `size`) |
| GET  | `/api/v1/documents/:id` | ดูรายละเอียด Document + Versions + Recipients |
| POST | `/api/v1/documents/:id/versions` | Upload Version ใหม่ |
| POST | `/api/v1/documents/:id/archive` | Archive เอกสาร (Admin) |
| GET  | `/api/v1/documents/:id/versions/:versionId/download` | Download ไฟล์ (บันทึก Download Log อัตโนมัติ) |
| POST | `/api/v1/documents/:id/acknowledge` | กดรับทราบ Version ล่าสุดของแผนกตน |

### 18.3 Master Data & Admin

| Method | Path | Description |
|---|---|---|
| GET/POST/PATCH | `/api/v1/departments` | จัดการแผนก |
| GET/POST/PATCH | `/api/v1/document-types` | จัดการประเภทเอกสาร (มี field `require_acknowledge`, `allowed_mime_types`, `max_file_size_mb`) |
| GET/POST/PATCH | `/api/v1/users` | จัดการผู้ใช้ + assign role/department |
| GET | `/api/v1/audit-logs` | ค้นหา Audit Log (Admin) |

### 18.4 Standard Response Shape

```json
// success
{ "data": <payload>, "meta": { "page": 1, "size": 20, "total": 100 } }

// error
{ "error": { "code": "FORBIDDEN", "message": "You do not have permission" } }
```

### 18.5 Error Codes มาตรฐาน

`UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (422), `FILE_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415), `INTERNAL_ERROR` (500)

## 19. Database Schema (PostgreSQL)

ตารางหลักและความสัมพันธ์ (สรุประดับ overview จาก Section 11)

```text
users (id, username, email, password_hash, full_name, is_active, created_at)
  ├─< user_roles (user_id, role) -- Uploader | Receiver | DeptAdmin | SysAdmin
  └─< user_departments (user_id, department_id, is_default)

departments (id, code, name_th, name_en, is_active)

document_types (id, code, name, require_acknowledge, allowed_mime_types[], max_file_size_mb)

documents (id, code, title, document_type_id, source_department_id,
           owner_user_id, status, current_version_no, due_date, note,
           created_at, updated_at)
  ├─< document_versions (id, document_id, version_no, original_file_name,
  │                       stored_file_name, file_path, file_size_bytes,
  │                       mime_type, sha256, uploaded_by, uploaded_at)
  ├─< document_recipients (id, document_id, target_department_id,
  │                         received_status, first_downloaded_at,
  │                         acknowledged_at, acknowledged_by)
  ├─< download_logs (id, document_id, version_id, downloaded_by,
  │                   downloaded_department_id, downloaded_at, ip_address, user_agent)
  └─< acknowledgements (id, document_id, version_id, department_id,
                         user_id, acknowledged_at)

audit_logs (id, actor_user_id, action, target_type, target_id, detail_json, created_at)

refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at)
```

Index สำคัญ

- `documents (source_department_id, status, created_at DESC)`
- `document_recipients (target_department_id, received_status)`
- `download_logs (document_id, version_id)`
- `audit_logs (actor_user_id, created_at DESC)`, `audit_logs (target_type, target_id)`

## 20. Environment Variables

### Backend (`backend/.env`)

```env
APP_ENV=development
APP_PORT=8080
DATABASE_URL=postgres://postgres:postgres@localhost:5432/project_document?sslmode=disable
JWT_ACCESS_SECRET=<random 64 char>
JWT_REFRESH_SECRET=<random 64 char>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=168h
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=./storage/documents
MAX_UPLOAD_MB=20
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api/v1
```

## 21. Definition of Done (MVP)

- Docker Compose ยิงคำสั่งเดียวขึ้นทั้งระบบ (frontend + backend + postgres)
- Migration รันอัตโนมัติเมื่อ Backend boot
- Seed script สร้าง System Admin, แผนกตัวอย่าง (ES, Accounting), Document Type ตัวอย่าง
- Uploader ล็อกอิน → Upload เอกสาร → Receiver เห็นใน Incoming → Download ได้ → Log ถูกบันทึกครบ
- ทุก endpoint สำคัญมี unit test / integration test ระดับพื้นฐาน
- README มีวิธี setup dev + prod
