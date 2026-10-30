from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api import nwis3d

app = FastAPI(title="NWIS 3D API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(nwis3d.router, prefix="/api/nwis3d")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "NWIS 3D Simulator API"}
