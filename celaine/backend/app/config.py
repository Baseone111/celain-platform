from pathlib import Path
import secrets
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    environment: str = 'development'
    database_url: str = 'sqlite:///./celaine.db'
    jwt_secret: str = secrets.token_urlsafe(48)
    access_token_minutes: int = 15
    refresh_days: int = 7
    cors_origins: str = 'http://localhost:4173,http://127.0.0.1:4173'
    cookie_secure: bool = False
    demo_payments: bool = False
    payment_webhook_secret: str = ''
    storage_dir: Path = Path('./storage')
    max_upload_bytes: int = 20 * 1024 * 1024

    @property
    def origins(self):
        return [value.strip() for value in self.cors_origins.split(',') if value.strip()]

    @model_validator(mode='after')
    def production_settings(self):
        if len(self.jwt_secret) < 32:
            raise ValueError('JWT_SECRET must contain at least 32 characters')
        if self.environment == 'production':
            if 'jwt_secret' not in self.model_fields_set or not self.cookie_secure or self.demo_payments:
                raise ValueError('Production requires an explicit JWT_SECRET, COOKIE_SECURE=true, and DEMO_PAYMENTS=false')
            if not self.database_url.startswith('postgresql'):
                raise ValueError('Use PostgreSQL in production')
            if any(not origin.startswith('https://') for origin in self.origins):
                raise ValueError('Production CORS origins must use HTTPS')
        return self

settings = Settings()
