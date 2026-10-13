from datetime import date,datetime
from sqlalchemy import Boolean,Date,DateTime,Float,ForeignKey,Index,Integer,String,Text
from sqlalchemy.orm import Mapped,mapped_column,relationship
from app.database import Base
class Student(Base):
    __tablename__="tabel_siswa"
    id:Mapped[int]=mapped_column(Integer,primary_key=True)
    nama:Mapped[str]=mapped_column(String(50))
    kelas:Mapped[str]=mapped_column(String(50))
    asal_sekolah:Mapped[str]=mapped_column(String(50))
    nomer_telepon:Mapped[str]=mapped_column(String(15))
    nis:Mapped[str]=mapped_column(String(20),unique=True,index=True)
    startPkl: Mapped[date | None] = mapped_column(Date, nullable=True)
    endPkl: Mapped[date | None] = mapped_column(Date, nullable=True)
    supervisor_id: Mapped[int | None] = mapped_column(
    ForeignKey("tabel_pembimbing.id"),
    nullable=True,
    index=True
)
    attendances: Mapped[list["Attendance"]] = relationship(
        back_populates="student",
        cascade="all, delete-orphan",
    )

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(150))
    role: Mapped[str] = mapped_column(String(20))
    student_id: Mapped[int | None] = mapped_column(ForeignKey("tabel_siswa.id"), nullable=True)
    supervisor_id: Mapped[int | None] = mapped_column(ForeignKey("tabel_pembimbing.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)    

class Mentor(Base):
    __tablename__ = "tabel_pembimbing"  # Sesuaikan dengan nama tabel mentor/pembimbing di SQL Server kamu

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nama: Mapped[str] = mapped_column(String(50))
    asal_daerah: Mapped[str | None] = mapped_column(String(50), nullable=True)
    nomer_telepon: Mapped[str | None] = mapped_column(String(15), nullable=True)
    attendances: Mapped[list["Attendance"]] = relationship(back_populates="mentor")

class Location(Base):
    __tablename__ = "tabel_lokasi"  # Sesuaikan dengan nama tabel mentor/pembimbing di SQL Server kamu

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nama: Mapped[str] = mapped_column(String(50))
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    radius_meter: Mapped[float | None] = mapped_column(Float, nullable=True,default=100.0)
    is_aktif: Mapped[bool | None] = mapped_column(Boolean,default=True)

    attendances: Mapped[list["Attendance"]] = relationship(back_populates="location")


class Attendance(Base):
    __tablename__ = "attendances"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("tabel_siswa.id"), index=True)
    supervisor_id: Mapped[int | None] = mapped_column(ForeignKey("tabel_pembimbing.id"), nullable=True, index=True)
    location_id: Mapped[int | None] = mapped_column(ForeignKey("tabel_lokasi.id"), nullable=True, index=True)

    attendance_date: Mapped[date] = mapped_column(Date, index=True)
    attendance_type: Mapped[str] = mapped_column(String(20), index=True)
    attendance_time: Mapped[datetime] = mapped_column(DateTime)

    status: Mapped[str] = mapped_column(String(20), default="hadir")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)

    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_accuracy_meters: Mapped[float | None] = mapped_column(Float, nullable=True)
    distance_from_target_meters: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    student: Mapped["Student"] = relationship(back_populates="attendances")
    mentor: Mapped["Mentor | None"] = relationship(back_populates="attendances")
    location: Mapped["Location | None"] = relationship(back_populates="attendances")

    __table_args__ = (
        Index("ix_attendance_student_date_type", "student_id", "attendance_date", "attendance_type"),
    )

class Task(Base):
    __tablename__ = "tugas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    id_pembimbing: Mapped[int | None] = mapped_column(ForeignKey("tabel_pembimbing.id"), nullable=True, index=True)
    id_siswa: Mapped[int] = mapped_column(ForeignKey("tabel_siswa.id"), index=True)
    judul_tugas: Mapped[str] = mapped_column(String(150))
    deskripsi_tugas: Mapped[str | None] = mapped_column(Text, nullable=True)
    deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    startTugas: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str | None] = mapped_column(String(20), default="pending")
    status_progress: Mapped[str | None] = mapped_column(String(20), default="pending")
    # Relasi (Opsional)
    student: Mapped["Student"] = relationship()
    mentor: Mapped["Mentor"] = relationship()

class Report(Base):
    __tablename__ = "laporan"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    id_siswa: Mapped[int] = mapped_column(ForeignKey("tabel_siswa.id"), index=True)
    id_tugas: Mapped[int | None] = mapped_column(ForeignKey("tugas.id"), nullable=True, index=True)
    tanggal_laporan: Mapped[date | None] = mapped_column(Date, default=date.today)
    isi_laporan: Mapped[str] = mapped_column(Text)
    status_review: Mapped[str | None] = mapped_column(String(20), default="pending")
    komentar_pembimbing: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relasi (Opsional)
    siswa: Mapped["Student"] = relationship()
    task: Mapped["Task | None"] = relationship()