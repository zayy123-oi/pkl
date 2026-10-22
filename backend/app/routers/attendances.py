
import math
from datetime import datetime, timezone, timedelta, date
from zoneinfo import ZoneInfo
from app.config import settings
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Attendance, Location, Student, Mentor
from app.schemas import (
    AttendanceCreate,
    AttendanceResponse,
    AttendancePage,
    AttendanceUpdate,
)
from app.security import get_current_user

router = APIRouter(prefix="/attendances", tags=["attendances"])


# --- HELPER FUNCTION: Menghitung Jarak Koordinat (Haversine Formula) ---
def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return round(R * c, 2)


def get_student(db: Session, student_id: int) -> Student:
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(404, "siswa tidak ditemukan")
    return student

def check_student_pkl_period(student: Student):
    today = datetime.now(ZoneInfo("Asia/Jakarta")).date()

    if student.endPkl and today > student.endPkl:
        raise HTTPException(
            status_code=403,
            detail="Periode PKL kamu sudah berakhir. Fitur absensi tidak dapat digunakan."
        )


def get_mentor(db: Session, supervisor_id: int) -> Mentor:
    mentor = db.get(Mentor, supervisor_id)
    if not mentor:
        raise HTTPException(404, "pembimbing tidak ditemukan")
    return mentor


def get_location(db: Session, location_id: int) -> Location:
    location = db.get(Location, location_id)
    if not location:
        raise HTTPException(404, "lokasi tidak valid")
    return location


def validate_distance(
    location: Location | None,
    latitude: float | None,
    longitude: float | None,
) -> float | None:
    if location is None:
        return None

    if latitude is None or longitude is None:
        raise HTTPException(
            status_code=400,
            detail="Latitude dan longitude wajib dikirim jika location_id digunakan.",
        )

    distance = calculate_haversine_distance(
        latitude,
        longitude,
        location.latitude,
        location.longitude,
    )

    if distance > location.radius_meter:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Lokasi di luar radius absensi.",
                "distance_meter": round(distance, 2),
                "allowed_radius_meter": location.radius_meter,
            },
        )

    return distance


def check_duplicate(
    db: Session,
    student_id: int,
    attendance_type: str,
    attendance_time: datetime,
):
    same_day = db.scalar(
        select(Attendance).where(
            Attendance.student_id == student_id,
            Attendance.attendance_type == attendance_type,
            Attendance.attendance_date == attendance_time.date(),
            Attendance.status != "di tolak",
        ).limit(1)
    )

    if same_day:
        raise HTTPException(
            409,
            {
                "message": "absensi dengan tipe yang sama sudah ada untuk hari ini",
                "attendance_id": same_day.id,
            },
        )

    lower = attendance_time - timedelta(
        minutes=getattr(settings, "duplicate_windows_minutes", 5)
    )
    upper = attendance_time + timedelta(
        minutes=getattr(settings, "duplicate_windows_minutes", 5)
    )

    recent = db.scalar(
        select(Attendance).where(
            Attendance.student_id == student_id,
            Attendance.attendance_type == attendance_type,
            Attendance.attendance_time >= lower,
            Attendance.attendance_time <= upper,
            Attendance.status != "di tolak",
        ).limit(1)
    )

    if recent:
        raise HTTPException(
            409,
            {
                "message": "terdeteksi request absensi berulang",
                "attendance_id": recent.id,
            },
        )


def normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def utc_now_naive() -> datetime:
    return datetime.now(timezone(timedelta(hours=7))).replace(tzinfo=None)


