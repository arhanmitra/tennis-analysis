from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routes import h2h, model, players, predict, ratings

Base.metadata.create_all(bind=engine)

app = FastAPI(title="ATP Predictor & Analytics API")

# Explicit origin list (no wildcards) — localhost for local dev, Pi IP for LAN access.
ALLOWED_ORIGINS = [
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://192.168.0.56:5175",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(players.router, prefix="/api")
app.include_router(predict.router, prefix="/api")
app.include_router(ratings.router, prefix="/api")
app.include_router(h2h.router, prefix="/api")
app.include_router(model.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
