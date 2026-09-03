"""FastAPI application entry point for Flight Tracking AI Service."""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import time
import uuid
import logging

from app.config import get_settings
from app.api.health import router as health_router
from app.api.chat import router as chat_router
from app.observability.logging import setup_logging

settings = get_settings()

setup_logging(settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s", settings.service_name)
    yield
    logger.info("Shutting down %s", settings.service_name)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Flight Tracking AI Service",
        description="AI backend for Flight Tracking application",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if get_settings().environment != "production" else None,
        redoc_url="/redoc" if get_settings().environment != "production" else None,
    )

    cors_origins = [origin.strip() for origin in get_settings().cors_origins.split(",")]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # Combined middleware: request ID + AI service key validation
    # Starlette executes middleware in reverse registration order,
    # so this single middleware handles both concerns in the correct sequence.
    @app.middleware("http")
    async def process_request(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id

        # Validate AI service key for /api/ routes
        cfg = get_settings()
        if cfg.ai_service_api_key and request.url.path.startswith("/api/"):
            key = request.headers.get("X-AI-Service-Key")
            if key != cfg.ai_service_api_key:
                return JSONResponse(
                    status_code=401,
                    content={
                        "error": "UNAUTHORIZED",
                        "message": "Invalid or missing AI service key",
                        "request_id": request_id,
                    },
                )

        start_time = time.perf_counter()
        response = await call_next(request)
        process_time = time.perf_counter() - start_time

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = f"{process_time:.4f}"
        return response

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", "unknown")
        logger.exception("Unhandled exception: %s", exc)
        return JSONResponse(
            status_code=500,
            content={
                "error": "INTERNAL_SERVER_ERROR",
                "message": "An internal server error occurred",
                "request_id": request_id,
            },
        )

    app.include_router(health_router)
    app.include_router(chat_router, prefix="/api/ai")

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.environment == "development",
        log_level=settings.log_level.lower(),
    )
