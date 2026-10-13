from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Task
from app.schemas import TaskCreate, TaskOut, TaskUpdate
from app.security import get_current_user

router = APIRouter(prefix="/tasks", tags=["tasks"])

@router.post("", response_model=TaskOut, status_code=201)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    # VALIDASI DEADLINE
    if payload.deadline is not None:
        now = datetime.now(timezone(timedelta(hours=7))).replace(tzinfo=None)

        deadline = payload.deadline
        if deadline.tzinfo is not None:
            deadline = deadline.astimezone(
                timezone(timedelta(hours=7))
            ).replace(tzinfo=None)

        if deadline < now:
            raise HTTPException(
                status_code=400,
                detail="Deadline tidak boleh menggunakan tanggal atau waktu yang sudah lewat."
            )

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
def get_task(task_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tugas tidak ditemukan")
    return task

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

    # Cek perubahan status progress
    if "status_progress" in updates:
        current_progress = task.status_progress or "pending"
        new_progress = updates["status_progress"]

        urutan = {
            "pending": 0,
            "proses": 1,
            "selesai": 2
        }

        if current_progress not in urutan:
            raise HTTPException(
                status_code=400,
                detail="Status progress saat ini tidak valid"
            )

        if new_progress not in urutan:
            raise HTTPException(
                status_code=400,
                detail="Status progress tidak valid"
            )

        # Progress hanya boleh maju satu tahap
        if urutan[new_progress] != urutan[current_progress] + 1:
            raise HTTPException(
                status_code=400,
                detail="Progress harus berurutan: Belum Mulai → Sedang Dikerjakan → Selesai"
            )

        # Saat tugas mulai dikerjakan
        if new_progress == "proses" and task.startTugas is None:
          wib = timezone(timedelta(hours=7))
          task.startTugas = datetime.now(wib).replace(tzinfo=None)
    # Terapkan perubahan
    for key, value in updates.items():
        setattr(task, key, value)

    db.commit()
    db.refresh(task)

    return task

@router.delete("/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Tugas tidak ditemukan")
    db.delete(task)
    db.commit()
    return {"message": "Tugas berhasil dihapus", "id": task_id}