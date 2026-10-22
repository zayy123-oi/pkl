
from datetime import date,datetime
from typing import Literal,Optional
from pydantic import BaseModel,ConfigDict,Field

AttendanceStatus = Literal[
    "hadir",
    "terlambat",
    "izin",
    "sakit",
    "alpa",
    "ditolak",
    "bekerja"
]

AttendanceType = Literal["masuk", "keluar"]

class studentCreate(BaseModel):
    nama:str=Field(min_length=1,max_length=50)
    kelas:str=Field(min_length=1,max_length=50)
    asal_sekolah:str=Field(min_length=1,max_length=50)
    nomer_telepon:str=Field(min_length=1,max_length=15)
    nis:str=Field(min_length=1,max_length=20)
    startPkl: date | None = None
    endPkl: date | None = None

class studentOut(studentCreate):
    model_config=ConfigDict(from_attributes=True)
    id:int

class StudentUpdate(BaseModel):
    nama: Optional[str] = Field(None, min_length=1, max_length=50)
    kelas: Optional[str] = Field(None, min_length=1, max_length=50)
    asal_sekolah: Optional[str] = Field(None, min_length=1, max_length=50)
    nomer_telepon: Optional[str] = Field(None, min_length=1, max_length=15)
    nis: Optional[str] = Field(None, min_length=1, max_length=20)
    startPkl: Optional[date] = None
    endPkl: Optional[date] = None

class StudentPklUpdate(BaseModel):
    startPkl: Optional[date] = None
    endPkl: Optional[date] = None

class StudentSchema(BaseModel):
    id: int
    nama: str | None = None
    kelas: str | None = None
    asal_sekolah: str | None = None
    nomer_telepon: str | None = None
    nis: str | None = None

    class Config:
        from_attributes = True

class LoginUser(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    student_id: int | None = None
    supervisor_id: int | None = None

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: LoginUser

# --- SCHEMAS FOR MENTOR ---
class MentorCreate(BaseModel):
    nama: str = Field(min_length=1, max_length=50)
    asal_daerah: Optional[str] = Field(None, min_length=1, max_length=50)
    nomer_telepon: Optional[str] = Field(None, min_length=1, max_length=15)

class MentorOut(MentorCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int

class MentorUpdate(BaseModel):
    nama: Optional[str] = Field(None, min_length=1, max_length=50)
    asal_daerah: Optional[str] = Field(None, min_length=1, max_length=50)
    nomer_telepon: Optional[str] = Field(None, min_length=1, max_length=15)

# --- SCHEMAS FOR attendance ---
class LocationCreate(BaseModel):
    nama: str = Field(min_length=1, max_length=50)
    latitude: float = Field(ge=-90,le=90)
    longitude: float = Field(ge=-180,le=180)
    radius_meter: float = Field(default=100,gt=0)
    is_aktif: bool = True

class LocationOut(LocationCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int

class LocationUpdate(BaseModel):
    nama: str | None = Field(min_length=1, max_length=50,default=None)
    latitude: float | None = Field(ge=-90,le=90,default=None)
    longitude: float | None= Field(ge=-180,le=180,default=None)
    radius_meter: float | None= Field(default=100,gt=0)
    is_aktif: bool | None= None

class AttendanceCreate(BaseModel):
    student_id: int
    supervisor_id: int | None = None
    location_id: int | None = None
    attendance_type: AttendanceType
    attendance_time: datetime | None = None
    status: AttendanceStatus = "hadir"
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    location_accuracy_meters: float | None = Field(default=None, ge=0)
    note: str | None = None

class AttendanceUpdate(BaseModel):
    supervisor_id: int | None = None
    location_id: int | None = None
    attendance_type: AttendanceType | None = None
    attendance_time: datetime | None = None
    status: AttendanceStatus | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    location_accuracy_meters: float | None = Field(default=None, ge=0)
    note: str | None = None

class AttendanceResponse(BaseModel):
    id: int
    student_id: int
    supervisor_id: int | None = None
    location_id: int | None = None
    attendance_date: date
    attendance_type: str
    attendance_time: datetime
    status: str
    note: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    location_accuracy_meters: float | None = None
    distance_from_target_meters: float | None = None
    created_at: datetime
    updated_at: datetime

    # Harus sesuai dengan nama relationship di model SQLAlchemy
    student: StudentSchema | None = None

    class Config:
        from_attributes = True

class AttendancePage(BaseModel):
    items: list[AttendanceResponse]
    page: int
    page_size: int
    total: int

# --- SCHEMAS FOR TASK ---
class TaskBase(BaseModel):
    judul_tugas: str = Field(min_length=1, max_length=150)
    deskripsi_tugas: Optional[str] = None
    startTugas: Optional[datetime] = None
    deadline: Optional[datetime] = None

class TaskCreate(TaskBase):
    id_siswa: int
    id_pembimbing: Optional[int] = None

class TaskUpdate(BaseModel):
    judul_tugas: Optional[str] = Field(None, min_length=1, max_length=150)
    deskripsi_tugas: Optional[str] = None
    deadline: Optional[datetime] = None
    status: Optional[str] = Field(None, max_length=20)
    status_progress: Optional[str] = Field(None, max_length=20)
    id_pembimbing: Optional[int] = None

class TaskOut(TaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    id_siswa: int
    id_pembimbing: Optional[int] = None
    status: Optional[str] = None
    status_progress: Optional[str] = None
    startTugas: Optional[datetime] = None

# --- SCHEMAS FOR REPORT ---
class ReportBase(BaseModel):
    isi_laporan: str
    tanggal_laporan: Optional[date] = None

class ReportCreate(ReportBase):
    id_siswa: int
    id_tugas: Optional[int] = None

class ReportUpdate(BaseModel):
    isi_laporan: Optional[str] = None
    tanggal_laporan: Optional[date] = None
    status_review: Optional[str] = Field(None, max_length=20)
    komentar_pembimbing: Optional[str] = None

class ReportOut(ReportBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    id_siswa: int
    id_tugas: Optional[int] = None
    status_review: Optional[str] = None
    komentar_pembimbing: Optional[str] = None
    foto_laporan: Optional[str] = None

    siswa: Optional[StudentSchema] = None

    
class CertificateAssessmentInput(BaseModel):
    disiplin_tanggung_jawab: float = Field(ge=0, le=100)
    kemampuan_adaptasi: float = Field(ge=0, le=100)
    kualitas_hasil_kerja: float = Field(ge=0, le=100)
    komunikasi_kerja_sama: float = Field(ge=0, le=100)
    inisiatif_etika: float = Field(ge=0, le=100)

    catatan_pembimbing: str | None = Field(
        default=None,
        max_length=1000
    )


class CertificateAssessmentOut(CertificateAssessmentInput):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    supervisor_id: int
    updated_at: datetime

