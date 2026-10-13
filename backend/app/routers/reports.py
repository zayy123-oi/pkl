from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models import Report, User
from app.schemas import ReportCreate, ReportOut, ReportUpdate
from app.security import get_current_user

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", response_model=ReportOut, status_code=201)
def create_report(payload: ReportCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    report = Report(**payload.model_dump())
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


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