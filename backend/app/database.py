
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.config import settings

class Base(DeclarativeBase):
    pass

def _postgresql_url(database_url: str) -> str:
    """Normalize Supabase PostgreSQL URLs for SQLAlchemy's psycopg driver."""
    url = make_url(database_url)
    if url.drivername == "postgres":
        url = url.set(drivername="postgresql+psycopg")
    elif url.drivername == "postgresql":
        url = url.set(drivername="postgresql+psycopg")

    if not url.drivername.startswith("postgresql+"):
        raise ValueError(
            "DATABASE_URL harus berupa URI PostgreSQL Supabase, "
            "misalnya postgresql://... atau postgresql+psycopg://..."
        )
    return url.render_as_string(hide_password=False)


connect_args = {"prepare_threshold": None}
if settings.database_sslmode:
    connect_args["sslmode"] = settings.database_sslmode

engine = create_engine(
    _postgresql_url(settings.database_url),
    pool_pre_ping=True,
    pool_recycle=1800,
    connect_args=connect_args,
    future=True,
)

sessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)

def get_db():
    db = sessionLocal()
    try:
        yield db
    finally:
        db.close()
