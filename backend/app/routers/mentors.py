
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import get_db

from app.models import Mentor, Student, CertificateAssessment

from app.schemas import (
    MentorCreate,
    MentorOut,
    MentorUpdate,
    CertificateAssessmentInput,
    CertificateAssessmentOut,
)
from app.security import require_roles




router = APIRouter(prefix="/mentors", tags=["mentors"])

@router.get(
    "/certificate-assessments",
    summary="Admin melihat semua penilaian sertifikat",
    response_model=list[CertificateAssessmentOut],
    dependencies=[Depends(require_roles("admin"))],
)
def get_semua_penilaian_sertifikat(
    db: Session = Depends(get_db),
):
    return db.scalars(
        select(CertificateAssessment).order_by(
            CertificateAssessment.student_id
        )
    ).all()

# --- TAMBAHKAN DUA ENDPOINT INI ---
@router.get("", summary="Get all mentors", response_model=list[MentorOut])
def get_mentors(db: Session = Depends(get_db)):
    mentors = db.scalars(select(Mentor)).all()
    return mentors


@router.get("/{mentor_id}", summary="Get mentor by ID", response_model=MentorOut)
def get_mentor_by_id(mentor_id: int, db: Session = Depends(get_db)):
    mentor = db.scalar(select(Mentor).where(Mentor.id == mentor_id))
    if not mentor:
        raise HTTPException(status_code=404, detail="Mentor tidak ditemukan")
    return mentor


@router.post(
    "",
    summary="Create a new mentor",
    response_model=MentorOut,
    status_code=201,
    dependencies=[Depends(require_roles("admin"))]
)
def create_mentor(payload: MentorCreate, db: Session = Depends(get_db)):
    mentor = Mentor(**payload.model_dump())
    db.add(mentor)
    db.commit()
    db.refresh(mentor)
    return mentor


@router.patch(
    "/{mentor_id}",
    summary="Update mentor data",
    response_model=MentorOut,
    dependencies=[Depends(require_roles("admin"))]
)
def update_mentor(mentor_id: int, data: MentorUpdate, db: Session = Depends(get_db)):
    mentor = db.scalar(select(Mentor).where(Mentor.id == mentor_id))
    if not mentor:
        raise HTTPException(status_code=404, detail="Mentor tidak ditemukan")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(mentor, key, value)

    db.commit()
    db.refresh(mentor)
    return mentor


@router.delete(
    "/{mentor_id}",
    summary="Delete mentor",
    status_code=204,
    dependencies=[Depends(require_roles("admin"))]
)
def delete_mentor(mentor_id: int, db: Session = Depends(get_db)):
    mentor = db.scalar(select(Mentor).where(Mentor.id == mentor_id))
    if not mentor:
        raise HTTPException(status_code=404, detail="Mentor tidak ditemukan")

    db.delete(mentor)
    db.commit()
    return None


@router.put(
    "/students/{student_id}/certificate-assessment",
    summary="Simpan penilaian sertifikat siswa",
    response_model=CertificateAssessmentOut,
)
def simpan_penilaian_sertifikat(
    student_id: int,
    payload: CertificateAssessmentInput,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("pembimbing")),
):
    if not current_user.supervisor_id:
        raise HTTPException(
            status_code=403,
            detail="Akun ini belum terhubung ke data pembimbing",
        )

    siswa = db.scalar(
        select(Student).where(Student.id == student_id)
    )

    if not siswa:
        raise HTTPException(
            status_code=404,
            detail="Siswa tidak ditemukan",
        )

    if siswa.supervisor_id != current_user.supervisor_id:
        raise HTTPException(
            status_code=403,
            detail="Siswa ini bukan siswa bimbingan Anda",
        )

    penilaian = db.scalar(
        select(CertificateAssessment).where(
            CertificateAssessment.student_id == student_id
        )
    )

    if penilaian is None:
        penilaian = CertificateAssessment(
            student_id=student_id,
            supervisor_id=current_user.supervisor_id,
        )
        db.add(penilaian)

    for key, value in payload.model_dump().items():
        setattr(penilaian, key, value)

    penilaian.supervisor_id = current_user.supervisor_id

    try:
        db.commit()
        db.refresh(penilaian)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Gagal menyimpan penilaian sertifikat",
        )

    return penilaian