# ==========================================
# 1. CREATE (POST /api/attendances)
# ==========================================
@router.post("", response_model=AttendanceResponse, status_code=status.HTTP_201_CREATED)
def create_attendance(
    payload: AttendanceCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    data = payload.model_dump()

    # 1. Otomatis tangkap IP Address
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        data["ip_address"] = forwarded_for.split(",")[0].strip()[:45]
    else:
        data["ip_address"] = request.client.host if request.client else None

    # 2. Otomatis tangkap User-Agent
    data["user_agent"] = request.headers.get("User-Agent")

    # 3. Hitung jarak otomatis jika location_id dikirim
    if (
        data.get("location_id")
        and data.get("latitude") is not None
        and data.get("longitude") is not None
    ):
        target_location = db.get(Location, data["location_id"])
        if target_location:
            data["distance_from_target_meters"] = calculate_haversine_distance(
                lat1=data["latitude"],
                lon1=data["longitude"],
                lat2=target_location.latitude,
                lon2=target_location.longitude,
            )

    # 4. Otomatis isi attendance_time dan attendance_date
    now = datetime.now(timezone(timedelta(hours=7)))
    if not data.get("attendance_time"):
        data["attendance_time"] = now

    data["attendance_date"] = data["attendance_time"].date()

    if current_user.role == "siswa" and current_user.student_id != payload.student_id:
        raise HTTPException(
            403,
            "siswa hanya boleh melakukan absensi untuk dirinya sendiri",
        )

    student = get_student(db, payload.student_id)

    if current_user.role == "siswa":
     check_student_pkl_period(student)
    get_mentor(db, payload.supervisor_id)
    location = get_location(db, payload.location_id) if payload.location_id else None

    attendance_time = normalize_datetime(
        payload.attendance_time or utc_now_naive()
    )
    check_duplicate(
        db,
        student.id,
        payload.attendance_type,
        attendance_time,
    )

    if payload.attendance_type == "keluar":
        absen_masuk = db.scalar(
            select(Attendance).where(
                Attendance.student_id == student.id,
                Attendance.attendance_date == attendance_time.date(),
                Attendance.attendance_type == "masuk",
                Attendance.status.notin_(["ditolak", "di tolak"]),
            ).limit(1)
        )

        if not absen_masuk:
            raise HTTPException(
                status_code=400,
                detail="Pengajuan ditolak",
            )

    if (
        location is None
        or payload.latitude is None
        or payload.longitude is None
        or location.latitude is None
        or location.longitude is None
    ):
        raise HTTPException(
            status_code=400,
            detail="Lokasi dan koordinat GPS wajib tersedia untuk absensi.",
        )

    distance = calculate_haversine_distance(
        payload.latitude,
        payload.longitude,
        location.latitude,
        location.longitude,
    )

    
    
    if payload.status in ("izin", "sakit"):
        if distance <= location.radius_meter:
            raise HTTPException(
                status_code=400,
                detail="Pengajuan izin atau sakit hanya dapat dilakukan di luar radius kantor.",
            )

    elif payload.status == "bekerja":
        if payload.attendance_type != "masuk":
            raise HTTPException(
                status_code=400,
                detail="Status bekerja hanya dapat digunakan untuk absen masuk.",
            )

        if distance <= location.radius_meter:
            raise HTTPException(
                status_code=400,
                detail="Status bekerja di luar lokasi hanya dapat digunakan di luar radius kantor.",
            )

    elif payload.attendance_type == "keluar":
        pass

    elif distance > location.radius_meter:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Lokasi di luar radius absensi.",
                "distance_meter": round(distance, 2),
                "allowed_radius_meter": location.radius_meter,
            },
        )
    
    # Tentukan status terlambat berdasarkan waktu server Jakarta.
    final_status = payload.status

    if (
        payload.attendance_type == "masuk"
        and payload.status == "hadir"
    ):
        waktu_sekarang = datetime.now(ZoneInfo("Asia/Jakarta"))

        if waktu_sekarang.hour >= 9:
            final_status = "terlambat"




    attendance = Attendance(
        student_id=student.id,
        supervisor_id=payload.supervisor_id,
        location_id=payload.location_id,
        attendance_date=attendance_time.date(),
        attendance_type=payload.attendance_type,
        attendance_time=attendance_time,
        status=final_status,
        note=payload.note,
        ip_address=data["ip_address"],
        user_agent=data["user_agent"],
        latitude=payload.latitude,
        longitude=payload.longitude,
        location_accuracy_meters=payload.location_accuracy_meters,
        distance_from_target_meters=distance,
    )

    db.add(attendance)
    db.commit()
    db.refresh(attendance)
    return attendance


# ==========================================
# 2. READ ALL / PAGINATION
# ==========================================
@router.get("", response_model=AttendancePage)
def list_attendances(
    student_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    stmt = select(Attendance)

    if student_id:
        stmt = stmt.where(Attendance.student_id == student_id)

    user_role = getattr(current_user, "role", None)

    if user_role in ["pembimbing", "supervisor"]:
        stmt = stmt.where(
            Attendance.supervisor_id == current_user.supervisor_id
        )
    elif user_role in ["siswa", "student"]:
        stmt = stmt.where(
            Attendance.student_id
            == getattr(current_user, "student_id", current_user.id)
        )

    total_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(total_stmt) or 0

    stmt = stmt.options(joinedload(Attendance.student))
    stmt = stmt.order_by(None).order_by(Attendance.id.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    items = list(db.scalars(stmt).unique().all())

    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
    }


# ==========================================
# 3. READ DETAIL BY ID
# ==========================================
@router.get("/{attendance_id}", response_model=AttendanceResponse)
def get_attendance(
    attendance_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    attendance = db.get(Attendance, attendance_id)
    if not attendance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Data presensi tidak ditemukan",
        )
    return attendance


# ==========================================
# 4. UPDATE
# ==========================================
@router.patch("/{attendance_id}", response_model=AttendanceResponse)
def update_attendance(
    attendance_id: int,
    payload: AttendanceUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    attendance = db.get(Attendance, attendance_id)
    if not attendance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Data presensi tidak ditemukan",
        )

    data = payload.model_dump(exclude_unset=True)

    # 1. Otomatis perbarui IP Address saat update
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        data["ip_address"] = forwarded_for.split(",")[0].strip()[:45]
    else:
        data["ip_address"] = request.client.host if request.client else None

    # 2. Otomatis perbarui User-Agent saat update
    data["user_agent"] = request.headers.get("User-Agent")

    # 3. Jika waktu diperbarui, update juga tanggalnya
    if "attendance_time" in data and data["attendance_time"] is not None:
        data["attendance_date"] = data["attendance_time"].date()

    # 4. Ambil koordinat dan location_id terbaru untuk hitung ulang jarak
    location_id = data.get("location_id", attendance.location_id)
    latitude = data.get("latitude", attendance.latitude)
    longitude = data.get("longitude", attendance.longitude)

    if location_id and latitude is not None and longitude is not None:
        target_location = db.get(Location, location_id)
        if target_location:
            data["distance_from_target_meters"] = calculate_haversine_distance(
                lat1=latitude,
                lon1=longitude,
                lat2=target_location.latitude,
                lon2=target_location.longitude,
            )

    for key, value in data.items():
        setattr(attendance, key, value)

    db.commit()
    db.refresh(attendance)
    return attendance


# ==========================================
# 5. DELETE
# ==========================================
@router.delete("/{attendance_id}")
def delete_attendance(
    attendance_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    attendance = db.get(Attendance, attendance_id)
    if not attendance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Data presensi tidak ditemukan",
        )

    db.delete(attendance)
    db.commit()
    return {
        "message": "Data presensi berhasil dihapus",
        "id": attendance_id,
    }
