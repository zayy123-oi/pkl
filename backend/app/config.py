from pydantic_settings import BaseSettings,SettingsConfigDict
class settings(BaseSettings):
    app_name:str="absensi_pkl_api"
    database_url:str
    attendance_radius_meters:float=150.0
    duplicate_windows_minutes:int=5
    jwt_secret_key:str
    jwt_algorithm:str="HS256"
    jwt_access_token_expire_minutes:int=60
    model_config=SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",

    )

settings=settings()