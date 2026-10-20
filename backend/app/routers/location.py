
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Location
from app.schemas import LocationCreate, LocationOut, LocationUpdate
from app.security import get_current_user, require_roles


router = APIRouter(prefix="/location", tags=["location"])


@router.post("", response_model=LocationOut, status_code=201, dependencies=[Depends(require_roles("admin"))])
def create_location(payload: LocationCreate, db: Session = Depends(get_db)):
    location = Location(**payload.model_dump())
    db.add(location)
    db.commit()
    db.refresh(location)
    return location


@router.get("", response_model=list[LocationOut])
def list_locations(
    active_only: bool | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    stmt = select(Location).order_by(Location.nama)

    if active_only is True:
        stmt = stmt.where(Location.is_aktif.is_(True))
    elif active_only is False:
        stmt = stmt.where(Location.is_aktif.is_(False))
    else:
        stmt = stmt.where(Location.is_aktif.is_(True))

    return list(db.scalars(stmt).all())


@router.get("/{location_id}", response_model=LocationOut)
def get_location(location_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    location = db.get(Location, location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Lokasi absensi tidak ditemukan")
    return location


@router.patch("/{location_id}", response_model=LocationOut, dependencies=[Depends(require_roles("admin"))])
def update_location(location_id: int, payload: LocationUpdate, db: Session = Depends(get_db)):
    location = db.get(Location, location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Lokasi absensi tidak ditemukan")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(location, key, value)
    db.commit()
    db.refresh(location)
    return location


@router.delete("/{location_id}", dependencies=[Depends(require_roles("admin"))])
def delete_location(location_id: int, db: Session = Depends(get_db)):
    location = db.get(Location, location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Lokasi absensi tidak ditemukan")
    location.is_aktif = False
    db.commit()
    return {"message": "Lokasi dinonaktifkan", "id": location_id}
