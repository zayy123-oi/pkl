import os
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, UploadFile,File, Form
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models import Report, User
from app.schemas import ReportCreate, ReportOut, ReportUpdate
from app.security import get_current_user

router = APIRouter(prefix="/reports", tags=["reports"])
UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "laporan"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
print("FOLDER FOTO:", UPLOAD_DIR.resolve())

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


@router.post("", response_model=ReportOut, status_code=201)
def create_report(payload: ReportCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    report = Report(**payload.model_dump())
    db.add(report)
    db.commit()
    db.refresh(report)
    return report

@router.post("/upload", response_model=ReportOut, status_code=201)
async def create_report_with_photo(
    id_siswa: int = Form(...),
    isi_laporan: str = Form(...),
    id_tugas: int | None = Form(None),
    foto_laporan: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    user_role = getattr(current_user, "role", None)
    student_id = getattr(current_user, "student_id", None)

    # Hanya siswa yang boleh mengirim laporan
    if user_role not in ["siswa", "student"]:
        raise HTTPException(
            status_code=403,
            detail="Hanya siswa yang dapat membuat laporan."
        )

    if student_id is None or int(student_id) != id_siswa:
        raise HTTPException(
            status_code=403,
            detail="Anda hanya dapat membuat laporan untuk akun sendiri."
        )

    isi_laporan = isi_laporan.strip()
    if not isi_laporan:
        raise HTTPException(
            status_code=400,
            detail="Isi laporan tidak boleh kosong."
        )

    nama_file = None
    path_file = None

    if foto_laporan and foto_laporan.filename:
        ekstensi = ALLOWED_IMAGE_TYPES.get(foto_laporan.content_type)

        if not ekstensi:
            raise HTTPException(
                status_code=400,
                detail="Format foto harus JPG, PNG, atau WEBP."
            )

        isi_file = await foto_laporan.read()

        if len(isi_file) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail="Ukuran foto maksimal 5 MB."
            )

        nama_file = f"{uuid.uuid4().hex}{ekstensi}"
        path_file = UPLOAD_DIR / nama_file

        with path_file.open("wb") as file:
            file.write(isi_file)

    try:
        report = Report(
            id_siswa=id_siswa,
            id_tugas=id_tugas,
            isi_laporan=isi_laporan,
            foto_laporan=nama_file,
        )

        db.add(report)
        db.commit()
        db.refresh(report)

        return report

    except Exception:
        db.rollback()

        if path_file and path_file.exists():
            path_file.unlink()

        raise HTTPException(
            status_code=500,
            detail="Gagal menyimpan laporan."
        )

    finally:
        if foto_laporan:
            await foto_laporan.close()


@router.get("", response_model=list[ReportOut])
def list_reports(
    id_siswa: int | None = None,
    id_tugas: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    stmt = select(Report).options(joinedload(Report.siswa))
    # print(stmt)

    # --- TAMBAHKAN LOGIKA INI ---
    user_role = getattr(current_user, "role", None)

    if user_role in ["pembimbing", "supervisor"]:
        # Ambil daftar student_id milik siswa bimbingan user yang login
        subquery = select(User.student_id).where(
            User.supervisor_id == current_user.supervisor_id,
            User.student_id.isnot(None)
        )
        stmt = stmt.where(Report.id_siswa.in_(subquery))

    elif user_role in ["siswa", "student"]:
        student_id = getattr(current_user, "student_id", current_user.id)
        stmt = stmt.where(Report.id_siswa == student_id)
    # ----------------------------

    if id_siswa:
        stmt = stmt.where(Report.id_siswa == id_siswa)
    if id_tugas:
        stmt = stmt.where(Report.id_tugas == id_tugas)

    return list(db.scalars(stmt).all())


@router.get("/{report_id}", response_model=ReportOut)
def get_report(report_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    report = db.get(Report, report_id)
    print(report)
    if not report:
        raise HTTPException(status_code=404, detail="Laporan tidak ditemukan")
    return report


@router.patch("/{report_id}", response_model=ReportOut)
def update_report(report_id: int, payload: ReportUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    report = db.get(Report, report_id)
    print(report)
    if not report:
        raise HTTPException(status_code=404, detail="Laporan tidak ditemukan")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(report, key, value)
    db.commit()
    db.refresh(report)
    return report


@router.delete("/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Laporan tidak ditemukan")
    db.delete(report)
    db.commit()
    return {"message": "Laporan berhasil dihapus", "id": report_id}
