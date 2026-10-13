from fastapi import APIRouter, HTTPException,Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Student,User
from app.schemas import studentCreate,studentOut,StudentUpdate,StudentPklUpdate
from app.security import get_current_user,require_roles


router = APIRouter(prefix="/students", tags=["students"])





@router.get("", summary="Get all students")
def get_students(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(Student)

    if current_user.role == "pembimbing":
        stmt = stmt.where(Student.supervisor_id == current_user.supervisor_id)

    students = db.scalars(stmt).all()

    return students


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
    summary="Update periode PKL siswa",
    dependencies=[Depends(require_roles("pembimbing"))]
)
def update_student_pkl(
    student_id: int,
    data: StudentPklUpdate,
    db: Session = Depends(get_db)
):
    student = db.scalar(select(Student).where(Student.id == student_id))

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student tidak ditemukan"
        )

    student.startPkl = data.startPkl
    student.endPkl = data.endPkl

    db.commit()
    db.refresh(student)

    return student


@router.delete(
    "/{student_id}", 
    status_code=204, 
    summary="Delete student",
    dependencies=[Depends(require_roles("admin"))]
)
def delete_student(student_id: int, db: Session = Depends(get_db)):
    # 1. Cari siswa berdasarkan ID di database
    student = db.scalar(select(Student).where(Student.id == student_id))
    
    # 2. Jika tidak ditemukan, kembalikan error 404
    if not student:
        raise HTTPException(status_code=404, detail="Student tidak ditemukan")

    # 3. Hapus data dari database SQL Server
    db.delete(student)
    db.commit()

    return None