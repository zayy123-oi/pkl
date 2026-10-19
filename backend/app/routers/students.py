
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Student,User
from app.schemas import studentCreate,studentOut,StudentUpdate,StudentPklUpdate
from app.security import get_current_user,require_roles


router = APIRouter(prefix="/students", tags=["students"])





@router.get("", summary="Get all students")
def get_students(
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(Student)

    if active_only:
        stmt = stmt.where(Student.is_active == True)

    if current_user.role == "pembimbing":
        stmt = stmt.where(
            Student.supervisor_id == current_user.supervisor_id
        )

    return db.scalars(stmt).all()


@router.get("/{student_id}", summary="Get student by ID", response_model=studentOut)
def get_student_by_id(student_id: int, db: Session = Depends(get_db)):
    student = db.scalar(select(Student).where(Student.id == student_id))
    
    if not student:
        raise HTTPException(status_code=404, detail="Student tidak ditemukan")
        
    return student


@router.post("",response_model=studentOut,status_code=201,dependencies=[Depends(require_roles("admin"))])
def create_student(payload:studentCreate,db:Session=Depends(get_db)):
    if db.scalar(select(Student).where(Student.nis==payload.nis)):
        raise HTTPException(409,"nis sudah terdaftar")
    student=Student(**payload.model_dump())
    db.add(student)
    db.commit()
    db.refresh(student)
    return student

@router.patch(
    "/{student_id}", 
    response_model=studentOut, 
    summary="Update student data",
    dependencies=[Depends(require_roles("admin"))]
)
def update_student(student_id: int, data: StudentUpdate, db: Session = Depends(get_db)):
    student = db.scalar(select(Student).where(Student.id == student_id))
    
    if not student:
        raise HTTPException(status_code=404, detail="Student tidak ditemukan")

    update_data = data.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(student, key, value)

    db.commit()
    db.refresh(student)

    return student


@router.patch(
    "/{student_id}/pkl",
    response_model=studentOut,
    summary="Update atau aktifkan kembali siswa PKL",
    dependencies=[Depends(require_roles("pembimbing"))]
)
def update_student_pkl(
    student_id: int,
    data: StudentPklUpdate,
    db: Session = Depends(get_db)
):
    student = db.scalar(
        select(Student).where(Student.id == student_id)
    )

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student tidak ditemukan"
        )

    student.startPkl = data.startPkl
    student.endPkl = data.endPkl
    student.is_active = True

    akun = db.scalars(
        select(User).where(User.student_id == student_id)
    ).all()

    for user in akun:
        user.is_active = True

    db.commit()
    db.refresh(student)

    return student


@router.delete(
    "/{student_id}/pkl",
    response_model=studentOut,
    summary="Hapus periode PKL siswa",
    dependencies=[Depends(require_roles("pembimbing"))]
)
def delete_student_pkl(
    student_id: int,
    db: Session = Depends(get_db)
):
    student = db.scalar(
        select(Student).where(Student.id == student_id)
    )

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student tidak ditemukan"
        )

    student.startPkl = None
    student.endPkl = None

    db.commit()
    db.refresh(student)

    return student


    





@router.delete(
    "/{student_id}",
    status_code=204,
    summary="Nonaktifkan siswa",
)
def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Hanya Admin dan Pembimbing yang boleh menonaktifkan siswa.
    if current_user.role not in ["admin", "pembimbing"]:
        raise HTTPException(
            status_code=403,
            detail="Tidak memiliki izin untuk menonaktifkan siswa"
        )

    student = db.scalar(
        select(Student).where(Student.id == student_id)
    )

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student tidak ditemukan"
        )

    # Pembimbing hanya boleh menonaktifkan siswa bimbingannya.
    if current_user.role == "pembimbing":
        if student.supervisor_id != current_user.supervisor_id:
            raise HTTPException(
                status_code=403,
                detail="Siswa ini bukan siswa bimbingan Anda"
            )

    # Nonaktifkan siswa tanpa menghapus riwayat.
    student.is_active = False

    # Nonaktifkan akun login siswa yang terkait.
    akun = db.scalars(
        select(User).where(User.student_id == student_id)
    ).all()

    for user in akun:
        user.is_active = False

    db.commit()
    return None
