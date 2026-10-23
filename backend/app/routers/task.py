
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Task, Student
from zoneinfo import ZoneInfo
from app.schemas import TaskCreate, TaskOut, TaskUpdate
from app.security import get_current_user

router = APIRouter(prefix="/tasks", tags=["tasks"])

@router.post("", response_model=TaskOut, status_code=201)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    
    
    task = Task(
        id_siswa=payload.id_siswa,
        id_pembimbing=current_user.supervisor_id,
        judul_tugas=payload.judul_tugas,
        deskripsi_tugas=payload.deskripsi_tugas,
        startTugas=payload.startTugas,
        deadline=payload.deadline,
        status="belum",
        status_progress="pending"
    )

    db.add(task)
    db.commit()
    db.refresh(task)

    return task

@router.get("", response_model=list[TaskOut])
def list_tasks(
    id_siswa: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    stmt = select(Task)

    if current_user.role == "siswa":
        stmt = stmt.where(Task.id_siswa == current_user.student_id)

    elif id_siswa:
        stmt = stmt.where(Task.id_siswa == id_siswa)

    return list(db.scalars(stmt).all())

@router.get("/{task_id}", response_model=TaskOut)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    task = db.get(Task, task_id)

    if not task:
        raise HTTPException(
            status_code=404,
            detail="Tugas tidak ditemukan"
        )

    return task

def check_student_pkl_period(student: Student):
    today = datetime.now(ZoneInfo("Asia/Jakarta")).date()

    if student.endPkl and today > student.endPkl:
        raise HTTPException(
            status_code=403,
            detail="Periode PKL kamu sudah berakhir. Perubahan progres tugas tidak dapat dilakukan."
        )





@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    task = db.get(Task, task_id)

    if not task:
        raise HTTPException(
            status_code=404,
            detail="Tugas tidak ditemukan"
        )

    updates = payload.model_dump(exclude_unset=True)

    if current_user.role == "siswa":
        if task.id_siswa != current_user.student_id:
            raise HTTPException(
                status_code=403,
                detail="Kamu tidak dapat mengubah tugas siswa lain."
            )

        student = db.get(Student, current_user.student_id)

        if not student:
            raise HTTPException(
                status_code=404,
                detail="Data siswa tidak ditemukan."
            )

        check_student_pkl_period(student)

        # Siswa tidak boleh mengubah status revisi milik pembimbing.
        if "status" in updates:
            raise HTTPException(
                status_code=403,
                detail="Status revisi hanya dapat diubah oleh pembimbing."
            )

        # Tugas selesai terkunci sampai pembimbing meminta revisi.
        if task.status_progress == "selesai":
            raise HTTPException(
                status_code=403,
                detail="Tugas sudah selesai. Tunggu keputusan pembimbing."
            )

       
        # Siswa hanya boleh mengubah progres.
        if any(key != "status_progress" for key in updates):
            raise HTTPException(
                status_code=403,
                detail="Siswa hanya dapat mengubah progres tugas."
            )

    elif current_user.role == "pembimbing":
        if task.id_pembimbing != current_user.supervisor_id:
            raise HTTPException(
                status_code=403,
                detail="Kamu tidak dapat mengubah tugas pembimbing lain."
            )

    else:
        raise HTTPException(
            status_code=403,
            detail="Kamu tidak memiliki izin untuk mengubah tugas."
        )


    if "status_progress" in updates:
        current_progress = task.status_progress or "pending"
        new_progress = updates["status_progress"]

        urutan = {
            "pending": 0,
            "proses": 1,
            "selesai": 2
        }

        if new_progress not in urutan:
            raise HTTPException(
                status_code=400,
                detail="Status progres tidak valid."
            )

        # Progres siswa hanya boleh maju satu tahap.
        if current_user.role == "siswa":
            if current_progress not in urutan:
                raise HTTPException(
                    status_code=400,
                    detail="Status progres saat ini tidak valid."
                )

            if urutan[new_progress] != urutan[current_progress] + 1:
                raise HTTPException(
                    status_code=400,
                    detail="Progres harus berurutan: Belum Mulai → Sedang Dikerjakan → Selesai."
                )

        if new_progress == "proses" and task.startTugas is None:
            wib = timezone(timedelta(hours=7))
            task.startTugas = datetime.now(wib).replace(tzinfo=None)

    for key, value in updates.items():
        setattr(task, key, value)

    db.commit()
    db.refresh(task)

    return task


@router.post("/{task_id}/revisi", response_model=TaskOut)
def request_task_revision(
    task_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if current_user.role != "pembimbing":
        raise HTTPException(
            status_code=403,
            detail="Hanya pembimbing yang dapat meminta revisi."
        )

    task = db.get(Task, task_id)

    if not task:
        raise HTTPException(
            status_code=404,
            detail="Tugas tidak ditemukan."
        )

    if task.id_pembimbing != current_user.supervisor_id:
        raise HTTPException(
            status_code=403,
            detail="Kamu tidak dapat meminta revisi tugas pembimbing lain."
        )

    if task.status_progress != "selesai":
        raise HTTPException(
            status_code=400,
            detail="Revisi hanya dapat diminta untuk tugas yang sudah selesai."
        )

    task.status = "revisi"
    task.status_progress = "proses"

    db.commit()
    db.refresh(task)

    return task





@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    task = db.get(Task, task_id)

    if not task:
        raise HTTPException(
            status_code=404,
            detail="Tugas tidak ditemukan"
        )

    db.delete(task)
    db.commit()

    return {"message": "Tugas berhasil dihapus", "id": task_id}
