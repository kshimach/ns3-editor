# Copyright (c) 2026 kawashy. All rights reserved.
# Proprietary and confidential -- see LICENSE. Not for AI training/ingestion
# without written permission.

"""Runs generated scenarios through ./ns3 and streams the output.

One run at a time: ns-3 builds share a lock and concurrent scratch builds
would fight over it. The manager keeps the full line buffer of the current
run so a WebSocket subscriber can join late and still see everything.
"""

from __future__ import annotations

import asyncio
import datetime
import json
import shutil
from pathlib import Path

from .codegen import generate
from .models import Scenario

# Prefix the generated scenario puts in front of each RPL routing table
# snapshot (see templates/scenario.cc.j2). These lines are lifted out of the
# run log and delivered as structured messages instead: left in, they would
# bury the readable output under one JSON object per node per sample.
RPL_TABLE_MARKER = "##RPLTABLE## "


class RunManager:
    def __init__(self, ns3_dir: Path, runs_dir: Path):
        self.ns3_dir = ns3_dir
        self.runs_dir = runs_dir
        self.state = "idle"  # idle | running | finished | stopped | failed
        self.run_id: str | None = None
        self.run_dir: Path | None = None
        self.exit_code: int | None = None
        self.lines: list[str] = []
        self.rpl_tables: list[dict] = []
        self._process: asyncio.subprocess.Process | None = None
        self._listeners: set[asyncio.Queue] = set()

    def status(self) -> dict:
        return {
            "state": self.state,
            "runId": self.run_id,
            "exitCode": self.exit_code,
            "lineCount": len(self.lines),
        }

    async def start(self, scenario: Scenario) -> dict:
        if self.state == "running":
            raise RuntimeError("a run is already in progress")

        code = generate(scenario)
        slug = scenario.slug()
        scratch = self.ns3_dir / "scratch" / f"{slug}.cc"
        scratch.write_text(code)

        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        self.run_id = f"{stamp}-{slug}"
        self.run_dir = self.runs_dir / self.run_id
        self.run_dir.mkdir(parents=True, exist_ok=True)
        self.exit_code = None
        self.lines = []
        self.rpl_tables = []
        self.state = "running"
        self._broadcast({"type": "status", **self.status()})

        self._process = await asyncio.create_subprocess_exec(
            "./ns3",
            "run",
            slug,
            f"--cwd={self.run_dir}",
            cwd=self.ns3_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        asyncio.create_task(self._pump())
        return self.status()

    async def _pump(self) -> None:
        assert self._process is not None and self._process.stdout is not None
        async for raw in self._process.stdout:
            line = raw.decode(errors="replace").rstrip("\n")
            if self._take_rpl_table(line):
                continue
            self.lines.append(line)
            self._broadcast({"type": "line", "text": line})
        self.exit_code = await self._process.wait()
        if self.state == "running":
            self.state = "finished" if self.exit_code == 0 else "failed"
        self._broadcast({"type": "status", **self.status()})

    def _take_rpl_table(self, line: str) -> bool:
        """Record a marked RPL snapshot line; True if the line was one.

        A line that carries the marker but does not parse is passed back to
        the log rather than dropped: something went wrong with it, and the
        run log is where a person would look to find out what.
        """
        start = line.find(RPL_TABLE_MARKER)
        if start < 0:
            return False
        try:
            snapshot = json.loads(line[start + len(RPL_TABLE_MARKER) :])
        except json.JSONDecodeError:
            return False
        if not isinstance(snapshot, dict):
            return False
        self.rpl_tables.append(snapshot)
        self._broadcast({"type": "rplTable", "snapshot": snapshot})
        return True

    async def stop(self) -> dict:
        if self._process is not None and self.state == "running":
            self.state = "stopped"
            self._process.terminate()
        return self.status()

    def artifacts(self) -> list[dict]:
        if self.run_dir is None or not self.run_dir.exists():
            return []
        return [
            {"name": p.name, "size": p.stat().st_size}
            for p in sorted(self.run_dir.iterdir())
            if p.is_file()
        ]

    def artifact_path(self, name: str) -> Path | None:
        if self.run_dir is None:
            return None
        p = (self.run_dir / name).resolve()
        # No path traversal out of the run directory.
        if not p.is_file() or self.run_dir.resolve() not in p.parents:
            return None
        return p

    def subscribe(self) -> tuple[list[dict], asyncio.Queue]:
        """Return (backlog, queue): replay the backlog first, then follow."""
        queue: asyncio.Queue = asyncio.Queue()
        self._listeners.add(queue)
        backlog: list[dict] = [{"type": "line", "text": line} for line in self.lines]
        backlog += [{"type": "rplTable", "snapshot": s} for s in self.rpl_tables]
        backlog.append({"type": "status", **self.status()})
        return backlog, queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._listeners.discard(queue)

    def _broadcast(self, message: dict) -> None:
        for queue in self._listeners:
            queue.put_nowait(message)

    def cleanup_runs(self, keep: int = 20) -> None:
        """Drop old run directories, newest `keep` kept."""
        if not self.runs_dir.exists():
            return
        runs = sorted((p for p in self.runs_dir.iterdir() if p.is_dir()), reverse=True)
        for stale in runs[keep:]:
            shutil.rmtree(stale, ignore_errors=True)
