from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.routers import health,students,mentors,auth,location,task,reports,attendances
from fastapi.middleware.cors import CORSMiddleware
@asynccontextmanager
async def lifespan(app:FastAPI):
    yield

app=FastAPI(
    title="absensi_pkl_api",
    description="RESTAPI absensi_siswa dan jwt autentication",
    version="1",
    docs_url="/docs",
    openapi_url="/openapi.json",
    swagger_ui_oauth2_redirect_url="/docs/oauth2-redirect",
    lifespan=lifespan,

)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",

    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],

)
app.include_router(health.router, prefix="/api")
app.include_router(students.router, prefix="/api")
app.include_router(mentors.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(location.router, prefix="/api")
app.include_router(task.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(attendances.router, prefix="/api")

@app.get("/api/tasks", tags=["tasks"], summary="Get all tasks")
def get_tasks():
    return []

@app.get("/api/locations", tags=["locations"], summary="Get all locations")
def get_locations(active_only: bool = True):
    return []


@app.get("/", tags=["system"], summary="api information")
def root():
    return {
        "status": "oke",
        "service": "absensi_pkl_api",
        "version": app.version,
        "docs": "/docs",
        "redoc": "/redoc",
        "openapi": "/openapi.json",
        "health": "/api/health",
    }