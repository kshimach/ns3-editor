"""RunManager unit tests for the parts that do not need a live ns-3 run.

The RPL snapshot lines are the interesting case: they arrive interleaved
with ordinary log output on the same stream, and the split between the two
is what the whole "RPL テーブル" view rests on.
"""

from pathlib import Path

from app.runner import RunManager


def _manager() -> RunManager:
    return RunManager(Path("/nonexistent-ns3"), Path("/nonexistent-runs"))


def test_marked_snapshot_is_lifted_out_of_the_log():
    m = _manager()
    assert m._take_rpl_table('##RPLTABLE## {"node":1,"rank":256}') is True
    assert m.rpl_tables == [{"node": 1, "rank": 256}]
    # ...and it must not also land in the readable log.
    assert m.lines == []


def test_ordinary_lines_are_left_alone():
    m = _manager()
    assert m._take_rpl_table("Node: 1, Time: +99s, RPL routing table") is False
    assert m.rpl_tables == []


def test_marker_is_found_past_a_prefix():
    # ns-3 can put its own prefix in front of anything a program prints;
    # anchoring the marker to column zero would lose the snapshot entirely.
    m = _manager()
    assert m._take_rpl_table('[node 1] ##RPLTABLE## {"node":1}') is True
    assert m.rpl_tables == [{"node": 1}]


def test_unparsable_marked_line_goes_back_to_the_log():
    # Something went wrong with it, and the run log is where a person looks
    # to find out what -- so it must not be swallowed silently.
    m = _manager()
    assert m._take_rpl_table("##RPLTABLE## {this is not json") is False
    assert m.rpl_tables == []


def test_marked_non_object_is_rejected():
    m = _manager()
    assert m._take_rpl_table("##RPLTABLE## [1, 2, 3]") is False
    assert m.rpl_tables == []


def test_snapshots_are_replayed_to_a_late_subscriber():
    m = _manager()
    m._take_rpl_table('##RPLTABLE## {"node":0}')
    m.lines.append("some log line")
    backlog, _ = m.subscribe()
    kinds = [b["type"] for b in backlog]
    assert "line" in kinds
    assert "rplTable" in kinds
    assert kinds[-1] == "status"
    assert [b["snapshot"] for b in backlog if b["type"] == "rplTable"] == [{"node": 0}]
