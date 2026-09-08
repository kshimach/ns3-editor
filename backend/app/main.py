# Copyright (c) 2026 kawashy. All rights reserved.
# Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
# without written permission.

"""FastAPI entry point for the ns-3 scenario editor.

Dev mode: run `uvicorn app.main:app --reload` and the Vite dev server with
its /api + /ws proxy. Production-ish mode: `npm run build` the frontend and
this app serves frontend/dist statically.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .codegen import CodegenError, generate
from .models import Scenario
from .runner import RunManager
from .validate import validate_scenario

_REPO_ROOT = Path(__file__).resolve().parents[2]
NS3_DIR = Path(os.environ.get("NS3_DIR", str(Path.home() / "ns-3-dev")))
SCENARIOS_DIR = _REPO_ROOT / "scenarios"
RUNS_DIR = _REPO_ROOT / "runs"
FRONTEND_DIST = _REPO_ROOT / "frontend" / "dist"

app = FastAPI(title="ns3-editor")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

run_manager = RunManager(NS3_DIR, RUNS_DIR)


def _scenario_file(name: str) -> Path:
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "-", name).strip("-.")
    if not safe:
        raise HTTPException(400, "invalid scenario name")
    return SCENARIOS_DIR / f"{safe}.json"


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "ns3Dir": str(NS3_DIR), "ns3DirExists": (NS3_DIR / "ns3").exists()}


@app.get("/api/scenarios")
def list_scenarios() -> list[dict]:
    SCENARIOS_DIR.mkdir(exist_ok=True)
    out = []
    for p in sorted(SCENARIOS_DIR.glob("*.json")):
        try:
            data = json.loads(p.read_text())
            out.append({"file": p.stem, "name": data.get("name", p.stem)})
        except (json.JSONDecodeError, OSError):
            continue
    return out


@app.get("/api/scenarios/{name}")
def load_scenario(name: str) -> Scenario:
    p = _scenario_file(name)
    if not p.exists():
        raise HTTPException(404, f"scenario '{name}' not found")
    return Scenario.model_validate_json(p.read_text())


@app.put("/api/scenarios/{name}")
def save_scenario(name: str, scenario: Scenario) -> dict:
    SCENARIOS_DIR.mkdir(exist_ok=True)
    p = _scenario_file(name)
    p.write_text(scenario.model_dump_json(by_alias=True, indent=2))
    return {"saved": p.stem}


@app.delete("/api/scenarios/{name}")
def delete_scenario(name: str) -> dict:
    p = _scenario_file(name)
    if p.exists():
        p.unlink()
    return {"deleted": name}


@app.post("/api/validate")
def validate(scenario: Scenario) -> list:
    return [issue.model_dump() for issue in validate_scenario(scenario)]


@app.post("/api/generate")
def generate_code(scenario: Scenario):
    issues = [issue.model_dump() for issue in validate_scenario(scenario)]
    try:
        code = generate(scenario)
    except CodegenError as e:
        return JSONResponse(
            status_code=422,
            content={"issues": issues + [i.model_dump() for i in e.issues], "code": None},
        )
    return {"issues": issues, "code": code, "scratchName": scenario.slug()}


@app.post("/api/run")
async def start_run(scenario: Scenario):
    try:
        status = await run_manager.start(scenario)
    except RuntimeError as e:
        raise HTTPException(409, str(e))
    except CodegenError as e:
        return JSONResponse(
            status_code=422, content={"issues": [i.model_dump() for i in e.issues]}
        )
    run_manager.cleanup_runs()
    return status


@app.get("/api/run")
def run_status() -> dict:
    return run_manager.status()


@app.post("/api/run/stop")
async def stop_run() -> dict:
    return await run_manager.stop()


@app.get("/api/run/artifacts")
def run_artifacts() -> list[dict]:
    return run_manager.artifacts()


@app.get("/api/run/artifacts/{name}")
def run_artifact(name: str):
    p = run_manager.artifact_path(name)
    if p is None:
        raise HTTPException(404, "no such artifact")
    return FileResponse(p, filename=name)


@app.websocket("/ws/run")
async def run_ws(ws: WebSocket) -> None:
    await ws.accept()
    backlog, queue = run_manager.subscribe()
    try:
        for message in backlog:
            await ws.send_json(message)
        while True:
            await ws.send_json(await queue.get())
    except WebSocketDisconnect:
        pass
    finally:
        run_manager.unsubscribe(queue)


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
